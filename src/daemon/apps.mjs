/**
 * macOS Antigravity 桌面版与 Antigravity IDE 应用探测、进程与端口归属校验模块
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_DESKTOP = Object.freeze({
  id: 'desktop',
  name: 'Antigravity',
  bundleName: 'Antigravity.app',
  bundleId: 'com.google.antigravity',
  exeRelPath: 'Contents/MacOS/Antigravity',
});

export const APP_IDE = Object.freeze({
  id: 'ide',
  name: 'Antigravity IDE',
  bundleName: 'Antigravity IDE.app',
  bundleId: 'com.google.antigravity-ide',
  exeRelPath: 'Contents/MacOS/Electron',
});

export const SUPPORTED_APPS = Object.freeze([APP_DESKTOP, APP_IDE]);

/**
 * 定位已安装的 .app 目录（优先 /Applications，其次 ~/Applications）
 */
export function findAppBundle(appCfg, envOverride = null) {
  if (envOverride && fs.existsSync(envOverride)) return envOverride;
  const candidates = [
    path.join('/Applications', appCfg.bundleName),
    path.join(os.homedir(), 'Applications', appCfg.bundleName),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

/**
 * 解析 `ps -eo pid,ppid,command` 输出
 * @param {string} psOutput
 * @returns {Array<{ pid: number, ppid: number, command: string }>}
 */
export function parsePsOutput(psOutput) {
  const list = [];
  for (const raw of String(psOutput || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
    if (!m) continue;
    list.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      command: m[3],
    });
  }
  return list;
}

export function readProcessTable() {
  try {
    const out = execFileSync('/bin/ps', ['-eo', 'pid,ppid,command'], { encoding: 'utf8' });
    return parsePsOutput(out);
  } catch {
    return [];
  }
}

/**
 * 在进程表中找到指定 App 的主进程记录
 */
export function findMainProcess(appCfg, processTable = null) {
  const table = processTable ?? readProcessTable();
  const exeMarker = `/${appCfg.bundleName}/${appCfg.exeRelPath}`;
  for (const proc of table) {
    const cmd = proc.command;
    if (
      cmd.includes(exeMarker) &&
      !cmd.includes('antigravity-zh-patch') &&
      !cmd.includes('Helper') &&
      !cmd.includes('--type=') &&
      !cmd.includes(' -e ')
    ) {
      return proc;
    }
  }
  return null;
}

/**
 * 判断主进程命令行是否携带 --remote-debugging-port 参数
 */
export function hasDebugPortFlag(proc) {
  if (!proc || !proc.command) return false;
  return proc.command.includes('--remote-debugging-port');
}

/**
 * 解析 lsof 输出，提取指定进程在 127.0.0.1 上 LISTEN 的全部 TCP 端口
 */
export function parseListeningPorts(lsofOutput) {
  const ports = new Set();
  for (const m of String(lsofOutput || '').matchAll(/(?:127\.0\.0\.1|\[::1\]):(\d+)\s+\(LISTEN\)/g)) {
    const p = Number(m[1]);
    if (p > 0 && p <= 65535) ports.add(p);
  }
  return Array.from(ports);
}

/**
 * 获取某 PID 监听的本机回环 TCP 端口（天然具备端口进程归属保证）
 */
export function listProcessListeningPorts(pid) {
  if (!pid) return [];
  try {
    const out = execFileSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    return parseListeningPorts(out);
  } catch {
    return [];
  }
}

/**
 * 查找监听指定本机回环端口的 PID 列表
 */
export function findPidsListeningOnPort(port) {
  if (!port || port <= 0 || port > 65535) return [];
  try {
    const out = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], {
      encoding: 'utf8',
    });
    const pids = [];
    for (const line of out.split('\n')) {
      if (line.startsWith('p')) {
        const pid = Number(line.slice(1));
        if (pid > 0) pids.push(pid);
      }
    }
    return pids;
  } catch {
    return [];
  }
}

/**
 * 校验 childPid 是否位于 ancestorPid 的进程派生链中
 */
export function isPidDescendantOf(childPid, ancestorPid, processTable = null) {
  if (!childPid || !ancestorPid) return false;
  if (childPid === ancestorPid) return true;
  const table = processTable ?? readProcessTable();
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const visited = new Set();
  let cur = childPid;
  for (let depth = 0; depth < 32 && cur > 0 && !visited.has(cur); depth++) {
    if (cur === ancestorPid) return true;
    visited.add(cur);
    const info = byPid.get(cur);
    if (!info) break;
    cur = info.ppid;
  }
  return false;
}

/**
 * 校验 IDE Agent iframe 监听端口是否由本 IDE 进程树内的受信任进程（如 ~/.gemini/bin/agy）提供
 */
export function isTrustedIdeAgentPort(agentPort, ideMainPid, options = {}) {
  if (!agentPort || !ideMainPid) return false;
  const pids = options.listeningPids ?? findPidsListeningOnPort(agentPort);
  if (!pids.length) return false;
  const table = options.processTable ?? readProcessTable();
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const expectedAgyPath = options.expectedAgyPath ?? path.join(os.homedir(), '.gemini', 'bin', 'agy');

  for (const pid of pids) {
    if (!isPidDescendantOf(pid, ideMainPid, table)) continue;
    const info = byPid.get(pid);
    if (!info) continue;
    // 允许 ~/.gemini/bin/agy 或 IDE 自身 Helper/Electron 进程派生的本地服务
    if (
      info.command.includes(expectedAgyPath) ||
      info.command.includes('/Antigravity IDE.app/')
    ) {
      return true;
    }
  }
  return false;
}
