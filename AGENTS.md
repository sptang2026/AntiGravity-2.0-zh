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
git clone https://github.com/sptang2026/AntiGravity-2.0-zh.git
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

成功标志：

- 输出包含 `✅ 汉化服务已启动`
- 退出码为 `0`

失败处理：把完整输出贴给用户，并说明卡在哪一步。

**安装成功后，必须把下面三条命令明确告诉用户**（复制给用户，不要省略）：

```
（以下命令都在你克隆下来的仓库目录里执行）

更新汉化：  ./mac/update.sh        （或双击「一键更新.command」）
还原/卸载：  ./mac/uninstall.sh     （或双击「一键卸载.command」）
检查状态：  launchctl list | grep zhpatch   （有输出 = 后台服务在运行）
```

---

## 4. ⚠️ 安装后 App 会自动重启一次（重点，务必告知用户）

本方案**不修改 App 文件**，靠后台守护进程"检测到 App 没带调试端口 → 优雅退出 → 带端口重新打开"来注入中文。

因此安装完成、用户下一次用原图标打开 Antigravity 时：

- App 会在 **3~10 秒内自己关闭并重开一次**——这是**正常现象**，不是崩溃；
- **不要**重复执行安装脚本，**不要**手动去杀进程或重启；
- 重开后界面即为中文。

**你必须在安装完成后明确告诉用户：**"以后每次打开 Antigravity，它会自己重启一次（约 3~10 秒），之后就是中文，这是正常的。"

如果用户是在 **Antigravity 内部**让你安装的，这条尤其重要：你就是 App 的子进程，App 重启时你这条对话会被打断，属正常现象。请在你**执行安装前**就先提醒用户"安装过程中 Antigravity 会自己重启一次，不要担心"。

---

## 5. 验证（可选但推荐）

```bash
launchctl list | grep zhpatch            # 有输出 = 后台服务已注册
```

---

## 6. 约束（不要做）

- ❌ 不要用 `sudo`
- ❌ 不要修改 `/Applications/Antigravity.app` 里的任何文件（本方案从不修改 App，保持其签名完好）
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

它等价于 `git pull` + 重新安装（刷新后台服务）。

- 若返回"已是最新版本"，说明作者还没发布新版
- 若不是 git 仓库（用户下载的 zip），会提示重新下载
- 更新完成后同样可能触发一次 App 退出并重开

## 9. 卸载（用户要求时）

```bash
./mac/uninstall.sh
```

会：停止后台服务、移除开机自启。App 文件不受影响（本方案从不修改 App；若用户以前装过旧版打过补丁，会自动一并还原成原厂）。
