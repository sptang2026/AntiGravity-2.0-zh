# CLAUDE.md

本项目的 Agent 安装与开发维护指南见 [AGENTS.md](./AGENTS.md)，请按其中的步骤执行。

要点速览：

1. 仅支持 macOS（`uname -s` 必须是 `Darwin`），纯 Node.js 22+ 零依赖，支持 `Antigravity.app`（含 Swarm 面板）与 `Antigravity IDE.app`
2. `git clone` 后执行 `./mac/install.sh`，**不需要 sudo**
3. **不修改 App 文件**：靠后台事件驱动 CDP 守护进程注入中文；冷启动时 App 会自动带调试端口重启一次（约 3~10 秒），**属正常现象，不要重复执行，并在安装前提前告知用户**
4. 成功标志：输出含 `✅ 汉化服务已启动` 且退出码为 0；可用 `node mac/bin/antigravity-zh-patch.js --status` 只读查看状态
5. 词库与源码位于 `src/`，修改后运行 `node tools/lint-dict.mjs && node tools/build.mjs && node --test tests/*.test.mjs`
6. **永久翻译口径**：无论用户截图里是否包含，模型名称、产品/套餐名、skill 名、技术缩写（Token/MCP/URL/CLI）、开屏问候语、用户输入与代码块一律自动忽略、保持英文不翻
