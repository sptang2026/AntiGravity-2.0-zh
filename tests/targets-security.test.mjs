import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_DESKTOP,
  APP_IDE,
  findMainProcess,
  hasDebugPortFlag,
  isPidDescendantOf,
  isTrustedIdeAgentPort,
  parseListeningPorts,
  parsePsOutput,
} from '../src/daemon/apps.mjs';
import { buildInjectionPayload, classifyTarget, validateCdpWsUrl } from '../src/daemon/targets.mjs';

test('validateCdpWsUrl 严格拦截非回环、端口不匹配与畸形 URL', () => {
  assert.ok(validateCdpWsUrl('ws://127.0.0.1:9222/devtools/browser/abc', 9222, '/devtools/browser/'));
  assert.ok(validateCdpWsUrl('ws://localhost:9222/devtools/page/123', 9222, '/devtools/page/'));
  assert.equal(validateCdpWsUrl('ws://192.168.1.5:9222/devtools/page/123', 9222, '/devtools/page/'), null);
  assert.equal(validateCdpWsUrl('ws://127.0.0.1:9999/devtools/page/123', 9222, '/devtools/page/'), null);
  assert.equal(validateCdpWsUrl('ws://user:pass@127.0.0.1:9222/devtools/page/123', 9222, '/devtools/page/'), null);
  assert.equal(validateCdpWsUrl('http://127.0.0.1:9222/devtools/page/123', 9222, '/devtools/page/'), null);
  assert.equal(validateCdpWsUrl('ws://127.0.0.1:9222/other/123', 9222, '/devtools/page/'), null);
});

test('classifyTarget 准确识别桌面版、Swarm 子帧、IDE 主页与受控 Agent iframe 并拦截外部网页', () => {
  // 桌面版主页 & 首屏
  assert.deepEqual(
    classifyTarget({ id: '1', type: 'page', url: 'http://127.0.0.1:51234/' }, APP_DESKTOP),
    { kind: 'main' }
  );
  assert.deepEqual(
    classifyTarget({ id: '2', type: 'page', url: 'data:text/html;charset=utf-8,<html></html>' }, APP_DESKTOP),
    { kind: 'main' }
  );
  // 拒绝外部网页与 worker
  assert.equal(classifyTarget({ id: '3', type: 'page', url: 'https://google.com/' }, APP_DESKTOP), null);
  assert.equal(classifyTarget({ id: '4', type: 'service_worker', url: 'http://127.0.0.1:51234/sw.js' }, APP_DESKTOP), null);

  // Swarm plugin:// iframe（桌面版与 IDE 均支持）
  assert.deepEqual(
    classifyTarget({ id: '5', type: 'iframe', url: 'plugin://swarm--swarm_board-a1b2c3/?token=secret' }, APP_DESKTOP),
    { kind: 'swarm', host: 'swarm--swarm_board-a1b2c3' }
  );
  assert.equal(
    classifyTarget({ id: '6', type: 'page', url: 'plugin://swarm--swarm_board-a1b2c3/' }, APP_DESKTOP),
    null,
    'Swarm 必须是 iframe 类型'
  );
  assert.equal(
    classifyTarget({ id: '7', type: 'iframe', url: 'plugin://other--plugin-123/' }, APP_DESKTOP),
    null
  );

  // IDE 主页面与 Jetski Agent 页面
  assert.deepEqual(
    classifyTarget(
      { id: '8', type: 'page', url: 'vscode-file://vscode-app/Applications/Antigravity%20IDE.app/workbench.html' },
      APP_IDE
    ),
    { kind: 'main' }
  );
  assert.deepEqual(
    classifyTarget(
      { id: '9', type: 'page', url: 'file:///Applications/Antigravity%20IDE.app/workbench-jetski-agent.html' },
      APP_IDE
    ),
    { kind: 'main' }
  );

  // IDE Agent iframe 白名单与防路径穿越
  assert.deepEqual(
    classifyTarget({ id: '10', type: 'iframe', url: 'http://127.0.0.1:43210/settings-standalone' }, APP_IDE),
    { kind: 'ide-agent', agentPort: 43210, route: '/settings-standalone' }
  );
  assert.deepEqual(
    classifyTarget({ id: '11', type: 'iframe', url: 'http://127.0.0.1:43210/c/conv_123' }, APP_IDE),
    { kind: 'ide-agent', agentPort: 43210, route: '/c/conv_123' }
  );
  assert.equal(
    classifyTarget({ id: '12', type: 'iframe', url: 'http://127.0.0.1:43210/../../etc/passwd' }, APP_IDE),
    null
  );
  assert.equal(
    classifyTarget({ id: '13', type: 'iframe', url: 'http://127.0.0.1:43210/unknown-route' }, APP_IDE),
    null
  );
  assert.equal(
    classifyTarget({ id: '14', type: 'iframe', url: 'http://127.0.0.1:43210/settings-standalone' }, APP_DESKTOP),
    null,
    'ide-agent 路由只对 IDE 生效'
  );
});

