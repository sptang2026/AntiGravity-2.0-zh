# AntiGravity 2.0 汉化

> ## ⚠️ 仅限 macOS
> 本工具**只支持 macOS**（Windows / Linux 不支持），纯 Node.js 22+ 零外部依赖。
>
> 同时覆盖 **Antigravity 桌面版**（含 Swarm 子面板）与 **Antigravity IDE**（智能体侧边栏、独立设置页与 Swarm 面板）。
> IDE 顶部 VS Code 菜单栏配合微软官方简体中文语言包（`MS-CEINTL.vscode-language-pack-zh-hans`）即可实现全界面汉化。

社区维护的非官方中文汉化工具。全程**零改包、不触碰任何 App 本体文件**、保持 Google 原生代码签名完好；继续使用原图标打开，自带 **Apple 液态玻璃中英一键切换胶囊**与**事件驱动热更新**。

---

## 核心特色

1. **零改包、原签名完好**：全程不修改 `app.asar` / `Info.plist` / `workbench.html`，保持原厂代码签名，从结构上消除「已损坏 / 打不开」风险。
2. **Apple 风格液态水滴玻璃中英一键切换胶囊（`[ 中 | EN ]`）**：
   - 窗口右下角常驻可拖拽的高透水滴液态玻璃双段滑块（Chromium 原生 SVG 边缘透镜折射 + 细腻银灰玻璃描边，浅/深色主题自动适配）；
   - **单击**通过 `WeakMap` 毫秒级无损切回原版英文或中文，绝不覆写 App 后续动态更新的文本，并同步联动 Swarm 子面板；
   - **右键或双击**弹出 macOS 风格液态玻璃菜单 + iOS 原生滑动开关，可一键开启「**选项名保留英文**」（中文界面下保留 `Auto / Turbo / Extra High / XHigh / High / Medium / Low / Request Review` 等选项名）。
3. **事件驱动 CDP + 免重启热更新 + 四层安全边界**：
   - 基于浏览器级 WebSocket `Target.setDiscoverTargets` 事件驱动注入，新窗口与面板毫秒级生效；
   - 词库更新或修改 `custom-translations.txt` 后，守护进程通过 SHA256 内容指纹自动卸载旧版并热刷新，无需重启 App；
   - 严格校验端口进程归属、回环 WebSocket 地址、页面 Origin 白名单、Swarm `plugin://` 协议与 IDE Agent 父进程派生链。
4. **全场景深度覆盖（主词库 2,960 条 + Swarm 61 条 + 动态规则）**：
   - **主工作台与侧边栏**：新建对话、自动化（完整消除 React 多文本节点拆段中英混排）、自定义、项目、历史记录、打开 IDE、终端与控制栏；
   - **模型选择器**：全部模型悬停提示、编排器分流说明、下线倒计时日期、`即将下线` / `提醒` / `新` 徽章与推理档位；
   - **用量与额度面板**：5 小时 / 每周额度进度、重置倒计时（如 `6d 23h 后重置`，保留 `d / h / m` 与阿拉伯数字）与额度不足提醒；
   - **运行位置与远程菜单**：本机 / 远程切换、本地运行 / 云端环境说明、本地克隆与 SSH 主机连接；
   - **全部设置与审批**：常规、外观、账户、权限预设、沙盒规则、终端自动执行、浏览器 JS 策略、通知、快捷键、权限审批弹窗与插件/技能市场；
   - **子面板与双产品**：桌面版 **Swarm** 独立 `plugin://` 子面板；**Antigravity IDE** 主窗口、Jetski Agent 侧边栏、独立设置页与 Swarm 面板。
5. **克制统一的翻译口径（同区域绝不中英混排）**：
   - 专有名词与标识符一律保留英文：模型名（Gemini 4 Neon / Carbon / Argon / Hydrogen、Claude Opus / Sonnet、GPT-OSS、Orchestrator）、产品/套餐名（Antigravity、Google AI Pro / Ultra、Swarm）、skill 名称、技术缩写（Token / MCP / URL / CLI / JSON / SSH）、紧凑时间单位（`d / h / m`）、开屏问候语、项目/对话/分支名、代码块与下拉框官方默认项。
6. **外部自定义词表 + 模块化工程测试**：
   - 根目录放置 `custom-translations.txt` 即可覆盖译文或强制保留指定英文词，无需改源码；
   - 词库按模块拆分为 `src/dict/*.json`，内置词库体检（查重、控制字符与 `Allow / Deny` 权限极性反转拦截）及 12 项 Node 22 原生回归测试。

---

## ⚠️ 冷启动“闪退重开”为什么正常？（macOS 不可能三角）

安装后，**每次冷启动点原图标打开 Antigravity / Antigravity IDE 时，App 会在 3~10 秒内自动关闭并重新打开一次**——这是**完全正常的自愈行为**，请勿手动杀进程或重复运行安装脚本。

背后是 macOS 桌面应用无侵入汉化的 **「不可能三角」**（三项最多同时满足两项）：

| 目标 | 含义 | 本工具默认选择 |
|---|---|---|
| ① **零改包保签名** | 不改动 App 内部文件，永远不会出现「已损坏 / 打不开」 | ✅ 坚持 |
| ② **继续点原图标** | 保留原有 Dock / 应用程序图标，不多建一个“中文版”图标 | ✅ 坚持 |
| ③ **冷启动零闪退重开** | 第一次点开进程就自带调试端口，完全不重开 | ⏭️ 为保 ①② 主动让渡 |

