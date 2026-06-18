# cc-wrap Computer Use 集成开发文档

## 1. 概述

### 1.1 什么是 Computer Use

Computer Use 是让 AI Agent 直接操控计算机图形界面的能力。AI 通过截屏感知屏幕内容，通过鼠标键盘模拟执行操作，覆盖那些没有命令行接口的场景（浏览器、Office、设计工具等）。

### 1.2 目标

在 cc-wrap 现有 Agent 循环中新增 5 个 Computer Use 工具，使 AI 能够：

- 截取屏幕/窗口截图
- 移动鼠标并点击
- 输入文字和快捷键
- 滚动页面
- 拖拽元素

### 1.3 设计原则

- **安全优先**：所有 Computer Use 操作必须经过用户确认，默认不可"始终允许"
- **模型兼容**：视觉能力检测复用现有 `modelSupportsVision()`，非视觉模型自动降级为文本描述
- **平台适配**：Windows 优先（`robotjs` + `screenshot-desktop`），macOS 后续跟进
- **最小侵入**：新增独立模块，不修改现有工具执行流程，只在 `tools.js` 和 `tool-executor.js` 中注册

---

## 2. 架构设计

### 2.1 模块划分

```
src/main/
├── computer-use/           # 新增目录
│   ├── screenshot.js       # 截屏模块
│   ├── mouse.js            # 鼠标控制模块
│   ├── keyboard.js         # 键盘控制模块
│   ├── display.js          # 显示器信息模块
│   └── index.js            # 统一导出 + 工具注册
├── tools.js                # 修改：新增 5 个工具定义
├── tool-executor.js        # 修改：新增 5 个工具处理器
├── agent-loop.js           # 修改：PERMISSION_REQUIRED_TOOLS 加入 Computer Use 工具
└── preload.js              # 修改：新增 IPC 通道
```

### 2.2 数据流

```
用户发出指令（如"帮我把这个 Word 转成 PDF"）
    ↓
Agent Loop 调用 API，模型返回 tool_use: ComputerScreenshot
    ↓
tool-executor.js 调用 computer-use/screenshot.js 截屏
    ↓
截图以 base64 图片返回给模型（视觉模型）或 OCR 文本描述（非视觉模型）
    ↓
模型分析截图，返回 tool_use: ComputerClick { x: 320, y: 150 }
    ↓
tool-executor.js 调用 computer-use/mouse.js 执行点击
    ↓
循环继续，直到任务完成
```

### 2.3 与现有系统的集成点

| 集成点 | 文件 | 修改内容 |
|--------|------|---------|
| 工具定义 | `tools.js` | `TOOL_DEFINITIONS` 数组新增 5 项 |
| 工具执行 | `tool-executor.js` | `TOOL_HANDLERS` Map 新增 5 个处理函数 |
| 权限控制 | `agent-loop.js` | `PERMISSION_REQUIRED_TOOLS` 新增 Computer Use 工具名 |
| IPC 通道 | `preload.js` | `INVOKE_CHANNELS` 新增 `computer-use-preview` |
| 视觉检测 | `api-client.js` | 复用 `modelSupportsVision()`，无需修改 |
| 系统提示 | `system-prompt.js` | 追加 Computer Use 使用指引段落 |

---

## 3. 工具定义

### 3.1 ComputerScreenshot — 截屏

| 字段 | 值 |
|------|---|
| 名称 | `ComputerScreenshot` |
| 描述 | 截取屏幕或指定窗口的截图。返回 base64 编码的 PNG 图片（视觉模型）或 OCR 文本（非视觉模型） |
| 需要权限 | 是 |

**输入参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| display_index | number | 否 | 显示器编号，默认 0（主显示器） |
| region | object | 否 | 截取区域 `{ x, y, width, height }`，省略则全屏 |
| quality | number | 否 | JPEG 质量 1-100，默认 75（控制 base64 大小） |

**输出：**

