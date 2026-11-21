#!/bin/zsh
# 若被 bash / sh 等其它 shell 调用，自动切回 zsh 重新执行（本脚本用了 zsh 专有语法）
if [ -z "${ZSH_VERSION:-}" ]; then exec /bin/zsh "$0" "$@"; fi
# AntiGravity 2.0 中文汉化 · macOS 安装脚本
# 仅限 macOS。安装后注册一个开机自启的后台服务（LaunchAgent）自动注入中文。
set -euo pipefail

ROOT="${0:A:h}"            # .../mac
REPO_ROOT="${ROOT:h}"      # 仓库根目录
LABEL="com.a1412.antigravity.zhpatch"
PLIST_NAME="$LABEL.plist"
SRC_PLIST="$ROOT/launchagents/$PLIST_NAME"
DEST_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"
PATCH_SCRIPT="$ROOT/bin/antigravity-zh-patch.js"
LOG_DIR="$ROOT/logs"

say() { printf '%s\n' "$*"; }
die() { printf '\n❌ 错误：%s\n' "$*" >&2; exit 1; }

say "== AntiGravity 2.0 中文汉化（仅限 macOS）=="

# 1) 平台检查
if [[ "$(uname -s)" != "Darwin" ]]; then
  die "本工具仅支持 macOS（当前系统：$(uname -s)）。"
fi

# 2) Antigravity 桌面版是否安装
if [[ ! -d "/Applications/Antigravity.app" && ! -d "$HOME/Applications/Antigravity.app" ]]; then
  say "⚠️  没在 /Applications 或 ~/Applications 找到 Antigravity.app。"
  say "    请先安装 Antigravity 桌面版（不是 Antigravity IDE），装好后重新运行本脚本。"
fi

# 3) Node.js 22+
NODE_BIN="$(command -v node || true)"
# GUI / Agent 环境的 PATH 常常很干净，这里补几个常见安装位置（Homebrew / 官方包 / nvm）
if [[ -z "$NODE_BIN" ]]; then
  for _c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.volta/bin/node" "$HOME/.local/bin/node"; do
    if [[ -x "$_c" ]]; then NODE_BIN="$_c"; break; fi
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  _nvm_bin=$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)
  [[ -n "$_nvm_bin" ]] && NODE_BIN="$_nvm_bin"
fi
[[ -n "$NODE_BIN" ]] || die "未找到 Node.js，请先安装 Node.js 22 或更高版本：https://nodejs.org"
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( ${NODE_MAJOR:-0} < 22 )); then
  die "Node.js 版本过低（$("$NODE_BIN" -v)），需要 22 或更高。"
fi
say "✅ Node.js $("$NODE_BIN" -v)"

# 4) 文件权限
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod +x "$PATCH_SCRIPT" 2>/dev/null || true
chmod +x "$REPO_ROOT/一键汉化.command" "$REPO_ROOT/一键卸载.command" "$ROOT/patch/delayed-apply.sh" "$ROOT/patch/patch-asar.js" 2>/dev/null || true

# 5) 生成 LaunchAgent 配置
sed -e "s#__NODE_BIN__#$NODE_BIN#g" \
    -e "s#__PATCH_SCRIPT__#$PATCH_SCRIPT#g" \
    -e "s#__LOG_DIR__#$LOG_DIR#g" \
    "$SRC_PLIST" > "$DEST_PLIST"
plutil -lint "$DEST_PLIST" >/dev/null || die "生成的 LaunchAgent 配置无效。"

# 6) 注册并启动
launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST_PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

# 7) 自检
sleep 2
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
  say "✅ 汉化服务已启动（开机自启）"
else
  die "服务未能启动，请查看日志：$LOG_DIR/zhpatch.err.log"
fi

# 9) 给 App 打启动补丁（用原图标打开即中文，不闪退）
say ""
say "→ 正在为 Antigravity 打启动补丁…"
PATCHER="$REPO_ROOT/mac/patch/patch-asar.js"
if [[ -f "$PATCHER" ]]; then
  if "$NODE_BIN" "$PATCHER" --check >/dev/null 2>&1; then
    say "✅ 补丁已存在，无需重复"
  elif pgrep -f "/Antigravity.app/Contents/MacOS/Antigravity" >/dev/null 2>&1; then
    # 关键：如果本脚本正运行在 Antigravity 内部（用户在 App 里让 Agent 安装），
    # 退出 App 会把脚本一起杀掉。所以把"退出→打补丁→重开"交给脱壳的独立进程。
    mkdir -p "$LOG_DIR"
    /usr/bin/nohup /bin/bash "$ROOT/patch/delayed-apply.sh" \
      "$NODE_BIN" "$PATCHER" "/Applications/Antigravity.app" "$LOG_DIR/install.log" \
      >/dev/null 2>&1 &
    disown 2>/dev/null || true
    say "✅ 已安排后台完成补丁：Antigravity 会自动退出，打补丁后自动重新打开（约 10 秒）"
    say "   进度日志：$LOG_DIR/install.log"
  else
    if "$NODE_BIN" "$PATCHER" --apply; then
      say "✅ 启动补丁已应用"
    else
      say "⚠️  补丁未应用成功；可稍后重试：node mac/patch/patch-asar.js --apply"
    fi
  fi
else
  say "⚠️  未找到补丁工具，跳过"
fi

say ""
say "🎉 安装完成！"
say ""
say "以后直接用原来的 Antigravity 图标打开即可："
say "   · 打开就是中文，不会闪退、不需要重启；"
say "   · App 自动更新后补丁可能被覆盖，服务会自动重打；期间若见英文，退出 App 再打开即恢复中文。"
say ""
say "──────────── 常用命令（在本目录下执行）────────────"
say "  更新汉化：  ./mac/update.sh        （或双击「一键更新.command」）"
say "  还原/卸载：  ./mac/uninstall.sh     （或双击「一键卸载.command」，会把 App 还原成原始文件）"
say "  检查状态：  node mac/patch/patch-asar.js --check"
say "────────────────────────────────────────────────"
say ""
say "开源仓库：https://github.com/sptang2026/AntiGravity-2.0-zh"

# 完成提示（系统通知）
/usr/bin/osascript -e 'display notification "已生效：用原来的图标打开即是中文。更新用 ./mac/update.sh，还原用 ./mac/uninstall.sh" with title "AntiGravity 中文汉化 · 安装完成"' >/dev/null 2>&1 || true
