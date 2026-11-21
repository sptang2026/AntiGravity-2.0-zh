#!/usr/bin/env node
/**
 * patch-asar.js — AntiGravity 2.0 中文汉化：给 App 打/还原启动补丁
 *
 * 作用：在 Antigravity 的 app.asar 里 dist/main.js 顶部注入一行，让 App 启动时
 * 自己打开本机调试端口（仅 127.0.0.1），从而让汉化守护进程能注入中文。
 * 这样用原图标打开即中文，不需要"退出再重开"。
 *
 * 为什么要同时改 Info.plist：Electron 开启了 asar 完整性校验
 * （ElectronAsarIntegrity 记录的是 asar 头部 JSON 的 SHA256），
 * 改了 asar 必须同步更新该哈希，否则 App 启动失败。
 *
 * 用法：
 *   node patch-asar.js --check      # 检查是否已打补丁（已打=退出码0）
 *   node patch-asar.js --apply      # 打补丁（自动备份；App 需先退出）
 *   node patch-asar.js --restore    # 还原原始文件
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const APP = process.env.AG_APP_PATH || '/Applications/Antigravity.app';
const ASAR = path.join(APP, 'Contents/Resources/app.asar');
const INFO = path.join(APP, 'Contents/Info.plist');
const BACKUP_DIR = path.join(os.homedir(), 'Library/Application Support/AntigravityZh/backup');
const BAK_ASAR = path.join(BACKUP_DIR, 'app.asar.orig');
const BAK_INFO = path.join(BACKUP_DIR, 'Info.plist.orig');

const INJECT = 'try{require("electron").app.commandLine.appendSwitch("remote-debugging-port","0");}catch(e){}\n';
const MARKER = 'appendSwitch("remote-debugging-port"';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function readAsar(file) {
  const data = fs.readFileSync(file);
  const v = [0, 1, 2, 3].map((i) => data.readUInt32LE(i * 4));
  const jsonLen = v[3];
  const pad = (4 - (jsonLen % 4)) % 4;
  const dataStart = 16 + jsonLen + pad;
  const header = JSON.parse(data.slice(16, 16 + jsonLen).toString('utf8'));
  return { data, header, dataStart };
}

function collectEntries(header) {
  const out = [];
  (function walk(node, prefix) {
    for (const [name, meta] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + name : name;
      if (meta.files) walk(meta, p);
      else out.push([p, meta]);
    }
  })(header, '');
  return out;
}

function isPatched(file) {
  const { data, header, dataStart } = readAsar(file);
  const node = header.files.dist.files['main.js'];
  const off = parseInt(node.offset, 10);
  const size = parseInt(node.size, 10);
  return data.slice(dataStart + off, dataStart + off + size).toString('utf8').includes(MARKER);
}

function buildPatched(origAsarFile) {
  const { data, header, dataStart } = readAsar(origAsarFile);
  const entries = collectEntries(header);

  const contents = new Map();
  for (const [p, meta] of entries) {
    if (meta.unpacked || meta.link) continue;
    const off = parseInt(meta.offset, 10);
    const size = parseInt(meta.size, 10);
    contents.set(p, data.slice(dataStart + off, dataStart + off + size));
  }

  const mainKey = 'dist/main.js';
  if (!contents.has(mainKey)) throw new Error('app.asar 里找不到 dist/main.js，版本可能不兼容');
  const orig = contents.get(mainKey);
  const strict = Buffer.from('"use strict";\n');
  if (!orig.slice(0, strict.length).equals(strict)) {
    throw new Error('dist/main.js 开头结构不符合预期，已中止（避免破坏 App）');
  }
  contents.set(mainKey, Buffer.concat([strict, Buffer.from(INJECT, 'utf8'), orig.slice(strict.length)]));

  let offset = 0;
  const chunks = [];
  for (const [p, meta] of entries) {
    if (meta.unpacked || meta.link) continue;
    const blob = contents.get(p);
    meta.size = blob.length;
    meta.offset = String(offset);
    if (meta.integrity) {
      const bs = Number(meta.integrity.blockSize) || 4194304;
      const blocks = [];
      for (let i = 0; i < blob.length; i += bs) blocks.push(sha256(blob.slice(i, i + bs)));
      if (!blocks.length) blocks.push(sha256(Buffer.alloc(0)));
      meta.integrity.hash = sha256(blob);
      meta.integrity.blocks = blocks;
    }
    chunks.push(blob);
    offset += blob.length;
  }

  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const pad2 = (4 - (json.length % 4)) % 4;
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(8 + json.length + pad2, 4);
  head.writeUInt32LE(4 + json.length + pad2, 8);
  head.writeUInt32LE(json.length, 12);
  const out = Buffer.concat([head, json, Buffer.alloc(pad2), ...chunks]);
  return { buffer: out, headerHash: sha256(json) };
}

function readPlistXml() {
  return execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', INFO], { encoding: 'utf8' });
}

function currentPlistHash(xml) {
  const i = xml.indexOf('ElectronAsarIntegrity');
  if (i === -1) return null;
  const seg = xml.slice(i, i + 2000);
  const m = seg.match(/app\.asar<\/key>\s*<dict>[\s\S]*?<key>hash<\/key>\s*<string>([0-9a-fA-F]+)<\/string>/);
  return m ? m[1] : null;
}

function cmd(args) {
  try { execFileSync('/usr/bin/plutil', args, { stdio: 'ignore' }); return true; } catch { return false; }
}

function writePlistWithHash(xml, newHash, oldHash) {
  let out;
  if (oldHash) {
    out = xml.split(oldHash).join(newHash);
  } else {
    out = xml; // 没有旧值则无法替换
  }
  const tmp = path.join(os.tmpdir(), 'ag-info-' + Date.now() + '.plist');
  fs.writeFileSync(tmp, out);
  // 写回为二进制 plist（与原文件一致）
  const ok = cmd(['-convert', 'binary1', '-o', INFO, tmp]);
  fs.unlinkSync(tmp);
  if (!ok) throw new Error('写回 Info.plist 失败');
}

function appRunning() {
  try {
    const target = path.join(APP, 'Contents/MacOS/Antigravity');
    const out = execFileSync('/bin/ps', ['-eo', 'command'], { encoding: 'utf8' });
    return out.split('\n').some((l) => l.includes(target));
  } catch { return false; }
}

function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(BAK_ASAR)) { fs.copyFileSync(ASAR, BAK_ASAR); console.log('已备份 app.asar ->', BAK_ASAR); }
  if (!fs.existsSync(BAK_INFO)) { fs.copyFileSync(INFO, BAK_INFO); console.log('已备份 Info.plist ->', BAK_INFO); }
}

function apply() {
  if (!fs.existsSync(ASAR)) { console.error('找不到 app.asar：' + ASAR); process.exit(2); }
  if (isPatched(ASAR)) { console.log('已打过补丁，无需重复'); return 0; }
  if (appRunning()) { console.error('Antigravity 正在运行，请先退出后再打补丁'); process.exit(3); }

  backup();
  const xml = readPlistXml();
  const oldHash = currentPlistHash(xml);
  if (!oldHash) { console.error('Info.plist 里找不到 ElectronAsarIntegrity，已中止'); process.exit(4); }

  const { buffer, headerHash } = buildPatched(ASAR);
  const tmp = ASAR + '.new';
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, ASAR);
  writePlistWithHash(xml, headerHash, oldHash);
  console.log('✅ 补丁已应用（启动时自动开启本机调试端口 9222）');
  return 0;
}

function restore() {
  if (!fs.existsSync(BAK_ASAR) || !fs.existsSync(BAK_INFO)) { console.error('没有找到备份，无法还原'); process.exit(5); }
  if (appRunning()) { console.error('Antigravity 正在运行，请先退出后再还原'); process.exit(3); }
  fs.copyFileSync(BAK_ASAR, ASAR);
  fs.copyFileSync(BAK_INFO, INFO);
  console.log('✅ 已还原原始 app.asar 与 Info.plist');
  return 0;
}

const mode = process.argv[2] || '--check';
if (mode === '--check') {
  if (!fs.existsSync(ASAR)) process.exit(2);
  const ok = isPatched(ASAR);
  console.log(ok ? 'patched' : 'not-patched');
  process.exit(ok ? 0 : 1);
} else if (mode === '--apply') {
  process.exit(apply());
} else if (mode === '--restore') {
  process.exit(restore());
} else {
  console.error('用法: node patch-asar.js [--check|--apply|--restore]');
  process.exit(64);
}
