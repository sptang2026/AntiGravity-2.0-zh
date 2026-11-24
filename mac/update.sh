#!/bin/zsh
# 更新 AntiGravity 2.0 中文汉化：git pull + 产物校验 + 重新安装
# 用法：./mac/update.sh   （或双击「一键更新.command」）
if [ -z "${ZSH_VERSION:-}" ]; then exec /bin/zsh "$0" "$@"; fi
set -euo pipefail

ROOT="${0:A:h}"
REPO_ROOT="${ROOT:h}"
cd "$REPO_ROOT" || exit 1

say() { printf '%s\n' "$*"; }

say "== 更新 AntiGravity 2.0 中文汉化 =="

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  say "❌ 当前目录不是 git 仓库（可能是下载的 zip 包），无法自动更新。"
  say "   请重新下载最新版后重新安装："
  say "   https://github.com/sptang2026/AntiGravity-2.0-zh"
  exit 1
fi

command -v git >/dev/null 2>&1 || { say "❌ 未找到 git，无法更新"; exit 1; }

say "→ 拉取最新代码…"
if ! git fetch --all --tags --prune; then
  say "❌ git fetch 失败（网络问题？），未做任何更改。"
  exit 1
fi

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse '@{u}' 2>/dev/null || echo "$LOCAL")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  say "✅ 已是最新版本（$(cat VERSION 2>/dev/null || echo '?')）"
else
  if ! git pull --ff-only; then
    say "❌ 更新失败：本地有改动或存在冲突，请手动处理后重试。"
    exit 1
  fi
  say "✅ 代码已更新到 $(cat VERSION 2>/dev/null || echo '最新版本')"
fi

if [[ -f "$REPO_ROOT/tools/build.mjs" ]] && command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/tools/build.mjs" --check >/dev/null 2>&1 || node "$REPO_ROOT/tools/build.mjs"
fi

say "→ 重新安装（刷新后台服务）…"
"$ROOT/install.sh"

say ""
say "✅ 更新完成。新词库将通过指纹检测自动热更新生效。"
