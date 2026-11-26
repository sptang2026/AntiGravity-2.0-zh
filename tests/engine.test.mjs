import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { MAIN_FINGERPRINT, MAIN_OVERLAY, SWARM_FINGERPRINT, SWARM_OVERLAY } from '../mac/bin/overlays.generated.mjs';
import { formatCompactDuration, formatDuration, translateDynamic, translateWithShortcut } from '../src/runtime/rules.js';

// ========== 1. 动态规则纯函数测试 ==========
test('动态规则：耗时、工具摘要、额度、权限与快捷键后缀', () => {
  assert.equal(formatDuration('2 hours 15 minutes'), '2 小时 15 分钟');
  assert.equal(formatCompactDuration('<1s'), '不到 1 秒');
  assert.equal(formatCompactDuration('12s'), '12 秒');

  assert.equal(translateDynamic('Thought for 5s'), '已思考 5 秒');
  assert.equal(translateDynamic('Explored 3 files, ran 2 commands'), '已探索 3 个文件，已运行 2 个命令');
  assert.equal(translateDynamic('78.5% left'), '剩余 78.5%');
  assert.equal(translateDynamic('21.5% used'), '已用 21.5%');
  assert.equal(translateDynamic('Select model, current: Gemini 4 Neon High'), '选择模型，当前：Gemini 4 Neon 高');
  assert.equal(
    translateDynamic('Select model, current: Gemini 4 Neon High', null, { keepEnglishLabels: true }),
    '选择模型，当前：Gemini 4 Neon High'
  );
  assert.equal(translateDynamic('3 tools enabled'), '3 个工具已启用');
  assert.equal(
    translateDynamic('The original Gemini 4 model for advanced workflows. Leaving on Dec 15.'),
    '面向进阶工作流的初代 Gemini 4 模型。将于 12 月 15 日下线。'
  );
  assert.equal(
    translateDynamic('GPT-OSS will be removed from Antigravity on November 30, 2026.'),
    'GPT-OSS 将于 2026 年 11 月 30 日从 Antigravity 下线。'
  );
  assert.equal(
    translateDynamic('Neon that may offload routine steps to Hydrogen. Same Neon-level quality, fewer tokens used.'),
    '以 Neon 为主，可将常规步骤分流给 Hydrogen。保持 Neon 级质量，消耗更少 Token。'
  );
  assert.equal(translateDynamic('Gemini 4 Neon (XHigh)'), 'Gemini 4 Neon (超高)');
  assert.equal(translateDynamic('Resets in 6d 23h'), '6d 23h 后重置');
  assert.equal(translateDynamic('Resets in <1m'), '<1m 后重置');

  const shortcutRes = translateWithShortcut('Cancel (⌃C)', (k) => (k === 'Cancel' ? '取消' : null));
  assert.equal(shortcutRes, '取消 (⌃C)');
});

