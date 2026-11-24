# AntiGravity 2.0 中文汉化

> ## ⚠️ 仅限 macOS
> 本工具**只支持 macOS**（Windows / Linux 不支持），纯 Node.js 22+ 零外部依赖。
>
> 同时支持 **Antigravity 桌面版**（含 Swarm 子面板）与 **Antigravity IDE**（智能体侧边栏、独立设置页与 Swarm 子面板）。
> IDE 的 VS Code 顶部菜单栏请配合微软官方简体中文语言包（`MS-CEINTL.vscode-language-pack-zh-hans`）一起使用。

社区维护的非官方中文汉化工具。全程**不修改任何 App 文件**、保持 Google 原生代码签名完好，装好后继续用原图标打开即可，支持**窗口右下角一键无损切换中/英文**与**外部自定义词表**。

## 核心特性

1. **零改包、原签名完好**：不动 `app.asar` / `Info.plist` / `workbench.html`，从结构上杜绝“已损坏 / 打不开”。
2. **双产品 + 子面板覆盖**：
   - `Antigravity.app`：主界面 + Swarm 独立 `plugin://` 子面板；
   - `Antigravity IDE.app`：主窗口 + Jetski Agent 侧边栏 + 独立设置页 + Swarm 面板（互不干扰，装了哪款生效哪款）。
3. **事件驱动 CDP + 指纹热更新**：浏览器级 WebSocket `Target.setDiscoverTargets` 事件驱动注入，新窗口与面板毫秒级响应；词库或自定义名单变更后自动热刷新，无需重启 App。
4. **右下角可拖拽中英切换悬浮球**：
   - 基于 `WeakMap` 记录原文，**单击**实时无损切回英文或中文（不覆写 App 新渲染的内容）；
   - **拖动**可自由调整位置并自动记忆；
   - **右键或双击**打开选项菜单，可勾选「**选项名保留英文**」（中文界面下保留 `Auto / Turbo / Extra High / High / Medium / Low / Request Review` 等英文选项名）。
5. **自定义翻译名单**：仓库根目录放置 `custom-translations.txt`（参考 [custom-translations.example.txt](./custom-translations.example.txt)）即可覆盖译文或强制保留英文词，无需改源码。
6. **模块化词库与原生测试**：词库按功能拆为 `src/dict/*.json`，配套词库体检（查重、空值、权限语义反转检查）、自动构建与 `node --test` 回归测试。

## 常用命令速查

| 想做什么 | 命令 | 或双击 |
|---|---|---|
| 安装汉化 | `./mac/install.sh` | `一键汉化.command` |
| 更新汉化 | `./mac/update.sh` | `一键更新.command` |
| 还原 / 卸载 | `./mac/uninstall.sh` | `一键卸载.command` |
| 查看运行状态（只读） | `node mac/bin/antigravity-zh-patch.js --status` | — |
| 检查服务状态 | `launchctl list \| grep zhpatch` | — |

## 目录结构

```text
AntiGravity-2.0-zh/
├── 一键汉化.command                    # 双击安装
├── 一键更新.command                    # 双击更新
├── 一键卸载.command                    # 双击卸载（停服务，不碰 App）
├── custom-translations.example.txt    # 外部自定义词表示例
├── src/
│   ├── dict/                          # 模块化词库（common / settings / chat-agent / marketplace / ide / swarm）
│   ├── runtime/                       # 前端引擎、动态正则规则、悬浮球 UI、Swarm 子帧引擎
│   └── daemon/                        # 事件驱动 CDP 守护、双 App 探测、安全边界校验、自定义词表加载
├── tools/
│   ├── build.mjs                      # 词库与前端引擎构建脚本（支持 --check）
│   └── lint-dict.mjs                  # 词库体检（查重 / 控制字符 / 权限语义反转）
├── tests/                             # Node 22 原生回归测试套（node --test）
└── mac/
    ├── install.sh / update.sh / uninstall.sh
    ├── launchagents/com.a1412.antigravity.zhpatch.plist
    ├── patch/                         # 仅保留用于旧版用户还原补丁
    └── bin/
        ├── antigravity-zh-patch.js    # LaunchAgent 与命令行统一入口
        └── overlays.generated.mjs     # 由 tools/build.mjs 生成（请勿手改）
```

