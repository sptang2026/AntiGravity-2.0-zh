/**
 * CDP 浏览器级事件驱动长连接 + 精准注入 + 断线重连 + 自愈模块（纯 Node 22 原生 WebSocket / fetch）
 */
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import {
  findAppBundle,
  findMainProcess,
  hasDebugPortFlag,
  isTrustedIdeAgentPort,
  listProcessListeningPorts,
} from './apps.mjs';
import {
  buildInjectionPayload,
  classifyTarget,
  IGNORED_TARGET_TYPES,
  validateCdpWsUrl,
} from './targets.mjs';

const HTTP_TIMEOUT_MS = 1500;
const WS_CONNECT_TIMEOUT_MS = 2500;
const CDP_CALL_TIMEOUT_MS = 3000;
const RELAUNCH_COOLDOWN_MS = 30000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLoopbackJson(port, endpoint) {
  const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 在指定 PID 监听的回环端口中，探测真正响应 CDP `/json/version` 且浏览器 WS 地址合法的调试端口
 */
export async function probeAppCdpPort(pid) {
  const ports = listProcessListeningPorts(pid);
  for (const port of ports) {
    try {
      const info = await fetchLoopbackJson(port, '/json/version');
      const wsUrl = validateCdpWsUrl(info?.webSocketDebuggerUrl, port, '/devtools/browser/');
      if (wsUrl) return { port, browserWsUrl: wsUrl };
    } catch {}
  }
  return null;
}

export async function listCdpTargets(port) {
  try {
    const raw = await fetchLoopbackJson(port, '/json/list');
    if (!Array.isArray(raw)) return [];
    const valid = [];
    for (const t of raw) {
      if (!t || !t.id || IGNORED_TARGET_TYPES.has(t.type)) continue;
      const wsUrl = validateCdpWsUrl(t.webSocketDebuggerUrl, port, '/devtools/page/');
      if (!wsUrl) continue;
      // 校验路径尾部 target ID 与 JSON id 一致
      if (!wsUrl.endsWith(`/${t.id}`)) continue;
      valid.push({ ...t, webSocketDebuggerUrl: wsUrl, debugPort: port });
    }
    return valid;
  } catch {
    return [];
  }
}

function openWebSocket(wsUrl, timeoutMs = WS_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      reject(new Error('WebSocket 连接超时'));
    }, timeoutMs);

    ws.addEventListener(
      'open',
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ws);
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(err?.message || 'WebSocket 连接失败'));
      },
      { once: true }
    );
  });
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) entry.reject(new Error(msg.error.message || 'CDP error'));
        else entry.resolve(msg.result);
      }
    };
    this.ws.addEventListener('message', this.onMessage);
  }

  call(method, params = {}, timeoutMs = CDP_CALL_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket 未连接'));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  close() {
    this.ws.removeEventListener('message', this.onMessage);
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('会话已关闭'));
    }
    this.pending.clear();
    try {
      this.ws.close();
    } catch {}
  }
}

