/**
 * AntiGravity 2.0 前端主翻译引擎模板
 * 特性：
 *   - 内容哈希指纹幂等 + cleanup() 热更新卸载（兼容清理旧版 v23 残留）
 *   - WeakMap 原文追踪：一键切回英文无损还原，不覆写 App 动态更新的新文本
 *   - 右下角可拖拽半透明中英切换悬浮球 + 右键/双击菜单（「选项名保留英文」开关）
 *   - 支持外部 custom-translations.txt（window.__agZhCustom）覆盖或保留原文
 *   - 严格物理隔离：不碰输入框、代码块、终端、编辑器、用户消息与 AI 正文、skill 名
 *
 * 说明：由 tools/build.mjs 注入指纹、词典与动态规则模块后生成最终浏览器脚本。
 */
(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const FINGERPRINT = window.__agZhRequestedFingerprint || '__BUILD_FINGERPRINT__';
  if (
    window.__agZhInstalled === true &&
    window.__agZhDocument === document &&
    window.__agZhFingerprint === FINGERPRINT
  ) {
    return;
  }

  // 清理旧版（含 v23 遗留与本引擎上一指纹实例）
  if (typeof window.__agZhCleanup === 'function') {
    try {
      window.__agZhCleanup();
    } catch {}
  }
  if (window.__antigravityZhPatchObserver) {
    try {
      window.__antigravityZhPatchObserver.disconnect();
    } catch {}
    window.__antigravityZhPatchObserver = null;
  }
  if (window.__antigravityTitleInterval) {
    try {
      clearInterval(window.__antigravityTitleInterval);
    } catch {}
    window.__antigravityTitleInterval = null;
  }

  window.__agZhInstalled = true;
  window.__agZhDocument = document;
  window.__agZhFingerprint = FINGERPRINT;
  // 兼容旧版检测标记
  window.__antigravityZhPatchInstalled = 200;

  // ========== 1. 静态词典与规则 ==========
  const RAW_ENTRIES = [
    /* __DICT_ENTRIES__ */
  ];

  const exactMap = new Map(RAW_ENTRIES);
  const lowerMap = new Map();
  for (const [k, v] of RAW_ENTRIES) {
    const lk = k.toLowerCase();
    if (!lowerMap.has(lk)) lowerMap.set(lk, v);
  }

  // 反向词典（中文 -> 英文）：用于热接管旧版已翻译节点时的兜底无损还原
  const PREFERRED_REVERSE = new Map([
    ['新建对话', 'New conversation'],
    ['自动化', 'Automations'],
    ['自定义', 'Customizations'],
    ['个性化定制', 'Customizations'],
    ['项目', 'Projects'],
    ['对话', 'Conversations'],
    ['设置', 'Settings'],
    ['打开 IDE', 'Open IDE'],
    ['侧边栏', 'Sidebar'],
    ['历史记录', 'History'],
    ['终端', 'Terminal'],
    ['搜索', 'Search'],
    ['新建', 'New'],
    ['反馈', 'Feedback'],
    ['帮助', 'Help'],
    ['文件', 'Files'],
    ['编辑', 'Edit'],
    ['取消', 'Cancel'],
    ['保存', 'Save'],
    ['关闭', 'Close'],
    ['删除', 'Delete'],
    ['归档', 'Archive'],
    ['归档对话', 'Archive conversation'],
    ['固定对话', 'Pin conversation'],
    ['更多选项', 'More options'],
    ['消息输入框', 'Message input'],
    ['使用量', 'Usage'],
    ['模型', 'Models'],
    ['驱动模型', 'Models'],
    ['通知', 'Notifications'],
    ['通知设置', 'Notifications'],
    ['常规', 'General'],
    ['通用', 'General'],
    ['外观', 'Appearance'],
    ['账户', 'Account'],
    ['快捷键', 'Keyboard Shortcuts'],
    ['键盘快捷键', 'Keyboard Shortcuts'],
    ['权限', 'Permissions'],
    ['浏览器', 'Browser'],
    ['高级', 'Advanced'],
    ['规划', 'Planning'],
    ['快速', 'Fast'],
    ['即将下线', 'Leaving Soon'],
    ['提醒', 'Notice'],
    ['新', 'New'],
  ]);

  const reverseMap = new Map(PREFERRED_REVERSE);
  for (const [en, zh] of RAW_ENTRIES) {
    const zhNorm = String(zh || '').replace(/\s+/g, ' ').trim();
    if (!zhNorm || !/[\u4e00-\u9fff]/.test(zhNorm)) continue;
    if (!reverseMap.has(zhNorm)) {
      reverseMap.set(zhNorm, en);
    } else if (!PREFERRED_REVERSE.has(zhNorm)) {
      // 同译文多英文时优先保留首字母大写且更简短的常规英文标签
      const cur = reverseMap.get(zhNorm);
      const enTitle = /^[A-Z]/.test(en) && !/^[A-Z]+$/.test(en);
      const curTitle = /^[A-Z]/.test(cur) && !/^[A-Z]+$/.test(cur);
      if ((enTitle && !curTitle) || (enTitle === curTitle && en.length < cur.length)) {
        reverseMap.set(zhNorm, en);
      }
    }
  }

  function reverseDynamic(zhNorm) {
    let m;
    if ((m = zhNorm.match(/^已思考\s+(\d+)\s*秒$/))) return `Thought for ${m[1]}s`;
    if ((m = zhNorm.match(/^正在思考\s+(\d+)\s*秒$/))) return `Thinking for ${m[1]}s`;
    if ((m = zhNorm.match(/^已工作\s+(\d+)\s*秒$/))) return `Worked for ${m[1]}s`;
    if ((m = zhNorm.match(/^选择模型，当前：(.+)$/))) return `Select model, current: ${m[1]}`;
    if ((m = zhNorm.match(/^选择项目，当前：(.+)$/))) return `Select project, current: ${m[1]}`;
    if ((m = zhNorm.match(/^分支，当前：(.+)$/))) return `Branch, current: ${m[1]}`;
    if ((m = zhNorm.match(/^智能体权限预设选择器，当前：(.+)$/))) return `Agent permissions preset selector, current: ${m[1]}`;
    if ((m = zhNorm.match(/^剩余\s+(\d+(?:\.\d+)?)%$/))) return `${m[1]}% left`;
    if ((m = zhNorm.match(/^已用\s+(\d+(?:\.\d+)?)%$/))) return `${m[1]}% used`;
    if ((m = zhNorm.match(/^版本\s+([\d.a-zA-Z-]+)$/))) return `Version ${m[1]}`;
    if ((m = zhNorm.match(/^(\d+)\s+个工具已启用$/))) return `${m[1]} tools enabled`;
    if ((m = zhNorm.match(/^(\d+)\s+个工具$/))) return `${m[1]} tools`;
    if ((m = zhNorm.match(/^查看全部\s*\((\d+)\)$/))) return `See all (${m[1]})`;
    return null;
  }

  function reverseLookup(rawValue) {
    if (!rawValue || !/[\u4e00-\u9fff]/.test(rawValue)) return null;
    const zhNorm = rawValue.replace(/\s+/g, ' ').trim();
    if (!zhNorm) return null;
    // 先查快捷键后缀，如 "取消 (⌃C)" -> "Cancel (⌃C)"
    const sc = zhNorm.match(/^(.+?)\s*\((Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)([^)]*)\)$/i);
    if (sc) {
      const baseEn = reverseMap.get(sc[1].trim());
      if (baseEn) {
        const lead = rawValue.match(/^\s*/)?.[0] || '';
        const trail = rawValue.match(/\s*$/)?.[0] || '';
        return `${lead}${baseEn} (${sc[2]}${sc[3]})${trail}`;
      }
    }
    const en = reverseMap.get(zhNorm) ?? reverseDynamic(zhNorm);
    if (!en) return null;
    const lead = rawValue.match(/^\s*/)?.[0] || '';
    const trail = rawValue.match(/\s*$/)?.[0] || '';
    return lead + en + trail;
  }

  /* __RULES_BODY__ */

  // 外部自定义词表（优先级最高）：[[enLower, target], ...]，target === '' 表示保留英文
  const customMap = new Map();
  if (Array.isArray(window.__agZhCustom)) {
    for (const pair of window.__agZhCustom) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const k = String(pair[0] ?? '').trim().toLowerCase();
      const v = String(pair[1] ?? '').trim();
      if (k) customMap.set(k, v);
    }
  }

  // 「选项名保留英文」预设：开启后保留权限预设与模型推理档位英文名
  const ENGLISH_OPTION_LABELS = new Set([
    'this conversation',
    'request review',
    'default',
    'auto',
    'turbo',
    'extra high',
    'xhigh',
    'high',
    'medium',
    'low',
  ]);

  // ========== 2. 偏好存储与 WeakMap 原文追踪 ==========
  const STORAGE_KEYS = {
    lang: 'agZhLang',
    pos: 'agZhTogglePos',
    keepEnLabels: 'agZhKeepEnLabels',
  };

  function loadPref(key) {
    try {
      return window.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function savePref(key, value) {
    try {
      window.localStorage?.setItem(key, value);
    } catch {}
  }

  const originals =
    window.__agZhOriginals ||
    (window.__agZhOriginals = {
      texts: new WeakMap(),
      attrs: new WeakMap(),
    });

  let currentLang = loadPref(STORAGE_KEYS.lang) === 'en' ? 'en' : 'zh';
  let keepEnglishLabels = loadPref(STORAGE_KEYS.keepEnLabels) === '1';
  let originalDocLang = document.documentElement?.getAttribute('lang') ?? '';

  function writeTextNode(node, nextVal) {
    const prev = node.nodeValue;
    const rec = originals.texts.get(node);
    if (rec && rec.zh === prev) {
      rec.zh = nextVal;
    } else {
      originals.texts.set(node, { orig: prev, zh: nextVal });
    }
    node.nodeValue = nextVal;
  }

  function writeAttrValue(el, attr, nextVal) {
    const prev = el.getAttribute(attr);
    let attrMap = originals.attrs.get(el);
    if (!attrMap) {
      attrMap = new Map();
      originals.attrs.set(el, attrMap);
    }
    const rec = attrMap.get(attr);
    if (rec && rec.zh === prev) {
      rec.zh = nextVal;
    } else {
      attrMap.set(attr, { orig: prev, zh: nextVal });
    }
    el.setAttribute(attr, nextVal);
  }

  function restoreNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const rec = originals.texts.get(node);
      if (rec) {
        if (node.nodeValue === rec.zh) {
          node.nodeValue = rec.orig;
        }
        originals.texts.delete(node);
        return;
      }
      // 兜底：若该 UI 节点在热接管前已由旧版翻译（WeakMap 无记录），安全反向还原为英文
      if (!shouldSkipText(node)) {
        const cur = node.nodeValue || '';
        const rev = reverseLookup(cur);
        if (rev && rev !== cur) {
          node.nodeValue = rev;
        }
      }
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.closest?.('[data-ag-zh-ui="1"]')) return;
      const attrMap = originals.attrs.get(node);
      const handledAttrs = new Set();
      if (attrMap) {
        for (const [attr, rec] of attrMap.entries()) {
          handledAttrs.add(attr);
          if (node.getAttribute(attr) === rec.zh) {
            if (rec.orig === null) node.removeAttribute(attr);
            else node.setAttribute(attr, rec.orig);
          }
        }
        originals.attrs.delete(node);
      }
      if (!shouldSkipAttrs(node) || hasSafeForceAttr(node)) {
        for (const attr of ATTRS) {
          if (handledAttrs.has(attr)) continue;
          const cur = node.getAttribute?.(attr);
          const rev = reverseLookup(cur);
          if (rev && rev !== cur) {
            node.setAttribute(attr, rev);
          }
        }
      }
    }
  }

  function restoreTree(root) {
    if (!root) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      restoreNode(root);
      if (root.shadowRoot) restoreTree(root.shadowRoot);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      restoreNode(node);
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
        restoreTree(node.shadowRoot);
      }
    }
  }

  // ========== 3. 物理隔离与安全跳过规则 ==========
  const SKIP_TEXT_SELECTOR = [
    '[data-ag-zh-ui="1"]',
    'input',
    'textarea',
    'select',
    'option',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[contenteditable=""]',
    '[data-lexical-editor]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="searchbox"]',
    '[data-testid="user-input-step"] [data-quotable="true"]',
    '[data-testid="planner-response-text"]',
    '.cursor-edit',
    'script',
    'style',
    'code',
    'pre',
    'kbd',
    'samp',
    'var',
    '.xterm',
    '.terminal',
    '.monaco-editor',
    '.cm-editor',
    '.cm-line',
    '.code-line',
    '.code-block',
    '.line-content',
    '[aria-label="File Viewer"]',
    '[data-file-uri]',
    '[data-uri]',
    '[class*="diffEditor"]',
    '.token',
    '.hljs',
    '[class*="mtk"]',
    '.font-mono',
    '[data-quotable-inline="true"]',
    '.context-scope-mention',
    '[data-testid="file-title-name"]',
    '[data-testid="entity-pill"]',
    '[data-project-card="true"]',
    '[data-testid="conversation-row-sidebar"] span.truncate',
    '[translate="no"]',
    '.notranslate',
  ].join(', ');

  const SKIP_ATTR_SELECTOR = [
    '[data-ag-zh-ui="1"]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[contenteditable=""]',
    '[data-lexical-editor]',
    '[data-testid="user-input-step"] [data-quotable="true"]',
    '[data-testid="planner-response-text"]',
    '.cursor-edit',
    'script',
    'style',
    'code',
    'pre',
    '.xterm',
    '.terminal',
    '.monaco-editor',
    '.cm-editor',
    '.cm-line',
    '[aria-label="File Viewer"]',
    '[data-file-uri]',
    '[data-uri]',
    '[class*="diffEditor"]',
    '.token',
    '.hljs',
    '[class*="mtk"]',
    '.font-mono',
    '[data-quotable-inline="true"]',
    '.context-scope-mention',
    '[data-testid="file-title-name"]',
    '[data-testid="entity-pill"]',
    '[data-project-card="true"]',
    '[data-testid="conversation-row-sidebar"]',
    '[translate="no"]',
    '.notranslate',
  ].join(', ');

  const SAFE_FORCE_ATTRS = new Set(['Archive conversation', 'Pin conversation', 'More options', 'Message input']);

  function isEditableElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    const ce = el.getAttribute?.('contenteditable');
    if (ce === 'true' || ce === 'plaintext-only' || ce === '') return true;
    if (el.getAttribute?.('data-lexical-editor') === 'true') return true;
    const role = el.getAttribute?.('role');
    if (role === 'textbox' || role === 'combobox' || role === 'searchbox') return true;
    return false;
  }

  function shouldSkipText(node) {
    try {
      if (!node) return true;
      let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!el) return true;
      if (isEditableElement(el)) return true;
      const active = document.activeElement;
      if (active && isEditableElement(active) && (active === el || active.contains(el))) {
        return true;
      }
      while (el) {
        if (isEditableElement(el)) return true;
        if (typeof el.closest === 'function' && el.closest(SKIP_TEXT_SELECTOR)) return true;
        const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
        el = root && root.host ? root.host : null;
      }
      return false;
    } catch {
      return true;
    }
  }

  function shouldSkipAttrs(element) {
    try {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
      if (element.isContentEditable) return true;
      const active = document.activeElement;
      if (active && (active === element || element.contains(active)) && isEditableElement(active)) {
        return true;
      }
      let el = element;
      while (el) {
        if (el.isContentEditable) return true;
        if (typeof el.closest === 'function' && el.closest(SKIP_ATTR_SELECTOR)) return true;
        const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
        el = root && root.host ? root.host : null;
      }
      return false;
    } catch {
      return true;
    }
  }

  function hasSafeForceAttr(element) {
    try {
      for (const a of ['aria-label', 'title', 'placeholder']) {
        const v = element.getAttribute?.(a);
        if (v && SAFE_FORCE_ATTRS.has(v)) return true;
      }
    } catch {}
    return false;
  }

  // ========== 4. 核心翻译函数 ==========
  function lookupStatic(normText) {
    const lower = normText.toLowerCase();
    if (customMap.has(lower)) {
      const target = customMap.get(lower);
      return target === '' ? null : target;
    }
    if (keepEnglishLabels && ENGLISH_OPTION_LABELS.has(lower)) {
      return null;
    }
    return exactMap.get(normText) ?? lowerMap.get(lower) ?? null;
  }

  function translateString(rawValue, contextEl) {
    if (!rawValue || !/[A-Za-z]/.test(rawValue)) return rawValue;
    const valNorm = normalizeText(rawValue);
    if (!valNorm) return rawValue;

    const lower = valNorm.toLowerCase();
    if (customMap.has(lower)) {
      const customTarget = customMap.get(lower);
      if (customTarget === '') return rawValue; // 显式保留英文
      const lead = rawValue.match(/^\s*/)?.[0] || '';
      const trail = rawValue.match(/\s*$/)?.[0] || '';
      return lead + customTarget + trail;
    }

    if (keepEnglishLabels && ENGLISH_OPTION_LABELS.has(lower)) {
      return rawValue;
    }

    const lead = rawValue.match(/^\s*/)?.[0] || '';
    const trail = rawValue.match(/\s*$/)?.[0] || '';

    // 模型列表与菜单徽章内的 "New" 统一译为「新」，不影响普通「新建」按钮
    if (
      valNorm === 'New' &&
      contextEl &&
      (contextEl.closest?.('[data-tooltip-id], [role="menuitem"], [role="option"], [role="listbox"]') ||
        /\brounded-full\b/.test(String(contextEl.className || '')))
    ) {
      return lead + '新' + trail;
    }

    let translated = exactMap.get(valNorm) ?? lowerMap.get(lower);
    if (!translated) {
      translated = translateWithShortcut(valNorm, lookupStatic);
    }
    if (!translated) {
      translated = translateDynamic(valNorm, contextEl, { keepEnglishLabels });
    }
    if (translated && translated !== valNorm) {
      return lead + translated + trail;
    }
    return rawValue;
  }

  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

  function translateElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.closest?.('[data-ag-zh-ui="1"]')) return;
    if (shouldSkipAttrs(element) && !hasSafeForceAttr(element)) return;

    for (const attr of ATTRS) {
      const cur = element.getAttribute?.(attr);
      if (!cur) continue;
      const attrMap = originals.attrs.get(element);
      const rec = attrMap?.get(attr);
      // 若之前翻过，基于 orig 重新计算（支持开关切换后重算）
      const sourceText = rec && rec.zh === cur ? rec.orig : cur;
      if (!sourceText || !/[A-Za-z]/.test(sourceText)) continue;
      const translated = translateString(sourceText, element);
      if (translated !== sourceText) {
        if (cur !== translated) writeAttrValue(element, attr, translated);
      } else if (rec && rec.zh === cur) {
        // 规则变更后不再需要翻译，还原原文
        element.setAttribute(attr, rec.orig);
        attrMap.delete(attr);
      }
    }
  }

  function translateTextNode(node) {
    if (shouldSkipText(node)) return;
    const cur = node.nodeValue || '';
    if (!cur.trim()) return;

    const rec = originals.texts.get(node);
    const sourceText = rec && rec.zh === cur ? rec.orig : cur;

    // 思考计时器中紧跟数字后的独立 "s" 节点
    if (sourceText === 's' && node.parentElement?.closest?.('[data-testid="thinking-collapsible-trigger"]')) {
      if (cur !== ' 秒') writeTextNode(node, ' 秒');
      return;
    }

    if (!/[A-Za-z]/.test(sourceText)) return;
    const translated = translateString(sourceText, node.parentElement);
    if (translated !== sourceText) {
      if (cur !== translated) writeTextNode(node, translated);
    } else if (rec && rec.zh === cur) {
      node.nodeValue = rec.orig;
      originals.texts.delete(node);
    }
  }

  function translateTree(root) {
    if (!root || currentLang !== 'zh') return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.closest?.('[data-ag-zh-ui="1"]')) return;
      if (isEditableElement(root)) return;
      translateElement(root);
      if (root.shadowRoot) translateTree(root.shadowRoot);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        translateElement(node);
        if (node.shadowRoot) translateTree(node.shadowRoot);
      }
    }
  }

  // ========== 5. 语言切换与跨帧同步 ==========
  function broadcastLangState() {
    try {
      const payload = { type: 'ag-zh-state', lang: currentLang, keepEnglishLabels };
      const iframes = document.querySelectorAll('iframe');
      for (const frame of iframes) {
        try {
          frame.contentWindow?.postMessage(payload, '*');
        } catch {}
      }
    } catch {}
  }

  function applyLanguageState() {
    if (currentLang === 'zh') {
      document.documentElement.lang = 'zh-CN';
      translateTree(document);
    } else {
      restoreTree(document);
      if (originalDocLang) document.documentElement.lang = originalDocLang;
      else document.documentElement.removeAttribute('lang');
    }
    updateToggleVisual();
    broadcastLangState();
  }

  function setLang(nextLang, persist = true) {
    const normalized = nextLang === 'en' ? 'en' : 'zh';
    currentLang = normalized;
    if (persist) savePref(STORAGE_KEYS.lang, normalized);
    applyLanguageState();
  }

  function setKeepEnglishLabels(enabled, persist = true) {
    keepEnglishLabels = Boolean(enabled);
    if (persist) savePref(STORAGE_KEYS.keepEnLabels, keepEnglishLabels ? '1' : '0');
    if (currentLang === 'zh') {
      translateTree(document);
    }
    updateToggleVisual();
    broadcastLangState();
  }

  window.__agZhSetLang = setLang;
  window.__agZhGetState = () => ({ lang: currentLang, keepEnglishLabels, fingerprint: FINGERPRINT });

  // ========== 6. 右下角可拖拽中英切换控件（真·水滴高透 Liquid Glass 扁胶囊 + SVG 边缘折射滤镜） ==========
  let toggleBtn = null;
  let toggleThumb = null;
  let zhSegEl = null;
  let enSegEl = null;
  let menuEl = null;
  let switchTrackEl = null;
  let switchKnobEl = null;
  let glassFilterSvg = null;
  let removeUiListeners = [];

  function shouldMountToggleUI() {
    // 排除 data: 首屏加载页与嵌入子 iframe，仅在真实顶层窗口挂载
    try {
      if (window.top !== window.self) return false;
      if (location.protocol === 'data:') return false;
    } catch {
      return false;
    }
    return true;
  }

  function detectDarkTheme() {
    try {
      const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
      const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const lum = 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
        return lum < 128;
      }
      return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
    } catch {
      return false;
    }
  }

  // 生成用于 Chromium backdrop-filter 的液态水滴透镜折射 SVG 滤镜（中心清澈透亮，边缘真实折射微弯）
  function createLiquidRefractionSvg() {
    if (typeof document.createElementNS !== 'function') return null;
    try {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('data-ag-zh-ui', '1');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      Object.assign(svg.style, {
        position: 'fixed',
        width: '0',
        height: '0',
        pointerEvents: 'none',
        opacity: '0',
      });

      // 胶囊透镜法线置换贴图：R=水平折射，G=垂直折射，中心保持中性灰 (128,128) 不扭曲文字，边缘呈水滴弧面折射
      const mapSvg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 60">` +
        `<defs>` +
        `<linearGradient id="rx" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="rgb(255,128,128)"/>` +
        `<stop offset="22%" stop-color="rgb(128,128,128)"/>` +
        `<stop offset="78%" stop-color="rgb(128,128,128)"/>` +
        `<stop offset="100%" stop-color="rgb(0,128,128)"/>` +
        `</linearGradient>` +
        `<linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="rgb(128,255,128)"/>` +
        `<stop offset="26%" stop-color="rgb(128,128,128)"/>` +
        `<stop offset="74%" stop-color="rgb(128,128,128)"/>` +
        `<stop offset="100%" stop-color="rgb(128,0,128)"/>` +
        `</linearGradient>` +
        `</defs>` +
        `<rect width="140" height="60" rx="30" fill="rgb(128,128,128)"/>` +
        `<rect width="140" height="60" rx="30" fill="url(#rx)" style="mix-blend-mode:normal"/>` +
        `<rect width="140" height="60" rx="30" fill="url(#gy)" opacity="0.55"/>` +
        `</svg>`;
      const mapUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mapSvg)}`;

      svg.innerHTML =
        `<defs>` +
        `<filter id="ag-zh-liquid-refract" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
        `<feImage href="${mapUri}" result="lensMap" preserveAspectRatio="none"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="lensMap" scale="7" xChannelSelector="R" yChannelSelector="G"/>` +
        `</filter>` +
        `</defs>`;
      return svg;
    } catch {
      return null;
    }
  }

  // 真·透明水滴液态玻璃色板：超高透明度水滴本体 + 柔和银灰玻璃折射边框
  function getAppleGlassTheme(isZh, isDark) {
    const activeColor = isZh
      ? isDark
        ? '#64D2FF'
        : '#0A7AFF'
      : isDark
        ? '#92C7AC'
        : '#467A62';

    if (isDark) {
      return {
        // 深色下极透清澈水滴 + 柔灰银玻璃边
        trackBg: 'linear-gradient(160deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 55%, rgba(255, 255, 255, 0.05) 100%)',
        trackBorder: 'rgba(186, 194, 206, 0.34)',
        trackHoverBorder: 'rgba(216, 224, 236, 0.50)',
        trackShadow:
          '0 10px 28px -8px rgba(0, 0, 0, 0.48), 0 1px 3px rgba(0, 0, 0, 0.24), inset 0 1px 1.2px rgba(255, 255, 255, 0.34), inset 1px 0 1.2px rgba(255, 255, 255, 0.16), inset -1px -1px 2px rgba(140, 150, 166, 0.24), inset 0 0 8px rgba(255, 255, 255, 0.05)',
        trackHoverShadow:
          '0 14px 34px -8px rgba(0, 0, 0, 0.56), 0 2px 6px rgba(0, 0, 0, 0.28), inset 0 1px 1.5px rgba(255, 255, 255, 0.46), inset 1px 0 1.4px rgba(255, 255, 255, 0.22), inset -1px -1px 2px rgba(160, 170, 188, 0.30), inset 0 0 10px rgba(255, 255, 255, 0.08)',
        thumbBg:
          'linear-gradient(155deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.05) 55%, rgba(255, 255, 255, 0.14) 100%)',
        thumbShadow:
          '0 2px 6px rgba(0, 0, 0, 0.24), 0 0 0 0.5px rgba(210, 218, 230, 0.34), inset 0 1px 1px rgba(255, 255, 255, 0.48), inset 0 -1px 2px rgba(0, 0, 0, 0.18)',
        activeText: activeColor,
        inactiveText: 'rgba(235, 240, 248, 0.50)',
        menuBg: 'linear-gradient(160deg, rgba(36, 40, 48, 0.38) 0%, rgba(24, 28, 36, 0.28) 100%)',
        menuBorder: 'rgba(186, 194, 206, 0.32)',
        menuShadow:
          '0 18px 42px -8px rgba(0, 0, 0, 0.52), inset 0 1px 1.2px rgba(255, 255, 255, 0.26), inset 0 -1px 2px rgba(0, 0, 0, 0.22)',
        menuText: 'rgba(255, 255, 255, 0.94)',
        menuSubText: 'rgba(226, 232, 242, 0.56)',
        menuHover: 'rgba(255, 255, 255, 0.11)',
        divider: 'rgba(200, 208, 220, 0.16)',
        switchOn: activeColor,
        switchOff: 'rgba(130, 136, 148, 0.34)',
      };
    }

    return {
      // 浅色下真水滴超高透明本体 + 细腻灰银折射边框（在白底与彩色背景上都有通透立体的水滴边缘）
      trackBg: 'linear-gradient(160deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.04) 52%, rgba(240, 244, 250, 0.14) 100%)',
      trackBorder: 'rgba(128, 136, 148, 0.34)',
      trackHoverBorder: 'rgba(104, 114, 128, 0.48)',
      trackShadow:
        '0 8px 24px -6px rgba(30, 41, 59, 0.12), 0 2px 5px rgba(30, 41, 59, 0.05), inset 0 1.2px 1.6px rgba(255, 255, 255, 0.96), inset 1.2px 0 1.4px rgba(255, 255, 255, 0.72), inset -1.2px -1.2px 2.4px rgba(132, 140, 154, 0.28), inset 0 0 8px rgba(148, 158, 172, 0.10)',
      trackHoverShadow:
        '0 12px 30px -6px rgba(30, 41, 59, 0.16), 0 3px 8px rgba(30, 41, 59, 0.07), inset 0 1.2px 2px rgba(255, 255, 255, 1), inset 1.2px 0 1.6px rgba(255, 255, 255, 0.85), inset -1.2px -1.2px 2.6px rgba(120, 130, 146, 0.34), inset 0 0 10px rgba(148, 158, 172, 0.14)',
      thumbBg:
        'linear-gradient(155deg, rgba(255, 255, 255, 0.56) 0%, rgba(255, 255, 255, 0.16) 55%, rgba(255, 255, 255, 0.42) 100%)',
      thumbShadow:
        '0 2px 6px rgba(30, 41, 59, 0.09), 0 0 0 0.5px rgba(148, 156, 168, 0.30), inset 0 1px 1.2px rgba(255, 255, 255, 0.98), inset 0 -1px 2px rgba(132, 140, 154, 0.20)',
      activeText: activeColor,
      inactiveText: 'rgba(54, 60, 70, 0.48)',
      menuBg: 'linear-gradient(160deg, rgba(255, 255, 255, 0.44) 0%, rgba(248, 250, 253, 0.24) 100%)',
      menuBorder: 'rgba(134, 142, 154, 0.32)',
      menuShadow:
        '0 18px 42px -8px rgba(30, 41, 59, 0.15), 0 2px 8px rgba(30, 41, 59, 0.05), inset 0 1px 1.5px rgba(255, 255, 255, 0.95), inset 0 -1px 2px rgba(132, 140, 154, 0.18)',
      menuText: 'rgba(24, 28, 34, 0.92)',
      menuSubText: 'rgba(64, 70, 80, 0.54)',
      menuHover: 'rgba(30, 41, 59, 0.06)',
      divider: 'rgba(120, 128, 140, 0.18)',
      switchOn: activeColor,
      switchOff: 'rgba(130, 138, 150, 0.26)',
    };
  }

  function updateToggleVisual() {
    if (!toggleBtn) return;
    const isZh = currentLang === 'zh';
    const isDark = detectDarkTheme();
    const theme = getAppleGlassTheme(isZh, isDark);

    toggleBtn.title = isZh
      ? '中文模式（单击平滑切换原版英文｜右键或双击打开设置｜按住拖动）'
      : 'English（单击平滑切换中文｜右键或双击打开设置｜按住拖动）';
    toggleBtn.style.background = theme.trackBg;
    toggleBtn.style.borderColor = theme.trackBorder;
    toggleBtn.style.boxShadow = theme.trackShadow;
    toggleBtn.__agRestShadow = theme.trackShadow;
    toggleBtn.__agHoverShadow = theme.trackHoverShadow;
    toggleBtn.__agRestBorder = theme.trackBorder;
    toggleBtn.__agHoverBorder = theme.trackHoverBorder;

    if (toggleThumb) {
      toggleThumb.style.background = theme.thumbBg;
      toggleThumb.style.boxShadow = theme.thumbShadow;
      toggleThumb.style.transform = isZh ? 'translateX(0px)' : 'translateX(32px)';
    }

    if (zhSegEl && enSegEl) {
      zhSegEl.style.color = isZh ? theme.activeText : theme.inactiveText;
      zhSegEl.style.fontWeight = isZh ? '600' : '500';
      enSegEl.style.color = isZh ? theme.inactiveText : theme.activeText;
      enSegEl.style.fontWeight = isZh ? '500' : '600';
    }

    if (menuEl) {
      menuEl.style.background = theme.menuBg;
      menuEl.style.borderColor = theme.menuBorder;
      menuEl.style.boxShadow = theme.menuShadow;
      menuEl.style.color = theme.menuText;
      menuEl.__agHoverBg = theme.menuHover;

      const rows = menuEl.querySelectorAll('[data-ag-menu-row="1"]');
      for (const r of rows) r.style.color = theme.menuText;

      const divider = menuEl.querySelector('[data-ag-divider="1"]');
      if (divider) divider.style.background = theme.divider;

      const statusSpan = menuEl.querySelector('[data-ag-opt="lang-label"]');
      if (statusSpan) statusSpan.textContent = isZh ? '切换为 English' : '切换为 中文';

      const subSpan = menuEl.querySelector('[data-ag-opt="lang-sub"]');
      if (subSpan) {
        subSpan.textContent = isZh ? 'EN' : '中文';
        subSpan.style.color = theme.menuSubText;
      }

      if (switchTrackEl && switchKnobEl) {
        switchTrackEl.style.background = keepEnglishLabels ? theme.switchOn : theme.switchOff;
        switchKnobEl.style.transform = keepEnglishLabels ? 'translateX(12px)' : 'translateX(0px)';
      }
    }
  }

  function closeMenu() {
    if (menuEl) {
      menuEl.style.opacity = '0';
      menuEl.style.transform = 'translateY(4px) scale(0.97)';
      menuEl.style.pointerEvents = 'none';
      menuEl.style.display = 'none';
    }
  }

  function openMenu() {
    if (!menuEl || !toggleBtn) return;
    updateToggleVisual();
    const rect = toggleBtn.getBoundingClientRect();
    menuEl.style.display = 'block';
    const menuW = 212;
    const menuH = 92;
    let left = rect.right - menuW;
    let top = rect.top - menuH - 10;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (top < 8) top = rect.bottom + 10;
    menuEl.style.left = `${Math.round(left)}px`;
    menuEl.style.top = `${Math.round(top)}px`;
    menuEl.style.pointerEvents = 'auto';
    menuEl.style.opacity = '1';
    menuEl.style.transform = 'translateY(0) scale(1)';
  }

  function clampPosition(left, top, width = 70, height = 28) {
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    return {
      left: Math.min(Math.max(8, left), maxX),
      top: Math.min(Math.max(8, top), maxY),
    };
  }

  function mountToggleUI() {
    if (!shouldMountToggleUI() || !document.body) return;
    document.querySelectorAll('[data-ag-zh-ui="1"]').forEach((n) => n.remove());

    // 挂载水滴透镜折射 SVG 滤镜
    const filterSvg = createLiquidRefractionSvg();
    if (filterSvg) {
      document.body.appendChild(filterSvg);
      glassFilterSvg = filterSvg;
    }

    const liquidBackdrop = filterSvg
      ? 'url(#ag-zh-liquid-refract) blur(2.2px) saturate(175%) contrast(1.03)'
      : 'blur(4px) saturate(180%) brightness(1.03)';

    // Apple 原生双段液态水滴滑动槽：71px × 30px（1px 银灰折射边 + 真水滴高透光学滤镜）
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-ag-zh-ui', '1');
    btn.setAttribute('translate', 'no');
    Object.assign(btn.style, {
      position: 'fixed',
      right: '18px',
      bottom: '16px',
      width: '71px',
      height: '30px',
      padding: '2.5px',
      border: '1px solid rgba(128, 136, 148, 0.34)',
      borderRadius: '9999px',
      backdropFilter: liquidBackdrop,
      WebkitBackdropFilter: liquidBackdrop,
      display: 'inline-flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      cursor: 'pointer',
      zIndex: '2147483640',
      userSelect: 'none',
      opacity: '0.98',
      transform: 'scale(1)',
      transition:
        'transform 0.24s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.22s ease, border-color 0.22s ease, opacity 0.2s ease, background 0.25s ease',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
    });

    // 滑动液态水珠游标（Apple 弹簧曲线）
    const thumb = document.createElement('span');
    thumb.setAttribute('data-ag-zh-ui', '1');
    Object.assign(thumb.style, {
      position: 'absolute',
      top: '2.5px',
      left: '2.5px',
      width: '32px',
      height: '23px',
      borderRadius: '9999px',
      pointerEvents: 'none',
      transition: 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1), background 0.25s ease, box-shadow 0.25s ease',
    });

    const zhSeg = document.createElement('span');
    zhSeg.setAttribute('data-ag-zh-ui', '1');
    zhSeg.textContent = '中';
    Object.assign(zhSeg.style, {
      position: 'relative',
      zIndex: '1',
      width: '32px',
      height: '23px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11.5px',
      lineHeight: '1',
      pointerEvents: 'none',
      transition: 'color 0.24s ease',
    });

    const enSeg = document.createElement('span');
    enSeg.setAttribute('data-ag-zh-ui', '1');
    enSeg.textContent = 'EN';
    Object.assign(enSeg.style, {
      position: 'relative',
      zIndex: '1',
      width: '32px',
      height: '23px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10.5px',
      letterSpacing: '0.02em',
      lineHeight: '1',
      pointerEvents: 'none',
      transition: 'color 0.24s ease',
    });

    btn.appendChild(thumb);
    btn.appendChild(zhSeg);
    btn.appendChild(enSeg);

    // 恢复已保存位置
    try {
      const savedPos = JSON.parse(loadPref(STORAGE_KEYS.pos) || 'null');
      if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
        const clamped = clampPosition(savedPos.left, savedPos.top);
        btn.style.left = `${clamped.left}px`;
        btn.style.top = `${clamped.top}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
    } catch {}

    // macOS 原生 Liquid Glass Popover 菜单
    const menu = document.createElement('div');
    menu.setAttribute('data-ag-zh-ui', '1');
    menu.setAttribute('translate', 'no');
    Object.assign(menu.style, {
      position: 'fixed',
      display: 'none',
      width: '212px',
      padding: '5px',
      borderRadius: '14px',
      border: '1px solid rgba(134, 142, 154, 0.32)',
      backdropFilter: 'blur(12px) saturate(190%) brightness(1.02)',
      WebkitBackdropFilter: 'blur(12px) saturate(190%) brightness(1.02)',
      zIndex: '2147483641',
      fontSize: '12.5px',
      opacity: '0',
      transform: 'translateY(4px) scale(0.97)',
      transition: 'opacity 0.16s ease, transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
      boxSizing: 'border-box',
    });

    const toggleRow = document.createElement('button');
    toggleRow.type = 'button';
    toggleRow.setAttribute('data-ag-zh-ui', '1');
    toggleRow.setAttribute('data-ag-menu-row', '1');
    Object.assign(toggleRow.style, {
      width: '100%',
      textAlign: 'left',
      padding: '7px 10px',
      border: 'none',
      borderRadius: '9px',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '12.5px',
      fontWeight: '450',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      transition: 'background 0.14s ease',
    });
    const langSpan = document.createElement('span');
    langSpan.setAttribute('data-ag-opt', 'lang-label');
    const langSub = document.createElement('span');
    langSub.setAttribute('data-ag-opt', 'lang-sub');
    Object.assign(langSub.style, {
      fontSize: '11px',
      fontWeight: '500',
    });
    toggleRow.appendChild(langSpan);
    toggleRow.appendChild(langSub);
    toggleRow.addEventListener('mouseenter', () => {
      toggleRow.style.background = menu.__agHoverBg || 'rgba(15, 23, 42, 0.055)';
    });
    toggleRow.addEventListener('mouseleave', () => {
      toggleRow.style.background = 'transparent';
    });
    toggleRow.addEventListener('click', () => {
      setLang(currentLang === 'zh' ? 'en' : 'zh');
      closeMenu();
    });

    const divider = document.createElement('div');
    divider.setAttribute('data-ag-zh-ui', '1');
    divider.setAttribute('data-ag-divider', '1');
    Object.assign(divider.style, {
      height: '0.5px',
      margin: '4px 8px',
      pointerEvents: 'none',
    });

    // 原生 iOS Switch 开关行（「选项名保留英文」）
    const optRow = document.createElement('button');
    optRow.type = 'button';
    optRow.setAttribute('data-ag-zh-ui', '1');
    optRow.setAttribute('data-ag-menu-row', '1');
    Object.assign(optRow.style, {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      padding: '7px 10px',
      border: 'none',
      borderRadius: '9px',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '12.5px',
      fontWeight: '450',
      userSelect: 'none',
      transition: 'background 0.14s ease',
    });
    const optText = document.createElement('span');
    optText.textContent = '选项名保留英文';

    const switchTrack = document.createElement('span');
    switchTrack.setAttribute('data-ag-zh-ui', '1');
    Object.assign(switchTrack.style, {
      width: '28px',
      height: '16px',
      borderRadius: '9999px',
      padding: '2px',
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      flexShrink: '0',
      transition: 'background 0.24s cubic-bezier(0.32, 0.72, 0, 1)',
    });
    const switchKnob = document.createElement('span');
    switchKnob.setAttribute('data-ag-zh-ui', '1');
    Object.assign(switchKnob.style, {
      width: '12px',
      height: '12px',
      borderRadius: '9999px',
      background: '#FFFFFF',
      boxShadow: '0 1px 2.5px rgba(0, 0, 0, 0.22)',
      transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    });
    switchTrack.appendChild(switchKnob);

    optRow.appendChild(optText);
    optRow.appendChild(switchTrack);
    optRow.addEventListener('mouseenter', () => {
      optRow.style.background = menu.__agHoverBg || 'rgba(15, 23, 42, 0.055)';
    });
    optRow.addEventListener('mouseleave', () => {
      optRow.style.background = 'transparent';
    });
    optRow.addEventListener('click', () => {
      setKeepEnglishLabels(!keepEnglishLabels);
    });

    menu.appendChild(toggleRow);
    menu.appendChild(divider);
    menu.appendChild(optRow);

    // 拖拽与单击逻辑
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let clickTimer = null;

    const onMouseEnter = () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.02)';
      if (btn.__agHoverShadow) btn.style.boxShadow = btn.__agHoverShadow;
      if (btn.__agHoverBorder) btn.style.borderColor = btn.__agHoverBorder;
    };
    const onMouseLeave = () => {
      if (!dragging) {
        btn.style.opacity = '0.98';
        btn.style.transform = 'scale(1)';
        if (btn.__agRestShadow) btn.style.boxShadow = btn.__agRestShadow;
        if (btn.__agRestBorder) btn.style.borderColor = btn.__agRestBorder;
      }
    };
    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      btn.style.transform = 'scale(0.97)';
      const rect = btn.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      btn.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) {
        moved = true;
        closeMenu();
      }
      if (moved) {
        const rect = btn.getBoundingClientRect();
        const clamped = clampPosition(originLeft + dx, originTop + dy, rect.width || 69, rect.height || 28);
        btn.style.left = `${clamped.left}px`;
        btn.style.top = `${clamped.top}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
    };
    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      btn.style.transform = 'scale(1)';
      btn.releasePointerCapture?.(e.pointerId);
      if (moved) {
        const rect = btn.getBoundingClientRect();
        savePref(STORAGE_KEYS.pos, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
      }
    };
    const onClick = () => {
      if (moved) {
        moved = false;
        return;
      }
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        openMenu();
        return;
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        closeMenu();
        setLang(currentLang === 'zh' ? 'en' : 'zh');
      }, 200);
    };
    const onContextMenu = (e) => {
      e.preventDefault();
      if (menu.style.display === 'block') closeMenu();
      else openMenu();
    };
    const onDocPointerDown = (e) => {
      if (menu.style.display !== 'block') return;
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        closeMenu();
      }
    };
    const onResize = () => {
      if (btn.style.left && btn.style.left !== 'auto') {
        const rect = btn.getBoundingClientRect();
        const clamped = clampPosition(rect.left, rect.top, rect.width || 69, rect.height || 28);
        btn.style.left = `${clamped.left}px`;
        btn.style.top = `${clamped.top}px`;
      }
    };

    btn.addEventListener('mouseenter', onMouseEnter);
    btn.addEventListener('mouseleave', onMouseLeave);
    btn.addEventListener('pointerdown', onPointerDown);
    btn.addEventListener('pointermove', onPointerMove);
    btn.addEventListener('pointerup', onPointerUp);
    btn.addEventListener('click', onClick);
    btn.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('resize', onResize);

    removeUiListeners = [
      () => {
        if (clickTimer) clearTimeout(clickTimer);
        btn.removeEventListener('mouseenter', onMouseEnter);
        btn.removeEventListener('mouseleave', onMouseLeave);
        btn.removeEventListener('pointerdown', onPointerDown);
        btn.removeEventListener('pointermove', onPointerMove);
        btn.removeEventListener('pointerup', onPointerUp);
        btn.removeEventListener('click', onClick);
        btn.removeEventListener('contextmenu', onContextMenu);
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        window.removeEventListener('resize', onResize);
      },
    ];

    document.body.appendChild(btn);
    document.body.appendChild(menu);
    toggleBtn = btn;
    toggleThumb = thumb;
    zhSegEl = zhSeg;
    enSegEl = enSeg;
    menuEl = menu;
    switchTrackEl = switchTrack;
    switchKnobEl = switchKnob;
    updateToggleVisual();
  }

  // ========== 7. Observer 批处理调度与生命周期 ==========
  let observer = null;
  let scheduled = false;
  const pendingNodes = new Set();

  function flushPending() {
    scheduled = false;
    if (currentLang !== 'zh') {
      pendingNodes.clear();
      return;
    }
    const batch = Array.from(pendingNodes);
    pendingNodes.clear();
    for (const node of batch) {
      if (!node || !node.isConnected) continue;
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateTree(node);
    }
  }

  function enqueueNode(node) {
    if (!node || currentLang !== 'zh') return;
    pendingNodes.add(node);
    if (!scheduled) {
      scheduled = true;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(flushPending);
      } else {
        setTimeout(flushPending, 16);
      }
    }
  }

  function onStorageSync(e) {
    if (!e) return;
    if (e.key === STORAGE_KEYS.lang && (e.newValue === 'zh' || e.newValue === 'en')) {
      if (e.newValue !== currentLang) setLang(e.newValue, false);
    } else if (e.key === STORAGE_KEYS.keepEnLabels) {
      const next = e.newValue === '1';
      if (next !== keepEnglishLabels) setKeepEnglishLabels(next, false);
    }
  }

  function onMessageSync(e) {
    const data = e?.data;
    if (!data || data.type !== 'ag-zh-state') return;
    if ((data.lang === 'zh' || data.lang === 'en') && data.lang !== currentLang) {
      setLang(data.lang, false);
    }
    if (typeof data.keepEnglishLabels === 'boolean' && data.keepEnglishLabels !== keepEnglishLabels) {
      setKeepEnglishLabels(data.keepEnglishLabels, false);
    }
  }

  function start() {
    mountToggleUI();
    applyLanguageState();

    observer = new MutationObserver((mutations) => {
      if (currentLang !== 'zh') return;
      for (const m of mutations) {
        if (m.type === 'characterData') {
          enqueueNode(m.target);
        } else if (m.type === 'attributes') {
          if (m.target && !shouldSkipAttrs(m.target)) translateElement(m.target);
        } else if (m.type === 'childList') {
          for (const added of m.addedNodes) {
            enqueueNode(added);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });

    window.addEventListener('storage', onStorageSync);
    window.addEventListener('message', onMessageSync);
  }

  window.__agZhCleanup = () => {
    try {
      observer?.disconnect();
    } catch {}
    observer = null;
    pendingNodes.clear();
    window.removeEventListener('DOMContentLoaded', start);
    window.removeEventListener('storage', onStorageSync);
    window.removeEventListener('message', onMessageSync);
    for (const off of removeUiListeners) {
      try {
        off();
      } catch {}
    }
    removeUiListeners = [];
    try {
      toggleBtn?.remove();
      menuEl?.remove();
      glassFilterSvg?.remove();
    } catch {}
    toggleBtn = null;
    toggleThumb = null;
    zhSegEl = null;
    enSegEl = null;
    menuEl = null;
    switchTrackEl = null;
    switchKnobEl = null;
    glassFilterSvg = null;
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
