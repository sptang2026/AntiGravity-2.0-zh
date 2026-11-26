/**
 * 动态 UI 文案翻译规则模块
 * 说明：本模块既可供浏览器 overlay 直接内联执行，也可在 Node 测试中直接 import。
 */

export function normalizeText(str) {
  if (!str) return '';
  return str
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .trim();
}

export function formatDuration(raw) {
  const text = raw.trim();
  const parts = [];
  const dayMatch = text.match(/(\d+)\s*days?/i);
  const hourMatch = text.match(/(\d+)\s*hours?/i);
  const minMatch = text.match(/(\d+)\s*minutes?/i);
  const secMatch = text.match(/(\d+)\s*seconds?/i);
  if (dayMatch) parts.push(`${dayMatch[1]} 天`);
  if (hourMatch) parts.push(`${hourMatch[1]} 小时`);
  if (minMatch) parts.push(`${minMatch[1]} 分钟`);
  if (secMatch) parts.push(`${secMatch[1]} 秒`);
  if (parts.length > 0) return parts.join(' ');
  if (/less than a minute/i.test(text)) return '不到 1 分钟';
  if (/a few seconds/i.test(text)) return '几秒';
  return text;
}

export function formatCompactDuration(raw) {
  let s = raw.trim();
  if (s === '<1s' || s === '< 1s') return '不到 1 秒';
  s = s
    .replace(/(\d+)\s*d(?:ays?)?\b/gi, '$1 天')
    .replace(/(\d+)\s*h(?:ours?|r|rs)?\b/gi, '$1 小时')
    .replace(/(\d+)\s*m(?:inutes?|in|ins)?\b/gi, '$1 分钟')
    .replace(/(\d+)\s*ms\b/gi, '$1 毫秒')
    .replace(/(\d+)\s*s(?:econds?|ec|ecs)?\b/gi, '$1 秒');
  return s;
}

const TOOL_VERB_MAP = {
  exploring: '正在探索',
  explored: '已探索',
  editing: '正在编辑',
  edited: '已编辑',
  running: '正在运行',
  ran: '已运行',
  searching: '正在搜索',
  searched: '已搜索',
  analyzing: '正在分析',
  analyzed: '已分析',
  reading: '正在读取',
  read: '已读取',
  viewing: '正在查看',
  viewed: '已查看',
};

const TOOL_NOUN_MAP = {
  file: '个文件',
  files: '个文件',
  folder: '个文件夹',
  folders: '个文件夹',
  directory: '个目录',
  directories: '个目录',
  search: '次搜索',
  searches: '次搜索',
  command: '个命令',
  commands: '个命令',
  task: '个任务',
  tasks: '个任务',
  page: '个网页',
  pages: '个网页',
  browser: '次浏览器操作',
  browsers: '次浏览器操作',
  image: '张图片',
  images: '张图片',
  action: '项操作',
  actions: '项操作',
  artifact: '个工件',
  artifacts: '个工件',
  edit: '处编辑',
  edits: '处编辑',
};

const LIMIT_MAP = {
  weekly: '每周',
  '5-hour': '5 小时',
  'five-hour': '5 小时',
  'five hour': '5 小时',
  daily: '每日',
  monthly: '每月',
  hourly: '每小时',
};

const EFFORT_MAP = {
  'Extra High': '超高',
  XHigh: '超高',
  High: '高',
  Medium: '中',
  Low: '低',
  Thinking: '思考',
};

