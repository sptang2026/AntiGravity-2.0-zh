import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from '../tools/build.mjs';
import { lintAllDictionaries, validateEntry } from '../tools/lint-dict.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('全量词库体检必须零错误通过', () => {
  const res = lintAllDictionaries();
  assert.equal(res.ok, true, `词库存在错误:\n${res.errors.join('\n')}`);
  assert.ok(res.mainTotal >= 2900, `主词库数量异常偏低: ${res.mainTotal}`);
  assert.ok(res.swarmTotal >= 50, `Swarm 词库数量异常偏低: ${res.swarmTotal}`);
});

test('词库校验器必须拦截空值、冗余、控制字符与权限极性反转', () => {
  assert.ok(validateEntry('test', '', '译文').errors.length > 0);
  assert.ok(validateEntry('test', 'Open', '   ').errors.length > 0);
  assert.ok(validateEntry('test', 'Same', 'Same').errors.length > 0);
  assert.ok(validateEntry('test', 'Bad\nKey', '换行').errors.length > 0);
  assert.ok(validateEntry('test', 'Allow command', '拒绝命令').errors.length > 0);
  assert.ok(validateEntry('test', 'Deny access', '允许访问').errors.length > 0);
  assert.equal(validateEntry('test', 'Allow command', '允许命令').errors.length, 0);
  assert.equal(validateEntry('test', 'Deny access', '拒绝访问').errors.length, 0);
});

test('构建产物 mac/bin/overlays.generated.mjs 必须与 src/ 源码完全同步', () => {
  const built = buildArtifacts();
  const outputPath = path.join(ROOT, 'mac', 'bin', 'overlays.generated.mjs');
  assert.ok(fs.existsSync(outputPath), '缺少 overlays.generated.mjs');
  const actual = fs.readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(actual, built.generatedModule, '构建产物不同步，请重新运行 node tools/build.mjs');
  assert.match(built.mainFingerprint, /^ag2-main-[0-9a-f]{12}$/);
  assert.match(built.swarmFingerprint, /^ag2-swarm-[0-9a-f]{12}$/);
});