- 视觉模型：`{ type: "image", data: "base64...", width: 1920, height: 1080 }`
- 非视觉模型：`{ type: "text", content: "OCR 识别结果文本..." }`

### 3.2 ComputerClick — 鼠标点击

| 字段 | 值 |
|------|---|
| 名称 | `ComputerClick` |
| 描述 | 在指定坐标执行鼠标点击操作 |
| 需要权限 | 是 |

**输入参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| x | number | 是 | 点击的 X 坐标（像素，左上角为 0） |
| y | number | 是 | 点击的 Y 坐标（像素，左上角为 0） |
| button | string | 否 | 鼠标按钮：`left`（默认）/ `right` / `middle` |
| click_count | number | 否 | 点击次数：1（默认，单击）/ 2（双击） |

**输出：** `{ success: true, position: { x, y } }`

### 3.3 ComputerType — 键盘输入

| 字段 | 值 |
|------|---|
| 名称 | `ComputerType` |
| 描述 | 输入文字或执行快捷键组合 |
| 需要权限 | 是 |

**输入参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| text | string | 否 | 要输入的文本内容（与 keys 二选一） |
| keys | string | 否 | 快捷键组合，如 `"ctrl+c"` / `"ctrl+shift+s"` / `"alt+f4"`（与 text 二选一） |
| press_enter | boolean | 否 | 输入文本后是否按回车，默认 false |

**输出：** `{ success: true, input: "typed text" }` 或 `{ success: true, keys: "ctrl+c" }`

### 3.4 ComputerScroll — 滚动

| 字段 | 值 |
|------|---|
| 名称 | `ComputerScroll` |
| 描述 | 在指定位置滚动鼠标滚轮 |
| 需要权限 | 是 |

**输入参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| x | number | 是 | 滚动位置的 X 坐标 |
| y | number | 是 | 滚动位置的 Y 坐标 |
| direction | string | 是 | 滚动方向：`up` / `down` |
| amount | number | 否 | 滚动量（行数），默认 3 |

**输出：** `{ success: true, position: { x, y }, direction, amount }`

### 3.5 ComputerDrag — 拖拽

| 字段 | 值 |
|------|---|
| 名称 | `ComputerDrag` |
| 描述 | 从一个坐标拖拽到另一个坐标 |
| 需要权限 | 是 |

**输入参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| from_x | number | 是 | 起始 X 坐标 |
| from_y | number | 是 | 起始 Y 坐标 |
| to_x | number | 是 | 目标 X 坐标 |
| to_y | number | 是 | 目标 Y 坐标 |
| button | string | 否 | 鼠标按钮：`left`（默认）/ `right` |

**输出：** `{ success: true, from: { x, y }, to: { x, y } }`

---

## 4. 技术选型

### 4.1 截屏方案

| 方案 | 包名 | 优点 | 缺点 |
|------|------|------|------|
| **screenshot-desktop**（推荐） | `screenshot-desktop` | 纯 JS，无需编译原生模块，支持多显示器 | 无法截取指定窗口 |
| electron 自带 | `desktopCapturer` | Electron 内置，无需额外依赖 | 需要通过渲染进程调用，架构复杂 |
| sharp + screenshot-desktop | `sharp` + `screenshot-desktop` | 可裁剪、压缩、格式转换 | sharp 原生模块需编译 |

**推荐方案**：`screenshot-desktop` + `sharp`（裁剪 region + 压缩为 JPEG 控制 base64 大小）

### 4.2 鼠标键盘控制方案

| 方案 | 包名 | 优点 | 缺点 |
|------|------|------|------|
| **robotjs**（推荐） | `robotjs` | 功能完整（鼠标移动/点击/拖拽/键盘/快捷键），API 简单 | C++ 原生模块，需 `electron-rebuild` |
| nut.js | `@nut-tree/nut-js` | 功能更丰富，支持窗口管理 | 依赖 OpenCV，体积大，编译复杂 |
| autoit（Windows only） | 通过 `child_process` 调用 | 无需原生模块 | 仅 Windows，需安装 AutoIt |