const MONTH_MAP = {
  jan: '1', january: '1',
  feb: '2', february: '2',
  mar: '3', march: '3',
  apr: '4', april: '4',
  may: '5',
  jun: '6', june: '6',
  jul: '7', july: '7',
  aug: '8', august: '8',
  sep: '9', sept: '9', september: '9',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function formatEnDate(monthStr, dayStr, yearStr = '') {
  const mon = MONTH_MAP[String(monthStr || '').toLowerCase()];
  if (!mon) return `${monthStr} ${dayStr}${yearStr ? `, ${yearStr}` : ''}`;
  return yearStr ? `${yearStr} 年 ${mon} 月 ${dayStr} 日` : `${mon} 月 ${dayStr} 日`;
}

export function translateToolGroupSummary(valNorm, contextEl) {
  if (/^(Editing|Edited)\s+files$/i.test(valNorm)) {
    return /^Editing/i.test(valNorm) ? '正在编辑文件' : '已编辑文件';
  }
  const parts = valNorm.split(/\s*,\s*/);
  const out = [];
  let matchedAll = parts.length > 0;
  for (const part of parts) {
    const m = part.match(
      /^(?:(Exploring|Explored|Editing|Edited|Running|Ran|Searching|Searched|Analyzing|Analyzed|Reading|Read|Viewing|Viewed)\s+)?(\d+)\s+(file|files|folder|folders|directory|directories|search|searches|command|commands|task|tasks|page|pages|browser|browsers|image|images|action|actions|artifact|artifacts|edit|edits)$/i
    );
    if (!m) {
      matchedAll = false;
      break;
    }
    const verb = m[1] ? `${TOOL_VERB_MAP[m[1].toLowerCase()] || m[1]} ` : '';
    const noun = TOOL_NOUN_MAP[m[3].toLowerCase()] || m[3];
    out.push(`${verb}${m[2]} ${noun}`);
  }
  if (matchedAll && out.length > 0) {
    return out.join('，');
  }
  if (contextEl && typeof contextEl.closest === 'function' && contextEl.closest('[data-testid="tool-group-collapsible"]')) {
    const cmdMatch = valNorm.match(/^(Ran|Running)\s+([\s\S]+)$/);
    if (cmdMatch) {
      return (cmdMatch[1] === 'Ran' ? '已运行 ' : '正在运行 ') + cmdMatch[2];
    }
  }
  return null;
}

export function translateWithShortcut(valNorm, lookupFn) {
  if (!valNorm) return null;
  const match = valNorm.match(/^(.+?)\s*\((Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)([^)]*)\)$/i);
  if (!match) return null;
  const prefix = normalizeText(match[1]);
  const translatedPrefix = lookupFn(prefix);
  if (translatedPrefix) {
    return `${translatedPrefix} (${match[2]}${match[3]})`;
  }
  return null;
}

