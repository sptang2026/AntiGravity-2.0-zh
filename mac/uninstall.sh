#!/bin/zsh
# AntiGravity 2.0 中文汉化 · macOS 卸载脚本
set -euo pipefail

ROOT="${0:A:h}"

LABEL="com.a1412.antigravity.zhpatch"
DEST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true
rm -f "$DEST_PLIST"


# 还原 App 启动补丁
PATCHER="$ROOT/patch/patch-asar.js"
if [[ -f "$PATCHER" ]] && command -v node >/dev/null 2>&1; then
  if pgrep -f "/Antigravity.app/Contents/MacOS/Antigravity" >/dev/null 2>&1; then
    echo "→ 先退出 Antigravity 以还原补丁…"
    /usr/bin/osascript -e 'quit application "Antigravity"' 2>/dev/null || true
    for _i in 1 2 3 4 5 6 7 8 9 10; do
      pgrep -f "/Antigravity.app/Contents/MacOS/Antigravity" >/dev/null 2>&1 || break
      sleep 1
    done
  fi
  node "$PATCHER" --restore 2>/dev/null || true
fi

echo "✅ 已停止汉化服务、移除开机自启，并还原 App 原始文件。"
echo "   重新安装：双击「一键汉化.command」"
