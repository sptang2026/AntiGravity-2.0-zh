#!/bin/bash
# 双击运行即可卸载汉化（仅限 macOS）
set -u
cd "$(dirname "$0")" || exit 1

echo
echo "======================================"
echo "  卸载 AntiGravity 中文汉化"
echo "======================================"
echo

chmod +x mac/uninstall.sh 2>/dev/null

if ./mac/uninstall.sh; then
  :
else
  echo
  echo "❌ 卸载失败，请把上面的错误信息截图反馈。"
fi

echo
read -r -n 1 -s -p "按任意键关闭窗口…"
echo
