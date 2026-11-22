# AntiGravity 2.0 中文汉化

> ## ⚠️ 仅限 macOS
> 本工具**只支持 macOS**（Windows / Linux 不支持）。
>
> 仅针对 **Antigravity 桌面主程序**（`Antigravity.app`，即 Agent / Hub 版）。
> **不适用**于 Antigravity IDE（VS Code 版）——那个请安装官方中文语言包。

社区维护的非官方汉化工具。装好后**用原来的 Antigravity 图标打开就是中文**：全程**不修改 App 文件**、签名完好，不会出现"打不开 / 已损坏"。打开后 App 会自动重启一次并注入中文（约 3~10 秒）。

## 它是怎么做到的

1. **不修改 App 文件**：`app.asar` / `Info.plist` 一律不动，App 保持 Google 原签名，结构上彻底消除"打不开"这类问题。
2. **自愈启动**：一个开机自启的 LaunchAgent 常驻，检测到你用原图标打开 App、但 App 没带调试端口时，会优雅退出并带 `--remote-debugging-port` 重新打开（所以冷启动会看到 App 自动重开一次，属正常现象）。
3. **注入中文**：守护进程通过该本机调试端口把中文词表注入界面，界面变化时持续生效。

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
| 检查服务状态 | `launchctl list \| grep zhpatch` | — |

## 目录结构

```
antigravity-zh/
├── 一键汉化.command          # 双击安装
├── 一键更新.command          # 双击更新到最新版
├── 一键卸载.command          # 双击卸载（停服务，不碰 App）
├── README.md
├── LICENSE
└── mac/
    ├── install.sh            # 环境检查 + 注册 LaunchAgent（老用户自动还原原厂）
    ├── update.sh             # git pull + 重新安装
    ├── uninstall.sh          # 停服务 + 移除自启（老用户自动还原原厂）
    ├── launchagents/
    │   └── com.a1412.antigravity.zhpatch.plist
    ├── patch/
    │   └── patch-asar.js     # 仅用于还原旧版打过的补丁（迁移遗留）
    ├── bin/
    │   └── antigravity-zh-patch.js   # 自愈守护 + 注入脚本 + 中文词表
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
3. 若 Antigravity 正开着且是旧版（打过补丁），安装时会自动退出 → 还原原厂 → 重新打开（仅这一次）
4. 之后**用原来的图标打开就是中文**（每次冷启动会看到 App 自动重开一次，属正常自愈）

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

### 如果是在 Antigravity 里让它自己的 Agent 装（重点）

发完上面那句安装指令后，**一定要再补一句提醒**：

> 注意：安装过程中 Antigravity 会自己退出并重新打开一次，这是正常的，不要中断。

原因：汉化靠守护进程"检测到没带调试端口 → 自动重启 App"来注入，而 Agent 就是 App 的子进程——App 一重启，这条对话会被打断，属正常现象；重开后界面就是中文。**提前说清"会重启"，才不会让对方误以为装坏了。**

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

双击 **`一键卸载.command`**。它会：停止后台服务、移除开机自启。App 文件不受影响（本方案从不修改 App；若你以前用过旧版打过补丁，会自动一并还原成原厂）。

```bash
./mac/uninstall.sh
```

## 排错

| 现象 | 处理 |
|---|---|
| 打开后是英文 | 打开后 App 会自动重开一次（约 3~10 秒）才变中文；若已超过 10 秒仍英文，看下一条 |
| 打开后仍是英文（持续） | 检查 `launchctl list \| grep zhpatch` 是否有输出；再看 `mac/logs/zhpatch.err.log` 有没有"检测到未带调试端口" |
| 提示 Node 版本过低 | 升级到 Node.js 22+ |
| 打开时闪了一下 | 属正常：守护进程把 App 带调试端口重启了一次 |
| 部分文字仍是英文 | 界面更新较快，词表可能未覆盖；欢迎提 Issue |

> 说明：以下内容**保持英文**，不是漏翻——产品/模型/套餐名（Antigravity、Gemini 4 Neon、Google AI Pro/Ultra）、技术名词（Token、MCP、URL）、skill 名称、项目/对话/分支名、下拉框里的官方默认值（Default Light、System default 等），以及**开屏问候语**。

## 安全说明

- 调试端口**只绑定 `127.0.0.1`**，不对外网开放；但本机任意进程理论上都能连它。
- 本工具**不修改 App 本体**（`app.asar` / `Info.plist` 均不动），App 代码签名保持有效，这是与旧版最大的区别。
- 非官方项目，与 Google 无关；请自行评估风险。

## 署名

- 词表与注入思路来自社区项目 [kdczyz/antigravity-chinese](https://github.com/kdczyz/antigravity-chinese)（MIT 协议）
- 本项目以 MIT 协议开源，详见 [LICENSE](./LICENSE)
