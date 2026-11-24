#!/usr/bin/env node
'use strict';

/**
 * AntiGravity 2.0 中文汉化 · 统一可执行入口（LaunchAgent 与命令行共用）
 * 兼容原有启动命令：
 *   node mac/bin/antigravity-zh-patch.js --watch
 *   node mac/bin/antigravity-zh-patch.js
 *   node mac/bin/antigravity-zh-patch.js --status
 *   node mac/bin/antigravity-zh-patch.js --desktop-only / --ide-only
 */
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const daemonUrl = pathToFileURL(path.resolve(__dirname, '../../src/daemon/index.mjs')).href;
  const overlaysUrl = pathToFileURL(path.resolve(__dirname, './overlays.generated.mjs')).href;

  const [{ runCli }, overlays] = await Promise.all([import(daemonUrl), import(overlaysUrl)]);

  await runCli(process.argv.slice(2), {
    mainOverlay: overlays.MAIN_OVERLAY,
    mainFingerprint: overlays.MAIN_FINGERPRINT,
    swarmOverlay: overlays.SWARM_OVERLAY,
    swarmFingerprint: overlays.SWARM_FINGERPRINT,
    stats: overlays.OVERLAY_STATS,
  });
})().catch((err) => {
  console.error('[antigravity-zh] 启动失败:', err && err.stack ? err.stack : err);
  process.exit(1);
});
