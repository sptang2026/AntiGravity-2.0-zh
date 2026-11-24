/**
 * AntiGravity 2.0 中文汉化 · 主守护进程入口（仅 macOS，支持桌面版 + IDE 双产品）
 *
 * 参数：
 *   --watch          开机常驻事件驱动守护模式（自动检测与自愈）
 *   --desktop-only   仅处理 Antigravity 桌面版
 *   --ide-only       仅处理 Antigravity IDE
 *   --status         只读查看当前安装/运行/端口/自定义词表状态（绝不重启 App）
 *   （无参数）        单次扫描并注入所有已开启调试端口的页面（绝不重启 App）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_DESKTOP,
  APP_IDE,
  findAppBundle,
  findMainProcess,
  hasDebugPortFlag,
  SUPPORTED_APPS,
} from './apps.mjs';
import { AppWatcher, injectAppOnce, probeAppCdpPort } from './cdp-client.mjs';
import { loadSafeCustomTranslations } from './custom-dict.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function resolveTargetApps(argv) {
  const desktopOnly = argv.includes('--desktop-only');
  const ideOnly = argv.includes('--ide-only');
  if (desktopOnly && !ideOnly) return [APP_DESKTOP];
  if (ideOnly && !desktopOnly) return [APP_IDE];
  return SUPPORTED_APPS;
}

function createCustomProvider() {
  const customPath = process.env.AG_CUSTOM_DICT || path.join(REPO_ROOT, 'custom-translations.txt');
  let lastWarn = null;
  return () => {
    const res = loadSafeCustomTranslations(customPath);
    if (res.warning && res.warning !== lastWarn) {
      lastWarn = res.warning;
      console.error(`[antigravity-zh] ${res.warning}`);
    }
    if (!res.warning) lastWarn = null;
    return res;
  };
}

export async function runCli(argv, bundle) {
  const apps = resolveTargetApps(argv);
  const customProvider = createCustomProvider();

  if (argv.includes('--status')) {
    const custom = customProvider();
    console.log('=== AntiGravity 中文汉化状态 ===');
    console.log(`主词库指纹: ${bundle.mainFingerprint} (${bundle.stats.mainTotal} 条)`);
    console.log(`Swarm 指纹: ${bundle.swarmFingerprint} (${bundle.stats.swarmTotal} 条)`);
    console.log(
      `自定义词表: ${custom.loaded ? `已加载 ${custom.entries.length} 条 (${custom.hash})` : '未配置'}`
    );
    for (const cfg of apps) {
      const bundlePath = findAppBundle(cfg);
      const proc = findMainProcess(cfg);
      const hasFlag = proc ? hasDebugPortFlag(proc) : false;
      const cdp = proc ? await probeAppCdpPort(proc.pid) : null;
      console.log(
        `- ${cfg.name}: 安装=${bundlePath || '未安装'} | 运行=${proc ? `PID ${proc.pid}` : '未运行'} | 调试参数=${hasFlag ? '是' : '否'} | CDP端口=${cdp ? cdp.port : '无'}`
      );
    }
    return;
  }

  if (argv.includes('--watch')) {
    const watchers = apps.map((cfg) => new AppWatcher(cfg, bundle, customProvider));
    const shutdown = () => {
      for (const w of watchers) w.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await Promise.all(watchers.map((w) => w.runLoop()));
    return;
  }

  let total = 0;
  for (const cfg of apps) {
    const res = await injectAppOnce(cfg, bundle, customProvider);
    total += res.injected;
    if (res.running && res.port) {
      console.log(`[${cfg.name}] 已通过端口 ${res.port} 注入 ${res.injected} 个目标。`);
    }
  }
  console.log(`Injected Antigravity Chinese overlay into ${total} target(s).`);
}
