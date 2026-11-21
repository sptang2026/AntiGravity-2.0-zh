# CLAUDE.md

本项目的 Agent 安装指南见 [AGENTS.md](./AGENTS.md)，请按其中的步骤执行。

要点速览：

1. 仅支持 macOS（`uname -s` 必须是 `Darwin`）
2. `git clone` 后执行 `./mac/install.sh`，**不需要 sudo**
3. 若 Antigravity 正在运行，脚本会脱壳到后台，约 10 秒后 App 自动退出、打补丁、自动重开——**属正常现象，不要重复执行**
4. 成功标志：输出含 `✅ 汉化服务已启动` 且退出码为 0
