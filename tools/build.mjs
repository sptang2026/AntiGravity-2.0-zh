#!/usr/bin/env node
/**
 * 词库与前端引擎构建脚本（纯 Node 22，零依赖）
 * 读取 src/dict/*.json + src/runtime/{rules,engine,swarm}.js
 * 生成 mac/bin/overlays.generated.mjs（内含自动计算的 SHA256 指纹）
 *
 * 用法：
 *   node tools/build.mjs          # 体检 + 生成产物
 *   node tools/build.mjs --check  # 仅校验产物与源码是否完全同步（供测试/CI 使用）
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintAllDictionaries, MAIN_DICT_FILES, SWARM_DICT_FILE } from './lint-dict.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DICT_DIR = path.join(ROOT, 'src', 'dict');
const RUNTIME_DIR = path.join(ROOT, 'src', 'runtime');
const OUTPUT_PATH = path.join(ROOT, 'mac', 'bin', 'overlays.generated.mjs');

function readLF(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function sha256Short(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/**
 * 去除 ES module `export ` 关键字，使 rules.js 可直接内联至浏览器 IIFE 中
 */
function stripExportsForBrowser(code) {
  return code
    .replace(/^export\s+(?=function|const|let|var)/gm, '')
    .trim();
}

export function buildArtifacts() {
  const lint = lintAllDictionaries(DICT_DIR);
  if (!lint.ok) {
    throw new Error(`词库体检未通过，终止构建:\n${lint.errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  // 1. 合并主词库并按源文长度倒序 + 字典序稳定排列
  const mainEntries = [];
  for (const fileName of MAIN_DICT_FILES) {
    const obj = JSON.parse(readLF(path.join(DICT_DIR, fileName)));
    for (const [k, v] of Object.entries(obj)) {
      mainEntries.push([k, v]);
    }
  }
  mainEntries.sort((a, b) => b[0].length - a[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const engineTpl = readLF(path.join(RUNTIME_DIR, 'engine.js'));
  const rulesBody = stripExportsForBrowser(readLF(path.join(RUNTIME_DIR, 'rules.js')));
  const dictLines = mainEntries.map(([k, v]) => `    [${JSON.stringify(k)}, ${JSON.stringify(v)}],`).join('\n');

  function assertSinglePlaceholder(tpl, ph, fileLabel) {
    const count = tpl.split(ph).length - 1;
    if (count !== 1) {
      throw new Error(`${fileLabel} 中占位符 ${ph} 出现次数为 ${count}（要求恰好 1 次）`);
    }
  }

  for (const ph of ["'__BUILD_FINGERPRINT__'", '/* __DICT_ENTRIES__ */', '/* __RULES_BODY__ */']) {
    assertSinglePlaceholder(engineTpl, ph, 'src/runtime/engine.js');
  }

  const mainPreHash = engineTpl
    .replace('    /* __DICT_ENTRIES__ */', () => dictLines)
    .replace('  /* __RULES_BODY__ */', () => rulesBody);

  const mainFingerprint = `ag2-main-${sha256Short(mainPreHash)}`;
  const mainOverlay = mainPreHash.replace("'__BUILD_FINGERPRINT__'", () => JSON.stringify(mainFingerprint));

  // 2. 构建 Swarm 子帧独立脚本
  const swarmCfg = JSON.parse(readLF(path.join(DICT_DIR, SWARM_DICT_FILE)));
  const swarmTpl = readLF(path.join(RUNTIME_DIR, 'swarm.js'));
  const swarmEntries = Object.entries(swarmCfg.phrases).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  for (const ph of [
    "'__SWARM_FINGERPRINT__'",
    "'__SWARM_HOST_PATTERN__'",
    '/* __SWARM_MARKERS__ */',
    '/* __SWARM_ENTRIES__ */',
  ]) {
    assertSinglePlaceholder(swarmTpl, ph, 'src/runtime/swarm.js');
  }

  const markerLines = swarmCfg.markers.map((m) => `    ${JSON.stringify(m)},`).join('\n');
  const swarmEntryLines = swarmEntries.map(([k, v]) => `    [${JSON.stringify(k)}, ${JSON.stringify(v)}],`).join('\n');

  const swarmPreHash = swarmTpl
    .replace("'__SWARM_HOST_PATTERN__'", () => JSON.stringify(swarmCfg.hostPattern))
    .replace('    /* __SWARM_MARKERS__ */', () => markerLines)
    .replace('    /* __SWARM_ENTRIES__ */', () => swarmEntryLines);

  const swarmFingerprint = `ag2-swarm-${sha256Short(swarmPreHash)}`;
  const swarmOverlay = swarmPreHash.replace("'__SWARM_FINGERPRINT__'", () => JSON.stringify(swarmFingerprint));

  // 3. 语法预检（用 Function 构造器验证两个生成的浏览器脚本无语法错误）
  new Function(mainOverlay);
  new Function(swarmOverlay);

  const generatedModule =
    `// 由 tools/build.mjs 自动生成，请勿直接手改！\n` +
    `// 修改词库或引擎请编辑 src/dict/*.json 与 src/runtime/*.js，然后执行：node tools/build.mjs\n\n` +
    `export const MAIN_FINGERPRINT = ${JSON.stringify(mainFingerprint)};\n` +
    `export const SWARM_FINGERPRINT = ${JSON.stringify(swarmFingerprint)};\n` +
    `export const OVERLAY_STATS = ${JSON.stringify({ mainTotal: mainEntries.length, swarmTotal: swarmEntries.length })};\n` +
    `export const MAIN_OVERLAY = ${JSON.stringify(mainOverlay)};\n` +
    `export const SWARM_OVERLAY = ${JSON.stringify(swarmOverlay)};\n`;

  return {
    generatedModule,
    mainOverlay,
    swarmOverlay,
    mainFingerprint,
    swarmFingerprint,
    stats: { mainTotal: mainEntries.length, swarmTotal: swarmEntries.length },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes('--check');
  const built = buildArtifacts();

  if (checkOnly) {
    const existing = fs.existsSync(OUTPUT_PATH) ? readLF(OUTPUT_PATH) : '';
    if (existing !== built.generatedModule) {
      console.error('❌ mac/bin/overlays.generated.mjs 与 src/ 源码不同步，请执行: node tools/build.mjs');
      process.exit(1);
    }
    console.log(
      `✅ 构建产物与源码完全同步（主词库 ${built.stats.mainTotal} 条 [${built.mainFingerprint}]，Swarm ${built.stats.swarmTotal} 条 [${built.swarmFingerprint}]）`
    );
  } else {
    fs.writeFileSync(OUTPUT_PATH, built.generatedModule, 'utf8');
    console.log(
      `✅ 已生成 mac/bin/overlays.generated.mjs（主词库 ${built.stats.mainTotal} 条 [${built.mainFingerprint}]，Swarm ${built.stats.swarmTotal} 条 [${built.swarmFingerprint}]）`
    );
  }
}