- **原因**：原图标启动时 macOS 不会附带 `--remote-debugging-port` 参数；要做到不改 App 文件（保签名），守护进程只能在检测到无参启动后优雅退出它、再带 `--remote-debugging-port=0` 重新拉起并注入中文。
- **附带好处**：Antigravity 官方自动更新覆盖 App 后，这套自愈机制会自动恢复中文，无需重新打补丁。
- **关于“不闪退”的取舍**：在不改 App 的前提下，若要实现冷启动零重开，唯一方式是放弃 ②、额外新建一个独立的「Antigravity 中文版」包装启动图标（直接带参数拉起原 App，数据与项目记忆完全共用）。本项目当前默认优先保持桌面干净（不增加多余图标）。

---

## 常用命令速查

| 想做什么 | 命令 | 或双击 |
|---|---|---|
| 安装汉化 | `./mac/install.sh` | `一键汉化.command` |
| 更新汉化 | `./mac/update.sh` | `一键更新.command` |
| 还原 / 卸载 | `./mac/uninstall.sh` | `一键卸载.command` |
| 查看运行状态（只读） | `node mac/bin/antigravity-zh-patch.js --status` | — |
| 检查后台服务 | `launchctl list \| grep zhpatch` | — |

---

## 环境要求与安装

- **系统**：macOS 13 或更高
- **运行环境**：Node.js **22 或更高**（零第三方依赖，无需 `npm install`）
- **应用**：已安装 `Antigravity.app` 或 `Antigravity IDE.app`（至少其一）

### 方式一：命令行一键安装

```bash
cd ~
git clone https://github.com/sptang2026/AntiGravity2.0-zh.git
cd AntiGravity2.0-zh
chmod +x mac/install.sh 一键汉化.command 一键更新.command 一键卸载.command
./mac/install.sh
```

> ⚠️ 请克隆到用户主目录下的固定位置（不要放在 `/tmp`），开机自启服务会直接引用该目录。

### 方式二：双击安装

下载或克隆仓库后双击 **`一键汉化.command`**（如系统提示「来自身份不明的开发者」，右键 → 打开）。

### 方式三：让 AI Agent 帮你安装

把仓库地址发给任意 Agent（Claude Code / Codex / Cursor / Antigravity 内置 Agent 等）：

> 帮我安装 https://github.com/sptang2026/AntiGravity2.0-zh ，按仓库里的 `AGENTS.md` 执行即可。注意安装后 App 会自动带调试端口重启一次，属正常现象。

---

## 自定义翻译名单

复制示例文件并收紧写权限（安全校验要求属主为当前用户且不可被其他用户写入）：

```bash
cp custom-translations.example.txt custom-translations.txt
chmod 600 custom-translations.txt
```

```text
# 只写英文：强制保留英文原文
Request Review

# 英文 = 译文：覆盖内置译文
Turbo = 极速模式
```

保存后数秒内通过内容指纹自动热更新生效，免重启 App。

---

## 目录结构与开发测试

```text
AntiGravity2.0-zh/
├── 一键汉化.command / 一键更新.command / 一键卸载.command
├── custom-translations.example.txt
├── src/
│   ├── dict/        # 模块化词库（common / settings / chat-agent / marketplace / ide / swarm）
│   ├── runtime/     # 前端引擎、动态规则、React 拆段协调、液态玻璃切换胶囊、Swarm 子帧引擎
│   └── daemon/      # 事件驱动 CDP 守护、双 App 探测、安全边界校验、自定义词表加载
├── tools/           # build.mjs（构建与 --check 同步校验）、lint-dict.mjs（词库体检）
├── tests/           # Node 22 原生回归测试（node --test）
└── mac/             # install.sh / update.sh / uninstall.sh / LaunchAgent / 生成产物
```

```bash
node tools/lint-dict.mjs          # 词库体检（重复项、空译文、权限极性反转拦截）
node tools/build.mjs              # 编译生成 mac/bin/overlays.generated.mjs
node tools/build.mjs --check      # 校验产物与 src/ 源码完全同步
node --test tests/*.test.mjs      # 运行全套 12 项回归测试
```

---

## 排错

| 现象 | 说明与处理 |
|---|---|
| 打开后 3~10 秒自动关掉又重开 | **正常现象**（见上方「不可能三角」说明）：自愈守护进程带 `--remote-debugging-port=0` 重拉 App 注入中文 |
| 超过 10 秒仍为英文 | 运行 `node mac/bin/antigravity-zh-patch.js --status` 查看进程与 CDP 端口，再查 `mac/logs/zhpatch.err.log` |
| IDE 顶部菜单仍是英文 | 在 IDE 扩展商店安装微软官方 `MS-CEINTL.vscode-language-pack-zh-hans`，并在命令面板运行 `Configure Display Language` 切换中文 |
| 自定义词表未生效 | 确认已执行 `chmod 600 custom-translations.txt`，并查看 `mac/logs/zhpatch.err.log` |
| 终端 `agy` CLI 仍是英文 | `agy` 为原生 Mach-O 终端二进制，本工具仅覆盖桌面版与 IDE 图形界面 |

## 安全与许可

- 调试端口仅绑定本机回环 `127.0.0.1` 动态空闲端口（`--remote-debugging-port=0`），不对外网开放。
- 早期桌面版词库基线参考社区项目 [kdczyz/antigravity-chinese](https://github.com/kdczyz/antigravity-chinese)（MIT 协议）。
- 本项目采用 MIT 协议开源，详见 [LICENSE](./LICENSE)；非官方项目，与 Google 无关。
