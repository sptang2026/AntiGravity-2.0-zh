#!/bin/bash
# delayed-apply.sh — 在 Antigravity 退出后把 App 还原成原厂文件，并重新打开
#
# 用途：迁移旧版本（改文件方案）时，若 App 正在运行，退出 App 会把调用方脚本一起杀掉
# （当安装在 Antigravity 内部执行时）。所以把"退出→还原→重开"交给这个独立进程脱壳执行。
# 自愈方案不再修改 App 文件，此脚本只用于把已打补丁的 App 还原成原厂。
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
  echo "[delayed-apply] $(date) App 未能退出，放弃还原" >> "$LOG"
  exit 1
fi

echo "[delayed-apply] $(date) App 已退出，开始还原成原厂文件" >> "$LOG"
AG_APP_PATH="$APP" "$NODE_BIN" "$PATCHER" --restore >> "$LOG" 2>&1
RC=$?
echo "[delayed-apply] $(date) 还原退出码=$RC" >> "$LOG"

# 还原后重新打开 App（守护进程会检测到没带调试端口，自愈重启并注入中文）
/usr/bin/open -a "$APP" >/dev/null 2>&1 || true
echo "[delayed-apply] $(date) 已重新打开 App" >> "$LOG"
exit $RC