**推荐方案**：`robotjs`，与现有 `node-pty` 一样需要 `electron-rebuild`，流程一致

### 4.3 OCR 方案（非视觉模型降级）

| 方案 | 包名 | 优点 | 缺点 |
|------|------|------|------|
| **Tesseract.js**（推荐） | `tesseract.js` | 纯 JS，无需安装，支持中英文 | 速度较慢（~2-5s/张） |
| 调用系统 OCR | Windows OCR API | 速度快 | 仅 Windows 10+，需要 native addon |
| 跳过 OCR | — | 简单 | 非视觉模型完全无法使用 Computer Use |

**推荐方案**：`tesseract.js`，作为非视觉模型的降级方案。视觉模型直接传图片，不经过 OCR

### 4.4 依赖清单

```
新增 npm 依赖：
- screenshot-desktop   # 截屏
- sharp                # 图片裁剪/压缩
- robotjs              # 鼠标键盘控制
- tesseract.js         # OCR（非视觉模型降级）

需重新执行：
- npm run rebuild      # 重新编译 robotjs 原生模块
```

---

## 5. 模块详细设计

### 5.1 screenshot.js — 截屏模块

**职责**：截取屏幕截图，支持全屏/区域截取，返回 base64 图片或 OCR 文本

**核心函数：**

```
captureScreen(options) → { image: string(base64), width, height }
```

**处理流程：**

1. 调用 `screenshot-desktop` 截取指定显示器
2. 如果指定了 `region`，用 `sharp` 裁剪区域
3. 用 `sharp` 转为 JPEG 并压缩到指定 `quality`
4. 转为 base64 字符串返回
5. 如果当前模型不支持视觉，调用 `tesseract.js` 进行 OCR，返回文本

**关键注意点：**

- 截图 base64 可能很大（1920x1080 PNG 约 2-3MB），必须压缩为 JPEG quality=75 降到 ~200KB
- `screenshot-desktop` 返回的是 PNG Buffer，需要用 `sharp` 转 JPEG
- 多显示器环境需支持 `display_index` 参数
- OCR 是异步操作，需要缓存结果避免重复识别

### 5.2 mouse.js — 鼠标控制模块

**职责**：鼠标移动、点击、拖拽、滚轮

**核心函数：**

```
moveMouse(x, y) → void
click(x, y, button, clickCount) → void
scroll(x, y, direction, amount) → void
drag(fromX, fromY, toX, toY, button) → void
getMousePosition() → { x, y }
```

**处理流程（以 click 为例）：**

1. 验证坐标在屏幕范围内（`0 <= x < screenWidth`, `0 <= y < screenHeight`）
2. 调用 `robotjs.moveMouse(x, y)`
3. 等待 50ms（让 UI 响应鼠标移动）
4. 调用 `robotjs.mouseClick(button, clickCount)`

**关键注意点：**

- `robotjs` 的坐标系统是屏幕左上角为原点，Y 轴向下，与 CSS/浏览器一致
- 拖拽操作需要：`moveMouse(from)` → `mouseToggle("down")` → `moveMouse(to)` → `mouseToggle("up")`，中间加 100ms 延迟
- 滚轮用 `robotjs.scrollMouse(amount, direction)` 实现
- DPI 缩放：Windows 125%/150% 缩放下坐标需要换算，`robotjs` 返回的是物理像素，截图也是物理像素，两者一致，但模型输出的坐标可能是逻辑像素，需要乘以 DPI 缩放比

### 5.3 keyboard.js — 键盘控制模块

**职责**：文字输入、快捷键组合

**核心函数：**

```
typeText(text) → void
pressKeys(keyCombination) → void
```

**处理流程（以 typeText 为例）：**

