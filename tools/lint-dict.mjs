#!/usr/bin/env node
/**
 * 词库体检工具（零外部依赖）
 * 检查项：
 *   1. JSON 语法与结构合法性
 *   2. 跨文件重复 key（精确及大小写冲突）
 *   3. 空 key / 空译文 / 非字符串 / key===val / 控制字符
 *   4. 权限极性反转检测（避免把 Allow/Enable 误翻为 拒绝/禁用，或反之）
 *
 * 用法：node tools/lint-dict.mjs [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DICT_DIR = path.join(ROOT, 'src', 'dict');

export const MAIN_DICT_FILES = [
  'common.json',
  'settings.json',
  'chat-agent.json',
  'marketplace.json',
  'ide.json',
];

export const SWARM_DICT_FILE = 'swarm.json';

const RE_POSITIVE_EN = /\b(allow|allowed|enable|enabled|approve|approved|accept|accepted|trust|trusted|permit|grant)\b/i;
const RE_NEGATIVE_EN = /\b(deny|denied|disable|disabled|reject|rejected|block|blocked|never|revoke|revoked|restrict|restricted|forbid|prohibit)\b/i;
const RE_PERMISSIVE_ZH = /(允许|启用|批准|接受|信任|授权|始终继续)/;
const RE_RESTRICTIVE_ZH = /(拒绝|禁用|拦截|阻止|从不|禁止|取消授权|撤销|绝不|限制|无需)/;

/**
 * 校验单条词条
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateEntry(sourceLabel, key, val) {
  const errors = [];
  const warnings = [];

  if (typeof key !== 'string' || key.length === 0) {
    errors.push(`[${sourceLabel}] 存在空 key`);
    return { errors, warnings };
  }
  if (typeof val !== 'string') {
    errors.push(`[${sourceLabel}] 译文非字符串: ${JSON.stringify(key)}`);
    return { errors, warnings };
  }
  if (val.trim().length === 0) {
    errors.push(`[${sourceLabel}] 译文为空: ${JSON.stringify(key)}`);
    return { errors, warnings };
  }
  if (key === val) {
    errors.push(`[${sourceLabel}] key 与译文完全相同（冗余条目）: ${JSON.stringify(key)}`);
  }
  if (/[\r\n\t]/.test(key)) {
    errors.push(`[${sourceLabel}] key 包含控制字符: ${JSON.stringify(key)}`);
  }

  // 权限极性反转检测：仅在英文单极性强语义且短/中句下判定，减少长句说明误报
  const isPos = RE_POSITIVE_EN.test(key) && !RE_NEGATIVE_EN.test(key);
  const isNeg = RE_NEGATIVE_EN.test(key) && !RE_POSITIVE_EN.test(key);
  if (isPos && RE_RESTRICTIVE_ZH.test(val) && !RE_PERMISSIVE_ZH.test(val)) {
    errors.push(`[${sourceLabel}] 疑似权限极性反转（正面译成负面）: ${JSON.stringify(key)} -> ${JSON.stringify(val)}`);
  }
  if (isNeg && RE_PERMISSIVE_ZH.test(val) && !RE_RESTRICTIVE_ZH.test(val)) {
    errors.push(`[${sourceLabel}] 疑似权限极性反转（负面译成正面）: ${JSON.stringify(key)} -> ${JSON.stringify(val)}`);
  }

  return { errors, warnings };
}

/**
 * 执行全量词库体检
 */
