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
            <div v-if="showDisclaimer" class="flex flex-col gap-3">
              <div class="text-base font-semibold">🔒 安全免责声明</div>
              <div class="text-sm leading-6">
                <div>1. 本插件仅本地存储/使用网易云Cookie，不上传、不收集、不传输任何账号信息,插件是开源的大家可以随时查看风险；</div>
                <div>2. 官方发布渠道仅为Discord「类脑OAYEEEIA社区」，非官方版本请勿使用，或者你认为本插件具有你无法承担的风险，也请勿使用；</div>
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
              <div class="text-base font-semibold">手机号登录</div>
              <input
                v-model="phone"
                placeholder="手机号"
                :disabled="isLoggingIn"
                class="w-full rounded border px-2 py-1 text-sm text-black dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
              />
              <input
                v-model="password"
                type="password"
                placeholder="网易云密码"
                :disabled="isLoggingIn"
                class="w-full rounded border px-2 py-1 text-sm text-black dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
              />
              <input
                v-if="showCaptcha"
                v-model="captcha"
                placeholder="验证码(如需)"
                :disabled="isLoggingIn"
                class="w-full rounded border px-2 py-1 text-sm text-black dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
              />
              
              <div class="flex items-center gap-2" v-show="isLoggingIn">
                <div class="flex-1 h-2 rounded bg-gray-700 overflow-hidden">
                  <div class="h-2 rounded" :style="{ width: loginProgress + '%', backgroundColor: 'var(--nm-accent)' }"></div>
                </div>
                <div class="text-xs text-gray-300">{{ loginMessage }} {{ loginProgress }}%</div>
              </div>
              
              <div class="flex justify-end gap-2">
                <button
                  @click="loginWithCellphone"
                  :disabled="isLoggingIn"
                  class="nm-accent-btn text-white py-1.5 px-3 rounded text-sm disabled:opacity-60"
                >
                  登录并设置 Cookie
                </button>
                <button
                  @click="openBehaviorVerify"
                  :disabled="!canOpenBehaviorVerify"
                  class="nm-accent-btn text-white py-1.5 px-3 rounded text-sm disabled:opacity-60"
                >
                  打开行为验证页面
                </button>
                <button
                  @click="closeCookieModal"
                  class="nm-accent-btn text-white py-1.5 px-3 rounded text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 当前播放信息 -->
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3" v-if="currentSong">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
              <i class="fa-solid fa-music text-gray-500"></i>
            </div>
            <div class="flex-1">
              <div class="font-medium">{{ currentSong.title || '未知歌曲' }}</div>
              <div class="text-sm text-gray-600 dark:text-gray-400">{{ currentSong.artist || '未知艺术家' }}</div>
              <div class="text-xs mt-1">
                <span class="inline-flex items-center gap-1">
                  <i :class="currentSong.isPlaying ? 'fa-solid fa-play text-green-500' : 'fa-solid fa-pause text-yellow-500'"></i>
                  <span>{{ currentSong.isPlaying ? '播放中' : '已暂停' }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3 text-center text-gray-500" v-else>
          <i class="fa-solid fa-music mb-1"></i>
          <div class="text-sm">无歌曲播放</div>
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
          <div class="flex flex-wrap gap-1">
            <button 
              @click="toggleMusicWindow" 
              class="nm-accent-btn text-white py-1 px-2 rounded text-xs"
            >
              <i class="fa-solid fa-window-maximize mr-1"></i>
              音乐窗口
            </button>
            <button 
              @click="clearCookie" 
              class="nm-accent-btn text-white py-1 px-2 rounded text-xs"
            >
              <i class="fa-solid fa-trash mr-1"></i>
              清空 Cookie
            </button>
          </div>
        </div>
        
        <!-- 桥接地址设置 -->
        <div class="border-t pt-2 mt-2">
          <div class="text-xs text-gray-500 mb-2">桥接设置</div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <label class="text-xs w-20">地址</label>
              <input v-model="bridgeUrl" placeholder="http://localhost:3000" class="flex-1 rounded border px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600" />
              <button @click="saveBridgeUrl" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">保存并校验后端</button>
              <button @click="autoDetectBridge" class="nm-accent-btn text-white py-1 px-2 rounded text-xs">自动探测</button>
            </div>
            <div class="text-xs text-gray-500">当前 Cookie（脱敏）：<span class="font-mono">{{ maskedCookie }}</span></div>
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
const phone = ref('')
const password = ref('')
const captcha = ref('')
const showCaptcha = ref(false)
const canOpenBehaviorVerify = ref(false)
const countdownSeconds = ref(3)
let disclaimerTimer: ReturnType<typeof setInterval> | null = null
const isLoggingIn = ref(false)
const loginProgress = ref(0)
const loginMessage = ref('')
let loginTimer: ReturnType<typeof setInterval> | null = null
const bridgeUrl = ref(window.NeteaseMusicPlugin?.getSettings?.().neteaseMusicBaseUrl || 'http://localhost:3000')
const maskedCookie = ref('')

// 更新状态函数 - 将被外部插件调用
function updateStatus(status: string) {
  connectionStatus.value = status
}

// 更新播放状态函数 - 将被外部插件调用  
function updatePlaybackStatus(playback: { title?: string; artist?: string; isPlaying?: boolean } | null) {
  if (!playback) {
    currentSong.value = null
    connectionStatus.value = '未连接到网易云音乐'
    return
  }
  
  currentSong.value = {
    title: playback.title || '',
    artist: playback.artist || '',
    isPlaying: playback.isPlaying || false
  }
  
  if (playback.title && playback.artist) {
    connectionStatus.value = `${playback.isPlaying ? '▶️' : '⏸️'} ${playback.title} - ${playback.artist}`
  } else {
    connectionStatus.value = '正在同步播放状态...'
  }
}

// 显示 Cookie 弹窗
async function showCookiePopup() {
  showCookieModal.value = true
  showDisclaimer.value = true
  consentEnabled.value = false
  countdownSeconds.value = 3
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
  phone.value = ''
  password.value = ''
  countdownSeconds.value = 3
  if (disclaimerTimer) {
    clearInterval(disclaimerTimer as any)
    disclaimerTimer = null
  }
  isLoggingIn.value = false
  loginProgress.value = 0
  loginMessage.value = ''
  if (loginTimer) {
    clearInterval(loginTimer as any)
    loginTimer = null
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

async function loginWithCellphone() {
  if (!phone.value || !password.value) {
    updateStatus('请输入手机号与密码')
    return
  }
  
  // 在开始登录前校验后端健康状态
  async function checkBridgeHealth(): Promise<boolean> {
    try {
      const base = window.NeteaseMusicPlugin?.getSettings?.().neteaseMusicBaseUrl || window.MusicApi?.baseUrl || 'http://localhost:3000'
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      const r = await fetch(`${base}/health`, { method: 'GET', signal: controller.signal })
      clearTimeout(timer)
      return r.ok
    } catch {
      return false
    }
  }
  
  let healthy = await checkBridgeHealth()
  if (!healthy) {
    updateStatus('未连接到桥接服务，正在尝试自动探测...')
    const detected = await window.NeteaseMusicPlugin?.autoDetectBaseUrl?.()
    if (detected) {
      bridgeUrl.value = detected
      healthy = await checkBridgeHealth()
    }
  }
  if (!healthy) {
    updateStatus('后端未连接，请先启动桥接服务')
    loginMessage.value = '后端未连接'
    return
  }
  
  if (isLoggingIn.value) return
  isLoggingIn.value = true
  loginProgress.value = 5
  loginMessage.value = '开始登录'
  if (loginTimer) {
    clearInterval(loginTimer as any)
    loginTimer = null
  }
  loginTimer = setInterval(() => {
    if (loginProgress.value < 85) {
      loginProgress.value = Math.min(85, loginProgress.value + 5)
    }
  }, 300)
  
  // 第一次不带验证码尝试登录
  let ok = await window.NeteaseMusicPlugin?.loginWithCellphone?.(phone.value, password.value)
  if (!ok) {
    const code = window.MusicApi?.lastErrorCode
    const msg = window.MusicApi?.lastErrorMsg || ''
    if ((code === 415) || /captcha/i.test(msg)) {
      showCaptcha.value = true
      loginMessage.value = '需要验证码，请输入后重试'
      ok = await window.MusicApi?.loginWithCellphone?.(phone.value, password.value, captcha.value) || false
    } else if ((code === 8821) || /行为验证码/.test(msg)) {
      showCaptcha.value = false
      const url = window.MusicApi?.lastRedirectUrl
      loginMessage.value = '需要行为验证码验证，请在弹出的页面完成后重试'
      if (url) {
        canOpenBehaviorVerify.value = true
        try { window.open(url, '_blank') } catch {}
      }
      ok = false
    } else {
      ok = await window.MusicApi?.loginWithCellphone?.(phone.value, password.value) || false
    }
  }
  ok = ok || false
    || false
  if (ok) {
    loginMessage.value = '登录成功，正在保存 Cookie'
    loginProgress.value = 100
    updateStatus('手机号登录成功，Cookie 已更新')
    window.NeteaseMusicPlugin?.refreshSync?.()
    isLoggingIn.value = false
    if (loginTimer) {
      clearInterval(loginTimer as any)
      loginTimer = null
    }
    closeCookieModal()
  } else {
    loginMessage.value = '登录失败，请检查账号和密码'
    isLoggingIn.value = false
    if (loginTimer) {
      clearInterval(loginTimer as any)
      loginTimer = null
    }
    loginProgress.value = 0
    updateStatus('手机号登录失败，请检查账号和密码')
  }
}

function openBehaviorVerify() {
  const url = window.MusicApi?.lastRedirectUrl
  if (url) {
    try { window.open(url, '_blank') } catch {}
  } else {
    updateStatus('当前无行为验证链接')
  }
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

// 切换音乐窗口显示
function toggleMusicWindow() {
  window.MusicWindow?.toggle?.()
}

// 清空 Cookie
function clearCookie() {
  if (window.MusicApi) {
    window.MusicApi.setCookie('')
    window.MusicApi.refreshSync?.()
    updateStatus('Cookie 已清空')
  }
}

async function saveBridgeUrl() {
  const url = (bridgeUrl.value || '').trim()
  if (!url) return
  window.NeteaseMusicPlugin?.setBaseUrl?.(url)
  window.NeteaseMusicPlugin?.refreshSync?.()
  try {
    const r = await fetch(`${url}/health`, { method: 'GET' })
    if (r.ok) {
      updateStatus('后端连接正常')
    } else {
      updateStatus('后端无连接')
    }
  } catch {
    updateStatus('后端无连接')
  }
}

async function autoDetectBridge() {
  const url = await window.NeteaseMusicPlugin?.autoDetectBaseUrl?.()
  if (url) {
    bridgeUrl.value = url
    updateStatus('已自动探测桥接服务')
  } else {
    updateStatus('未探测到桥接服务')
  }
}

// 令牌输入已移除

// 初始化时检查悬浮球状态
onMounted(() => {
  // 初始化状态
  updateStatus('初始化中...')
  
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
})

onUnmounted(() => {
  window.removeEventListener('netease-music-status-update', () => {})
})

// 导出函数供外部调用
defineExpose({
  updateStatus,
  updatePlaybackStatus,
  showCookiePopup,
  refreshSync
})
</script>

<style scoped>
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
  background: rgba(0,0,0,0.5);
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
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}
</style>
