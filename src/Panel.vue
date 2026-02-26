<template>
  <div class="netease-music-panel-content">
    <div class="flex flex-col gap-2">
      <!-- 状态信息 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">连接状态</span>
          <span id="netease-music-extension-status" class="text-sm text-gray-600 truncate max-w-[150px]" :title="connectionStatus">
            {{ connectionStatus }}
          </span>
        </div>
        
        <!-- Cookie 设置弹窗（免责声明 + 登录） -->
        <div v-if="showCookieModal" class="nm-modal-backdrop">
          <div class="nm-modal">
            <div class="flex justify-end">
              <button @click="closeCookieModal" class="py-0.5 px-2 text-xs rounded nm-danger-btn">取消</button>
            </div>
            <div v-if="showDisclaimer" class="flex flex-col gap-3">
              <div class="text-base font-semibold">🔒 安全免责声明</div>
              <div class="text-sm leading-6">
                <div>1. 本插件仅本地存储/使用网易云Cookie，不上传、不收集、不传输任何账号信息,插件是开源的大家可以随时查看风险；</div>
                <div>2. 官方发布渠道目前仅为Discord「类脑ΟΔΥΣΣΕΙΑ」社区，非官方版本请勿使用，或者你认为本插件具有你无法承担的风险，也请勿使用；</div>
                <div>3. 因频繁上传获取cookie(风控风险)、使用非官方版本导致的账号风险，作者不承担任何责任</div>
              </div>
              <div class="flex justify-end">
                <button 
                  :disabled="!consentEnabled"
                  @click="confirmDisclaimer"
                  class="nm-accent-btn text-white py-1.5 px-3 rounded text-sm disabled:opacity-60"
                >
                  我已确认<span v-if="!consentEnabled">({{ countdownSeconds }}s)</span>
                </button>
              </div>
            </div>
            <div v-else class="flex flex-col gap-3">
              <div class="text-base font-semibold">登录与 Cookie</div>
              <div class="text-xs text-gray-500">方式一：二维码登录（推荐）；方式二：在网页端登录后按照下方步骤复制并粘贴。</div>
              <div class="border rounded p-2 flex flex-col gap-2">
                <div class="flex items-center gap-2">
                  <button
                    @click="startQrLogin"
                    :disabled="qrChecking && !showQrSection"
                    class="nm-accent-btn text-white py-1 px-2 rounded text-xs"
                  >二维码获得 Cookie</button>
                  <a href="https://music.163.com/" target="_blank" class="text-xs underline">打开网易云网页</a>
                  <a :href="bridgeUrl + '/mobile/setup'" target="_blank" class="text-xs underline">一键配置手机推送</a>
                  <button
                    @click="openManualCookie"
                    class="nm-accent-btn text-white py-1 px-2 rounded text-xs"
                  >手动配置 Cookie</button>
                </div>
                <div v-if="showQrSection" class="flex flex-col gap-2">
                  <div v-if="qrImg" class="flex items-center justify-center">
                    <img :src="qrImg" alt="QR" class="w-40 h-40 rounded bg-white" />
                  </div>
                  <div class="text-xs text-gray-400">{{ qrStatus }}</div>
                  <div v-show="qrWriteProgress > 0" class="flex items-center gap-2">
                    <div class="flex-1 h-2 rounded bg-gray-700 overflow-hidden">
                      <div class="h-2 rounded" :style="{ width: qrWriteProgress + '%', backgroundColor: 'var(--nm-accent)' }"></div>
                    </div>
                    <div class="text-xs text-gray-300">{{ qrWriteProgress }}%</div>
                  </div>
                </div>
              </div>
              <div v-if="showManualCookieSection" class="border rounded p-2 flex flex-col gap-2">
                <div class="text-xs text-gray-400">步骤：</div>
                <div class="text-xs text-gray-400">1. 在网易云网页端登录后按 F12 打开开发者工具</div>
                <div class="text-xs text-gray-400">2. 点击 Application/应用程序 → Cookies → 选择 https://music.163.com/</div>
                <div class="text-xs text-gray-400">3. 复制 MUSIC_U 的值，粘贴到下方</div>
                <div class="flex items-center gap-2">
                  <input v-model="manualMusicU" placeholder="粘贴 MUSIC_U" class="w-full rounded border px-2 py-1 text-sm text-black dark:bg-gray-700 dark:border-gray-600" />
                  <button @click="saveMusicU" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">保存</button>
                </div>
                <div v-if="saveMusicUFeedback" class="text-xs text-green-400">{{ saveMusicUFeedback }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 当前播放信息 -->
        <div id="nm-fixed-anchor" class="bg-gray-50 dark:bg-gray-800 rounded p-3" v-if="currentSong">
          <div class="flex items-center gap-3">
            <!-- 唱片封面 -->
            <div class="relative w-16 h-16 flex-shrink-0">
               <!-- 唱片背景 -->
               <div class="absolute inset-0 rounded-full bg-black border-2 border-gray-700 shadow-lg" 
                    :class="{'animate-spin-slow': currentSong.isPlaying}"></div>
               <!-- 封面图片 -->
               <div class="absolute inset-0 flex items-center justify-center">
                 <img v-if="currentSong.coverUrl" :src="getCoverUrl(currentSong.coverUrl)" 
                      class="w-16 h-16 rounded-full object-cover" 
                      :class="{'animate-spin-slow': currentSong.isPlaying}"
                      style="animation-direction: normal;" />
                 <div v-else class="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300">
                   <i class="fa-solid fa-music"></i>
                 </div>
               </div>
               <!-- 中心孔 -->
               <div class="absolute inset-0 flex items-center justify-center">
                 <div class="w-3 h-3 rounded-full bg-white border border-gray-300 z-10"></div>
               </div>
            </div>
            
            <div class="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
              <div class="font-bold text-base truncate" :title="currentSong.title">{{ currentSong.title || '未知歌曲' }}</div>
              <div class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <i class="fa-solid fa-music text-xs"></i>
                <div class="truncate" :title="currentSong.artist">{{ currentSong.artist || '未知艺术家' }}</div>
              </div>
              <div class="flex items-center gap-1 text-xs font-medium mt-0.5">
                <i :class="currentSong.isPlaying ? 'fa-solid fa-pause text-blue-400' : 'fa-solid fa-play text-gray-400'"></i>
                <span :class="currentSong.isPlaying ? 'text-blue-400' : 'text-gray-400'">{{ currentSong.isPlaying ? '播放中' : '已暂停' }}</span>
              </div>
            </div>
          </div>
        </div>
        <div id="nm-fixed-anchor" class="bg-gray-50 dark:bg-gray-800 rounded p-3 flex items-center gap-3" v-else>
           <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border-2 border-gray-300 dark:border-gray-600">
              <i class="fa-solid fa-music text-gray-400 text-xl"></i>
           </div>
           <div class="flex-1">
              <div class="text-sm text-gray-500 font-medium">无歌曲播放</div>
              <div class="text-xs text-gray-400 mt-1">请在网易云音乐播放歌曲</div>
           </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="grid grid-cols-2 gap-2">
          <button 
            @click="showCookiePopup" 
            class="nm-accent-btn text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-2"
          >
            <i class="fa-solid fa-key"></i>
            <span>设置 Cookie</span>
          </button>
          
          <button 
            @click="refreshSync" 
            class="nm-accent-btn text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-2"
          >
            <i class="fa-solid fa-sync-alt"></i>
            <span>刷新同步</span>
          </button>
          
          <button 
            @click="toggleFloatingBall" 
            class="nm-accent-btn text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-2 col-span-2"
          >
            <i :class="floatingBallVisible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
            <span>{{ floatingBallVisible ? '隐藏悬浮球' : '显示悬浮球' }}</span>
          </button>
        </div>
        
        <!-- 快速操作 -->
        <div class="border-t pt-2 mt-2">
          <div class="text-xs text-gray-500 mb-2">快速操作</div>
          <div class="grid grid-cols-3 gap-2">
            <button 
              @click="clearCookie" 
              class="nm-accent-btn text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-2 w-full"
            >
              <i class="fa-solid fa-trash mr-1"></i>
              清空 Cookie
            </button>
            <button 
              @click="checkLoginStatus" 
              class="nm-accent-btn text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-2 w-full"
            >
              <i class="fa-solid fa-check mr-1"></i>
              验证 Cookie 状态
            </button>
            <button 
              @click="refreshPlaybackNow" 
              class="nm-accent-btn text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-2 w-full"
            >
              <i class="fa-solid fa-sync-alt mr-1"></i>
              刷新播放信息
            </button>
          </div>
          <div class="text-xs text-gray-400 mt-1" v-if="cookieCheckFeedback">{{ cookieCheckFeedback }}</div>
        </div>
        
        <!-- 实时监听设置 -->
        <div class="border-t pt-2 mt-2">
          <div class="text-xs text-gray-500 mb-2">实时监听</div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <button @click="openMobileSetup" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">打开手机推送配置页</button>
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs whitespace-nowrap w-32">电脑端监听助手</span>
                  <label class="nm-switch">
                    <input type="checkbox" v-model="pcRealtimeEnabled" @change="enablePcRealtime(pcRealtimeEnabled)" />
                    <span class="nm-slider"></span>
                  </label>
                  <span class="text-xs whitespace-nowrap" :class="mobileListenerClass">{{ mobileListenerText }}</span>
                </div>
                <div class="text-xs text-gray-500">
                  <span v-if="pcRealtimeEnabled && helperRunning" class="text-green-600">已开启 (助手运行中)</span>
                  <span v-else-if="pcRealtimeEnabled && !helperRunning" class="text-red-500">开启中...</span>
                  <span v-else>已关闭</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 桥接地址设置 -->
        <div class="border-t pt-2 mt-2">
          <div class="text-xs text-gray-500 mb-2">后端设置</div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <label class="text-xs w-20">地址</label>
              <input v-model="bridgeUrl" placeholder="http://localhost:3000" class="nm-bridge-input flex-1 rounded border px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600" />
            </div>
            <div class="flex items-center gap-2 justify-end">
              <button @click="saveBridgeUrl" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">保存后端地址</button>
              <button @click="checkBackend" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">校验后端状态</button>
              <button @click="autoDetectBridge" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">自动探测</button>
            </div>
            <div class="text-xs text-gray-400" v-if="saveBackendFeedback">{{ saveBackendFeedback }}</div>
            <div class="text-xs text-gray-400" v-if="checkBackendFeedback">{{ checkBackendFeedback }}</div>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const connectionStatus = ref('未连接')
const currentSong = ref<any>(null)
const floatingBallVisible = ref(true)
const showCookieModal = ref(false)
const showDisclaimer = ref(false)
const consentEnabled = ref(false)
const canOpenBehaviorVerify = ref(false)
const countdownSeconds = ref(3)
let disclaimerTimer: ReturnType<typeof setInterval> | null = null
const bridgeUrl = ref(window.NeteaseMusicPlugin?.getSettings?.().neteaseMusicBaseUrl || 'http://localhost:3000')
const maskedCookie = ref('')
const qrImg = ref('')
const qrKey = ref('')
const qrStatus = ref('')
const qrChecking = ref(false)
const qrWriteProgress = ref(0)
let qrWriteTimer: ReturnType<typeof setInterval> | null = null
let qrCookieCheckTimer: ReturnType<typeof setInterval> | null = null
let qrPrevCookie: string = ''
const pcRealtimeEnabled = ref(false)
const helperRunning = ref(false)
const mobileListenerText = ref('手机推送：未知')
const mobileListenerClass = ref('text-gray-400')
let mobileStatusTimer: ReturnType<typeof setInterval> | null = null
const manualMusicU = ref('')
const showManualCookieSection = ref(false)
const showQrSection = ref(false)
let qrCheckTimer: any = null
const saveMusicUFeedback = ref('')
const saveBackendFeedback = ref('')
const checkBackendFeedback = ref('')
const cookieCheckFeedback = ref('')

// 更新状态函数 - 将被外部插件调用
function updateStatus(status: string) {
  connectionStatus.value = status
  try {
    const s = window.NeteaseMusicPlugin?.getSettings?.()
    if (s) {
      (s as any).neteaseMusicConnectionStatus = status
      window.NeteaseMusicPlugin?.saveSettings?.()
    }
  } catch {}
}

// 更新播放状态函数 - 将被外部插件调用  
function updatePlaybackStatus(playback: { title?: string; artist?: string; isPlaying?: boolean } | null) {
  if (!playback) {
    currentSong.value = null
    return
  }
  
  currentSong.value = {
    title: playback.title || '',
    artist: playback.artist || '',
    isPlaying: playback.isPlaying || false
  }
}

// 显示 Cookie 弹窗
async function showCookiePopup() {
  showCookieModal.value = true
  showDisclaimer.value = true
  consentEnabled.value = false
  countdownSeconds.value = 3
  try { qrPrevCookie = window.NeteaseMusicPlugin?.getCookie?.() || '' } catch { qrPrevCookie = '' }
  if (disclaimerTimer) {
    clearInterval(disclaimerTimer as any)
    disclaimerTimer = null
  }
  disclaimerTimer = setInterval(() => {
    if (countdownSeconds.value > 1) {
      countdownSeconds.value = countdownSeconds.value - 1
    } else {
      countdownSeconds.value = 0
      consentEnabled.value = true
      if (disclaimerTimer) {
        clearInterval(disclaimerTimer as any)
        disclaimerTimer = null
      }
    }
  }, 1000)
}

function confirmDisclaimer() {
  if (!consentEnabled.value) return
  showDisclaimer.value = false
}

function closeCookieModal() {
  showCookieModal.value = false
  showDisclaimer.value = false
  consentEnabled.value = false
  countdownSeconds.value = 3
  showManualCookieSection.value = false
  showQrSection.value = false
  qrImg.value = ''
  qrKey.value = ''
  qrStatus.value = ''
  qrWriteProgress.value = 0
  qrChecking.value = false
  if (qrCheckTimer) { clearInterval(qrCheckTimer); qrCheckTimer = null }
  if (qrWriteTimer) { clearInterval(qrWriteTimer as any); qrWriteTimer = null }
  if (qrCookieCheckTimer) { clearInterval(qrCookieCheckTimer as any); qrCookieCheckTimer = null }
  if (disclaimerTimer) {
    clearInterval(disclaimerTimer as any)
    disclaimerTimer = null
  }
}

// 刷新同步
function refreshSync() {
  if (window.MusicApi) {
    window.MusicApi.refreshSync?.()
    updateStatus('正在刷新同步...')
  }
}

// 已废弃的切换登录表单函数（保留为空实现以避免引用报错）
function toggleLoginForm() {}



async function startQrLogin() {
  try {
    if (showQrSection.value) {
      showQrSection.value = false
      qrImg.value = ''
      qrKey.value = ''
      qrStatus.value = ''
      qrWriteProgress.value = 0
      qrChecking.value = false
      if (qrCheckTimer) { clearInterval(qrCheckTimer); qrCheckTimer = null }
      if (qrWriteTimer) { clearInterval(qrWriteTimer as any); qrWriteTimer = null }
      return
    }
    qrStatus.value = '正在生成二维码...'
    const r = await fetch(`${bridgeUrl.value}/login/qr/start`, {
      method: 'POST',
      headers: buildAuthHeaders()
    })
    const j = await r.json()
    if (!r.ok) {
      qrStatus.value = '生成失败：' + (j.error || r.statusText)
      return
    }
    qrImg.value = j.qrimg || ''
    qrKey.value = j.key || ''
    showQrSection.value = true
    qrStatus.value = '请使用网易云App扫码确认'
    if (qrKey.value) {
      qrChecking.value = true
      qrCheckTimer = setInterval(async () => {
        try {
          const rr = await fetch(`${bridgeUrl.value}/login/qr/check`, {
            method: 'POST',
            headers: buildAuthHeaders(),
            body: JSON.stringify({ key: qrKey.value })
          })
          const jj = await rr.json()
          const code = jj.code
          if (code === 803) {
            if (qrCheckTimer) { clearInterval(qrCheckTimer); qrCheckTimer = null }
            qrChecking.value = false
            qrStatus.value = '扫码成功，正在写入 Cookie'
            qrWriteProgress.value = 5
            if (qrWriteTimer) {
              clearInterval(qrWriteTimer as any)
              qrWriteTimer = null
            }
            qrWriteTimer = setInterval(() => {
              if (qrWriteProgress.value < 95) {
                qrWriteProgress.value = Math.min(95, qrWriteProgress.value + 5)
              }
            }, 200)
            const gotCookie = extractQrCookie(jj)
            if (gotCookie) {
              window.MusicApi?.setCookie?.(gotCookie as string)
              window.MusicApi?.refreshSync?.()
              try { window.NeteaseMusicPlugin?.startService?.() } catch {}
              maskedCookie.value = String(gotCookie || '').replace(/=.*/g, '=***')
              updateStatus('二维码登录成功，Cookie 已更新')
              try { (window as any).toastr?.success?.('已获取到 Cookie') } catch {}
              showToastSuccess('Cookie 已写入')
              await checkLoginStatus()
              await checkMediaStatus()
              qrWriteProgress.value = 100
              startQrCookieCheck()
            } else {
              updateStatus('二维码登录成功，但未返回 Cookie，请手动粘贴 MUSIC_U')
              try { (window as any).toastr?.warning?.('已确认登录，但后端未返回 Cookie，请手动粘贴 MUSIC_U') } catch {}
              qrWriteProgress.value = 95
            }
            if (qrWriteTimer) {
              clearInterval(qrWriteTimer as any)
              qrWriteTimer = null
            }
            qrImg.value = ''
            qrKey.value = ''
            showQrSection.value = false
            closeCookieModal()
          } else if (code === 800) {
            // 过期
            if (qrCheckTimer) { clearInterval(qrCheckTimer); qrCheckTimer = null }
            qrChecking.value = false
            qrStatus.value = '二维码已过期，请重新生成'
          }
        } catch {}
      }, 2000)
    }
  } catch (e) {
    qrStatus.value = '生成失败'
  }
}

function buildAuthHeaders() {
  const h: any = { 'Content-Type': 'application/json' }
  const token = window.NeteaseMusicPlugin?.getSettings?.().neteaseMusicApiToken
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function showToastSuccess(message: string) {
  try {
    const ctx = (window as any).SillyTavern?.getContext?.()
    if (ctx && typeof ctx.showSuccessMessage === 'function') {
      ctx.showSuccessMessage(message)
    }
  } catch {}
  try { (window as any).toastr?.success?.(message) } catch {}
}

function extractQrCookie(jj: any) {
  const strCandidates = [
    jj?.cookie,
    jj?.body?.cookie,
    jj?.data?.cookie,
    jj?.body?.data?.cookie
  ]
  for (const c of strCandidates) {
    if (typeof c === 'string' && c.trim()) return c
  }
  const arrCandidates = [
    jj?.cookies,
    jj?.body?.cookies,
    jj?.data?.cookies,
    jj?.body?.data?.cookies
  ]
  for (const a of arrCandidates) {
    if (Array.isArray(a) && a.length) return a.join('; ')
  }
  return ''
}

function startQrCookieCheck() {
  if (qrCookieCheckTimer) {
    clearInterval(qrCookieCheckTimer as any)
    qrCookieCheckTimer = null
  }
  let ticks = 0
  qrCookieCheckTimer = setInterval(() => {
    ticks++
    let current = ''
    try { current = window.NeteaseMusicPlugin?.getCookie?.() || '' } catch {}
    try {
      if (!current && (window as any).MusicApi?.cookie) {
        current = (window as any).MusicApi.cookie
      }
    } catch {}
    const written = !!current && current !== qrPrevCookie
    if (written) {
      qrWriteProgress.value = 100
      if (qrWriteTimer) { clearInterval(qrWriteTimer as any); qrWriteTimer = null }
      clearInterval(qrCookieCheckTimer as any)
      qrCookieCheckTimer = null
      setTimeout(() => { qrWriteProgress.value = 0 }, 1500)
    } else if (ticks >= 20) {
      clearInterval(qrCookieCheckTimer as any)
      qrCookieCheckTimer = null
      qrWriteProgress.value = 95
    }
  }, 1000)
}

function manualCookie() {
  // 复用已有的 Cookie 输入弹窗
  (window as any).NeteaseMusicExtensionPanel?.showCookiePopup?.()
  try { (window as any).toastr?.info?.('提交成功后将提示“已获取到 Cookie”') } catch {}
}
function openManualCookie() {
  showManualCookieSection.value = !showManualCookieSection.value
}
function saveMusicU() {
  const v = (manualMusicU.value || '').trim()
  if (!v) return
  window.MusicApi?.setCookieFromInput?.(`MUSIC_U=${v}`)
  window.MusicApi?.refreshSync?.()
  try { (window as any).toastr?.success?.('MUSIC_U 保存成功') } catch {}
  saveMusicUFeedback.value = 'MUSIC_U 保存成功'
  setTimeout(() => { saveMusicUFeedback.value = '' }, 2500)
  checkLoginStatus()
}
// 切换悬浮球显示
function toggleFloatingBall() {
  if (floatingBallVisible.value) {
    window.FloatingBall?.hide?.()
  } else {
    window.FloatingBall?.create?.()
  }
  floatingBallVisible.value = !floatingBallVisible.value
}

// 已移除手动音乐窗口按钮，保留悬浮球点击展开

// 清空 Cookie
function clearCookie() {
  try {
    const s = window.NeteaseMusicPlugin?.getSettings?.()
    if (s) {
      ;(s as any).neteaseMusicCompanion = (s as any).neteaseMusicCompanion || {}
      ;(s as any).neteaseMusicCompanion.neteaseMusicCookie = ''
      window.NeteaseMusicPlugin?.saveSettings?.()
    }
  } catch {}
  if (window.MusicApi) {
    window.MusicApi.setCookie('')
    window.MusicApi.refreshSync?.()
  }
  maskedCookie.value = '(空)'
  updatePlaybackStatus(null)
  updateStatus('Cookie 已清空')
  showToastSuccess('Cookie 已清空')
}
function openMobileSetup() {
  const url = `${bridgeUrl.value}/mobile/setup`
  try { window.open(url, '_blank') } catch {}
}
async function enablePcRealtime(enable: boolean) {
  try {
    const r = await fetch(`${bridgeUrl.value}/media/enable`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ enable })
    })
    const j = await r.json()
    pcRealtimeEnabled.value = !!j.enabled
    helperRunning.value = !!j.helper
    updateStatus(pcRealtimeEnabled.value ? '已开启电脑端监听助手' : '已关闭电脑端监听助手')
    if (pcRealtimeEnabled.value) {
      try { window.NeteaseMusicPlugin?.startService?.() } catch {}
    }
  } catch {
    updateStatus('操作失败，请检查后端')
  }
}

