// DeepSeek 余额桌宠 —— 主进程
// 透明置顶桌宠窗口、余额代理、配置/位置/尺寸持久化、设置窗口、单实例。
// 功能：低余额提醒、开机自启、消耗统计、闲置半透明、托盘、全局热键、自定义图片等。
'use strict'

const { app, BrowserWindow, ipcMain, screen, nativeImage, Tray, Menu, Notification, dialog, globalShortcut } = require('electron')

// 允许 Web Audio 无需用户手势即可播放（余额刷新是后台动作）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
const path = require('node:path')
const fs = require('node:fs')

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const DEFAULT_SIZE = 196
const MIN_SIZE = 96
const MAX_SIZE = 292
const MIN_SCALE = 0.6
const MAX_SCALE = 1.4

// ---------------------------------------------------------------------------
// 配置（AppData/deepseek-whale-pet/config.json）
// ---------------------------------------------------------------------------
const configPath = () => path.join(app.getPath('userData'), 'config.json')
const historyPath = () => path.join(app.getPath('userData'), 'history.json')
const customImagePath = () => path.join(app.getPath('userData'), 'custom-whale.png')

function defaultConfig() {
  return {
    apiKey: '',
    balanceUrl: '',
    snap: true,
    label: 'DeepSeek 余额',
    refreshSec: 30,
    scale: 1,
    x: null,
    y: null,
    lowBalanceAlert: true,
    lowThreshold: 5,
    autoStart: false,
    idleTransparency: true,
    idleSec: 5,
    trackStats: true,
    mood: true,
    bounceAnim: true,
    sound: true,
    quotesEnabled: false,
    quotesText: '',
    customImage: false,
    hotkey: true,
    trayIcon: true,
    displayMode: 'all',   // all | taskbar | tray | hidden
    alwaysOnTop: true,      // 是否始终置顶
  }
}

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    return { ...defaultConfig(), ...c }
  } catch {
    return defaultConfig()
  }
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch }
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true })
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.error('[whale-pet] save config failed:', err)
  }
  return next
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const petSize = (scale) => Math.round(clamp(DEFAULT_SIZE * scale, MIN_SIZE, MAX_SIZE))

let petWin = null
let settingsWin = null
let tray = null
let balanceCache = null
let balanceInFlight = null
let posSaveTimer = null
let balanceFetchCount = 0
let stats = { today: '', todayUsed: 0, lastBalance: null }
let lastLowAlertAt = 0
let cfg = loadConfig()

// ---------------------------------------------------------------------------
// 消耗统计（按自然日累计，持久化到 history.json）
// ---------------------------------------------------------------------------
function todayKey() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function loadStats() {
  try {
    const h = JSON.parse(fs.readFileSync(historyPath(), 'utf8'))
    const today = todayKey()
    if (h.today === today) {
      stats = { today, todayUsed: h.todayUsed || 0, lastBalance: typeof h.lastBalance === 'number' ? h.lastBalance : null }
    } else {
      stats = { today, todayUsed: 0, lastBalance: typeof h.lastBalance === 'number' ? h.lastBalance : null }
    }
  } catch {
    stats = { today: todayKey(), todayUsed: 0, lastBalance: null }
  }
  return stats
}

function saveStats() {
  try {
    fs.mkdirSync(path.dirname(historyPath()), { recursive: true })
    fs.writeFileSync(historyPath(), JSON.stringify(stats), 'utf8')
  } catch (err) { /* ignore */ }
}

function recordBalance(nb) {
  if (typeof nb !== 'number' || !isFinite(nb)) return
  if (stats.lastBalance !== null && nb < stats.lastBalance) {
    stats.todayUsed = Math.round((stats.todayUsed + (stats.lastBalance - nb)) * 100) / 100
  }
  stats.lastBalance = nb
  saveStats()
}

