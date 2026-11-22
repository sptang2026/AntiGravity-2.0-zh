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
 *   node patch-asar.js --verify     # 健康校验：asar 标记 + integrity 哈希是否一致
 *   node patch-asar.js --apply      # 打补丁（自动备份；App 需先退出）
 *   node patch-asar.js --restore    # 还原原始文件
 *
 * v1.2.0 修复（针对"打完补丁 App 打不开 / 提示移到废纸篓"）：
 *   1. 打补丁后会清除 com.apple.quarantine —— 改 app.asar 会让 Google 签名失效，
 *      而新下载的 App 带隔离属性，macOS Gatekeeper 会把"签名失效 + 有 quarantine"
 *      判定为"已损坏"，直接拒绝启动。这是外部用户必踩的坑。
 *   2. 事务式写入：asar 与 Info.plist 先各自写临时文件，再连续 rename 提交；
 *      任一步失败立即从备份回滚，杜绝"asar 已改、哈希没改"的半改状态
 *      （这种状态会让 App 静默退出，且没有任何报错）。
 *   3. 打完自动自校验（asar 标记 + integrity 哈希），不通过立即回滚并报错。
 *   4. restore 后同样清除 quarantine，保证还原后能正常打开。
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

/** 把改好哈希的 plist XML 编译成二进制 plist 写到 destPath（不碰 Info.plist 本身） */
function buildPlistBinary(xml, newHash, oldHash, destPath) {
  if (!oldHash) throw new Error('Info.plist 里找不到 ElectronAsarIntegrity');
  // 注意：修复"半改"状态时，plist 里可能已经是正确的新哈希（newHash === oldHash），
  // 此时无需替换，也不能把它当成失败。
  let out = xml;
  if (oldHash !== newHash) {
    out = xml.split(oldHash).join(newHash);
    if (out === xml) throw new Error('替换 integrity 哈希失败（未匹配到旧值）');
  }
  const tmpXml = path.join(path.dirname(destPath), '.ag-info-' + process.pid + '.xml');
  fs.writeFileSync(tmpXml, out);
  try {
    execFileSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', destPath, tmpXml], { stdio: 'ignore' });
  } finally {
    try { fs.unlinkSync(tmpXml); } catch {}
  }
}

function appRunning() {
  try {
    const target = path.join(APP, 'Contents/MacOS/Antigravity');
    const out = execFileSync('/bin/ps', ['-eo', 'command'], { encoding: 'utf8' });
    return out.split('\n').some((l) => l.includes(target));
  } catch { return false; }
}