async function checkLoginStatus() {
  try {
    const cookie = window.NeteaseMusicPlugin?.getCookie?.() || ''
    const r = await fetch(`${bridgeUrl.value}/login/status`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ cookie })
    })
    const j = await r.json()
    const ok =
      !!(j?.data?.account?.id) ||
      !!(j?.account?.id) ||
      !!(j?.profile?.userId) ||
      !!(j?.body?.profile?.userId) ||
      !!(j?.body?.account?.id) ||
      !!(j?.body?.data?.account?.id)
    if (r.ok && ok) {
      updateStatus('已连接到网易云音乐')
      cookieCheckFeedback.value = 'Cookie 有效，已连接到网易云音乐'
    } else {
      updateStatus('未连接到网易云音乐')
      const code = j?.code ?? j?.body?.code
      const msg = j?.msg ?? j?.message ?? j?.body?.message ?? ''
      cookieCheckFeedback.value = `Cookie 无效或未登录${code ? `（code=${code}）` : ''}${msg ? `：${msg}` : ''}`
    }
  } catch {
    updateStatus('未连接到网易云音乐')
    cookieCheckFeedback.value = '验证失败，后端不可用或网络错误'
  }
  setTimeout(() => { cookieCheckFeedback.value = '' }, 3000)
}

async function refreshPlaybackNow() {
  try {
    window.NeteaseMusicPlugin?.refreshPlayback?.()
    const cookie = window.NeteaseMusicPlugin?.getCookie?.() || ''
    const r = await fetch(`${bridgeUrl.value}/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    })
    const j = await r.json().catch(()=>null)
    if (j && !j.error) {
      updatePlaybackStatus(j)
    }
  } catch {}
}

async function saveBridgeUrl() {
  const url = (bridgeUrl.value || '').trim()
  if (!url) return
  window.NeteaseMusicPlugin?.setBaseUrl?.(url)
  window.NeteaseMusicPlugin?.refreshSync?.()
  updateStatus('后端地址已保存')
  saveBackendFeedback.value = '后端地址已保存'
  setTimeout(() => { saveBackendFeedback.value = '' }, 2500)
}

async function autoDetectBridge() {
  const candidates: string[] = []
  const cur = bridgeUrl.value?.trim()
  if (cur) candidates.push(cur)
  candidates.push('http://localhost:3000', 'http://127.0.0.1:3000')
  try {
    const controller = new AbortController()
    for (const base of candidates) {
      try {
        const timer = setTimeout(() => controller.abort(), 1500)
        const r = await fetch(`${base}/health`, { method: 'GET', signal: controller.signal })
        clearTimeout(timer)
        if (r.ok) {
          bridgeUrl.value = base
          updateStatus('已自动探测桥接服务')
          return
        }
      } catch {}
    }
    updateStatus('未探测到桥接服务')
  } catch {
    updateStatus('未探测到桥接服务')
  }
}

async function checkBackend() {
  const url = (bridgeUrl.value || '').trim()
  if (!url) {
    updateStatus('后端地址为空')
    checkBackendFeedback.value = '后端地址为空'
    setTimeout(() => { checkBackendFeedback.value = '' }, 2500)
    return
  }
  try {
    const r = await fetch(`${url}/health`, { method: 'GET' })
    if (r.ok) {
      updateStatus('后端连接正常')
      checkBackendFeedback.value = '后端连接正常'
      setTimeout(() => { checkBackendFeedback.value = '' }, 2500)
      await checkMediaStatus()
    } else {
      updateStatus('后端无连接')
      checkBackendFeedback.value = '后端无连接'
      setTimeout(() => { checkBackendFeedback.value = '' }, 2500)
    }
  } catch {
    updateStatus('后端无连接')
    checkBackendFeedback.value = '后端无连接'
    setTimeout(() => { checkBackendFeedback.value = '' }, 2500)
  }
}

async function checkMediaStatus() {
  const base = (bridgeUrl.value || '').trim()
  if (!base) { pcRealtimeEnabled.value = false; return }
  try {
    const hr = await fetch(`${base}/health`, { method: 'GET' })
    if (!hr.ok) { pcRealtimeEnabled.value = false; return }
    const r = await fetch(`${base}/media/status`, { method: 'GET' })
    if (!r.ok) { pcRealtimeEnabled.value = false; return }
    const j = await r.json().catch(()=>({enabled:false, helper:false}))
    pcRealtimeEnabled.value = !!j.enabled
    helperRunning.value = !!j.helper
  } catch {
    pcRealtimeEnabled.value = false
  }
}

function formatAge(ageMs: number) {
  const sec = Math.floor(ageMs / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m`
}

async function checkMobileListener() {
  const base = (bridgeUrl.value || '').trim()
  if (!base) {
    mobileListenerText.value = '手机推送：未知'
    mobileListenerClass.value = 'text-gray-400'
    return
  }
  try {
    const r = await fetch(`${base}/mobile/status`, { method: 'GET' })
    if (r.ok) {
      const j = await r.json().catch(() => null)
      if (j?.ok && j.hasData && typeof j.ageMs === 'number') {
        const age = j.ageMs as number
        if (j.active) {
          mobileListenerText.value = `手机推送：正常（${formatAge(age)}前）`
          mobileListenerClass.value = 'text-green-600'
        } else {
          mobileListenerText.value = `手机推送：可能断开（${formatAge(age)}前）`
          mobileListenerClass.value = 'text-yellow-600'
        }
        return
      }
      mobileListenerText.value = '手机推送：未收到'
      mobileListenerClass.value = 'text-gray-400'
      return
    }
  } catch {}
  try {
    const cookie = window.NeteaseMusicPlugin?.getCookie?.() || ''
    const r2 = await fetch(`${base}/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    })
    const j2 = await r2.json().catch(() => null)
    if (j2?.source === 'mobile' && typeof j2.lastUpdate === 'number') {
      const age = Math.max(0, Date.now() - j2.lastUpdate)
      mobileListenerText.value = age < 2 * 60 * 1000 ? `手机推送：正常（${formatAge(age)}前）` : `手机推送：可能断开（${formatAge(age)}前）`
      mobileListenerClass.value = age < 2 * 60 * 1000 ? 'text-green-600' : 'text-yellow-600'
      return
    }
    mobileListenerText.value = '手机推送：未收到'
    mobileListenerClass.value = 'text-gray-400'
  } catch {
    mobileListenerText.value = '手机推送：未知'
    mobileListenerClass.value = 'text-gray-400'
  }
}


// 令牌输入已移除

// 初始化时检查悬浮球状态
onMounted(() => {
  // 初始化状态（从设置恢复持久化的连接状态）
  try {
    const saved = window.NeteaseMusicPlugin?.getSettings?.()?.neteaseMusicConnectionStatus
    if (typeof saved === 'string' && saved) {
      connectionStatus.value = saved
    }
  } catch {}
  
  // 检查悬浮球是否可见
  floatingBallVisible.value = window.FloatingBall?.isVisible !== false
  
  // 初始化脱敏 Cookie
  const raw = window.NeteaseMusicPlugin?.getCookie?.() || ''
  maskedCookie.value = raw ? (raw.length <= 12 ? raw : `${raw.slice(0, 6)}****${raw.slice(-6)}`) : '(空)'
  
  // 监听状态更新事件
  window.addEventListener('netease-music-status-update', (event: any) => {
    if (event.detail) {
      updatePlaybackStatus(event.detail)
    }
  })
  pcRealtimeEnabled.value = false
  helperRunning.value = false
  enablePcRealtime(false)
  
  // 主动刷新一次，确保初始状态正确
   setTimeout(refreshPlaybackNow, 500)
   checkMobileListener()
   if (mobileStatusTimer) clearInterval(mobileStatusTimer as any)
   mobileStatusTimer = setInterval(checkMobileListener, 15000)
   
   // 移除 Panel 内部的自动刷新定时器，避免与全局轮询冲突导致闪烁
   // 全局 music_companion.ts 会负责轮询并通过事件通知 Panel 更新
   /*
   const autoRefreshTimer = setInterval(refreshPlaybackNow, 5000)
   onUnmounted(() => {
     clearInterval(autoRefreshTimer)
   })
   */
 })

onUnmounted(() => {
  window.removeEventListener('netease-music-status-update', () => {})
  if (mobileStatusTimer) {
    clearInterval(mobileStatusTimer as any)
    mobileStatusTimer = null
  }
})

function getCoverUrl(url: string) {
  if (!url) return '';
  // 确保 URL 是 HTTPS
  let secureUrl = url.replace(/^http:\/\//i, 'https://');
  // 安全拼接参数
  const separator = secureUrl.includes('?') ? '&' : '?';
  return `${secureUrl}${separator}param=140y140`;
}

// 导出函数供外部调用
defineExpose({
  updateStatus,
  updatePlaybackStatus,
  showCookiePopup,
  refreshSync
})
</script>

<style scoped>
.animate-spin-slow {
  animation: spin 8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.inline-drawer {
  margin-bottom: 1rem;
}
.nm-accent-btn {
  background-color: var(--nm-accent);
}
.nm-accent-btn:hover {
  filter: brightness(0.9);
}
</style>
<style scoped>
.nm-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.nm-modal {
  width: 28rem;
  max-width: 90vw;
  background: #1f2937;
  color: #fff;
  border-radius: 0.75rem;
  padding: 1rem;
  box-shadow: 0 6px 18px rgba(0,0,0,0.32);
}
.nm-danger-btn {
  background-color: #dc2626 !important;
  color: #fff !important;
}
</style>