// ---------------------------------------------------------------------------
// 低余额提醒
// ---------------------------------------------------------------------------
function notifyLowBalance(total, currency) {
  const now = Date.now()
  // 至少 10 分钟内不重复提醒
  if (now - lastLowAlertAt < 10 * 60 * 1000) return
  lastLowAlertAt = now
  const sym = currency === 'CNY' ? '¥' : (currency || '')
  const n = new Notification({
    title: '🐋 DeepSeek 余额不足提醒',
    body: '当前余额：' + sym + ' ' + Number(total).toFixed(2) + ' ' + (currency || '') + '\n记得及时充值，避免任务中断～',
  })
  n.show()
}

// ---------------------------------------------------------------------------
// 桌宠窗口
// ---------------------------------------------------------------------------
function createPetWindow(posOverride) {
  const size = petSize(cfg.scale)
  const wa = screen.getPrimaryDisplay().workArea
  const mode = cfg.displayMode || 'all'
  // 任务栏图标只在 all / taskbar 模式显示（运行时 setSkipTaskbar 在 Windows 上不可靠，
  // 必须在创建窗口时用 skipTaskbar 参数决定）
  const skipTaskbar = (mode === 'tray' || mode === 'hidden')

  let x = cfg.x
  let y = cfg.y
  if (posOverride && typeof posOverride.x === 'number' && typeof posOverride.y === 'number') {
    x = posOverride.x
    y = posOverride.y
  }
  if (typeof x !== 'number' || typeof y !== 'number' ||
      x < wa.x - size || x > wa.x + wa.width - 1 ||
      y < wa.y - size || y > wa.y + wa.height - 1) {
    x = wa.x + wa.width - size
    y = wa.y + wa.height - size
  }

  petWin = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  petWin.setAlwaysOnTop(true, 'screen-saver')
  petWin.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  petWin.once('ready-to-show', () => {
    petWin.show()
    petWin.focus()
  })
  petWin.on('closed', () => { petWin = null })
}

// 运行时 setSkipTaskbar 在 Windows 上不可靠，切换任务栏显隐需重建窗口
function recreatePetWindow() {
  const pos = petWin && !petWin.isDestroyed() ? petWin.getPosition() : null
  if (petWin && !petWin.isDestroyed()) petWin.destroy()
  petWin = null
  createPetWindow(pos ? { x: pos[0], y: pos[1] } : null)
  applyDisplayMode(cfg.displayMode)
}

function schedulePosSave() {
  if (posSaveTimer) clearTimeout(posSaveTimer)
  posSaveTimer = setTimeout(() => {
    posSaveTimer = null
    if (!petWin || petWin.isDestroyed()) return
    const [x, y] = petWin.getPosition()
    cfg = saveConfig({ x, y })
  }, 500)
}

// ---------------------------------------------------------------------------
// 余额拉取（主进程代理，key 不出主进程）
// ---------------------------------------------------------------------------
async function fetchBalance() {
  balanceFetchCount++
  if (balanceInFlight) return balanceInFlight
  balanceInFlight = (async () => {
    const cfgNow = loadConfig()
    const key = cfgNow.apiKey.trim()
    const url = (cfgNow.balanceUrl || '').trim() || BALANCE_URL
    if (!key) {
      return { ok: false, code: 'NO_KEY', error: '未配置 API Key（右键小鲸鱼 → 设置）' }
    }
    try {
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(20000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status)
        const payload = { ok: false, code: 'HTTP_' + res.status, error: String(msg).slice(0, 200), transient: res.status >= 500 }
        if (!payload.transient) console.error('[whale-pet]', payload.code, payload.error)
        return payload
      }
      const info = Array.isArray(data.balance_infos) && data.balance_infos[0]
      if (!info) return { ok: false, code: 'EMPTY', error: '接口未返回余额数据', transient: true }
      const payload = {
        ok: true,
        totalBalance: info.total_balance,
        currency: info.currency || 'CNY',
        isAvailable: info.is_available !== false,
        grantedBalance: info.granted_balance,
        toppedUpBalance: info.topped_up_balance,
        cachedAt: Date.now(),
      }
      balanceCache = { at: Date.now(), payload }
      // 消耗统计
      if (cfgNow.trackStats) {
        recordBalance(Number(payload.totalBalance))
      }
      // 低余额提醒
      if (cfgNow.lowBalanceAlert && Number(payload.totalBalance) > 0 && Number(payload.totalBalance) < Number(cfgNow.lowThreshold)) {
        notifyLowBalance(payload.totalBalance, payload.currency)
      }
      return payload
    } catch (err) {
      const msg = String((err && err.message) || err).slice(0, 200)
      if (balanceCache && Date.now() - balanceCache.at < 10 * 60 * 1000) {
        return { ...balanceCache.payload, stale: true, error: msg }
      }
      return { ok: false, code: 'ERROR', error: msg, transient: true }
    } finally {
      balanceInFlight = null
    }
  })()
  return balanceInFlight
}