function hasQuarantine(appDir = APP) {
  try {
    execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', appDir], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/**
 * 清除 quarantine。这一步不是"可选优化"，而是打补丁后的必要收尾：
 * 改过 app.asar 后 Google 签名必然失效，若 App 仍带隔离属性，
 * Gatekeeper 会判定"已损坏，应移到废纸篓"，用户双击无任何反应。
 */
function stripQuarantine(appDir = APP) {
  try {
    execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', appDir], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(BAK_ASAR)) { fs.copyFileSync(ASAR, BAK_ASAR); console.log('已备份 app.asar ->', BAK_ASAR); }
  if (!fs.existsSync(BAK_INFO)) { fs.copyFileSync(INFO, BAK_INFO); console.log('已备份 Info.plist ->', BAK_INFO); }
}

function rollback() {
  try { if (fs.existsSync(BAK_ASAR)) fs.copyFileSync(BAK_ASAR, ASAR); } catch {}
  try { if (fs.existsSync(BAK_INFO)) fs.copyFileSync(BAK_INFO, INFO); } catch {}
}

/** 校验当前文件状态：asar 是否带补丁、哈希是否与 Info.plist 一致 */
function verifyIntegrity() {
  const res = { consistent: false, patched: false, reason: '', hash: null, plistHash: null };
  if (!fs.existsSync(ASAR) || !fs.existsSync(INFO)) {
    res.reason = 'app.asar 或 Info.plist 不存在';
    return res;
  }
  try {
    res.patched = isPatched(ASAR);
  } catch (err) {
    res.reason = '无法解析 app.asar：' + err.message;
    return res;
  }
  let data;
  try {
    data = fs.readFileSync(ASAR);
    const jsonLen = data.readUInt32LE(12);
    res.hash = sha256(data.slice(16, 16 + jsonLen));
  } catch (err) {
    res.reason = '无法读取 app.asar 头部：' + err.message;
    return res;
  }
  try {
    res.plistHash = currentPlistHash(readPlistXml());
  } catch (err) {
    res.reason = '无法读取 Info.plist：' + err.message;
    return res;
  }
  if (!res.plistHash) {
    res.reason = 'Info.plist 缺少 ElectronAsarIntegrity';
    return res;
  }
  if (res.hash !== res.plistHash) {
    res.reason = 'asar 哈希与 Info.plist 不一致（这会让 App 启动后静默退出）';
    return res;
  }
  res.consistent = true;
  return res;
}

function apply() {
  if (!fs.existsSync(ASAR)) { console.error('找不到 app.asar：' + ASAR); process.exit(2); }
  if (appRunning()) { console.error('Antigravity 正在运行，请先退出后再打补丁'); process.exit(3); }

  // 已打过且哈希一致：只需补一下 quarantine 清理
  if (isPatched(ASAR)) {
    const cur = verifyIntegrity();
    if (cur.consistent) {
      if (hasQuarantine()) { stripQuarantine(); console.log('已清除 App 的 quarantine 隔离属性'); }
      console.log('已打过补丁，无需重复');
      return 0;
    }
    console.error('检测到补丁状态不一致（' + cur.reason + '），将重新应用');
  }

  backup();
  const xml = readPlistXml();
  const oldHash = currentPlistHash(xml);
  if (!oldHash) { console.error('Info.plist 里找不到 ElectronAsarIntegrity，已中止'); process.exit(4); }

  const { buffer, headerHash } = buildPatched(ASAR);

  // 两个目标文件都先写成同目录临时文件，保证 rename 不跨卷、可回滚
  const tmpAsar = path.join(path.dirname(ASAR), '.app.asar.new-' + process.pid);
  const tmpPlist = path.join(path.dirname(INFO), '.Info.plist.new-' + process.pid);

  try {
    fs.writeFileSync(tmpAsar, buffer);
    buildPlistBinary(xml, headerHash, oldHash, tmpPlist);
  } catch (err) {
    try { fs.unlinkSync(tmpAsar); } catch {}
    try { fs.unlinkSync(tmpPlist); } catch {}
    console.error('❌ 生成新文件失败，App 未被修改：' + (err && err.message ? err.message : err));
    process.exit(5);
  }

  // 提交：两次 rename 尽量靠近，失败则整体回滚
  try {
    fs.renameSync(tmpAsar, ASAR);
    fs.renameSync(tmpPlist, INFO);
  } catch (err) {
    try { fs.unlinkSync(tmpAsar); } catch {}
    try { fs.unlinkSync(tmpPlist); } catch {}
    rollback();
    console.error('❌ 写入失败，已从备份回滚：' + (err && err.message ? err.message : err));
    process.exit(6);
  }

  // 自校验：不通过立即回滚，绝不留下"打不开"的状态
  const v = verifyIntegrity();
  if (!v.consistent || !v.patched) {
    rollback();
    console.error('❌ 自校验失败（' + (v.reason || '补丁未生效') + '），已回滚到原始文件');
    process.exit(7);
  }

  const hadQuarantine = hasQuarantine();
  stripQuarantine();
  console.log('✅ 补丁已应用（启动时自动开启本机调试端口）');
  console.log('   完整性校验：asar 哈希与 Info.plist 一致');
  if (hadQuarantine) console.log('   已清除 quarantine（否则签名失效后 Gatekeeper 会拒绝启动）');
  return 0;
}

function restore() {
  if (!fs.existsSync(BAK_ASAR) || !fs.existsSync(BAK_INFO)) { console.error('没有找到备份，无法还原'); process.exit(5); }
  if (appRunning()) { console.error('Antigravity 正在运行，请先退出后再还原'); process.exit(3); }
  fs.copyFileSync(BAK_ASAR, ASAR);
  fs.copyFileSync(BAK_INFO, INFO);
  stripQuarantine();
  const v = verifyIntegrity();
  if (!v.consistent) {
    console.error('⚠️  已还原文件，但哈希校验仍不一致（' + v.reason + '），请重新安装 Antigravity');
    process.exit(7);
  }
  console.log('✅ 已还原原始 app.asar 与 Info.plist（并清除 quarantine）');
  return 0;
}

const mode = process.argv[2] || '--check';
if (mode === '--check') {
  if (!fs.existsSync(ASAR)) process.exit(2);
  const ok = isPatched(ASAR);
  console.log(ok ? 'patched' : 'not-patched');
  process.exit(ok ? 0 : 1);
} else if (mode === '--verify') {
  const v = verifyIntegrity();
  if (v.consistent && v.patched) {
    console.log('ok: patched & consistent');
    process.exit(0);
  }
  console.log('fail: ' + (v.reason || (v.patched ? 'unknown' : '未打补丁')));
  process.exit(1);
} else if (mode === '--apply') {
  process.exit(apply());
} else if (mode === '--restore') {
  process.exit(restore());
} else {
  console.error('用法: node patch-asar.js [--check|--verify|--apply|--restore]');
  process.exit(64);
}
