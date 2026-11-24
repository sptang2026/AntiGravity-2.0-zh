/**
 * 外部自定义翻译名单（custom-translations.txt）解析与安全权限校验模块
 * 规则：
 *   - `#` 开头为空白注释行
 *   - `英文 = 译文` 表示覆盖内置译文
 *   - `英文`（不含 `=`）表示强制保留英文原文不翻译
 * 安全边界：
 *   - 拒绝符号链接（防止软链劫持）
 *   - 限制文件大小（<= 1MB）
 *   - 校验文件属主为当前用户且不开放 group/other 写权限
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const MAX_CUSTOM_FILE_BYTES = 1024 * 1024;

/**
 * 解析自定义翻译文本
 * @param {string} content
 * @returns {Array<[string, string]>} [[enLower, target], ...]（target === '' 代表保留英文）
 */
export function parseCustomTranslations(content) {
  if (typeof content !== 'string' || !content.trim()) return [];
  const map = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      map.set(line.toLowerCase(), '');
    } else {
      const en = line.slice(0, eqIdx).trim();
      const zh = line.slice(eqIdx + 1).trim();
      if (!en) continue;
      map.set(en.toLowerCase(), zh);
    }
  }
  return Array.from(map.entries());
}

/**
 * 校验并读取外部自定义翻译文件
 * @param {string} filePath
 * @param {{ expectedUid?: number }} [options]
 * @returns {{ entries: Array<[string, string]>, hash: string, loaded: boolean, warning: string | null }}
 */
export function loadSafeCustomTranslations(filePath, options = {}) {
  const empty = { entries: [], hash: 'none', loaded: false, warning: null };
  if (!filePath || !fs.existsSync(filePath)) return empty;

  let st;
  try {
    st = fs.lstatSync(filePath);
  } catch (err) {
    return { ...empty, warning: `无法读取自定义词表元信息: ${err.message}` };
  }

  if (st.isSymbolicLink()) {
    return { ...empty, warning: `安全拒绝：自定义词表不能是符号链接 (${filePath})` };
  }
  if (!st.isFile()) {
    return { ...empty, warning: `安全拒绝：自定义词表不是普通文件 (${filePath})` };
  }
  if (st.size > MAX_CUSTOM_FILE_BYTES) {
    return { ...empty, warning: `安全拒绝：自定义词表超过 1MB 上限 (${st.size} bytes)` };
  }

  const currentUid = typeof options.expectedUid === 'number'
    ? options.expectedUid
    : typeof process.getuid === 'function'
      ? process.getuid()
      : null;

  if (currentUid !== null && st.uid !== currentUid) {
    return { ...empty, warning: `安全拒绝：自定义词表属主 (uid=${st.uid}) 与当前用户 (uid=${currentUid}) 不一致` };
  }

  // 禁止 group 或 other 拥有写权限（0o022）
  if ((st.mode & 0o022) !== 0) {
    return {
      ...empty,
      warning: `安全拒绝：自定义词表权限过宽 (mode=${(st.mode & 0o777).toString(8)})，请执行 chmod 600 "${filePath}"`,
    };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ...empty, warning: `读取自定义词表失败: ${err.message}` };
  }

  const entries = parseCustomTranslations(content);
  const hash = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12);
  return { entries, hash, loaded: true, warning: null };
}
