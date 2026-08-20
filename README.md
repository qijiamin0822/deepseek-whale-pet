# 🐋 DeepSeek 余额桌宠 · DeepSeek Whale Pet

> 透明置顶的桌面小鲸鱼，实时显示你的 DeepSeek API 余额。
> A transparent, always-on-top desktop whale that shows your **DeepSeek API balance** in real time.

![DeepSeek 余额桌宠](./screenshot.png)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-43-47848F)](https://www.electronjs.org/)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D6)](#)

> 本项目把 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（DSH 网页挂件）魔改成了独立桌面桌宠，完全脱离 DSH / 浏览器。
> Rewritten from the DSH web widget into a standalone desktop pet — no DSH or browser required.

## 特性 · Features

| | 中文 | English |
|---|---|---|
| 💰 | **实时余额**：30 秒自动刷新 + 单击刷新，余额变化滚动动画 | **Real-time balance**: auto-refresh + click to refresh, rolling animation |
| 🖱️ | **拖拽 / 吸附 / 镜像**：四分之一区域吸附，贴左边自动镜像 | **Drag / edge-snap / mirror** |
| 🔔 | **低余额提醒**：低于阈值弹系统通知（可设阈值） | **Low-balance alert** with custom threshold |
| 📊 | **今日消耗统计**：右键菜单查看 | **Today's usage stats** in context menu |
| 🧸 | **情绪表情 + 弹跳动画**：😊😢😰 | **Mood emoji & bounce** animations |
| 🔊 | **提示音效**（Web Audio 合成） | **Sound effects** (Web Audio) |
| 🎨 | **高度可自定义**：名称、图片、接口地址、刷新间隔、随机语录、闲置半透明 | **Highly customizable**: label, image, API endpoint, refresh interval, quotes, idle fade |
| ⚙️ | **系统集成**：托盘图标、全局热键 Ctrl+Shift+R、开机自启、单实例 | **System integration**: tray, global hotkey, auto-start, single instance |
| 💚 | **绿色便携版**：单文件 exe，免安装双击即用 | **Portable** single exe, no install |

## 快速开始 · Quick Start

1. **下载 / Download**：[Release v1.0.0](https://github.com/qijiamin0822/deepseek-whale-pet/releases/tag/v1.1.0) → 双击 `DeepSeek-Whale-Pet-1.1.0-portable.exe`
2. 右键小鲸鱼 → **设置** → 填入你的 DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com) 获取）→ 保存
   Right-click the whale → **Settings** → paste your DeepSeek API Key → Save
3. 余额显示后，每 30 秒自动刷新；单击小鲸鱼可手动刷新。
   Balance updates every 30s; click the whale to refresh manually.

### 从源码运行 · Run from source

```powershell
cd whale-pet
npm install
npm start
```

## 配置位置 · Config

Windows 用户目录 AppData 下的 `deepseek-whale-pet/config.json`（API Key、位置、全部设置）。**API Key 仅保存在本机，不会上传到任何地方。**

## 技术栈 · Tech Stack

- Electron
- Node.js
- 原生 JavaScript（无框架）

## 开源协议 · License

[MIT](LICENSE)
