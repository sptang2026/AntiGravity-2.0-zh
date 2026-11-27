#!/bin/zsh
# 若被 bash / sh 等其它 shell 调用，自动切回 zsh 重新执行（本脚本用了 zsh 专有语法）
if [ -z "${ZSH_VERSION:-}" ]; then exec /bin/zsh "$0" "$@"; fi
# AntiGravity 2.0 中文汉化 · macOS 安装脚本
# 仅限 macOS。支持 Antigravity 桌面版（含 Swarm 面板）与 Antigravity IDE 动态汉化。
set -euo pipefail

ROOT="${0:A:h}"            # .../mac
REPO_ROOT="${ROOT:h}"      # 仓库根目录
LABEL="com.a1412.antigravity.zhpatch"
PLIST_NAME="$LABEL.plist"
SRC_PLIST="$ROOT/launchagents/$PLIST_NAME"
DEST_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"
PATCH_SCRIPT="$ROOT/bin/antigravity-zh-patch.js"
GENERATED_OVERLAY="$ROOT/bin/overlays.generated.mjs"
LOG_DIR="$ROOT/logs"

say() { printf '%s\n' "$*"; }
die() { printf '\n❌ 错误：%s\n' "$*" >&2; exit 1; }

say "== AntiGravity 2.0 中文汉化（仅限 macOS · 桌面版 + IDE）=="

# 1) 平台检查
if [[ "$(uname -s)" != "Darwin" ]]; then
  die "本工具仅支持 macOS（当前系统：$(uname -s)）。"
fi

# 2) 检测 Antigravity 桌面版与 Antigravity IDE（至少安装其一即可）
APP_DIR=""
for _d in "/Applications/Antigravity.app" "$HOME/Applications/Antigravity.app"; do
  if [[ -d "$_d" ]]; then APP_DIR="$_d"; break; fi
done

IDE_DIR=""
for _d in "/Applications/Antigravity IDE.app" "$HOME/Applications/Antigravity IDE.app"; do
  if [[ -d "$_d" ]]; then IDE_DIR="$_d"; break; fi
done

if [[ -z "$APP_DIR" && -z "$IDE_DIR" ]]; then
  say "⚠️  没在 /Applications 或 ~/Applications 找到 Antigravity.app 或 Antigravity IDE.app。"
  say "    请先安装至少其中一款应用，装好后重新运行本脚本。"
  exit 1
fi

[[ -n "$APP_DIR" ]] && say "✅ 已找到桌面版：$APP_DIR"
if [[ -n "$IDE_DIR" ]]; then
  say "✅ 已找到 IDE 版：$IDE_DIR"
  # 检查 IDE 是否已安装微软官方简体中文语言包（负责 VS Code 菜单与编辑器外壳）
  if ls -d "$HOME"/.antigravity/extensions/ms-ceintl.vscode-language-pack-zh-hans* >/dev/null 2>&1; then
    say "✅ 已检测到 IDE 官方简体中文语言包（若菜单仍为英文，请在 IDE 中按 Cmd+Shift+P 运行 Configure Display Language 选择中文）"
  else
    say "ℹ️  提示：未检测到 IDE 微软官方简体中文语言包。"
    say "    本工具将汉化 IDE 内的智能体侧边栏、独立设置页与 Swarm 面板；"
    say "    如需将 IDE 顶部菜单栏一并汉化，请在 IDE 扩展商店安装：MS-CEINTL.vscode-language-pack-zh-hans"
  fi
fi

# 3) Node.js 22+
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  for _c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.volta/bin/node" "$HOME/.local/bin/node"; do
    if [[ -x "$_c" ]]; then NODE_BIN="$_c"; break; fi
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  _nvm_bin=$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)
  [[ -n "$_nvm_bin" ]] && NODE_BIN="$_nvm_bin"
fi
[[ -n "$NODE_BIN" ]] || die "未找到 Node.js，请先安装 Node.js 22 或更高版本：https://nodejs.org"
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( ${NODE_MAJOR:-0} < 22 )); then
  die "Node.js 版本过低（$("$NODE_BIN" -v)），需要 22 或更高。"
fi
say "✅ Node.js $("$NODE_BIN" -v)"

# 4) 确保前端构建产物存在
if [[ ! -f "$GENERATED_OVERLAY" && -f "$REPO_ROOT/tools/build.mjs" ]]; then
  say "→ 正在构建汉化词库产物…"
  "$NODE_BIN" "$REPO_ROOT/tools/build.mjs"