// ========== 2. 轻量级 DOM 沙箱（零依赖端到端执行浏览器 Overlay） ==========
function createMiniDom({ protocol = 'http:', hostname = '127.0.0.1', pathname = '/' } = {}) {
  const NodeConsts = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 };

  class MiniNode {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.parentNode = null;
      this.childNodes = [];
      this.isConnected = true;
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    remove() {
      if (!this.parentNode) return;
      const idx = this.parentNode.childNodes.indexOf(this);
      if (idx !== -1) this.parentNode.childNodes.splice(idx, 1);
      this.parentNode = null;
      this.isConnected = false;
    }
    getRootNode() {
      let cur = this;
      while (cur.parentNode) cur = cur.parentNode;
      return cur;
    }
  }

  class MiniText extends MiniNode {
    constructor(val) {
      super(3);
      this.nodeValue = val;
    }
  }

  function matchesSimpleSelector(el, sel) {
    const s = sel.trim();
    if (!s || el.nodeType !== 1) return false;
    // 组合后代选择器仅做简单末尾匹配（足够覆盖测试）
    if (s.includes(' ')) {
      const parts = s.split(/\s+/);
      if (!matchesSimpleSelector(el, parts[parts.length - 1])) return false;
      let p = el.parentElement;
      while (p) {
        if (matchesSimpleSelector(p, parts[0])) return true;
        p = p.parentElement;
      }
      return false;
    }
    if (s.startsWith('.')) {
      const cls = (el.getAttribute('class') || '').split(/\s+/);
      return cls.includes(s.slice(1));
    }
    const attrEq = s.match(/^\[([^=\]]+)="([^"]*)"\]$/);
    if (attrEq) return el.getAttribute(attrEq[1]) === attrEq[2];
    const attrHas = s.match(/^\[([^=\]]+)\]$/);
    if (attrHas) return el.attrs.has(attrHas[1]);
    return el.tagName === s.toUpperCase();
  }

  class MiniElement extends MiniNode {
    constructor(tagName) {
      super(1);
      this.tagName = tagName.toUpperCase();
      this.attrs = new Map();
      this.style = {};
      this.listeners = new Map();
      this.isContentEditable = false;
      this.checked = false;
    }
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
      if (k === 'contenteditable' && (v === 'true' || v === '' || v === 'plaintext-only')) {
        this.isContentEditable = true;
      }
    }
    getAttribute(k) {
      return this.attrs.has(k) ? this.attrs.get(k) : null;
    }
    removeAttribute(k) {
      this.attrs.delete(k);
    }
    set lang(v) {
      this.setAttribute('lang', v);
    }
    get lang() {
      return this.getAttribute('lang') || '';
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== '') this.appendChild(new MiniText(String(v)));
    }
    get textContent() {
      return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
    }
    closest(selectorList) {
      const sels = selectorList.split(',').map((s) => s.trim());
      let cur = this;
      while (cur && cur.nodeType === 1) {
        for (const s of sels) {
          if (matchesSimpleSelector(cur, s)) return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 1) {
            if (matchesSimpleSelector(c, sel)) out.push(c);
            walk(c);
          }
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    getBoundingClientRect() {
      return { left: 900, top: 700, right: 932, bottom: 732, width: 32, height: 32 };
    }
  }

  const documentElement = new MiniElement('html');
  documentElement.setAttribute('lang', 'en');
  const body = new MiniElement('body');
  documentElement.appendChild(body);

  const document = {
    nodeType: 9,
    readyState: 'complete',
    documentElement,
    body,
    activeElement: null,
    createElement: (tag) => new MiniElement(tag),
    createTextNode: (t) => new MiniText(t),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    querySelector: (sel) => documentElement.querySelector(sel),
    addEventListener: () => {},
    removeEventListener: () => {},
    createTreeWalker(root) {
      const flat = [];
      const visit = (n) => {
        const children = n === document ? [documentElement] : n.childNodes || [];
        for (const c of children) {
          flat.push(c);
          visit(c);
        }
      };
      visit(root);
      let i = 0;
      return {
        nextNode: () => (i < flat.length ? flat[i++] : null),
      };
    },
  };

  const storageData = new Map();
  const localStorage = {
    getItem: (k) => (storageData.has(k) ? storageData.get(k) : null),
    setItem: (k, v) => storageData.set(k, String(v)),
  };

  let observerInstances = 0;
  let disconnectedObservers = 0;
  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
      observerInstances += 1;
    }
    observe() {}
    disconnect() {
      disconnectedObservers += 1;
    }
  }

  const windowObj = {
    document,
    localStorage,
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { protocol, hostname, pathname },
  };
  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.top = windowObj;

  const sandbox = {
    window: windowObj,
    document,
    location: windowObj.location,
    Node: NodeConsts,
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    console,
  };

  return {
    sandbox,
    window: windowObj,
    document,
    body,
    getObserverStats: () => ({ observerInstances, disconnectedObservers }),
  };
}

