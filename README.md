# AntiGravity 2.0 中文汉化

> ## ⚠️ 仅限 macOS
> 本工具**只支持 macOS**（Windows / Linux 不支持）。
>
> 仅针对 **Antigravity 桌面主程序**（`Antigravity.app`，即 Agent / Hub 版）。
> **不适用**于 Antigravity IDE（VS Code 版）——那个请安装官方中文语言包。

社区维护的非官方汉化工具。装好后**用原来的 Antigravity 图标打开就是中文**：不闪退、不需要重启、不需要额外的启动器。

## 它是怎么做到的

1. **打一个极小补丁**：在 App 的 `app.asar` 里注入一行，让 Antigravity 启动时自己打开一个**仅本机**（`127.0.0.1`）的调试端口；同时同步更新 `Info.plist` 里的 asar 完整性哈希（否则 Electron 会拒绝启动）。
2. **后台服务注入中文**：一个开机自启的 LaunchAgent 常驻，通过该调试端口把中文词表注入界面；界面变化时持续生效。
3. **更新自愈**：App 自动更新会覆盖补丁，后台服务会检测到并**自动重打**。

## 安装完成后你会看到

- 终端会打印一份**常用命令清单**（更新 / 还原 / 检查）；
- 系统会弹一条通知：**「AntiGravity 中文汉化 · 安装完成」**；
- 之后用**原来的 Antigravity 图标**打开就是中文。

## 常用命令速查

| 想做什么 | 命令 | 或双击 |
|---|---|---|
| 安装汉化 | `./mac/install.sh` | `一键汉化.command` |
| 更新汉化 | `./mac/update.sh` | `一键更新.command` |
| 还原 / 卸载 | `./mac/uninstall.sh` | `一键卸载.command` |
| 检查补丁状态 | `node mac/patch/patch-asar.js --check` | — |

## 目录结构

```
antigravity-zh/
├── 一键汉化.command          # 双击安装
├── 一键更新.command          # 双击更新到最新版
├── 一键卸载.command          # 双击卸载（会还原 App）
├── README.md
├── LICENSE
└── mac/
    ├── install.sh            # 环境检查 + 注册 LaunchAgent + 打补丁
    ├── update.sh             # git pull + 重新安装
    ├── uninstall.sh          # 停服务 + 还原 App
    ├── launchagents/
    │   └── com.a1412.antigravity.zhpatch.plist
    ├── patch/
    │   └── patch-asar.js     # 打/查/还原启动补丁（含完整性哈希处理）
    ├── bin/
    │   └── antigravity-zh-patch.js   # 注入脚本 + 中文词表
    └── logs/
```

## 环境要求

| 项目 | 要求 |
|---|---|
| 系统 | macOS 13 或更高 |
| Node.js | **22 或更高** |
| App | 已安装 Antigravity 桌面版（不是 Antigravity IDE） |

## 安装

1. 下载或克隆本仓库
2. 双击 **`一键汉化.command`**
   - 若提示「无法打开，因为来自身份不明的开发者」：**右键 → 打开**
   - 若提示没有执行权限：终端执行 `chmod +x 一键汉化.command`
3. 安装过程中若 Antigravity 正开着，会**自动退出并重新打开一次**（仅这一次）
4. 之后**用原来的图标打开就是中文**

命令行方式：

```bash
chmod +x mac/install.sh
./mac/install.sh
```

## 一行命令安装（可选）

```bash
git clone https://github.com/sptang2026/AntiGravity-2.0-zh.git \
  && cd AntiGravity-2.0-zh \
  && chmod +x mac/install.sh 一键汉化.command 一键卸载.command \
  && ./mac/install.sh
```

## 让 AI Agent 帮你装

把仓库地址和这句话发给你在用的 Agent：

> 帮我安装 https://github.com/sptang2026/AntiGravity-2.0-zh 这个 macOS 汉化工具：
> 把仓库 clone 下来，执行 `mac/install.sh`，完成后把结果告诉我。

> ⚠️ **clone / 下载本身不会执行任何东西**。必须显式运行安装脚本才会生效——这是安全设计，不是缺陷。

> 💡 **在 Antigravity 里面安装也没问题**：脚本会先把自己"脱壳"到独立进程，再由它退出 App → 打补丁 → 自动重新打开。你会看到 App 自己关掉又重开一次（约 10 秒），属正常现象。

## 更新（作者发布新版后）

```bash
cd /你克隆的目录/AntiGravity-2.0-zh   # 换成你自己的路径
./mac/update.sh
```

或双击 **`一键更新.command`**。

也可以对 Agent 说：

> 帮我更新本地的 AntiGravity-2.0-zh 仓库，然后重新安装汉化。

> 注意：更新需要**git 克隆**的副本。如果是下载 zip 安装的，请重新下载最新版覆盖后重跑 `mac/install.sh`。

## 卸载

双击 **`一键卸载.command`**。它会：停止后台服务、移除开机自启、**把 App 还原成原始文件**（补丁完全移除）。

```bash
./mac/uninstall.sh
```

## 排错

| 现象 | 处理 |
|---|---|
| 打开后是英文 | 多半是 App 刚自动更新、补丁被覆盖。**退出 Antigravity，等 10~20 秒**（服务会自动重打补丁），再打开即可 |
| 打开后仍是英文（持续） | 检查 `node mac/patch/patch-asar.js --check` 是否输出 `patched`；再看 `mac/logs/zhpatch.err.log` |
| 提示 Node 版本过低 | 升级到 Node.js 22+ |
| App 打不开 / 提示已损坏 | 运行 `./mac/uninstall.sh` 还原，或 `node mac/patch/patch-asar.js --restore` |
| 部分文字仍是英文 | 界面更新较快，词表可能未覆盖；欢迎提 Issue |

> 说明：以下内容**保持英文**，不是漏翻——产品/模型/套餐名（Antigravity、Gemini 4 Neon、Google AI Pro/Ultra）、技术名词（Token、MCP、URL）、skill 名称、项目/对话/分支名、下拉框里的官方默认值（Default Light、System default 等），以及**开屏问候语**。

## 安全说明

- 调试端口**只绑定 `127.0.0.1`**，不对外网开放；但本机任意进程理论上都能连它。
- 本工具会**修改 App 本体**（`app.asar` + `Info.plist`），这会使 App 的代码签名失效。这是"原图标打开即中文、零闪退"的唯一办法。所有原始文件在安装时已备份到 `~/Library/Application Support/AntigravityZh/backup/`，可一键还原。
- 非官方项目，与 Google 无关；请自行评估风险。

## 署名

- 词表与注入思路来自社区项目 [kdczyz/antigravity-chinese](https://github.com/kdczyz/antigravity-chinese)（MIT 协议）
- 本项目以 MIT 协议开源，详见 [LICENSE](./LICENSE)