// ---------------------------------------------------------------------------
// 设置窗口
// ---------------------------------------------------------------------------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 640,
    title: 'DeepSeek 余额桌宠 · 设置',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  settingsWin.setMenuBarVisibility(false)
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'))
  settingsWin.once('ready-to-show', () => settingsWin.show())
  settingsWin.on('closed', () => { settingsWin = null })
}

// ---------------------------------------------------------------------------
// 显示位置模式：all(全显示) | taskbar(仅任务栏) | tray(仅托盘) | hidden(全隐藏)
// ---------------------------------------------------------------------------
function applyDisplayMode(mode) {
  if (!petWin || petWin.isDestroyed()) return
  const m = mode || 'all'
  // 桌宠本体始终显示，与显示位置无关；置顶只由「始终置顶」决定
  petWin.setAlwaysOnTop(loadConfig().alwaysOnTop !== false, 'screen-saver')
  petWin.show()
  // 任务栏显隐由创建窗口时的 skipTaskbar 决定（运行时切换不可靠，需重建）
  const showTray = (m === 'all' || m === 'tray')
  updateTray(showTray)
}

// ---------------------------------------------------------------------------
// 托盘
// ---------------------------------------------------------------------------
function buildTrayImage() {
  try {
    const p = path.join(__dirname, 'assets', 'DSniang02.png')
    return nativeImage.createFromPath(p).resize({ width: 16, height: 16 })
  } catch {
    return nativeImage.createEmpty()
  }
}

function updateTray(enabled) {
  if (!enabled) {
    if (tray) { tray.destroy(); tray = null }
    return
  }
  if (tray) return
  tray = new Tray(buildTrayImage())
  tray.setToolTip('DeepSeek 余额桌宠')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '🔄 立即刷新', click: () => { if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:refresh') } },
    { label: '⚙️ 设置…', click: () => openSettings() },
    { label: '✕ 退出', click: () => app.quit() },
  ]))
  tray.on('click', () => { if (petWin && !petWin.isDestroyed()) petWin.show() })
}

// ---------------------------------------------------------------------------
// 全局热键
// ---------------------------------------------------------------------------
function updateHotkey(enabled) {
  globalShortcut.unregisterAll()
  // 全隐藏时的安全恢复热键（始终可用）
  try {
    globalShortcut.register('Control+Shift+H', () => {
      const cur = loadConfig().displayMode || 'all'
      const next = cur === 'hidden' ? 'all' : 'hidden'
      cfg = saveConfig({ displayMode: next })
      applyDisplayMode(next)
      if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:config-updated')
    })
  } catch (err) { /* ignore */ }
  if (!enabled) return
  globalShortcut.register('Control+Shift+R', () => {
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:refresh')
  })
}

// ---------------------------------------------------------------------------
// 开机自启
// ---------------------------------------------------------------------------
function updateAutoStart(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [],
    })
  } catch (err) {
    console.error('[whale-pet] setLoginItemSettings failed:', err)
  }
}

