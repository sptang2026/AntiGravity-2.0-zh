#!/bin/bash
# delayed-apply.sh — 在 Antigravity 退出后打补丁，并重新打开 App
#
# 用途：当用户在 Antigravity 内部（通过它的 Agent）执行安装时，安装脚本本身
# 是 App 的子进程，退出 App 会把脚本一起杀掉。所以把"打补丁 + 重开"交给这个
# 独立进程（nohup 脱壳），它不受 App 退出影响。
#
# 参数：<node 路径> <patch-asar.js 路径> <App 路径> <日志文件>

set -u
NODE_BIN="$1"
PATCHER="$2"
APP="$3"
LOG="$4"

PGREP_PAT="/Antigravity.app/Contents/MacOS/Antigravity"

mkdir -p "$(dirname "$LOG")" 2>/dev/null
echo "[delayed-apply] $(date) 开始等待 Antigravity 退出…" >> "$LOG"

# 最多尝试 5 轮：发退出指令 → 等它真正退出
for _round in 1 2 3 4 5; do
  /usr/bin/osascript -e 'quit application "Antigravity"' >/dev/null 2>&1 || true
  for _i in $(seq 1 20); do
    /usr/bin/pgrep -f "$PGREP_PAT" >/dev/null 2>&1 || break
    sleep 1
  done
  /usr/bin/pgrep -f "$PGREP_PAT" >/dev/null 2>&1 || break
done

if /usr/bin/pgrep -f "$PGREP_PAT" >/dev/null 2>&1; then
  echo "[delayed-apply] $(date) App 未能退出，放弃打补丁" >> "$LOG"
  exit 1
fi

echo "[delayed-apply] $(date) App 已退出，开始打补丁" >> "$LOG"
"$NODE_BIN" "$PATCHER" --apply >> "$LOG" 2>&1
RC=$?
echo "[delayed-apply] $(date) 打补丁退出码=$RC" >> "$LOG"

/usr/bin/open -a "$APP" >/dev/null 2>&1 || true
echo "[delayed-apply] $(date) 已重新打开 App" >> "$LOG"
exit $RC