test('apps.mjs 进程识别、端口解析与 IDE Agent 父进程链安全校验', () => {
  const fakePs = `
  100     1 /Applications/Antigravity.app/Contents/MacOS/Antigravity --remote-debugging-port=0
  101   100 /Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper.app/Contents/MacOS/Antigravity Helper --type=renderer
  200     1 /Applications/Antigravity IDE.app/Contents/MacOS/Electron --remote-debugging-port=0
  250   200 /Applications/Antigravity IDE.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=utility
  300   250 /Users/tester/.gemini/bin/agy serve --port 45000
  999     1 /usr/local/bin/rogue-server --port 45001
  `;
  const table = parsePsOutput(fakePs);

  const desk = findMainProcess(APP_DESKTOP, table);
  assert.equal(desk?.pid, 100);
  assert.equal(hasDebugPortFlag(desk), true);

  const ide = findMainProcess(APP_IDE, table);
  assert.equal(ide?.pid, 200);
  assert.equal(isPidDescendantOf(300, 200, table), true);
  assert.equal(isPidDescendantOf(999, 200, table), false);

  assert.equal(
    isTrustedIdeAgentPort(45000, 200, {
      listeningPids: [300],
      processTable: table,
      expectedAgyPath: '/Users/tester/.gemini/bin/agy',
    }),
    true
  );
  assert.equal(
    isTrustedIdeAgentPort(45001, 200, {
      listeningPids: [999],
      processTable: table,
      expectedAgyPath: '/Users/tester/.gemini/bin/agy',
    }),
    false,
    '非 IDE 派生进程监听的本地端口必须拒绝注入'
  );

  const lsofSample = `
  Antigravi 100 tang 22u IPv4 0x1 0t0 TCP 127.0.0.1:53471 (LISTEN)
  Antigravi 100 tang 23u IPv4 0x2 0t0 TCP 127.0.0.1:53471 (LISTEN)
  Antigravi 100 tang 24u IPv4 0x3 0t0 TCP [::1]:60000 (LISTEN)
  `;
  assert.deepEqual(parseListeningPorts(lsofSample), [53471, 60000]);
});

test('buildInjectionPayload 为 Swarm 与 IDE Agent 附加执行期校验包装', () => {
  const swarmPayload = buildInjectionPayload(
    { kind: 'swarm', host: 'swarm--swarm_board-abc' },
    '/*swarm*/',
    { fingerprint: 'fp-swarm' }
  );
  assert.ok(swarmPayload.includes("location.protocol !== 'plugin:'"));
  assert.ok(swarmPayload.includes('"swarm--swarm_board-abc"'));

  const idePayload = buildInjectionPayload(
    { kind: 'ide-agent', agentPort: 45000, route: '/settings-standalone' },
    '/*main*/',
    { fingerprint: 'fp-main', customEntries: [['turbo', '极速']] }
  );
  assert.ok(idePayload.includes("location.port !== \"45000\""));
  assert.ok(idePayload.includes("location.pathname !== \"/settings-standalone\""));
  assert.ok(idePayload.includes("document.getElementById('root')"));
});