## 环境要求

| 项目 | 要求 |
|---|---|
| 系统 | macOS 13 或更高 |
| Node.js | **22 或更高**（零第三方依赖） |
| App | 已安装 `Antigravity.app` 或 `Antigravity IDE.app`（至少其一） |

## 安装

1. 下载或克隆本仓库到固定目录（不要放 `/tmp`）：
   ```bash
   git clone https://github.com/sptang2026/AntiGravity-2.0-zh.git
   cd AntiGravity-2.0-zh
   chmod +x mac/install.sh 一键汉化.command 一键更新.command 一键卸载.command
   ./mac/install.sh
   ```
   或直接双击 **`一键汉化.command`**（如提示“来自身份不明的开发者”，右键 → 打开）。
2. 安装后继续用原来的图标打开 App。冷启动时后台服务检测到未带调试端口会自动优雅退出并带 `--remote-debugging-port=0` 重开一次（约 3~10 秒），之后即为中文。

## 自定义翻译名单

复制示例文件并收紧写权限（安全校验要求属主为当前用户且不可被其他用户写入）：

```bash
cp custom-translations.example.txt custom-translations.txt
chmod 600 custom-translations.txt
```

格式示例：

```text
# 只写英文：强制保留英文原文
Request Review

# 英文 = 译文：覆盖内置翻译
Turbo = 极速模式
```

保存后守护进程会在数秒内通过指纹变更自动热更新，无需重启 App。

## 词库维护与自动化测试

```bash
node tools/lint-dict.mjs          # 词库体检（重复项、空译文、权限极性反转检测）
node tools/build.mjs              # 编译生成 mac/bin/overlays.generated.mjs
node tools/build.mjs --check      # 校验产物与 src/ 源码同步
node --test tests/*.test.mjs      # 运行全套回归测试
```

## 排错

| 现象 | 处理 |
|---|---|
| 打开后短暂关闭并重开一次 | 正常自愈行为：守护进程为无参启动的 App 补上 `--remote-debugging-port=0` 并注入中文 |
| 超过 10 秒仍为英文 | 执行 `node mac/bin/antigravity-zh-patch.js --status` 查看进程与 CDP 端口，再查 `mac/logs/zhpatch.err.log` |
| IDE 顶部菜单仍是英文 | 在 IDE 扩展商店安装微软官方 `MS-CEINTL.vscode-language-pack-zh-hans` 并在命令面板切换显示语言 |
| 自定义词表未生效 | 检查是否已 `chmod 600 custom-translations.txt`，并查看 `mac/logs/zhpatch.err.log` 安全提示 |
| 终端 `agy` CLI 仍是英文 | `agy` 为原生 Mach-O 终端二进制，本工具仅覆盖桌面版与 IDE 图形界面 |

> 说明：开屏问候语、产品/模型/套餐名（Antigravity、Gemini 4 Neon、Google AI Pro/Ultra）、技术缩写（Token、MCP、URL、CLI）、skill 名称、项目/对话/分支名、代码块与下拉框官方默认值按设计保持英文。

## 安全说明

- 调试端口仅绑定 `127.0.0.1` 动态端口（`--remote-debugging-port=0`），不暴露外网。
- 守护进程对端口进程归属、CDP WebSocket 地址、页面 Origin 白名单、Swarm `plugin://` 协议及 IDE Agent 子进程派生链均做显式校验。
- 全程不修改 App 本体，代码签名保持完整；非官方项目，与 Google 无关。

## 署名与许可

- 早期桌面版词库基线来自社区项目 [kdczyz/antigravity-chinese](https://github.com/kdczyz/antigravity-chinese)（MIT 协议）
- 本项目采用 MIT 协议开源，详见 [LICENSE](./LICENSE)
