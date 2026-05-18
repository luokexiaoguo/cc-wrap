# cc-wrap — Claude Code 中文桌面端

面向中文开发者的轻量级 Electron 桌面应用，完整移植 Claude Code CLI 核心能力，图形界面开箱即用，现已完美支持 Windows 和 macOS 双平台。

![界面截图](./screenshots/interface.jpg)

## 功能一览（所见即所得）

- 🌐 中文界面 + 斜杠命令 `/help` `/clear` `/config` `/model` 等带中文注释
- 📁 文件读写 / 编辑 / Bash 命令 / Web 搜索 / 任务管理，原生权限弹窗
- 🔧 模型下拉切换，支持 OpenAI / Anthropic 双格式，灵活接入任意第三方模型（如 deepseek-v4-flash）
- 🔌 MCP 服务器管理，一键连接外部工具扩展
- 💾 记忆系统 + Skills 模板，跨会话持久化
- 📡 流式输出，实时看到 Agent 执行过程
- 🖥️ 自定义标题栏 + 托盘常驻 + 无头模式

## 技术栈

Electron 28 + Node.js，contextBridge 安全隔离，electron-builder 打包 Windows / macOS 安装包。

---

> ⭐ 如果对你有帮助，欢迎 Star 支持！
> 第一个版本难免有坑，欢迎提 Issue 和 PR，一起让 cc-wrap 更好用。