// ---------------------------------------------------------------------------
// 自定义图片
// ---------------------------------------------------------------------------
async function chooseCustomImage() {
  const r = await dialog.showOpenDialog(settingsWin || petWin, {
    title: '选择鲸鱼图片（建议 1026×1026 PNG）',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false }
  try {
    const src = r.filePaths[0]
    fs.copyFileSync(src, customImagePath())
    cfg = saveConfig({ customImage: true })
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:config-updated')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('pet:get-balance', () => fetchBalance())
ipcMain.handle('pet:get-screen', () => {
  const d = screen.getPrimaryDisplay()
  return { workArea: d.workArea, bounds: d.bounds }
})
ipcMain.handle('pet:get-position', () => {
  if (!petWin || petWin.isDestroyed()) return { x: 0, y: 0 }
  const [x, y] = petWin.getPosition()
  return { x, y }
})
ipcMain.handle('pet:set-position', (_e, { x, y }) => {
  if (!petWin || petWin.isDestroyed()) return { x: 0, y: 0 }
  // 用 setBounds 显式固定宽高再移动：Windows 显示缩放非 100% 时，setPosition 拖动无边框
  // 窗口会按移动方向被拉伸放大；这里锁定为正方形，避免拖动时变形（修复「拖动放大」）
  const size = petSize(cfg.scale)
  const nx = Math.round(x)
  const ny = Math.round(y)
  petWin.setBounds({ x: nx, y: ny, width: size, height: size })
  schedulePosSave()
  return { x: nx, y: ny }
})
ipcMain.handle('pet:get-size', () => {
  const scale = loadConfig().scale
  return { size: petSize(scale), scale, minSize: MIN_SIZE, maxSize: MAX_SIZE }
})
ipcMain.handle('pet:set-scale', (_e, { scale }) => {
  const next = Math.round(clamp(scale, MIN_SCALE, MAX_SCALE) * 10) / 10
  cfg = saveConfig({ scale: next })
  if (petWin && !petWin.isDestroyed()) {
    const b = petWin.getBounds()
    const size = petSize(next)
    petWin.setBounds({ x: b.x, y: b.y, width: size, height: size })
  }
  return { scale: next, size: petSize(next) }
})
ipcMain.handle('pet:get-config', () => {
  const c = loadConfig()
  return {
    hasKey: !!c.apiKey.trim(), scale: c.scale,
    snap: c.snap !== false, label: c.label || 'DeepSeek 余额', refreshSec: c.refreshSec,
    lowBalanceAlert: !!c.lowBalanceAlert, lowThreshold: c.lowThreshold,
    idleTransparency: c.idleTransparency !== false, idleSec: c.idleSec,
    trackStats: c.trackStats !== false, mood: c.mood !== false, bounceAnim: c.bounceAnim !== false,
    sound: c.sound !== false, quotesEnabled: !!c.quotesEnabled, quotesText: c.quotesText || '',
    customImage: !!c.customImage, hotkey: c.hotkey !== false, trayIcon: c.trayIcon !== false,
    autoStart: !!c.autoStart, displayMode: c.displayMode || 'all', alwaysOnTop: c.alwaysOnTop !== false,
  }
})
ipcMain.handle('pet:get-full-config', () => {
  const c = loadConfig()
  return {
    apiKey: c.apiKey, balanceUrl: c.balanceUrl || '', snap: c.snap !== false,
    label: c.label || 'DeepSeek 余额', refreshSec: c.refreshSec, scale: c.scale,
    lowBalanceAlert: !!c.lowBalanceAlert, lowThreshold: c.lowThreshold,
    idleTransparency: c.idleTransparency !== false, idleSec: c.idleSec,
    trackStats: c.trackStats !== false, mood: c.mood !== false, bounceAnim: c.bounceAnim !== false,
    sound: c.sound !== false, quotesEnabled: !!c.quotesEnabled, quotesText: c.quotesText || '',
    customImage: !!c.customImage, hotkey: c.hotkey !== false, trayIcon: c.trayIcon !== false,
    autoStart: !!c.autoStart, displayMode: c.displayMode || 'all', alwaysOnTop: c.alwaysOnTop !== false,
  }
})
ipcMain.handle('pet:save-settings', (_e, settings) => {
  const s = settings || {}
  const apiKey = String(s.apiKey || '').trim()
  const balanceUrl = String(s.balanceUrl || '').trim()
  const label = String(s.label || '').trim() || 'DeepSeek 余额'
  let refreshSec = Number(s.refreshSec)
  if (!Number.isFinite(refreshSec)) refreshSec = 30
  refreshSec = Math.round(clamp(refreshSec, 0, 3600))
  let lowThreshold = Number(s.lowThreshold)
  if (!Number.isFinite(lowThreshold)) lowThreshold = 5
  lowThreshold = clamp(lowThreshold, 0, 100000)
  // 缺失的字段保留当前已保存的值，避免部分保存把设置重置回默认
  const cur = loadConfig()
  const bool = function (v, dft) { return typeof v === 'boolean' ? v : dft }
  const patch = {
    apiKey, balanceUrl,
    snap: bool(s.snap, cur.snap !== false),
    label,
    refreshSec,
    scale: cfg.scale,
    lowBalanceAlert: bool(s.lowBalanceAlert, !!cur.lowBalanceAlert),
    lowThreshold,
    idleTransparency: bool(s.idleTransparency, cur.idleTransparency !== false),
    idleSec: clamp(Number(s.idleSec) || cur.idleSec || 5, 1, 300),
    trackStats: bool(s.trackStats, cur.trackStats !== false),
    mood: bool(s.mood, cur.mood !== false),
    bounceAnim: bool(s.bounceAnim, cur.bounceAnim !== false),
    sound: bool(s.sound, cur.sound !== false),
    quotesEnabled: bool(s.quotesEnabled, !!cur.quotesEnabled),
    quotesText: String(s.quotesText || '').trim(),
    customImage: bool(s.customImage, !!cur.customImage),
    hotkey: bool(s.hotkey, cur.hotkey !== false),
    trayIcon: bool(s.trayIcon, cur.trayIcon !== false),
    autoStart: bool(s.autoStart, !!cur.autoStart),
    displayMode: (s.displayMode === 'taskbar' || s.displayMode === 'tray' || s.displayMode === 'hidden') ? s.displayMode : 'all',
    alwaysOnTop: bool(s.alwaysOnTop, cur.alwaysOnTop !== false),
  }
  const oldMode = cur.displayMode || 'all'
  const oldSkip = (oldMode === 'tray' || oldMode === 'hidden')
  const newSkip = (patch.displayMode === 'tray' || patch.displayMode === 'hidden')
  cfg = saveConfig(patch)
  if (oldSkip !== newSkip) {
    // 任务栏显隐状态变化 -> 重建窗口以应用创建期 skipTaskbar
    recreatePetWindow()
  } else {
    applyDisplayMode(cfg.displayMode)
  }
  updateHotkey(cfg.hotkey)
  updateAutoStart(cfg.autoStart)
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:refresh')
    petWin.webContents.send('pet:config-updated')
  }
  return { ok: true, hasKey: !!apiKey }
})
ipcMain.handle('pet:save-key', (_e, { apiKey }) => {
  cfg = saveConfig({ apiKey: String(apiKey || '').trim() })
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:refresh')
  return { ok: true, hasKey: !!cfg.apiKey.trim() }
})
ipcMain.handle('pet:get-stats', () => {
  loadStats()
  return { today: stats.today, todayUsed: stats.todayUsed, lastBalance: stats.lastBalance }
})
ipcMain.handle('pet:set-idle', (_e, { idle }) => {
  if (petWin && !petWin.isDestroyed()) {
    petWin.setOpacity(idle ? 0.4 : 1)
  }
  return { idle: !!idle }
})
ipcMain.handle('pet:get-image-url', () => {
  const c = loadConfig()
  if (c.customImage && fs.existsSync(customImagePath())) {
    return { url: 'file://' + customImagePath().replace(/\\/g, '/') }
  }
  return { url: '' }
})
ipcMain.handle('pet:choose-image', () => chooseCustomImage())
ipcMain.handle('pet:open-settings', () => openSettings())
ipcMain.handle('pet:quit', () => {
  if (posSaveTimer) clearTimeout(posSaveTimer)
  app.quit()
})

// ---------------------------------------------------------------------------
// 启动（单实例 + whenReady）
// ---------------------------------------------------------------------------
const isSmokeTest = process.argv.includes('--smoke-test')
const isCaptureDemo = process.argv.includes('--capture-demo')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (petWin && !petWin.isDestroyed()) {
      petWin.show()
      petWin.focus()
    }
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.deepseek-whale-pet')
    console.log('[boot] userData=' + app.getPath('userData'))
    loadStats()
    createPetWindow()
    applyDisplayMode(cfg.displayMode)
    updateHotkey(cfg.hotkey)

    if (isSmokeTest) {
      await new Promise((r) => setTimeout(r, 3500))
      if (petWin && !petWin.isDestroyed()) {
        try {
          const info = await petWin.webContents.executeJavaScript(`(() => {
            const el = (s) => document.querySelector(s)
            return {
              pet: !!el('.dshp-root'),
              imgLoaded: !!el('.dshp-img') && el('.dshp-img').complete && el('.dshp-img').naturalWidth > 0,
              label: el('.dshp-label') ? el('.dshp-label').textContent : null,
              amount: el('.dshp-amount') ? el('.dshp-amount').textContent : null,
              hint: el('.dshp-hint') ? el('.dshp-hint').textContent : null,
              bodyText: document.body.innerText,
            }
          })()`)
          console.log('[smoke] DOM=' + JSON.stringify(info))
          try {
            await petWin.webContents.executeJavaScript(`window.pet.setPosition(120, 130)`)
            await new Promise((r) => setTimeout(r, 400))
            const pos = await petWin.webContents.executeJavaScript(`window.pet.getPosition()`)
            console.log('[smoke] pos-ipc=' + JSON.stringify(pos))
          } catch (err) { console.error('[smoke] pos-ipc failed:', err) }
          const image = await petWin.webContents.capturePage()
          const outDir = process.env.WHALE_PET_SMOKE_DIR || app.getPath('temp')
          fs.mkdirSync(outDir, { recursive: true })
          const shot = path.join(outDir, 'whale-pet-smoke.png')
          fs.writeFileSync(shot, image.toPNG())
          const bmp = nativeImage.createFromBuffer(image.toPNG()).toBitmap()
          let opaque = 0
          const total = bmp.length / 4
          for (let i = 0; i < bmp.length; i += 4) if (bmp[i + 3] > 8) opaque++
          console.log('[smoke] pixels total=' + total + ' opaque=' + opaque + ' ratio=' + (opaque / total).toFixed(3))
          console.log('[smoke] screenshot=' + shot)

          // 设置窗口检查
          openSettings()
          await new Promise((r) => setTimeout(r, 1800))
          if (settingsWin && !settingsWin.isDestroyed()) {
            const sinfo = await settingsWin.webContents.executeJavaScript(
              `(() => ({
                title: document.title,
                hasInput: !!document.getElementById('keyInput'),
                hasLabel: !!document.getElementById('labelInput'),
                hasSnap: !!document.getElementById('snapInput'),
                hasUrl: !!document.getElementById('urlInput'),
                hasRefresh: !!document.getElementById('refreshInput'),
                hasLow: !!document.getElementById('lowAlertInput'),
                hasThreshold: !!document.getElementById('lowThresholdInput'),
                hasAutoStart: !!document.getElementById('autoStartInput'),
                hasIdle: !!document.getElementById('idleInput'),
                hasStats: !!document.getElementById('trackStatsInput'),
                hasMood: !!document.getElementById('moodInput'),
                hasBounce: !!document.getElementById('bounceInput'),
                hasSound: !!document.getElementById('soundInput'),
                hasQuotes: !!document.getElementById('quotesInput'),
                hasImage: !!document.getElementById('imageBtn'),
                hasHotkey: !!document.getElementById('hotkeyInput'),
                hasDisplayMode: !!document.querySelector('input[name=displayMode]'),
                hasAlwaysTop: !!document.getElementById('alwaysTopInput'),
              }))()`
            )
            console.log('[smoke] settings=' + JSON.stringify(sinfo))
          // 布局自检：body 不应滚动（避免双滚动条），只有内层滚动区滚动
          try {
            const lay = await settingsWin.webContents.executeJavaScript(`(() => {
              const sc = document.querySelector('.scroll')
              return {
                winH: window.innerHeight,
                bodyScrollH: document.body.scrollHeight,
                bodyOverflow: document.body.scrollHeight - window.innerHeight,
                scrollOverflow: sc ? sc.scrollHeight - sc.clientHeight : -1
              }
            })()`)
            console.log('[smoke] settings-layout=' + JSON.stringify(lay))
          } catch (err) { console.error('[smoke] settings-layout failed:', err) }
          // 设置窗口复选框是否反映保存的值（idleTransparency 应为 false）
          try {
            const boxes = await settingsWin.webContents.executeJavaScript(`(() => ({
              idle: document.getElementById('idleInput').checked,
              mood: document.getElementById('moodInput').checked,
              snap: document.getElementById('snapInput').checked,
            }))()`)
            console.log('[smoke] settings-boxes=' + JSON.stringify(boxes))
          // 自动保存自检：勾选 snap 开关（不点保存），等 1 秒看配置是否自动写入
          try {
            const snapBefore = loadConfig().snap
            await settingsWin.webContents.executeJavaScript(`(() => {
              var el = document.getElementById('snapInput')
              el.checked = true
              el.dispatchEvent(new Event('change', { bubbles: true }))
            })()`)
            await new Promise((r) => setTimeout(r, 1200))
            const snapAfter = loadConfig().snap
            console.log('[smoke] auto-save snap before=' + snapBefore + ' after=' + snapAfter)
          } catch (err) { console.error('[smoke] auto-save test failed:', err) }
          } catch (err) { console.error('[smoke] settings-boxes failed:', err) }
          // 音频状态检查（音效功能）
          try {
            const audioState = await petWin.webContents.executeJavaScript(`window.__dshpAudioTest()`)
            console.log('[smoke] audio-state=' + audioState)
          // 打印桌宠实际应用的功能开关（验证设置记忆）
          try {
            const flags = await petWin.webContents.executeJavaScript(`window.__dshpFlags ? window.__dshpFlags() : null`)
            const cfgState = await petWin.webContents.executeJavaScript(`window.__dshpConfig ? window.__dshpConfig() : null`)
            console.log('[smoke] applied-flags=' + JSON.stringify(flags) + ' cfg=' + JSON.stringify(cfgState))
          // 显示模式自检：4 种模式下桌宠都应始终可见（模式只影响任务栏/托盘图标）
          // 注意：切换任务栏组会重建桌宠窗口，因此从稳定的设置窗口发 saveSettings
          try {
            const visMap = {}
            for (const m of ['all', 'taskbar', 'tray', 'hidden']) {
              await settingsWin.webContents.executeJavaScript(`window.pet.saveSettings({ displayMode: '${m}' })`)
              await new Promise((r) => setTimeout(r, 2000))   // 重建窗口需时间
              visMap[m] = petWin.isVisible()
            }
            await settingsWin.webContents.executeJavaScript(`window.pet.saveSettings({ displayMode: 'all' })`)
            await new Promise((r) => setTimeout(r, 2000))
            console.log('[smoke] display-mode visible-map=' + JSON.stringify(visMap))
          } catch (err) { console.error('[smoke] display-mode test failed:', err) }
          } catch (err) { console.error('[smoke] flags check failed:', err) }
          // 刷新不闪 "--" 自检：模拟余额 10.00 -> 9.50，过程中数字应保持旧值并滚动
          try {
            const flashTest = await petWin.webContents.executeJavaScript(`(async () => {
              // 第一次：把余额设成 10.00
              window.__dshpSetFakeBalance({ ok: true, totalBalance: '10.00', currency: 'CNY' })
              window.__dshpTestRefresh()
              await new Promise(function (r) { setTimeout(r, 700) })
              var before = window.__dshpTestState()
              // 第二次：余额变成 9.50，且请求有 350ms 延迟（模拟自动刷新进行中）
              window.__dshpSetFakeBalance(function () {
                return new Promise(function (r) { setTimeout(function () {
                  r({ ok: true, totalBalance: '9.50', currency: 'CNY' })
                }, 350) })
              })
              window.__dshpTestRefresh()
              await new Promise(function (r) { setTimeout(r, 120) })   // 请求进行中：数字应保持 10.00，绝不是 "--"
              var during = window.__dshpTestState()
              await new Promise(function (r) { setTimeout(r, 800) })   // 等滚动动画完成
              var after = window.__dshpTestState()
              window.__dshpSetFakeBalance(null)
              return { before: before, during: during, after: after }
            })()`)
            console.log('[smoke] refresh-flash=' + JSON.stringify(flashTest))
          } catch (err) {
            console.error('[smoke] refresh-flash test failed:', err)
          }
          } catch (err) { console.error('[smoke] audio check failed:', err) }
          }
        } catch (err) {
          console.error('[smoke] failed:', err)
        }
      }
      app.quit()
      return
    }

    if (isCaptureDemo) {
      const outDir = process.env.WHALE_PET_CAPTURE_DIR || app.getPath('temp')
      fs.mkdirSync(outDir, { recursive: true })
      const save = async (w, name) => {
        if (!w || w.isDestroyed()) return
        const img = await w.webContents.capturePage()
        fs.writeFileSync(path.join(outDir, name), img.toPNG())
        console.log('[capture] ' + name)
      }
      await new Promise((r) => setTimeout(r, 3500))   // 等首次余额
      if (petWin && !petWin.isDestroyed()) {
        await save(petWin, 'shot-balance.png')
        // 余额上涨 -> 情绪 😊
        await petWin.webContents.executeJavaScript(`window.__dshpSetFakeBalance({ ok: true, totalBalance: '9.99', currency: 'CNY' })`)
        await petWin.webContents.executeJavaScript(`window.__dshpTestRefresh()`)
        await new Promise((r) => setTimeout(r, 1600))
        await save(petWin, 'shot-mood-up.png')
        // 低余额 -> 😰 红色
        await petWin.webContents.executeJavaScript(`window.__dshpSetFakeBalance({ ok: true, totalBalance: '2.00', currency: 'CNY' })`)
        await petWin.webContents.executeJavaScript(`window.__dshpTestRefresh()`)
        await new Promise((r) => setTimeout(r, 1600))
        await save(petWin, 'shot-low.png')
        // 恢复真实余额
        await petWin.webContents.executeJavaScript(`window.__dshpSetFakeBalance(null)`)
        await petWin.webContents.executeJavaScript(`window.__dshpTestRefresh()`)
        await new Promise((r) => setTimeout(r, 1200))
        // 右键菜单
        await petWin.webContents.executeJavaScript(`(() => {
          var m = document.getElementById('menu')
          m.style.left = '14px'; m.style.top = '8px'
          m.classList.add('dshp-open')
        })()`)
        await new Promise((r) => setTimeout(r, 500))
        await save(petWin, 'shot-menu.png')
        // 设置窗口
        openSettings()
        await new Promise((r) => setTimeout(r, 1600))
        if (settingsWin && !settingsWin.isDestroyed()) await save(settingsWin, 'shot-settings.png')
        console.log('[capture] done -> ' + outDir)
      }
      app.quit()
      return
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createPetWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
