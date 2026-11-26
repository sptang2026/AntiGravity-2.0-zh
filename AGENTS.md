# AGENTS.md — 给 AI Agent 的安装指南

本仓库是 **macOS 上 Antigravity 桌面版与 Antigravity IDE 的中文汉化工具**。
用户把本仓库地址发给你时，按下面步骤执行即可完成安装。

> 适用于任何 Agent：Claude Code / Codex / Cursor / Windsurf / Antigravity 自带的 Agent 等。

---

## 0. 先确认平台

```bash
uname -s
```

必须是 `Darwin`。**如果是 Linux / Windows，请直接告知用户本工具只支持 macOS，不要继续。**

---

## 1. 克隆

```bash
# 建议克隆到用户主目录下的固定位置（不要放 /tmp，重启可能被清理）
cd ~
git clone https://github.com/sptang2026/AntiGravity2.0-zh.git
cd AntiGravity2.0-zh
```

> ⚠️ 克隆位置会被写进开机自启服务里。**不要克隆到 `/tmp` 或临时目录**，否则目录被清理后汉化服务会失效。

---

## 2. 安装（非交互，直接执行，不需要 sudo）

```bash
chmod +x mac/install.sh mac/patch/*.sh mac/patch/*.js mac/bin/antigravity-zh-patch.js 2>/dev/null
./mac/install.sh
```

- 脚本会自动处理 shell 差异（用 `bash` 调用也会自动切到 `zsh`）
- 自动查找 Node.js 22+（PATH / `/opt/homebrew/bin` / `/usr/local/bin` / volta / nvm）
- 自动检测 `Antigravity.app` 与 `Antigravity IDE.app`（至少安装其一即可）
- **不要加 `sudo`**

---

## 3. 判断结果

成功标志：

- 输出包含 `✅ 汉化服务已启动`
- 退出码为 `0`

失败处理：把完整输出贴给用户，并说明卡在哪一步。

**安装成功后，必须把下面四条命令明确告诉用户**（复制给用户，不要省略）：

```
（以下命令都在你克隆下来的仓库目录里执行）

查看状态：  node mac/bin/antigravity-zh-patch.js --status
更新汉化：  ./mac/update.sh        （或双击「一键更新.command」）
还原/卸载：  ./mac/uninstall.sh     （或双击「一键卸载.command」）
检查服务：  launchctl list | grep zhpatch   （有输出 = 后台服务在运行）
```

---

## 4. ⚠️ 安装后 App 会自动重启一次（重点，务必告知用户）

本方案**不修改任何 App 文件**，靠后台守护进程"检测到 App 没带调试端口 → 优雅退出 → 带 `--remote-debugging-port=0` 重新打开"来建立事件驱动 CDP 连接并注入中文（macOS 不可能三角下，为同时保住原厂代码签名与不新增图标，默认保留此冷启动自愈重开机制）。

因此安装完成、用户下一次用原图标打开 Antigravity 或 Antigravity IDE 时：

- App 会在 **3~10 秒内自己关闭并重开一次**——这是**正常现象**；
- **不要**重复执行安装脚本，**不要**手动杀进程；
- 重开后界面即为中文，窗口右下角会出现可拖拽的「中 / EN」悬浮球（单击秒切中英文，右键或双击可勾选「选项名保留英文」）。

如果用户是在 **Antigravity 内部**让你安装的，这条尤其重要：你就是 App 的子进程，App 重启时当前对话会被打断，属正常现象。请在**执行安装前**先提醒用户。

---

## 5. 验证（只读，不会重启 App）

```bash
launchctl list | grep zhpatch
node mac/bin/antigravity-zh-patch.js --status
```

---

## 6. 约束（不要做）

- ❌ 不要用 `sudo`
- ❌ 不要修改 `/Applications/Antigravity.app` 或 `/Applications/Antigravity IDE.app` 里的任何文件
- ❌ 不要 `pip install` / `npm install` 任何依赖（零依赖，仅需 Node.js 22+）
- ❌ 不要尝试安装到 Windows / Linux
- ❌ 终端 `agy` CLI 为原生二进制，不支持汉化，无需尝试修改

---

## 7. 词库修改与测试（开发维护时）

**翻译口径硬规范（永久生效，用户截图补词时自动遵守，无需用户重复提醒）**：
- **一律保持英文不翻译**：模型名称（如 Gemini 4 Neon / Carbon / Argon / Hydrogen、Claude Opus / Sonnet、GPT-OSS、Orchestrator 等）、产品/套餐名（Antigravity、Google AI Pro / Ultra、Swarm）、skill 名称、技术缩写（Token、MCP、URL、CLI、JSON、SSH）、开屏问候语、项目名/对话名/分支名、代码块与下拉框官方默认项。
- 仅翻译 UI 功能性文案、按钮、提示与说明，且保持同区域语言一致（不中英混排）。

修改 `src/dict/*.json`、`src/runtime/*.js` 或 `src/daemon/*.mjs` 后，依次执行：

```bash
node tools/lint-dict.mjs
node tools/build.mjs
node tools/build.mjs --check
node --test tests/*.test.mjs
```

---

## 8. 更新与卸载

```bash
./mac/update.sh      # 更新仓库 + 校验构建 + 刷新后台服务
./mac/uninstall.sh   # 停止后台服务 + 移除开机自启（如曾用旧版打过补丁会自动还原）
```