export function lintAllDictionaries(dictDir = DICT_DIR) {
  const errors = [];
  const warnings = [];
  const stats = {};
  const exactSeen = new Map();
  const lowerSeen = new Map();

  let mainTotal = 0;

  for (const fileName of MAIN_DICT_FILES) {
    const filePath = path.join(dictDir, fileName);
    if (!fs.existsSync(filePath)) {
      errors.push(`缺少词库文件: ${fileName}`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      errors.push(`[${fileName}] JSON 解析失败: ${err.message}`);
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push(`[${fileName}] 根节点必须是键值对象`);
      continue;
    }

    const entries = Object.entries(parsed);
    stats[fileName] = entries.length;
    mainTotal += entries.length;

    for (const [key, val] of entries) {
      const res = validateEntry(fileName, key, val);
      errors.push(...res.errors);
      warnings.push(...res.warnings);

      if (exactSeen.has(key)) {
        errors.push(`重复词条 ${JSON.stringify(key)} 同时出现在 ${exactSeen.get(key)} 与 ${fileName}`);
      } else {
        exactSeen.set(key, fileName);
      }

      const lk = key.toLowerCase();
      if (lowerSeen.has(lk)) {
        const prev = lowerSeen.get(lk);
        if (prev.val !== val && prev.key !== key) {
          warnings.push(
            `大小写变体译文不一致: ${JSON.stringify(prev.key)}(${prev.file}) -> ${JSON.stringify(prev.val)} vs ${JSON.stringify(key)}(${fileName}) -> ${JSON.stringify(val)}`
          );
        }
      } else {
        lowerSeen.set(lk, { key, val, file: fileName });
      }
    }
  }

  // 检查 Swarm 独立词库
  const swarmPath = path.join(dictDir, SWARM_DICT_FILE);
  let swarmTotal = 0;
  if (!fs.existsSync(swarmPath)) {
    errors.push(`缺少 Swarm 词库文件: ${SWARM_DICT_FILE}`);
  } else {
    try {
      const swarm = JSON.parse(fs.readFileSync(swarmPath, 'utf8'));
      if (typeof swarm.hostPattern !== 'string' || !swarm.hostPattern) {
        errors.push(`[${SWARM_DICT_FILE}] 缺少 hostPattern`);
      } else {
        try {
          new RegExp(swarm.hostPattern, 'i');
        } catch (err) {
          errors.push(`[${SWARM_DICT_FILE}] hostPattern 正则无效: ${err.message}`);
        }
      }
      if (!Array.isArray(swarm.markers) || swarm.markers.length === 0) {
        errors.push(`[${SWARM_DICT_FILE}] 缺少非空 markers 数组`);
      }
      if (!swarm.phrases || typeof swarm.phrases !== 'object' || Array.isArray(swarm.phrases)) {
        errors.push(`[${SWARM_DICT_FILE}] 缺少 phrases 词表对象`);
      } else {
        const entries = Object.entries(swarm.phrases);
        swarmTotal = entries.length;
        stats[SWARM_DICT_FILE] = swarmTotal;
        for (const [key, val] of entries) {
          const res = validateEntry(SWARM_DICT_FILE, key, val);
          errors.push(...res.errors);
          warnings.push(...res.warnings);
        }
      }
    } catch (err) {
      errors.push(`[${SWARM_DICT_FILE}] JSON 解析失败: ${err.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats,
    mainTotal,
    swarmTotal,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const strict = process.argv.includes('--strict');
  const result = lintAllDictionaries();

  console.log('=== 词库体检统计 ===');
  for (const [file, count] of Object.entries(result.stats)) {
    console.log(`  ${file.padEnd(20)} ${count} 条`);
  }
  console.log(`  主词库合计           ${result.mainTotal} 条`);
  console.log(`  Swarm 独立词库       ${result.swarmTotal} 条`);

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  警告 (${result.warnings.length} 条):`);
    for (const w of result.warnings.slice(0, 20)) console.log(`  - ${w}`);
    if (result.warnings.length > 20) {
      console.log(`  ... 另有 ${result.warnings.length - 20} 条警告`);
    }
  }

  if (result.errors.length > 0) {
    console.error(`\n❌ 错误 (${result.errors.length} 条):`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  if (strict && result.warnings.length > 0) {
    console.error('\n❌ --strict 模式下存在警告，检查未通过');
    process.exit(1);
  }

  console.log('\n✅ 词库体检通过');
}