1. 调用 `robotjs.typeString(text)` 逐字符输入
2. 如果 `press_enter` 为 true，调用 `robotjs.keyTap("enter")`

**处理流程（以 pressKeys 为例）：**

1. 解析快捷键字符串 `"ctrl+shift+s"` → `["control", "shift", "s"]`
2. 调用 `robotjs.keyTap("s", ["control", "shift"])`

**关键注意点：**

- `robotjs` 的修饰键名称映射：`ctrl` → `control`，`alt` → `alt`，`shift` → `shift`，`cmd/win` → `command`
- 中文输入法下 `typeString` 可能无法正确输入中文，需要考虑切换到英文输入法或使用剪贴板粘贴方案
- 剪贴板粘贴方案：`clipboard.writeText(text)` → `robotjs.keyTap("v", ["control"])`，可绕过输入法问题

### 5.4 display.js — 显示器信息模块

**职责**：获取显示器分辨率、DPI 缩放比、多显示器布局

**核心函数：**

```
getDisplayInfo() → [{ index, width, height, scaleFactor, bounds }]
```

**实现方式：**

- 使用 Electron 的 `screen.getPrimaryDisplay()` / `screen.getAllDisplays()` API
- 无需额外 npm 依赖

**关键注意点：**

- `scaleFactor` 用于坐标换算：物理像素 = 逻辑像素 × scaleFactor
- 多显示器时，副显示器的坐标可能是负数（左侧显示器）或大于主显示器宽度（右侧显示器）

### 5.5 index.js — 统一导出

**职责**：统一导出所有 Computer Use 功能，提供工具注册入口

**导出内容：**

```
module.exports = {
  screenshot: { captureScreen },
  mouse: { moveMouse, click, scroll, drag, getMousePosition },
  keyboard: { typeText, pressKeys },
  display: { getDisplayInfo },
  TOOL_DEFINITIONS: [...],    // 5 个工具定义，供 tools.js 引入
  TOOL_HANDLERS: {...},       // 5 个工具处理器，供 tool-executor.js 引入
}
```

---

## 6. 权限与安全设计

### 6.1 权限模型

Computer Use 的 5 个工具**全部加入 `PERMISSION_REQUIRED_TOOLS`**，且**不允许"始终允许"**。

理由：
- 鼠标点击可能误操作删除文件、关闭窗口
- 键盘输入可能执行危险命令
- 截屏可能泄露隐私信息

**实现方式：**

在 `agent-loop.js` 中新增 `COMPUTER_USE_TOOLS` 常量，在权限检查逻辑中强制拦截"始终允许"请求：

```
COMPUTER_USE_TOOLS = ['ComputerScreenshot', 'ComputerClick', 'ComputerType', 'ComputerScroll', 'ComputerDrag']

// 权限检查时，Computer Use 工具即使 alwaysAllowedTools 包含也不自动通过
if (COMPUTER_USE_TOOLS.includes(toolName)) {
  // 强制弹出权限确认弹窗，不读取 alwaysAllowedTools
}
```

### 6.2 截屏预览

用户收到 Computer Use 权限请求时，应同时展示当前屏幕截图预览，让用户确认 AI 看到的内容是合理的。

**IPC 通道**：新增 `computer-use-preview`（INVOKE_CHANNELS），权限弹窗触发时先截屏，将 base64 发送到渲染进程展示。

### 6.3 操作审计日志

所有 Computer Use 操作记录到 `app.log`，包含时间戳、工具名、参数、结果。

---

## 7. 模型适配

### 7.1 视觉模型（Claude / GPT-4o / Gemini 等）

截图以 `image_url` content block 直接传给模型，模型自行理解屏幕内容。

**消息格式（Anthropic）：**

```json
{
  "role": "user",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "..."
      }
    },
    {
      "type": "text",
      "text": "这是当前屏幕截图，请分析并决定下一步操作。"
    }
  ]
}
```

**消息格式（OpenAI）：**