fi
[[ -f "$GENERATED_OVERLAY" ]] || die "缺少构建产物 $GENERATED_OVERLAY，请运行 node tools/build.mjs。"

# 5) 文件权限
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod +x "$PATCH_SCRIPT" 2>/dev/null || true
chmod +x "$REPO_ROOT/一键汉化.command" "$REPO_ROOT/一键更新.command" "$REPO_ROOT/一键卸载.command" \
  "$ROOT/patch/delayed-apply.sh" "$ROOT/patch/patch-asar.js" \
  "$REPO_ROOT/tools/build.mjs" "$REPO_ROOT/tools/lint-dict.mjs" 2>/dev/null || true

# 6) 生成 LaunchAgent 配置
sed -e "s#__NODE_BIN__#$NODE_BIN#g" \
    -e "s#__PATCH_SCRIPT__#$PATCH_SCRIPT#g" \
    -e "s#__LOG_DIR__#$LOG_DIR#g" \
    "$SRC_PLIST" > "$DEST_PLIST"
plutil -lint "$DEST_PLIST" >/dev/null || die "生成的 LaunchAgent 配置无效。"

# 7) 注册并启动
launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST_PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

# 8) 自检
sleep 2
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
  say "✅ 汉化服务已启动（开机自启 · 事件驱动 CDP）"
else
  die "服务未能启动，请查看日志：$LOG_DIR/zhpatch.err.log"
fi

# 9) 迁移还原：若桌面版之前被旧版（改文件方案）打过启动补丁，还原成原厂文件以恢复 Google 签名
PATCHER="$REPO_ROOT/mac/patch/patch-asar.js"
if [[ -n "$APP_DIR" && -f "$PATCHER" ]] && AG_APP_PATH="$APP_DIR" "$NODE_BIN" "$PATCHER" --check >/dev/null 2>&1; then
  say ""
  say "→ 检测到 Antigravity.app 曾打过旧版启动补丁，正在还原成原厂…"
  if pgrep -f "/Antigravity.app/Contents/MacOS/Antigravity" >/dev/null 2>&1; then
    mkdir -p "$LOG_DIR"
    /usr/bin/nohup /bin/bash "$ROOT/patch/delayed-apply.sh" \
      "$NODE_BIN" "$PATCHER" "$APP_DIR" "$LOG_DIR/install.log" \
      >/dev/null 2>&1 &
    disown 2>/dev/null || true
    say "✅ 已安排后台还原：Antigravity 会自动退出，还原后自动重新打开（约 10 秒）"
    say "   进度日志：$LOG_DIR/install.log"
  else
    if AG_APP_PATH="$APP_DIR" "$NODE_BIN" "$PATCHER" --restore; then
      say "✅ 已还原成原厂文件（Google 签名恢复有效）"
    else
      say "⚠️  还原失败，请手动执行：node mac/patch/patch-asar.js --restore"
    fi
  fi
else
  say ""
  say "✅ App 为原厂状态（未修改任何文件，代码签名完好）"
fi

say ""
say "🎉 安装完成！"
say ""
say "使用提示："
say "   · 继续用原来的图标打开 Antigravity / Antigravity IDE 即可；"
say "   · 冷启动时 App 会在 3~10 秒内自动闪退并重开一次，属正常现象（macOS 不可能三角下，为同时保住原厂签名与原图标，由守护进程自动重开注入中文）；"
say "   · 窗口右下角提供可拖拽的「中 / EN」悬浮球：单击秒切中英文，右键或双击可勾选「选项名保留英文」；"
say "   · 如需自定义译文或强制保留英文词，复制 custom-translations.example.txt 为 custom-translations.txt 并执行 chmod 600。"
say ""
say "──────────── 常用命令（在本目录下执行）────────────"
say "  查看状态：  node mac/bin/antigravity-zh-patch.js --status"
say "  更新汉化：  ./mac/update.sh        （或双击「一键更新.command」）"
say "  还原/卸载：  ./mac/uninstall.sh     （或双击「一键卸载.command」）"
say "  检查服务：  launchctl list | grep zhpatch      （有输出=后台服务在运行）"
say "────────────────────────────────────────────────"
say ""
say "开源仓库：https://github.com/sptang2026/AntiGravity2.0-zh"

/usr/bin/osascript -e 'display notification "已生效：桌面版与 IDE 均支持事件驱动汉化，右下角可一键切换中英文。" with title "AntiGravity 中文汉化 · 安装完成"' >/dev/null 2>&1 || true
