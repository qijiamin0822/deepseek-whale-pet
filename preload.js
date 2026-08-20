// 预加载脚本：通过 contextBridge 暴露安全的桌宠 API 给渲染层
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pet', {
  // 余额
  getBalance: () => ipcRenderer.invoke('pet:get-balance'),
  // 屏幕/位置
  getScreen: () => ipcRenderer.invoke('pet:get-screen'),
  getPosition: () => ipcRenderer.invoke('pet:get-position'),
  setPosition: (x, y) => ipcRenderer.invoke('pet:set-position', { x, y }),
  // 尺寸
  getSize: () => ipcRenderer.invoke('pet:get-size'),
  setScale: (scale) => ipcRenderer.invoke('pet:set-scale', { scale }),
  // 配置
  getConfig: () => ipcRenderer.invoke('pet:get-config'),
  getFullConfig: () => ipcRenderer.invoke('pet:get-full-config'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('pet:save-key', { apiKey }),
  saveSettings: (settings) => ipcRenderer.invoke('pet:save-settings', settings),
  // 统计
  getStats: () => ipcRenderer.invoke('pet:get-stats'),
  // 闲置透明度
  setIdle: (idle) => ipcRenderer.invoke('pet:set-idle', { idle }),
  // 图片
  getImageUrl: () => ipcRenderer.invoke('pet:get-image-url'),
  chooseImage: () => ipcRenderer.invoke('pet:choose-image'),
  // 事件
  onRefreshRequested: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('pet:refresh', listener)
    return () => ipcRenderer.removeListener('pet:refresh', listener)
  },
  onConfigUpdated: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('pet:config-updated', listener)
    return () => ipcRenderer.removeListener('pet:config-updated', listener)
  },
  // 其它
  openSettings: () => ipcRenderer.invoke('pet:open-settings'),
  quit: () => ipcRenderer.invoke('pet:quit'),
})