```json
{
  "role": "user",
  "content": [
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/jpeg;base64,..."
      }
    },
    {
      "type": "text",
      "text": "这是当前屏幕截图，请分析并决定下一步操作。"
    }
  ]
}
```

### 7.2 非视觉模型（DeepSeek-Chat / Qwen3 等）

截图经过 OCR 转为文本描述，以纯文本传给模型。

**降级策略：**

1. `ComputerScreenshot` 工具定义中追加说明："如果你是不支持视觉的模型，请使用 OCR 文本模式"
2. 工具执行时检测 `modelSupportsVision(model)`，返回不同格式
3. OCR 结果附加坐标信息，帮助模型定位元素

### 7.3 系统提示追加

在 `system-prompt.js` 中追加 Computer Use 使用指引：

```
你拥有 Computer Use 能力，可以直接操控用户的计算机图形界面。可用工具：
- ComputerScreenshot：截取屏幕截图
- ComputerClick：点击指定坐标
- ComputerType：输入文字或快捷键
- ComputerScroll：滚动页面
- ComputerDrag：拖拽元素

使用规范：
1. 每次操作前先截屏确认当前界面状态
2. 操作后再次截屏验证结果
3. 坐标基于屏幕像素，左上角为 (0, 0)
4. 如需输入中文，使用 typeText + press_enter
5. 快捷键使用 "+" 连接修饰键，如 "ctrl+s"
6. 不要在用户未确认的情况下执行危险操作（关闭窗口、删除文件等）
```

---

## 8. 渲染进程改动

### 8.1 权限弹窗增强

现有权限弹窗（`agent-permission-request` IPC）需要增强：

- Computer Use 工具的权限请求展示当前屏幕截图预览
- 点击坐标用红色圆圈标注在截图上
- 拖拽操作用箭头标注起点和终点

**新增 IPC 通道：**

| 通道 | 方向 | 用途 |
|------|------|------|
| `computer-use-preview` | invoke | 获取当前屏幕截图 base64 |

### 8.2 工具调用卡片增强

`appendToolCallIncremental` / `updateToolCallIncremental` 中，Computer Use 工具的展示方式：

- `ComputerScreenshot`：展示截图缩略图（可点击放大）
- `ComputerClick`：展示坐标 + 操作描述
- `ComputerType`：展示输入内容（敏感内容脱敏）
- `ComputerScroll`：展示滚动方向和量
- `ComputerDrag`：展示起点→终点

---

## 9. 开发阶段规划

### 阶段一：基础截屏 + 鼠标点击（MVP）

**目标**：AI 能看到屏幕并点击

1. 安装 `screenshot-desktop` + `sharp` + `robotjs`
2. 实现 `screenshot.js` 和 `mouse.js`
3. 在 `tools.js` 注册 `ComputerScreenshot` 和 `ComputerClick`
4. 在 `tool-executor.js` 实现处理器
5. 权限弹窗增加截图预览
6. 系统提示追加 Computer Use 指引
7. 测试：让 AI 打开记事本并输入文字

**预计工作量**：3-5 天

### 阶段二：键盘输入 + 滚动 + 拖拽

**目标**：完整的鼠标键盘操控

1. 实现 `keyboard.js` 和 `display.js`
2. 注册 `ComputerType`、`ComputerScroll`、`ComputerDrag`
3. 中文输入的剪贴板粘贴方案
4. DPI 缩放适配
5. 测试：让 AI 操作 Word/Excel 完成简单任务

**预计工作量**：3-5 天

### 阶段三：OCR 降级 + 非视觉模型支持

**目标**：非视觉模型也能使用 Computer Use

1. 安装 `tesseract.js`
2. 在 `screenshot.js` 中实现 OCR 降级逻辑
3. 测试 DeepSeek/Qwen3 等非视觉模型的 Computer Use 效果

**预计工作量**：2-3 天

### 阶段四：体验优化

**目标**：打磨交互体验