async function isTargetInjectedOnSession(session, expectedFingerprint) {
  const expr =
    `window.__agZhInstalled === true && window.__agZhDocument === document && ` +
    `window.__agZhFingerprint === ${JSON.stringify(expectedFingerprint)}`;
  try {
    const res = await session.call('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res?.result?.value === true;
  } catch {
    return false;
  }
}

/**
 * 计算主脚本与自定义词表联合后的动态指纹（自定义词表变化即触发热更新）
 */
export function computeEffectiveFingerprint(baseFingerprint, customHash = 'none') {
  if (!customHash || customHash === 'none') return baseFingerprint;
  return `${baseFingerprint}+c_${crypto.createHash('sha256').update(customHash).digest('hex').slice(0, 8)}`;
}

/**
 * 向单个已分类的 Target 执行：指纹检查 → 注入 → 复核
 */
export async function ensureTargetInjected(target, classification, bundle, meta) {
  const { mainOverlay, mainFingerprint, swarmOverlay, swarmFingerprint } = bundle;
  const { customEntries = [], customHash = 'none', appMainPid = null } = meta;

  if (classification.kind === 'ide-agent') {
    if (!isTrustedIdeAgentPort(classification.agentPort, appMainPid)) {
      return { ok: false, skipped: true, reason: 'IDE Agent 端口进程归属校验未通过' };
    }
  }

  const baseSource = classification.kind === 'swarm' ? swarmOverlay : mainOverlay;
  const effectiveFingerprint =
    classification.kind === 'swarm'
      ? swarmFingerprint
      : computeEffectiveFingerprint(mainFingerprint, customHash);

  const ws = await openWebSocket(target.webSocketDebuggerUrl);
  const session = new CdpSession(ws);
  try {
    if (await isTargetInjectedOnSession(session, effectiveFingerprint)) {
      return { ok: true, alreadyInjected: true };
    }

    const payload = buildInjectionPayload(classification, baseSource, {
      fingerprint: effectiveFingerprint,
      customEntries,
    });

    if (classification.kind === 'main') {
      await session.call('Page.enable').catch(() => {});
      await session.call('Page.addScriptToEvaluateOnNewDocument', { source: payload }).catch(() => {});
    }

    const evalRes = await session.call('Runtime.evaluate', {
      expression: payload,
      awaitPromise: false,
    });
    if (evalRes?.exceptionDetails) {
      throw new Error(evalRes.exceptionDetails.text || 'Runtime.evaluate 抛出异常');
    }

    const verified = await isTargetInjectedOnSession(session, effectiveFingerprint);
    return { ok: verified, alreadyInjected: false };
  } finally {
    session.close();
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execFileSync('/bin/kill', ['-0', String(pid)], { stdio: 'ignore' });
    } catch {
      return true;
    }
    await sleep(400);
  }
  return false;
}

/**
 * 优雅退出未带调试端口的 App 并以 --remote-debugging-port=0 重新拉起（仅在 --watch 自愈模式下调用）
 */
async function relaunchAppWithDebugPort(appCfg, pid) {
  const appPath = findAppBundle(appCfg);
  if (!appPath) return false;

  console.error(`[antigravity-zh] 检测到 ${appCfg.name} 未带调试端口，正在自动重启并注入中文…`);
  try {
    execFileSync('/usr/bin/osascript', ['-e', `tell application id "${appCfg.bundleId}" to quit`], {
      timeout: 8000,
      stdio: 'ignore',
    });
  } catch {}

  const exited = await waitForProcessExit(pid, 9000);
  if (!exited) {
    try {
      execFileSync('/bin/kill', ['-TERM', String(pid)], { stdio: 'ignore' });
    } catch {}
    await waitForProcessExit(pid, 4000);
  }

  // 清除可能污染子进程的 ELECTRON_RUN_AS_NODE 环境变量
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  spawn('/usr/bin/open', ['-a', appPath, '--args', '--remote-debugging-port=0'], {
    detached: true,
    stdio: 'ignore',
    env: cleanEnv,
  }).unref();

  return true;
}

/**
 * 单次扫描并注入指定 App 的全部合格目标（绝不重启 App）
 */
export async function injectAppOnce(appCfg, bundle, customProvider) {
  const proc = findMainProcess(appCfg);
  if (!proc) return { app: appCfg.name, running: false, port: null, injected: 0 };

  const cdpInfo = await probeAppCdpPort(proc.pid);
  if (!cdpInfo) return { app: appCfg.name, running: true, port: null, injected: 0 };

  const custom = customProvider();
  const targets = await listCdpTargets(cdpInfo.port);
  let count = 0;

  for (const target of targets) {
    const cls = classifyTarget(target, appCfg);
    if (!cls) continue;
    try {
      const res = await ensureTargetInjected(target, cls, bundle, {
        customEntries: custom.entries,
        customHash: custom.hash,
        appMainPid: proc.pid,
      });
      if (res.ok) count += 1;
    } catch {}
  }

  return { app: appCfg.name, running: true, port: cdpInfo.port, injected: count };
}

/**
 * 单个 App 的事件驱动常驻监视器
 */
export class AppWatcher {
  constructor(appCfg, bundle, customProvider) {
    this.appCfg = appCfg;
    this.bundle = bundle;
    this.customProvider = customProvider;
    this.stopped = false;
    this.lastRelaunch = 0;
    this.inFlight = new Set();
    this.injectedFingerprints = new Map();
    this.activePort = null;
    this.activePid = null;
    this.browserWs = null;
    this.browserSession = null;
  }

  stop() {
    this.stopped = true;
    this.closeBrowserConnection();
  }

  closeBrowserConnection() {
    if (this.browserSession) {
      this.browserSession.close();
      this.browserSession = null;
    }
    this.browserWs = null;
    this.activePort = null;
    this.injectedFingerprints.clear();
  }

