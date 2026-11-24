/**
 * CDP Target 白名单过滤、WebSocket URL 安全校验与脚本二次封装模块
 */
import { APP_IDE } from './apps.mjs';

export const IGNORED_TARGET_TYPES = new Set([
  'worker',
  'service_worker',
  'shared_worker',
  'background_page',
]);

const SWARM_HOST_RE = /^swarm--swarm_board-[a-z0-9]{1,16}$/i;

const IDE_AGENT_STATIC_ROUTES = new Set([
  '/',
  '/settings-standalone',
  '/terminal-standalone',
  '/history',
  '/multi',
  '/new-project',
  '/artifact',
]);

const IDE_AGENT_DYNAMIC_RE =
  /^(?:\/c\/[A-Za-z0-9_-]+|\/forked\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|\/view\/[A-Za-z0-9_-]+|\/battle\/[A-Za-z0-9_-]+|\/sidecars\/(?:triggers\/)?[A-Za-z0-9._-]+|\/customizations(?:\/browse|\/(?:plugins|sidecars)\/[A-Za-z0-9._-]+|\/marketplaces\/[A-Za-z0-9._-]+\/(?:plugins|skills|bundles)\/[A-Za-z0-9._-]+)?)$/;

export function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

/**
 * 严格校验 CDP WebSocket 地址：必须是本机回环、匹配预期端口、且路径前缀合法
 */
export function validateCdpWsUrl(rawUrl, expectedPort, expectedPathPrefix = '/devtools/') {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'ws:') return null;
  if (u.username || u.password) return null;
  if (!isLoopbackHost(u.hostname)) return null;
  if (Number(u.port) !== Number(expectedPort)) return null;
  if (!u.pathname.startsWith(expectedPathPrefix)) return null;
  return u.toString();
}

export function isAllowedIdeAgentRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname || pathname.includes('..')) return false;
  if (IDE_AGENT_STATIC_ROUTES.has(pathname)) return true;
  return IDE_AGENT_DYNAMIC_RE.test(pathname);
}

/**
 * 判断是否为主界面页面
 */
export function isMainTargetUrl(rawURL, appCfg) {
  if (typeof rawURL !== 'string' || !rawURL) return false;
  const lower = rawURL.toLowerCase();

  if (appCfg.id === APP_IDE.id) {
    let u;
    try {
      u = new URL(rawURL);
    } catch {
      return false;
    }
    if (u.username || u.password) return false;
    const isLocalFile = u.protocol === 'file:' && (!u.hostname || u.hostname.toLowerCase() === 'localhost');
    const isVscodeFile = u.protocol === 'vscode-file:' && u.hostname.toLowerCase() === 'vscode-app';
    if (!isLocalFile && !isVscodeFile) return false;
    const base = u.pathname.split('/').pop()?.toLowerCase() || '';
    return base === 'workbench.html' || base === 'workbench-jetski-agent.html';
  }

  // 桌面版主页面：data:text/html 首屏或本机回环 http(s)
  if (lower.startsWith('data:text/html')) return true;
  let u;
  try {
    u = new URL(rawURL);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  return (u.protocol === 'http:' || u.protocol === 'https:') && isLoopbackHost(u.hostname);
}

/**
 * 判断是否为 Swarm 面板独立 plugin:// iframe
 */
export function matchSwarmTarget(target) {
  if (!target || target.type !== 'iframe' || typeof target.url !== 'string') return null;
  let u;
  try {
    u = new URL(target.url);
  } catch {
    return null;
  }
  if (u.protocol !== 'plugin:' || u.username || u.password || u.port || u.hash) return null;
  if (u.pathname && u.pathname !== '/') return null;
  if (!SWARM_HOST_RE.test(u.hostname)) return null;
  return { kind: 'swarm', host: u.hostname };
}

/**
 * 判断是否为 Antigravity IDE 的智能体/独立设置 iframe
 */
export function matchIdeAgentTarget(target, appCfg) {
  if (!target || appCfg.id !== APP_IDE.id || target.type !== 'iframe' || typeof target.url !== 'string') {
    return null;
  }
  let u;
  try {
    u = new URL(target.url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password || u.hash) return null;
  if (!isAllowedIdeAgentRoute(u.pathname)) return null;
  const agentPort = Number(u.port);
  if (!Number.isInteger(agentPort) || agentPort <= 0 || agentPort > 65535) return null;
  return { kind: 'ide-agent', agentPort, route: u.pathname };
}

/**
 * 综合分类一个 CDP target
 * @returns {null | { kind: 'main' } | { kind: 'swarm', host: string } | { kind: 'ide-agent', agentPort: number, route: string }}
 */
export function classifyTarget(target, appCfg) {
  if (!target || !target.id || IGNORED_TARGET_TYPES.has(target.type)) return null;
  if (target.type === 'page' && isMainTargetUrl(target.url, appCfg)) {
    return { kind: 'main' };
  }
  const swarm = matchSwarmTarget(target);
  if (swarm) return swarm;
  const ideAgent = matchIdeAgentTarget(target, appCfg);
  if (ideAgent) return ideAgent;
  return null;
}

/**
 * 为注入脚本附加指纹、自定义词表及执行期二次校验包装
 */
export function buildInjectionPayload(classification, baseSource, options = {}) {
  const { fingerprint, customEntries = [] } = options;
  const preamble =
    `window.__agZhRequestedFingerprint = ${JSON.stringify(fingerprint)};\n` +
    `window.__agZhCustom = ${JSON.stringify(customEntries)};\n`;

  if (classification.kind === 'swarm') {
    const hostLit = JSON.stringify(classification.host);
    return (
      `(() => {\n` +
      `  if (location.protocol !== 'plugin:' || location.hostname !== ${hostLit}) return;\n` +
      `  window.__agZhRequestedFingerprint = ${JSON.stringify(fingerprint)};\n` +
      `${baseSource}\n` +
      `})();`
    );
  }

  if (classification.kind === 'ide-agent') {
    const portLit = JSON.stringify(String(classification.agentPort));
    const routeLit = JSON.stringify(classification.route);
    return (
      `(() => {\n` +
      `  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || location.port !== ${portLit} || location.pathname !== ${routeLit} || !document.getElementById('root')) return;\n` +
      `${preamble}` +
      `${baseSource}\n` +
      `})();`
    );
  }

  return `${preamble}${baseSource}`;
}