1. 权限弹窗截图标注（坐标圆圈、拖拽箭头）
2. 操作审计日志
3. 操作回放功能（可选）
4. 多显示器支持完善
5. macOS 适配（`robotjs` 在 macOS 上的行为差异）

**预计工作量**：3-5 天

---

## 10. 风险与注意事项

### 10.1 DPI 缩放问题

Windows 默认 125%/150% 缩放下，`robotjs` 的坐标和截图的坐标可能不一致。

**解决方案**：从 `electron.screen.getPrimaryDisplay().scaleFactor` 获取缩放比，模型输出的坐标乘以缩放比后再传给 `robotjs`。在系统提示中明确告知模型当前缩放比。

### 10.2 中文输入问题

`robotjs.typeString()` 依赖系统键盘布局，中文输入法下可能输入乱码。

**解决方案**：优先使用剪贴板粘贴方案——`clipboard.writeText(text)` + `robotjs.keyTap("v", ["control"])`。在 `keyboard.js` 中检测文本是否包含非 ASCII 字符，包含则自动切换为粘贴模式。

### 10.3 截图体积问题

1920×1080 PNG 约 2-3MB base64，多次截屏会快速撑爆上下文窗口。

**解决方案**：
- 默认输出 JPEG quality=75，压缩到 ~200KB
- Agent 循环中限制 ComputerScreenshot 调用频率（建议每轮最多 2 次）
- 上下文压缩时优先丢弃旧的截图消息

### 10.4 原生模块编译

`robotjs` 和 `sharp` 都是 C++ 原生模块，每次 Electron 版本升级都需要 `npm run rebuild`。

**解决方案**：与现有 `node-pty` 一致，在 `package.json` 的 `rebuild` 脚本中一并处理。

### 10.5 安全风险

AI 可能误操作（关闭未保存的文档、删除文件、访问敏感网站）。

**解决方案**：
- 所有操作强制用户确认，不允许"始终允许"
- 系统提示中明确禁止危险操作
- 操作审计日志可追溯
- 考虑增加"操作撤销"提示（如操作前提醒用户保存）

### 10.6 性能影响

截屏 + OCR 是耗时操作（截屏 ~200ms，OCR ~2-5s），可能拖慢 Agent 循环。

**解决方案**：
- 视觉模型跳过 OCR，直接传图片
- OCR 结果缓存（同一张截图不重复识别）
- 截屏操作设置 500ms 最小间隔，防止高频调用

---

## 11. 测试方案

### 11.1 单元测试

| 模块 | 测试项 |
|------|--------|
| screenshot.js | 全屏截屏、区域截屏、JPEG 压缩、base64 输出 |
| mouse.js | 坐标验证、点击、双击、右键、滚动、拖拽 |
| keyboard.js | 文本输入、快捷键解析、中文粘贴方案 |
| display.js | 显示器信息获取、DPI 缩放比 |

### 11.2 集成测试场景

| 场景 | 步骤 | 预期结果 |
|------|------|---------|
| 打开记事本并输入 | 截屏 → 点击记事本图标 → 输入文字 | 记事本中出现输入的文字 |
| 浏览器搜索 | 截屏 → 点击地址栏 → 输入 URL → 回车 | 浏览器打开对应网页 |
| 文件管理器操作 | 截屏 → 右键点击文件 → 选择重命名 | 文件进入重命名状态 |
| Word 保存为 PDF | 截屏 → 点击文件菜单 → 另存为 → 选 PDF | 生成 PDF 文件 |

### 11.3 冒烟测试

安装完依赖后执行：

1. `npm run rebuild` — 确认 robotjs 和 sharp 编译成功
2. `npm start` — 启动应用，确认无模块加载错误
3. 在聊天中输入"截个屏给我看看" — 确认 ComputerScreenshot 工具被调用
4. 确认权限弹窗正常弹出
5. 确认截图在聊天中正确展示
