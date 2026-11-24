import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSafeCustomTranslations, parseCustomTranslations } from '../src/daemon/custom-dict.mjs';

test('parseCustomTranslations 正确解析注释、保留英文与自定义译文', () => {
  const raw = `
    # 这是注释
    Request Review
    Turbo = 极速模式
    turbo = 覆盖极速
    EmptyKey = 应该忽略
    = 应该忽略
  `;
  const entries = parseCustomTranslations(raw);
  const map = new Map(entries);
  assert.equal(map.get('request review'), '');
  assert.equal(map.get('turbo'), '覆盖极速');
  assert.equal(map.has(''), false);
});

test('loadSafeCustomTranslations 校验安全权限并拒绝符号链接与过宽权限', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-zh-custom-test-'));
  try {
    const safeFile = path.join(tmpDir, 'custom-translations.txt');
    fs.writeFileSync(safeFile, 'Request Review\nTurbo = 极速\n', { mode: 0o600 });
    fs.chmodSync(safeFile, 0o600);

    const ok = loadSafeCustomTranslations(safeFile);
    assert.equal(ok.loaded, true);
    assert.equal(ok.warning, null);
    assert.equal(ok.entries.length, 2);
    assert.match(ok.hash, /^[0-9a-f]{12}$/);

    // 开放其他用户写权限 → 必须拒绝
    const wideFile = path.join(tmpDir, 'wide.txt');
    fs.writeFileSync(wideFile, 'Turbo = 危险\n');
    fs.chmodSync(wideFile, 0o666);
    const rejectedWide = loadSafeCustomTranslations(wideFile);
    assert.equal(rejectedWide.loaded, false);
    assert.ok(rejectedWide.warning?.includes('权限过宽'));

    // 符号链接 → 必须拒绝
    const linkPath = path.join(tmpDir, 'link.txt');
    fs.symlinkSync(safeFile, linkPath);
    const rejectedLink = loadSafeCustomTranslations(linkPath);
    assert.equal(rejectedLink.loaded, false);
    assert.ok(rejectedLink.warning?.includes('符号链接'));

    // 不存在的路径 → 静默返回未加载且无报错
    const missing = loadSafeCustomTranslations(path.join(tmpDir, 'not-exist.txt'));
    assert.equal(missing.loaded, false);
    assert.equal(missing.warning, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
