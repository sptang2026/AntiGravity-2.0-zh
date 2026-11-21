#!/bin/bash
# 双击运行即可更新到最新版（仅限 macOS）
set -u
cd "$(dirname "$0")" || exit 1

echo
echo "======================================"
echo "  AntiGravity 2.0 中文汉化 · 更新"
echo "======================================"
echo

chmod +x mac/update.sh mac/install.sh 2>/dev/null

if ./mac/update.sh; then
  :
else
  echo
  echo "❌ 更新失败，请把上面的错误信息截图反馈。"
fi

echo
read -r -n 1 -s -p "按任意键关闭窗口…"
echo