  async handleTarget(target) {
    if (!target || !target.id) return;
    const cls = classifyTarget(target, this.appCfg);
    if (!cls) return;

    const custom = this.customProvider();
    const expectedFp =
      cls.kind === 'swarm'
        ? this.bundle.swarmFingerprint
        : computeEffectiveFingerprint(this.bundle.mainFingerprint, custom.hash);

    if (this.injectedFingerprints.get(target.id) === expectedFp) return;
    if (this.inFlight.has(target.id)) return;
    this.inFlight.add(target.id);

    try {
      const wsUrl = validateCdpWsUrl(
        target.webSocketDebuggerUrl || `ws://127.0.0.1:${this.activePort}/devtools/page/${target.id}`,
        this.activePort,
        '/devtools/page/'
      );
      if (!wsUrl) return;
      const normalizedTarget = { ...target, webSocketDebuggerUrl: wsUrl, debugPort: this.activePort };

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await ensureTargetInjected(normalizedTarget, cls, this.bundle, {
            customEntries: custom.entries,
            customHash: custom.hash,
            appMainPid: this.activePid,
          });
          if (res.ok) {
            this.injectedFingerprints.set(target.id, expectedFp);
            return;
          }
          if (res.skipped) return;
        } catch {}
        if (attempt < 3) await sleep(attempt * 250);
      }
    } finally {
      this.inFlight.delete(target.id);
    }
  }

  async scanAllTargets() {
    if (!this.activePort) return;
    const targets = await listCdpTargets(this.activePort);
    const liveIds = new Set(targets.map((t) => t.id));
    for (const id of this.injectedFingerprints.keys()) {
      if (!liveIds.has(id)) this.injectedFingerprints.delete(id);
    }
    await Promise.all(targets.map((t) => this.handleTarget(t)));
  }

  async attachBrowser(pid, cdpInfo) {
    this.activePid = pid;
    this.activePort = cdpInfo.port;
    const ws = await openWebSocket(cdpInfo.browserWsUrl);
    const session = new CdpSession(ws);
    this.browserWs = ws;
    this.browserSession = session;

    const onEvent = (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.method === 'Target.targetDestroyed') {
        const id = msg.params?.targetId;
        if (id) this.injectedFingerprints.delete(id);
        return;
      }
      if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
        const info = msg.params?.targetInfo;
        if (!info || !info.targetId || IGNORED_TARGET_TYPES.has(info.type)) return;
        this.handleTarget({
          id: info.targetId,
          type: info.type,
          title: info.title || '',
          url: info.url || '',
        }).catch(() => {});
      }
    };
    ws.addEventListener('message', onEvent);

    await session.call('Target.setDiscoverTargets', { discover: true });
    await this.scanAllTargets();

    // 等待长连接断开，期间每 4 秒低频巡检兜底（兼顾自定义词表热更新与漏网补刀）
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(watchdog);
        ws.removeEventListener('message', onEvent);
        resolve();
      };
      ws.addEventListener('close', finish, { once: true });
      ws.addEventListener('error', finish, { once: true });

      const watchdog = setInterval(() => {
        if (this.stopped || ws.readyState !== WebSocket.OPEN) {
          finish();
          return;
        }
        this.scanAllTargets().catch(() => {});
      }, 4000);
    });

    this.closeBrowserConnection();
  }

  async runLoop() {
    while (!this.stopped) {
      try {
        const proc = findMainProcess(this.appCfg);
        if (!proc) {
          await sleep(3000);
          continue;
        }

        if (!hasDebugPortFlag(proc)) {
          if (Date.now() - this.lastRelaunch > RELAUNCH_COOLDOWN_MS) {
            this.lastRelaunch = Date.now();
            await relaunchAppWithDebugPort(this.appCfg, proc.pid);
            await sleep(7000);
            continue;
          }
          await sleep(3000);
          continue;
        }

        const cdpInfo = await probeAppCdpPort(proc.pid);
        if (!cdpInfo) {
          await sleep(1500);
          continue;
        }

        await this.attachBrowser(proc.pid, cdpInfo);
      } catch (err) {
        console.error(`[antigravity-zh][${this.appCfg.name}] 监视异常: ${err?.message || err}`);
        this.closeBrowserConnection();
      }
      await sleep(2000);
    }
  }
}
