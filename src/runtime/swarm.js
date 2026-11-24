/**
 * Swarm 面板（plugin://swarm--swarm_board-*）独立子帧翻译引擎
 * 特性：
 *   - 执行期协议 + 主机名 + DOM 标记双重校验，防止误注入其他插件帧
 *   - WeakMap 原文追踪 + cleanup() 热更新清理
 *   - 监听主窗口 postMessage 同步中英切换状态
 *
 * 说明：由 tools/build.mjs 注入指纹、主机匹配正则、DOM 标记与词典后生成最终子帧脚本。
 */
(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const HOST_PATTERN = new RegExp('__SWARM_HOST_PATTERN__', 'i');
  if (
    location.protocol !== 'plugin:' ||
    !HOST_PATTERN.test(location.hostname || '') ||
    (location.pathname !== '/' && location.pathname !== '')
  ) {
    return;
  }

  const MARKERS = [
    /* __SWARM_MARKERS__ */
  ];

  const FINGERPRINT = window.__agZhRequestedFingerprint || '__SWARM_FINGERPRINT__';
  if (
    window.__agZhInstalled === true &&
    window.__agZhDocument === document &&
    window.__agZhFingerprint === FINGERPRINT
  ) {
    return;
  }

  if (typeof window.__agZhCleanup === 'function') {
    try {
      window.__agZhCleanup();
    } catch {}
  }

  window.__agZhInstalled = true;
  window.__agZhDocument = document;
  window.__agZhFingerprint = FINGERPRINT;

  const ENTRIES = [
    /* __SWARM_ENTRIES__ */
  ];
  const exactMap = new Map(ENTRIES);
  const lowerMap = new Map();
  for (const [k, v] of ENTRIES) {
    const lk = k.toLowerCase();
    if (!lowerMap.has(lk)) lowerMap.set(lk, v);
  }

  const originals =
    window.__agZhOriginals ||
    (window.__agZhOriginals = {
      texts: new WeakMap(),
      attrs: new WeakMap(),
    });

  let currentLang = 'zh';
  try {
    if (window.localStorage?.getItem('agZhLang') === 'en') currentLang = 'en';
  } catch {}

  const SKIP_SELECTOR = 'script, style, code, pre, input, textarea, [contenteditable="true"], .font-mono, [translate="no"]';
  const ATTRS = ['aria-label', 'title', 'placeholder'];

  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function hasSwarmMarker() {
    for (const sel of MARKERS) {
      try {
        if (document.querySelector(sel)) return true;
      } catch {}
    }
    return false;
  }

  function translateText(raw) {
    if (!raw || !/[A-Za-z]/.test(raw)) return raw;
    const key = norm(raw);
    if (!key) return raw;
    const hit = exactMap.get(key) ?? lowerMap.get(key.toLowerCase());
    if (!hit) return raw;
    const lead = raw.match(/^\s*/)?.[0] || '';
    const trail = raw.match(/\s*$/)?.[0] || '';
    return lead + hit + trail;
  }

  function applyTree(root) {
    if (!root || currentLang !== 'zh') return;
    if (!hasSwarmMarker()) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement?.closest?.(SKIP_SELECTOR)) continue;
        const cur = node.nodeValue || '';
        if (!cur.trim()) continue;
        const rec = originals.texts.get(node);
        const src = rec && rec.zh === cur ? rec.orig : cur;
        const next = translateText(src);
        if (next !== src && next !== cur) {
          originals.texts.set(node, { orig: src, zh: next });
          node.nodeValue = next;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.closest?.(SKIP_SELECTOR)) continue;
        for (const attr of ATTRS) {
          const cur = node.getAttribute?.(attr);
          if (!cur) continue;
          let map = originals.attrs.get(node);
          const rec = map?.get(attr);
          const src = rec && rec.zh === cur ? rec.orig : cur;
          const next = translateText(src);
          if (next !== src && next !== cur) {
            if (!map) {
              map = new Map();
              originals.attrs.set(node, map);
            }
            map.set(attr, { orig: src, zh: next });
            node.setAttribute(attr, next);
          }
        }
      }
    }
  }

  function restoreTree(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        const rec = originals.texts.get(node);
        if (rec) {
          if (node.nodeValue === rec.zh) node.nodeValue = rec.orig;
          originals.texts.delete(node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const map = originals.attrs.get(node);
        if (map) {
          for (const [attr, rec] of map.entries()) {
            if (node.getAttribute(attr) === rec.zh) {
              if (rec.orig === null) node.removeAttribute(attr);
              else node.setAttribute(attr, rec.orig);
            }
          }
          originals.attrs.delete(node);
        }
      }
    }
  }

  function setLang(next) {
    currentLang = next === 'en' ? 'en' : 'zh';
    if (currentLang === 'zh') applyTree(document);
    else restoreTree(document);
  }

  window.__agZhSetLang = setLang;

  function onMessage(e) {
    const data = e?.data;
    if (data && data.type === 'ag-zh-state' && (data.lang === 'zh' || data.lang === 'en')) {
      setLang(data.lang);
    }
  }

  let observer = null;
  function start() {
    applyTree(document);
    observer = new MutationObserver(() => {
      if (currentLang === 'zh') applyTree(document);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    window.addEventListener('message', onMessage);
  }

  window.__agZhCleanup = () => {
    try {
      observer?.disconnect();
    } catch {}
    observer = null;
    window.removeEventListener('DOMContentLoaded', start);
    window.removeEventListener('message', onMessage);
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
