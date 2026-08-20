# DeepSeek 余额桌宠（Whale Pet）

把 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（DSH 网页挂件）魔改成的**独立桌面桌宠**：
一只透明置顶、可拖拽的小鲸鱼常驻桌面右下角，实时显示 DeepSeek API 余额。完全脱离 DSH / 浏览器 / Codex，双击即可用。

![DeepSeek 余额桌宠](./screenshot.png)

> 这是把 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（DSH 网页挂件）魔改成的独立桌面桌宠，完全脱离 DSH / 浏览器。

## 功能

- 🐋 透明置顶悬浮小鲸鱼（始终在最上层，不占任务栏）
- 💰 DeepSeek 余额：60 秒自动刷新 + 单击鲸鱼手动刷新；余额变化有滚动动画；网络抖动沿用上次余额
- 🖱️ 拖拽 + 四分之一区域吸附（左/右/上/下，角落可组合）
- 🔄 吸附到左边时整体水平镜像（文字自动反向）
- 🧸 按压 Q 弹效果
- 🎚️ 悬停显示 − / + 缩放（0.6–1.4 倍），位置和尺寸都会记住
- ⚙️ 右键菜单：立即刷新 / 设置 / 退出

## 运行

```powershell
cd whale-pet
npm install
npm start
```

设置 API Key：右键小鲸鱼 → 设置 → 粘贴 DeepSeek API Key（platform.deepseek.com 获取）→ 保存并测试。

## 结构

```text
whale-pet/
├── main.js            # 主进程：透明置顶窗口、余额代理（Key 不进入渲染层）、配置持久化
├── preload.js         # contextBridge 安全桥
├── renderer/
│   ├── index.html     # 桌宠页面
│   ├── pet.js         # 交互逻辑（拖拽/吸附/镜像/Q弹/缩放/刷新/右键菜单）
│   ├── settings.html  # 设置页
│   └── settings.js
└── assets/DSniang02.png
```

## 配置存储位置

`%APPDATA%\deepseek-whale-pet\config.json`（含 API Key、缩放、位置）。

## 打包成独立 exe（可选）

```powershell
npm i -D electron-builder
npx electron-builder --win portable
```