test('前端主引擎：静态/动态翻译、安全隔离、WeakMap 无损还原、自定义词表与热更新清理', () => {
  const env = createMiniDom();
  const { document, body } = env;

  // 普通 UI 节点
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Archive conversation');
  const btnText = document.createTextNode('Cancel');
  btn.appendChild(btnText);

  const labelEl = document.createElement('span');
  const labelText = document.createTextNode('Request Review');
  labelEl.appendChild(labelText);

  const customKeepEl = document.createElement('span');
  const customKeepText = document.createTextNode('Artifacts');
  customKeepEl.appendChild(customKeepText);

  const customOverrideEl = document.createElement('span');
  const customOverrideText = document.createTextNode('Advanced');
  customOverrideEl.appendChild(customOverrideText);

  // 模型徽章里的 New 译为「新」，普通按钮里的 New 译为「新建」
  const badgeWrap = document.createElement('div');
  badgeWrap.setAttribute('data-tooltip-id', 'model-tag-1');
  const badgeNewText = document.createTextNode('New');
  badgeWrap.appendChild(badgeNewText);

  const normalNewBtn = document.createElement('button');
  const normalNewText = document.createTextNode('New');
  normalNewBtn.appendChild(normalNewText);

  // React 多 TextNode 拆段（模拟 "No " + "automations" + " yet" 与搜索无匹配）
  const emptyAutoP = document.createElement('p');
  emptyAutoP.appendChild(document.createTextNode('No '));
  emptyAutoP.appendChild(document.createTextNode('automations'));
  emptyAutoP.appendChild(document.createTextNode(' yet'));

  const noMatchP = document.createElement('p');
  noMatchP.appendChild(document.createTextNode('No '));
  noMatchP.appendChild(document.createTextNode('automations'));
  noMatchP.appendChild(document.createTextNode(' match “'));
  noMatchP.appendChild(document.createTextNode('daily'));
  noMatchP.appendChild(document.createTextNode('”.'));

  // 必须严格跳过的区域（代码块 & AI 回复正文）
  const codeEl = document.createElement('code');
  const codeText = document.createTextNode('Cancel');
  codeEl.appendChild(codeText);

  const aiEl = document.createElement('div');
  aiEl.setAttribute('data-testid', 'planner-response-text');
  const aiText = document.createTextNode('Settings');
  aiEl.appendChild(aiText);

  // 开屏问候语（按规范保持英文）
  const greetEl = document.createElement('h1');
  const greetText = document.createTextNode("Good to see you, Will. What's next?");
  greetEl.appendChild(greetText);

  for (const el of [btn, labelEl, customKeepEl, customOverrideEl, badgeWrap, normalNewBtn, emptyAutoP, noMatchP, codeEl, aiEl, greetEl]) {
    body.appendChild(el);
  }

  // 注入自定义词表：Artifacts 强制保留英文，Advanced 改为“进阶配置”
  env.window.__agZhCustom = [
    ['artifacts', ''],
    ['advanced', '进阶配置'],
  ];

  vm.runInNewContext(MAIN_OVERLAY, env.sandbox);

  // 1) 验证翻译结果与隔离
  assert.equal(btnText.nodeValue, '取消');
  assert.equal(btn.getAttribute('aria-label'), '归档对话');
  assert.equal(labelText.nodeValue, '请求审核');
  assert.equal(customKeepText.nodeValue, 'Artifacts', '自定义空译文必须强制保留英文');
  assert.equal(customOverrideText.nodeValue, '进阶配置', '自定义覆盖译文必须生效');
  assert.equal(badgeNewText.nodeValue, '新', '模型徽章里的 New 应译为「新」');
  assert.equal(normalNewText.nodeValue, '新建', '普通按钮里的 New 应保持「新建」');
  assert.equal(emptyAutoP.textContent, '暂无自动化', 'React 多 TextNode 拆段必须整句全中文无混排');
  assert.equal(noMatchP.textContent, '未找到匹配的自动化：“daily”。', '搜索无匹配拆段必须全中文且保留搜索词');
  assert.equal(codeText.nodeValue, 'Cancel', 'code 标签内不得翻译');
  assert.equal(aiText.nodeValue, 'Settings', 'AI 回复正文不得翻译');
  assert.equal(greetText.nodeValue, "Good to see you, Will. What's next?", '开屏问候语必须保持英文');
  assert.equal(document.documentElement.lang, 'zh-CN');

  // 2) 验证悬浮球已挂载且数量唯一
  const toggleBtns = body.querySelectorAll('button');
  const zhUiBtns = toggleBtns.filter((b) => b.getAttribute('data-ag-zh-ui') === '1');
  assert.ok(zhUiBtns.length >= 1, '悬浮球未挂载');

  // 3) 验证 WeakMap 无损还原 + 不覆写 React 新内容
  // 模拟 React 把 labelText 改写成了动态新内容
  labelText.nodeValue = 'React Updated Text';
  env.window.__agZhSetLang('en');
  assert.equal(btnText.nodeValue, 'Cancel', '切回英文必须精准还原原文');
  assert.equal(btn.getAttribute('aria-label'), 'Archive conversation', '切回英文必须还原属性原文');
  assert.equal(labelText.nodeValue, 'React Updated Text', 'App 更新后的文本绝不能被旧原文覆写');
  assert.equal(emptyAutoP.textContent, 'No automations yet', '切回英文时拆段节点必须无损还原');
  assert.equal(noMatchP.textContent, 'No automations match “daily”.', '切回英文时搜索无匹配拆段必须无损还原');
  assert.equal(document.documentElement.lang, 'en');

  // 再切回中文
  env.window.__agZhSetLang('zh');
  assert.equal(btnText.nodeValue, '取消');

  // 4) 验证热更新指纹升级会先 cleanup 旧实例（不泄露 observer、不叠双悬浮球）
  env.window.__agZhRequestedFingerprint = `${MAIN_FINGERPRINT}-hot`;
  vm.runInNewContext(MAIN_OVERLAY, env.sandbox);
  assert.equal(env.window.__agZhFingerprint, `${MAIN_FINGERPRINT}-hot`);
  const obs = env.getObserverStats();
  assert.equal(obs.observerInstances, 2);
  assert.equal(obs.disconnectedObservers, 1, '热更新必须断开旧 MutationObserver');

  // 5) 验证旧版热接管遗留的未入 WeakMap 中文 UI 节点也能 100% 反向还原为英文，且项目名/AI正文不受影响
  const legacyNewConv = document.createElement('span');
  const legacyNewConvText = document.createTextNode('新建对话');
  legacyNewConv.appendChild(legacyNewConvText);

  const legacyAuto = document.createElement('span');
  const legacyAutoText = document.createTextNode('自动化');
  legacyAuto.appendChild(legacyAutoText);

  const legacyCustom = document.createElement('span');
  const legacyCustomText = document.createTextNode('自定义');
  legacyCustom.appendChild(legacyCustomText);

  const legacyProj = document.createElement('span');
  const legacyProjText = document.createTextNode('项目');
  legacyProj.appendChild(legacyProjText);

  const legacySidebar = document.createElement('div');
  legacySidebar.setAttribute('aria-label', '侧边栏');

  const projectCard = document.createElement('div');
  projectCard.setAttribute('data-project-card', 'true');
  const projectCardText = document.createTextNode('项目');
  projectCard.appendChild(projectCardText);

  for (const el of [legacyNewConv, legacyAuto, legacyCustom, legacyProj, legacySidebar, projectCard]) {
    body.appendChild(el);
  }

  env.window.__agZhSetLang('en');
  assert.equal(legacyNewConvText.nodeValue, 'New conversation');
  assert.equal(legacyAutoText.nodeValue, 'Automations');
  assert.equal(legacyCustomText.nodeValue, 'Customizations');
  assert.equal(legacyProjText.nodeValue, 'Projects');
  assert.equal(legacySidebar.getAttribute('aria-label'), 'Sidebar');
  assert.equal(projectCardText.nodeValue, '项目', '项目名卡片内容绝不可被反向改写');
});

