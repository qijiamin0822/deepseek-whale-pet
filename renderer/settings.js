'use strict'
var $ = function (id) { return document.getElementById(id) }
var keyInput = $('keyInput')
var labelInput = $('labelInput')
var urlInput = $('urlInput')
var refreshInput = $('refreshInput')
var snapInput = $('snapInput')
var lowAlertInput = $('lowAlertInput')
var lowThresholdInput = $('lowThresholdInput')
var trackStatsInput = $('trackStatsInput')
var idleInput = $('idleInput')
var idleSecInput = $('idleSecInput')
var moodInput = $('moodInput')
var bounceInput = $('bounceInput')
var soundInput = $('soundInput')
var quotesInput = $('quotesInput')
var quotesTextInput = $('quotesTextInput')
var customImageInput = $('customImageInput')
var imageBtn = $('imageBtn')
var autoStartInput = $('autoStartInput')
var hotkeyInput = $('hotkeyInput')
var trayInput = $('trayInput')
var saveBtn = $('saveBtn')
var testBtn = $('testBtn')
var statusEl = $('status')

function show(msg, cls) {
  statusEl.textContent = msg
  statusEl.className = cls || ''
}

window.pet.getFullConfig().then(function (c) {
  if (!c) return
  if (c.apiKey) keyInput.value = c.apiKey
  if (c.label) labelInput.value = c.label
  if (c.balanceUrl) urlInput.value = c.balanceUrl
  if (typeof c.refreshSec === 'number') refreshInput.value = c.refreshSec
  snapInput.checked = c.snap !== false
  lowAlertInput.checked = c.lowBalanceAlert !== false
  if (typeof c.lowThreshold === 'number') lowThresholdInput.value = c.lowThreshold
  trackStatsInput.checked = c.trackStats !== false
  idleInput.checked = c.idleTransparency !== false
  if (typeof c.idleSec === 'number') idleSecInput.value = c.idleSec
  moodInput.checked = c.mood !== false
  bounceInput.checked = c.bounceAnim !== false
  soundInput.checked = c.sound !== false
  quotesInput.checked = !!c.quotesEnabled
  if (c.quotesText) quotesTextInput.value = c.quotesText
  customImageInput.checked = !!c.customImage
  autoStartInput.checked = !!c.autoStart
  hotkeyInput.checked = c.hotkey !== false
  trayInput.checked = c.trayIcon !== false
})

function num(v, dft) {
  var n = parseFloat(v)
  return isFinite(n) ? n : dft
}

function collect() {
  return {
    apiKey: keyInput.value.trim(),
    label: labelInput.value.trim() || 'DeepSeek 余额',
    balanceUrl: urlInput.value.trim(),
    refreshSec: Math.max(0, Math.min(3600, Math.round(num(refreshInput.value, 30)))),
    snap: snapInput.checked,
    lowBalanceAlert: lowAlertInput.checked,
    lowThreshold: Math.max(0, num(lowThresholdInput.value, 5)),
    trackStats: trackStatsInput.checked,
    idleTransparency: idleInput.checked,
    idleSec: Math.max(1, Math.min(300, Math.round(num(idleSecInput.value, 5)))),
    mood: moodInput.checked,
    bounceAnim: bounceInput.checked,
    sound: soundInput.checked,
    quotesEnabled: quotesInput.checked,
    quotesText: quotesTextInput.value,
    customImage: customImageInput.checked,
    autoStart: autoStartInput.checked,
    hotkey: hotkeyInput.checked,
    trayIcon: trayInput.checked,
  }
}

saveBtn.addEventListener('click', async function () {
  var r = await window.pet.saveSettings(collect())
  show(r && r.ok ? '已保存。桌宠已用新配置自动刷新。' : '保存失败', r && r.ok ? 'ok' : 'err')
})

testBtn.addEventListener('click', async function () {
  var r = await window.pet.saveSettings(collect())
  if (!r || !r.ok) { show('保存失败', 'err'); return }
  show('正在测试…', 'muted')
  var b = await window.pet.getBalance()
  if (b && b.ok) {
    show('✅ 连接成功，当前余额：' + (b.currency === 'CNY' ? '¥ ' : '') + Number(b.totalBalance).toFixed(2) + (b.currency !== 'CNY' && b.currency ? ' ' + b.currency : ''), 'ok')
  } else {
    show('❌ ' + ((b && b.error) || '测试失败'), 'err')
  }
})

imageBtn.addEventListener('click', async function () {
  var r = await window.pet.chooseImage()
  if (r && r.ok) {
    customImageInput.checked = true
    show('✅ 图片已设置，保存后生效。', 'ok')
  } else {
    show('未选择或读取失败。', 'err')
  }
})
