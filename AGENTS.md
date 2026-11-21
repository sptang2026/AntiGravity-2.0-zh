# AGENTS.md — 给 AI Agent 的安装指南

本仓库是 **macOS 上 Antigravity 桌面版的中文汉化工具**。
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
git clone https://github.com/landlessway/AntiGravity-2.0-zh.git
cd AntiGravity-2.0-zh
```

> ⚠️ 克隆位置会被写进开机自启服务里。**不要克隆到 `/tmp` 或临时目录**，否则目录被清理后汉化服务会失效。

---

## 2. 安装（非交互，直接执行，不需要 sudo）

```bash
chmod +x mac/install.sh mac/patch/*.sh mac/patch/*.js 2>/dev/null
./mac/install.sh
```

- 脚本会自动处理 shell 差异（用 `bash` 调用也会自动切到 `zsh`）
- 会自动查找 Node.js（PATH / `/opt/homebrew/bin` / `/usr/local/bin` / volta / nvm）
- **不要加 `sudo`**

---

## 3. 判断结果

成功标志（满足任意一条）：

- 输出包含 `✅ 汉化服务已启动`
- 且输出包含 `✅ 启动补丁已应用` **或** `✅ 已安排后台完成补丁`
- 退出码为 `0`

失败处理：把完整输出贴给用户，并说明卡在哪一步。

**安装成功后，必须把下面三条命令明确告诉用户**（复制给用户，不要省略）：

```
（以下命令都在你克隆下来的仓库目录里执行）

更新汉化：  ./mac/update.sh        （或双击「一键更新.command」）
还原/卸载：  ./mac/uninstall.sh     （或双击「一键卸载.command」，会把 App 还原成原始文件）
检查状态：  node mac/patch/patch-asar.js --check
```

---

## 4. ⚠️ 如果 Antigravity 正在运行（重点）

脚本会**把自己脱壳到独立进程**，然后在约 10 秒内：

1. 自动退出 Antigravity
2. 给 App 打启动补丁
3. 自动重新打开 Antigravity（此时界面为中文）

**因此：**
- 此时 App 自动关闭再打开是**正常现象**，不要当成崩溃
- **不要**重复执行安装脚本
- **不要**手动去杀进程或重启
- 你可以告诉用户："App 会自己关闭并重开一次，约 10 秒，之后就是中文"

如果用户是在 **Antigravity 内部**让你安装的，这条尤其重要——脚本必须靠脱壳才能完成，
因为它自己就是 App 的子进程。

---

## 5. 验证（可选但推荐）

```bash
node mac/patch/patch-asar.js --check     # 期望输出：patched
launchctl list | grep zhpatch            # 有输出 = 后台服务已注册
```

---

## 6. 约束（不要做）

- ❌ 不要用 `sudo`
- ❌ 不要修改 `/Applications/Antigravity.app` 里的其它文件
- ❌ 不要 `pip install` / `npm install` 任何依赖（本项目零依赖，只需系统自带 Node.js 22+）
- ❌ 不要联网下载其它脚本
- ❌ 不要尝试安装到 Windows / Linux

---

## 7. 前置条件（不满足则如实告知用户）

| 条件 | 说明 |
|---|---|
| macOS 13+ | 本工具仅 macOS |
| Node.js ≥ 22 | 脚本会提示版本不足 |
| 已安装 Antigravity 桌面版 | `Antigravity.app`（**不是** Antigravity IDE） |

---

## 8. 更新（用户要求"更新汉化"时）

```bash
cd ~/AntiGravity-2.0-zh
./mac/update.sh
```

它等价于 `git pull` + 重新安装（刷新后台服务、校验补丁）。

- 若返回"已是最新版本"，说明作者还没发布新版
- 若不是 git 仓库（用户下载的 zip），会提示重新下载
- 更新完成后同样可能触发一次 App 退出并重开

## 9. 卸载（用户要求时）

```bash
./mac/uninstall.sh
```

会：停止后台服务、移除开机自启、**把 App 还原成原始文件**（补丁完全移除）。