test('Swarm 子帧引擎：非 Swarm 协议绝不注入，合法 Swarm 帧正常翻译并支持切换还原', () => {
  // 1) 非 plugin:// 必须直接退出不标记安装
  const badEnv = createMiniDom({ protocol: 'https:', hostname: 'swarm--swarm_board-abc123', pathname: '/' });
  vm.runInNewContext(SWARM_OVERLAY, badEnv.sandbox);
  assert.equal(badEnv.window.__agZhInstalled, undefined);

  // 2) 合法 plugin://swarm--swarm_board-a1b2c3 + DOM marker 正常翻译与还原
  const okEnv = createMiniDom({ protocol: 'plugin:', hostname: 'swarm--swarm_board-a1b2c3', pathname: '/' });
  const tabs = okEnv.document.createElement('div');
  tabs.setAttribute('data-testid', 'swarm-tabs');
  const overviewText = okEnv.document.createTextNode('Overview');
  tabs.appendChild(overviewText);
  okEnv.body.appendChild(tabs);

  vm.runInNewContext(SWARM_OVERLAY, okEnv.sandbox);
  assert.equal(okEnv.window.__agZhFingerprint, SWARM_FINGERPRINT);
  assert.equal(overviewText.nodeValue, '总览');

  okEnv.window.__agZhSetLang('en');
  assert.equal(overviewText.nodeValue, 'Overview');
});