export function translateDynamic(valNorm, contextEl, options = {}) {
  const keepEnglishLabels = Boolean(options.keepEnglishLabels);

  // 1. 工具调用分组摘要
  const toolSummary = translateToolGroupSummary(valNorm, contextEl);
  if (toolSummary) return toolSummary;

  let m;

  // 2. 思考与工作耗时
  if ((m = valNorm.match(/^Thought for\s+(.+)$/i))) {
    return `已思考 ${formatCompactDuration(m[1])}`;
  }
  if ((m = valNorm.match(/^Thinking for\s+(.+)$/i))) {
    return `正在思考 ${formatCompactDuration(m[1])}`;
  }
  if ((m = valNorm.match(/^Worked for\s+(.+)$/i))) {
    return `已工作 ${formatCompactDuration(m[1])}`;
  }

  // 3. 分页与展开计数
  if ((m = valNorm.match(/^No more older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i))) {
    return `没有更多历史消息，当前显示 ${m[1]} / ${m[2]} 条`;
  }
  if ((m = valNorm.match(/^Showing\s+(\d+)\s+of\s+(\d+)(?:\s+results?|\s+items?|\s+messages?|\s+conversations?)?$/i))) {
    return `正在显示 ${m[1]} / ${m[2]}`;
  }
  if (
    (m = valNorm.match(
      /^Show\s+(\d+)\s+more(?:\s+(results?|items?|commands?|options?|files?|lines?|conversations?|projects?))?(\.\.\.|…)?$/i
    ))
  ) {
    const num = m[1];
    const type = (m[2] || '').toLowerCase();
    const dots = m[3] ? '...' : '';
    if (type.startsWith('result')) return `显示另外 ${num} 个结果${dots}`;
    if (type.startsWith('command')) return `显示另外 ${num} 个命令${dots}`;
    if (type.startsWith('item')) return `显示另外 ${num} 项${dots}`;
    if (type.startsWith('option')) return `显示另外 ${num} 个选项${dots}`;
    if (type.startsWith('file')) return `显示另外 ${num} 个文件${dots}`;
    if (type.startsWith('line')) return `显示另外 ${num} 行${dots}`;
    if (type.startsWith('conversation')) return `显示另外 ${num} 个对话${dots}`;
    if (type.startsWith('project')) return `显示另外 ${num} 个项目${dots}`;
    return `显示另外 ${num} 个${dots}`;
  }
  if ((m = valNorm.match(/^See all\s*\((\d+)\)$/i))) {
    return `查看全部 (${m[1]})`;
  }
  if ((m = valNorm.match(/^\+(\d+)\s+more$/i))) {
    return `另外 +${m[1]} 项`;
  }
  if ((m = valNorm.match(/^(\d+)\s+more\.\.\.$/i))) {
    return `另外 ${m[1]} 项...`;
  }

  // 4. 相对时间与紧凑时长
  if ((m = valNorm.match(/^(\d+)\s*(s|m|h|d|w|mo|yr|y)\s+ago$/i))) {
    const unitMap = { s: '秒前', m: '分钟前', h: '小时前', d: '天前', w: '周前', mo: '个月前', yr: '年前', y: '年前' };
    return `${m[1]} ${unitMap[m[2].toLowerCase()] || m[2]}`;
  }
  if ((m = valNorm.match(/^(\d+)(s|m|h|d|w|mo|yr|y)$/))) {
    const unitMap = { s: ' 秒', m: ' 分钟', h: ' 小时', d: ' 天', w: ' 周', mo: ' 个月', yr: ' 年', y: ' 年' };
    return `${m[1]}${unitMap[m[2]] || m[2]}`;
  }

  // 5. 模型、项目、分支、权限选择器及额度百分比
  if ((m = valNorm.match(/^Select model,\s*current:\s*(.+?)(?:\s+(Extra High|XHigh|High|Medium|Low|Thinking))?$/i))) {
    const model = m[1].trim();
    const effRaw = m[2] || '';
    const eff = effRaw ? ` ${keepEnglishLabels ? effRaw : EFFORT_MAP[effRaw] || effRaw}` : '';
    return `选择模型，当前：${model}${eff}`;
  }
  if ((m = valNorm.match(/^Select project,\s*current:\s*(.+)$/i))) {
    return `选择项目，当前：${m[1]}`;
  }
  if ((m = valNorm.match(/^Branch,\s*current:\s*(.+)$/i))) {
    return `分支，当前：${m[1]}`;
  }
  if ((m = valNorm.match(/^Agent permissions preset selector,\s*current:\s*(.+)$/i))) {
    return `智能体权限预设选择器，当前：${m[1]}`;
  }
  if ((m = valNorm.match(/^Where the agent runs,\s*current:\s*(.+)$/i))) {
    const loc = m[1].replace(/\bThis Computer\b/g, '本机').replace(/\bRemote\b/g, '远程');
    return `智能体运行位置，当前：${loc}`;
  }
  if ((m = valNorm.match(/^Show ([\d,]+) breakdowns?$/i))) {
    return `显示 ${m[1]} 项明细`;
  }
  if ((m = valNorm.match(/^Rules \(([\d,]+) tokens\) ([\d.]+%)$/i))) {
    return `规则（${m[1]} Token）${m[2]}`;
  }
  if ((m = valNorm.match(/^(\d+(?:\.\d+)?)% left$/i))) {
    return `剩余 ${m[1]}%`;
  }
  if ((m = valNorm.match(/^(\d+(?:\.\d+)?)% used$/i))) {
    return `已用 ${m[1]}%`;
  }
  if ((m = valNorm.match(/^(Gemini|Claude|GPT)\s+([^(]+)\s*\((Extra High|XHigh|High|Medium|Low|Thinking)\)$/))) {
    const label = keepEnglishLabels ? m[3] : EFFORT_MAP[m[3]] || m[3];
    return `${m[1]} ${m[2].trim()} (${label})`;
  }
  // 模型动态提示（编排器分流与下线日期提醒，保留模型名称原文）
  if (
    (m = valNorm.match(
      /^(.+?)\s+that may offload routine steps to\s+(.+?)\.\s+Same\s+(.+?)-level quality,\s*fewer tokens used\.?$/i
    ))
  ) {
    return `以 ${m[1]} 为主，可将常规步骤分流给 ${m[2]}。保持 ${m[3]} 级质量，消耗更少 Token。`;
  }
  if (
    (m = valNorm.match(
      /^(.+?)\s+will be removed from Antigravity on\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\.?$/i
    ))
  ) {
    return `${m[1]} 将于 ${formatEnDate(m[2], m[3], m[4] || '')}从 Antigravity 下线。`;
  }
  if ((m = valNorm.match(/^The original (.+?) model for advanced workflows\.\s*Leaving on ([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\.?$/i))) {
    return `面向进阶工作流的初代 ${m[1]} 模型。将于 ${formatEnDate(m[2], m[3], m[4] || '')}下线。`;
  }
  if ((m = valNorm.match(/^Use (.+?) for better quality with lower quota usage\.\s*Leaving on ([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\.?$/i))) {
    return `建议改用 ${m[1]}，效果更佳且额度消耗更低。将于 ${formatEnDate(m[2], m[3], m[4] || '')}下线。`;
  }
  if ((m = valNorm.match(/^Leaving on ([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\.?$/i))) {
    return `将于 ${formatEnDate(m[1], m[2], m[3] || '')}下线。`;
  }

  // 6. 额度重置与刷新提示
  if ((m = valNorm.match(/^You have (?:used some of|reached) your (.+?) limit,? it will (?:fully )?refresh in (.+?)\.?$/i))) {
    const limitZh = LIMIT_MAP[m[1].trim().toLowerCase()] ?? m[1].trim();
    return `您已使用部分${limitZh}额度，将在 ${formatDuration(m[2])}后完全重置。`;
  }
  if ((m = valNorm.match(/^You have used all of your (.+?) limit,? it will (?:fully )?refresh in (.+?)\.?$/i))) {
    const limitZh = LIMIT_MAP[m[1].trim().toLowerCase()] ?? m[1].trim();
    return `您的${limitZh}额度已耗尽，将在 ${formatDuration(m[2])}后完全重置。`;
  }
  if ((m = valNorm.match(/^You have not used any of your (.+?) limit\.?$/i))) {
    const limitZh = LIMIT_MAP[m[1].trim().toLowerCase()] ?? m[1].trim();
    return `您尚未消耗${limitZh}额度。`;
  }
  if ((m = valNorm.match(/^Refreshes in (.+?)\.?$/i))) {
    return `${formatDuration(m[1])}后刷新`;
  }
  if ((m = valNorm.match(/^Resets in (.+?)\.?$/i))) {
    // 保留 d/h/m 单位与数字原样（如 "6d 23h 后重置"）
    return `${m[1].trim()} 后重置`;
  }
  if ((m = valNorm.match(/^Available AI Credits:\s*(\d+)$/i))) {
    return `可用 AI 额度：${m[1]}`;
  }

  // 7. 权限审批与白名单规则
  if (
    (m = valNorm.match(
      /^Requesting permission to (read access to this path|write access to this path|reading this URL|executing actions on this URL|running this command|running this command outside the sandbox|using this MCP tool)\s*(.*)$/i
    ))
  ) {
    const actions = {
      'read access to this path': '读取此路径',
      'write access to this path': '写入此路径',
      'reading this url': '读取此 URL',
      'executing actions on this url': '在此 URL 上执行操作',
      'running this command': '运行此命令',
      'running this command outside the sandbox': '在沙盒外运行此命令',
      'using this mcp tool': '使用此 MCP 工具',
    };
    const actZh = actions[m[1].toLowerCase()] ?? m[1];
    return `正在请求权限：${actZh}${m[2] ? ` ${m[2]}` : ''}`;
  }
  if ((m = valNorm.match(/^Agent needs permission to execute JavaScript on (.+)$/i))) {
    return `智能体需要权限才能在 ${m[1]} 上执行 JavaScript`;
  }
  if ((m = valNorm.match(/^Agent needs permission to act on (.+)$/i))) {
    return `智能体需要权限才能操作 ${m[1]}`;
  }
  if ((m = valNorm.match(/^Yes, save rule for '([^']+)' when not in a project$/i))) {
    return `是，并在未处于项目时保存 '${m[1]}' 的规则`;
  }
  if ((m = valNorm.match(/^Yes, save rule for '([^']+)' in this project$/i))) {
    return `是，并在此项目中保存 '${m[1]}' 的规则`;
  }
  if ((m = valNorm.match(/^Yes, save rule for '([^']+)' in this workspace$/i))) {
    return `是，并在此工作区保存 '${m[1]}' 的规则`;
  }
  if ((m = valNorm.match(/^Yes, save rule for '([^']+)' globally$/i))) {
    return `是，并全局保存 '${m[1]}' 的规则`;
  }
  if ((m = valNorm.match(/^Yes, and always allow '([^']+)' when not in a project$/i))) {
    return `是，并在未处于项目时始终允许 '${m[1]}'`;
  }
  if ((m = valNorm.match(/^Yes, and always allow '([^']+)' in this project$/i))) {
    return `是，并在此项目中始终允许 '${m[1]}'`;
  }
  if ((m = valNorm.match(/^Yes, and always allow '([^']+)' in this workspace$/i))) {
    return `是，并在此工作区始终允许 '${m[1]}'`;
  }
  if ((m = valNorm.match(/^Yes, and always allow '([^']+)'$/i))) {
    return `是，并始终允许 '${m[1]}'`;
  }

  // 8. 统计、版本与反馈
  if ((m = valNorm.match(/^(\d+)\s+tools?\s+enabled$/i))) {
    return `${m[1]} 个工具已启用`;
  }
  if ((m = valNorm.match(/^(\d+)\s+tools?$/i))) {
    return `${m[1]} 个工具`;
  }
  if ((m = valNorm.match(/^(\d+)\s+active conversations?(\.?)$/i))) {
    return `${m[1]} 个活跃对话${m[2] ? '。' : ''}`;
  }
  if ((m = valNorm.match(/^including\s+(\d+)\s+active conversations?(\.?)$/i))) {
    return `包含 ${m[1]} 个活跃对话${m[2] ? '。' : ''}`;
  }
  if ((m = valNorm.match(/^(?:(Permanently delete)\s+)?(.+?)\s+including\s+(\d+)\s+active conversations?(\.?)$/i))) {
    const prefix = m[1] ? '永久删除 ' : '';
    return `${prefix}${m[2]}（包含 ${m[3]} 个活跃对话）${m[4] ? '。' : ''}`;
  }
  if ((m = valNorm.match(/^Are you sure you want to delete (?:the |this )?project (.+?)\??$/i))) {
    return `您确定要删除项目 ${m[1]} 吗？`;
  }
  if ((m = valNorm.match(/^Version\s+([\d.a-zA-Z-]+)$/i))) {
    return `版本 ${m[1]}`;
  }
  if ((m = valNorm.match(/^Send feedback as(?:\s+(.+))?$/i))) {
    return m[1] ? `以 ${m[1]} 身份发送反馈` : '以如下身份发送反馈：';
  }
  if ((m = valNorm.match(/^Learn more about\s+(.+)$/i))) {
    const p = m[1].trim();
    const pLow = p.toLowerCase();
    let preset = p;
    if (pLow === 'default') preset = '默认 (Default)';
    else if (pLow === 'full machine') preset = '全机访问 (Full Machine)';
    else if (pLow === 'turbo mode') preset = '极速模式 (Turbo Mode)';
    else if (pLow === 'custom') preset = '自定义 (Custom)';
    return `了解更多关于 ${preset} 的信息`;
  }

  return null;
}
