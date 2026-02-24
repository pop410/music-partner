import { createApp } from 'vue';
import Panel from './Panel.vue';
import "./styles/netease-music.css";

// Vue相关导入
declare var $: any;
declare const toastr: any;

interface SillyTavernContext {
  extensionSettings: { [key: string]: any; neteaseMusicCookie?: string; };
  saveSettings: () => void;
  showSuccessMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
  showWarningMessage: (message: string) => void;
  showInfoMessage: (message: string) => void;
  showInputMessage: (message: string, defaultValue: string, title: string) => Promise<{ value: string } | null>;
  registerPromptInjector: (name: string, injector: () => string) => void;
  characterId: string | null; // Add characterId
  eventSource?: {
    on: (event: string, callback: (...args: any[]) => void) => void;
  };
  event_types?: {
    SETTINGS_UPDATED?: string;
    CHAT_CHANGED?: string;
    [key: string]: string | undefined;
  };
  // Add other context properties as needed
}

interface SillyTavernEventTypes {
  APP_READY: 'app_ready';
  SETTINGS_UPDATED: 'settings_updated';
  CHAT_CHANGED: 'chat_changed'; // Add CHAT_CHANGED
  // Add other event types as needed
}

interface SillyTavernEventSource {
  on: (event: string, callback: (...args: any[]) => void) => void;
  // Add other eventSource methods as needed
}

interface SillyTavern {
  getContext: () => SillyTavernContext;
  eventSource: SillyTavernEventSource;
  event_types: SillyTavernEventTypes; // Use the new interface
  // Add other SillyTavern properties as needed
}

declare global {
  interface Window {
    SillyTavern?: SillyTavern;
    toastr: {
      success: (message: string) => void;
      error: (message: string) => void;
      info: (message: string) => void;
      warning: (message: string) => void;
    };
    NeteaseMusicPlugin?: {
      startService: () => void;
      stopService: (autoPaused?: boolean) => void;
      setCookie: (cookie: string) => void;
      getServiceStatus: () => boolean;
      getCookie: () => string;
      getSettings: () => any;
      saveSettings: () => void;
      refreshSync: () => void;
      showCookiePopup: () => void;
      loginWithCellphone: (phone: string, password: string) => Promise<boolean>;
      createFloatingBall: () => void;
      hideFloatingBall: () => void;
      refreshPlayback: (intervalMs?: number) => void;
    };
    NeteaseMusicExtensionPanel?: {
      updateStatus: (status: string) => void;
      updatePlaybackStatus: (playback: any) => void;
      showCookiePopup: () => void;
      refreshSync: () => void;
    };
    MusicApi?: any;
    FloatingBall?: any;
    MusicWindow?: any;
    SyncStatusBar?: any;
  }
}

// ------------------------------------------------------------------------------------------------
// 1. 类型定义与 API 封装 (MusicApi)
// ------------------------------------------------------------------------------------------------

interface SongInfo {
  id: number;
  name: string;
  artist: string;
  coverUrl: string;
  duration: number; // 毫秒
  lrc?: string; // 原始内容
  lrcLines?: LyricLine[]; // 解析后的行
}

interface LyricLine {
  time: number; // 毫秒
  text: string;
}

// 缓存接口
interface MusicCacheData {
  lyrics: { [id: number]: string };
  images: { [id: number]: string };
  lastUpdated: number;
}

const CACHE_KEY = 'music_companion_cache';

const MusicCache = {
  data: {
    lyrics: {},
    images: {},
    lastUpdated: Date.now()
  } as MusicCacheData,

  load() {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      try {
        this.data = JSON.parse(stored);
      } catch (e) {
        console.error('[Music] Cache load failed', e);
      }
    }
  },

  save() {
    this.data.lastUpdated = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(this.data));
  },

  getLyric(id: number): string | undefined {
    return this.data.lyrics[id];
  },

  setLyric(id: number, content: string) {
    this.data.lyrics[id] = content;
    this.save();
  },
  
  getImage(id: number): string | undefined {
    return this.data.images[id];
  },

  setImage(id: number, url: string) {
    this.data.images[id] = url;
    this.save();
  }
};

// ------------------------------------------------------------------------------------------------
// 2.1 图片缓存管理器 (IndexedDB)
// ------------------------------------------------------------------------------------------------

const ImageCache = {
  db: null as IDBDatabase | null,
  enabled: true,
  
  // 检查是否支持 IndexedDB
  supportsIndexedDB(): boolean {
    return 'indexedDB' in window;
  },
  
  // 初始化数据库
  async init(): Promise<boolean> {
    if (!this.supportsIndexedDB()) {
      console.warn('[Music] IndexedDB not supported, image cache disabled');
      this.enabled = false;
      return false;
    }
    
    return new Promise((resolve) => {
      const request = indexedDB.open('netease-music-images', 1);
      
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('images')) {
          const store = db.createObjectStore('images', { keyPath: 'songId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      
      request.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        this.enabled = true;
        console.log('[Music] Image cache initialized');
        resolve(true);
      };
      
      request.onerror = (e) => {
        console.error('[Music] Failed to initialize image cache', e);
        this.enabled = false;
        resolve(false);
      };
    });
  },
  
  // 保存图片到缓存
  async saveImage(songId: number, imageBlob: Blob): Promise<boolean> {
    if (!this.enabled || !this.db) {
      console.warn('[Music] Image cache disabled or not initialized');
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const record = {
          songId,
          image: imageBlob,
          timestamp: Date.now(),
          size: imageBlob.size
        };
        const request = store.put(record);
        
        request.onsuccess = () => {
          console.log(`[Music] Image cached for song ${songId}, size: ${imageBlob.size} bytes`);
          resolve(true);
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to cache image', e);
          resolve(false);
        };
      } catch (error) {
        console.error('[Music] Error saving image to cache', error);
        resolve(false);
      }
    });
  },
  
  // 从缓存获取图片
  async getImage(songId: number): Promise<Blob | null> {
    if (!this.enabled || !this.db) {
      return null;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(songId);
        
        request.onsuccess = () => {
          const result = request.result;
          if (result && result.image instanceof Blob) {
            console.log(`[Music] Image cache hit for song ${songId}`);
            resolve(result.image);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to retrieve image from cache', e);
          resolve(null);
        };
      } catch (error) {
        console.error('[Music] Error retrieving image from cache', error);
        resolve(null);
      }
    });
  },
  
  // 检查图片是否在缓存中
  async hasImage(songId: number): Promise<boolean> {
    if (!this.enabled || !this.db) {
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(songId);
        
        request.onsuccess = () => {
          resolve(!!request.result);
        };
        
        request.onerror = () => {
          resolve(false);
        };
      } catch (error) {
        resolve(false);
      }
    });
  },
  
  // 清理过期缓存（超过30天）
  async cleanup(expiryDays: number = 30): Promise<number> {
    if (!this.enabled || !this.db) {
      return 0;
    }
    
    return new Promise((resolve) => {
      try {
        const expiryTime = Date.now() - (expiryDays * 24 * 60 * 60 * 1000);
        const transaction = this.db!.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(expiryTime);
        const request = index.openCursor(range);
        let deletedCount = 0;
        
        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            console.log(`[Music] Cleaned ${deletedCount} expired images from cache`);
            resolve(deletedCount);
          }
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to cleanup cache', e);
          resolve(0);
        };
      } catch (error) {
        console.error('[Music] Error cleaning up cache', error);
        resolve(0);
      }
    });
  },
  
  // 获取缓存大小（字节）
  async getCacheSize(): Promise<number> {
    if (!this.enabled || !this.db) {
      return 0;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        let totalSize = 0;
        
        const request = store.openCursor();
        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor) {
            const record = cursor.value;
            totalSize += record.size || 0;
            cursor.continue();
          } else {
            resolve(totalSize);
          }
        };
        
        request.onerror = () => {
          resolve(0);
        };
      } catch (error) {
        resolve(0);
      }
    });
  },
  
  // 清除所有缓存
  async clearAll(): Promise<boolean> {
    if (!this.enabled || !this.db) {
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const request = store.clear();
        
        request.onsuccess = () => {
          console.log('[Music] Image cache cleared');
          resolve(true);
        };
        
        request.onerror = (e) => {
          console.error('[Music] Failed to clear cache', e);
          resolve(false);
        };
      } catch (error) {
        console.error('[Music] Error clearing cache', error);
        resolve(false);
      }
    });
  }
};

// 网易云 API 客户端 (连接本地 Bridge)
const MusicApi = {
  baseUrl: 'http://localhost:3000', // 默认连接本地桥接服务
  cookie: '', // 用户 Cookie，可通过设置界面或命令输入
  isServiceActive: false, // New state to track if service is active
  autoPaused: false, // New state to track if service was auto-paused
  lastErrorCode: undefined as number | undefined,
  lastErrorMsg: '' as string,
  lastRedirectUrl: '' as string,
  setCookieFromInput(input: string) {
    const parsed = CookieParser.extract(input);
    if (!parsed) {
      if (window.SillyTavern && window.SillyTavern.getContext) {
        const context = window.SillyTavern.getContext();
        context.showErrorMessage('未能从输入中解析出有效 Cookie');
      } else {
        toastr.error('未能从输入中解析出有效 Cookie');
      }
      return false;
    }
    this.setCookie(parsed);
    return true;
  },

  loadCookie() {
    if (window.SillyTavern && window.SillyTavern.getContext) {
      const context = window.SillyTavern.getContext();
      // Assuming settings are stored under 'neteaseMusicCompanion' key
      if (context && context.extensionSettings && context.extensionSettings.neteaseMusicCompanion?.neteaseMusicCookie) {
        this.cookie = context.extensionSettings.neteaseMusicCompanion.neteaseMusicCookie;
        console.log('[Music] Cookie loaded from settings.');
      }
    }
  },

  async request(endpoint: string, data: any = {}) {
    if (!this.isServiceActive) {
      // If service is not active, do not proceed with the request.
      // Warnings will be handled by the service activation logic.
      return null;
    }

    if (!this.cookie) {
      if (window.SillyTavern && window.SillyTavern.getContext) {
        const context = window.SillyTavern.getContext();
        context.showWarningMessage('请先在扩展设置中设置网易云音乐 Cookie。');
      } else {
        toastr.warning('请先在扩展设置中设置网易云音乐 Cookie。');
      }
      return null; // Prevent further execution without cookie
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...data, cookie: this.cookie })
      });
      return await response.json();
    } catch (e) {
      console.error(`[Music] API Error ${endpoint}`, e);
      if (window.SillyTavern && window.SillyTavern.getContext) {
        const context = window.SillyTavern.getContext();
        context.showErrorMessage(`连接音乐服务失败: ${endpoint}`);
      } else {
        toastr.error(`连接音乐服务失败: ${endpoint}`);
      }
      return null;
    }
  },
  
  async autoDetectBaseUrl(candidates?: string[]) {
    const list = candidates ?? [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ];
    for (const url of list) {
      try {
        const res = await fetch(`${url}/health`, { method: 'GET' });
        if (res.ok) {
          this.baseUrl = url;
          console.log(`[Music] Bridge detected at ${url}`);
          return url;
        }
      } catch {
        // continue
      }
    }
    console.warn('[Music] Bridge auto-detect failed, using default baseUrl:', this.baseUrl);
    return null;
  },
  
  setBaseUrl(url: string) {
    if (!url) return;
    this.baseUrl = url;
    const settings = getSettings();
    settings.neteaseMusicBaseUrl = url;
    saveSettings();
    console.log('[Music] Base URL set to', url);
  },

  // 搜索歌曲
  async search(keyword: string): Promise<SongInfo | null> {
    const res = await this.request('/search', { keywords: keyword, limit: 1 });
    if (res && res.result && res.result.songs && res.result.songs.length > 0) {
      const song = res.result.songs[0];
      return {
        id: song.id,
        name: song.name,
        artist: song.ar.map((a: any) => a.name).join('/'),
        coverUrl: song.al.picUrl,
        duration: song.dt,
      };
    }
    return null;
  },

  // 获取歌词
  async getLyric(id: number): Promise<string> {
    // 检查缓存
    const cached = MusicCache.getLyric(id);
    if (cached) {
      console.log(`[Music] 使用缓存歌词: ${id}`);
      return cached;
    }

    const res = await this.request('/lyric', { id });
    if (res && res.lrc && res.lrc.lyric) {
      const lrc = res.lrc.lyric;
      MusicCache.setLyric(id, lrc); // 存入缓存
      return lrc;
    }
    return "[00:00.00] 暂无歌词";
  },

  // 获取 MP3 URL
  async getSongUrl(id: number): Promise<string | null> {
    const res = await this.request('/url', { id });
    if (res && res.data && res.data[0] && res.data[0].url) {
      return res.data[0].url;
    }
    return null; // 或者返回官方链接尝试直接播放
  },
  
  // 设置 Cookie
  setCookie(cookie: string) {
    this.cookie = cookie;
    if (window.SillyTavern && window.SillyTavern.getContext) {
      const context = window.SillyTavern.getContext();
      if (context && context.extensionSettings) {
        // Ensure the neteaseMusicCompanion object exists
        if (!context.extensionSettings.neteaseMusicCompanion) {
          context.extensionSettings.neteaseMusicCompanion = {};
        }
        context.extensionSettings.neteaseMusicCompanion.neteaseMusicCookie = cookie;
        context.saveSettings();
      }
    }
    toastr.success('网易云 Cookie 已设置');
  },

  // 刷新同步状态，例如在 Cookie 更新后
  refreshSync() {
    this.loadCookie(); // 重新加载 Cookie
    if (this.isServiceActive) {
      // 如果服务是激活状态，重新启动 PlayerState 轮询以应用新 Cookie
      PlayerState.init();
      toastr.info('网易云音乐服务已刷新。');
    }
  },

  // 获取当前播放状态（来自 Windows 媒体控制）
  async getCurrentPlayback(): Promise<{
    isPlaying: boolean;
    title?: string;
    artist?: string;
    album?: string;
    neteaseId?: number;
    duration?: number;
    coverUrl?: string;
  } | null> {
    if (!this.isServiceActive) {
      return null;
    }
    const res = await this.request('/current');
    if (res && !res.error) {
      return res;
    }
    return null;
  },

  async loginWithCellphone(phone: string, password: string, captcha?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/login/cellphone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getSettings().neteaseMusicApiToken
            ? { Authorization: `Bearer ${getSettings().neteaseMusicApiToken}` }
            : {}),
        },
        body: JSON.stringify({ phone, password, captcha }),
      });
      const res = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = res?.error || res?.msg || '后端错误，请稍后重试';
        this.lastErrorCode = res?.code ?? res?.body?.code;
        this.lastErrorMsg = String(msg || '');
        this.lastRedirectUrl = String(res?.body?.redirectUrl || res?.redirectUrl || '');
        if (window.toastr?.error) window.toastr.error(msg);
        return false;
      }
      const cookie = res?.cookie || res?.body?.cookie || res?.data?.cookie || '';
      if (res && (res.code === 200 || res?.body?.code === 200) && cookie) {
        this.setCookie(cookie);
        if (window.toastr?.success) window.toastr.success('手机号登录成功，Cookie 已更新。');
        this.lastErrorCode = undefined;
        this.lastErrorMsg = '';
        this.lastRedirectUrl = '';
        return true;
      }
      const errorMessage =
        res?.msg || res?.body?.msg || '手机号登录失败，请检查账号和密码。';
      this.lastErrorCode = res?.code ?? res?.body?.code;
      this.lastErrorMsg = String(errorMessage || '');
      this.lastRedirectUrl = String(res?.body?.redirectUrl || res?.redirectUrl || '');
      if (window.toastr?.error) window.toastr.error(errorMessage);
      return false;
    } catch (e) {
      console.error('[Music] Cellphone login error', e);
       this.lastErrorCode = undefined;
       this.lastErrorMsg = '请求失败';
       this.lastRedirectUrl = '';
      if (window.toastr?.error) window.toastr.error('手机号登录请求失败。');
      return false;
    }
  },
};

const CookieParser = {
  extract(input: string): string | null {
    if (!input) return null;
    let text = input.trim();
    try {
      const maybeUrl = new URL(text);
      const hash = new URLSearchParams(maybeUrl.hash.replace(/^#/, ''));
      const query = new URLSearchParams(maybeUrl.search);
      const fromParam = hash.get('cookie') || query.get('cookie');
      if (fromParam) {
        try {
          text = decodeURIComponent(fromParam);
        } catch {
          text = fromParam;
        }
      }
    } catch {
      // not a URL
    }
    if (text.toLowerCase().startsWith('cookie:')) {
      text = text.slice(7).trim();
    }
    const keys = ['MUSIC_U', 'NMTID', 'NMC_A2', 'NMC_A2ID', '_ntes_nuid'];
    const found: string[] = [];
    for (const key of keys) {
      const re = new RegExp(`${key}=([^;\\s]+)`);
      const m = text.match(re);
      if (m) {
        found.push(`${key}=${m[1]}`);
      }
    }
    if (found.length > 0) {
      return found.join('; ');
    }
    if (/=/.test(text) && /;/.test(text)) {
      return text;
    }
    return null;
  }
};

// ------------------------------------------------------------------------------------------------
// 插件核心逻辑
// ------------------------------------------------------------------------------------------------

const MODULE_NAME = 'neteaseMusicCompanion';
let context: SillyTavernContext | null = null;
let pluginInitialized = false;

function getContext(): SillyTavernContext {
  if (!context) {
    if (window.SillyTavern && window.SillyTavern.getContext) {
      try {
        context = window.SillyTavern.getContext();
        console.log('[Music] Using real SillyTavern context');
      } catch (e) {
        console.warn('[Music] Failed to get SillyTavern context, falling back to mock', e);
        context = createMockContext();
      }
    } else {
      console.warn('[Music] SillyTavern not available, using mock context');
      context = createMockContext();
    }
  }
  return context;
}

function createMockContext(): SillyTavernContext {
  const mockSettings: { [key: string]: any } = {};
  const moduleSettingsKey = 'neteaseMusicCompanionSettings';
  
  // Load settings from localStorage
  const loadSettings = () => {
    try {
      const saved = localStorage.getItem(moduleSettingsKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(mockSettings, parsed);
      }
    } catch (e) {
      console.error('[Music] Failed to load settings from localStorage', e);
    }
  };
  
  // Save settings to localStorage
  const saveSettings = () => {
    try {
      localStorage.setItem(moduleSettingsKey, JSON.stringify(mockSettings));
    } catch (e) {
      console.error('[Music] Failed to save settings to localStorage', e);
    }
  };
  
  const saveSettingsDebounced = saveSettings;
  
  loadSettings();
  
  return {
    extensionSettings: {
      neteaseMusicCompanion: mockSettings
    },
    saveSettings,
    saveSettingsDebounced,
    showSuccessMessage: (message: string) => {
      console.log(`[Music] Success: ${message}`);
      if (window.toastr && window.toastr.success) {
        window.toastr.success(message);
      } else {
        alert(`Success: ${message}`);
      }
    },
    showErrorMessage: (message: string) => {
      console.error(`[Music] Error: ${message}`);
      if (window.toastr && window.toastr.error) {
        window.toastr.error(message);
      } else {
        alert(`Error: ${message}`);
      }
    },
    showWarningMessage: (message: string) => {
      console.warn(`[Music] Warning: ${message}`);
      if (window.toastr && window.toastr.warning) {
        window.toastr.warning(message);
      } else {
        alert(`Warning: ${message}`);
      }
    },
    showInfoMessage: (message: string) => {
      console.log(`[Music] Info: ${message}`);
      if (window.toastr && window.toastr.info) {
        window.toastr.info(message);
      } else {
        alert(`Info: ${message}`);
      }
    },
    showInputMessage: async (message: string, defaultValue: string, title: string) => {
      console.log(`[Music] Input requested: ${title} - ${message}`);
      const value = prompt(`${title}\n\n${message}`, defaultValue);
      return value !== null ? { value } : null;
    },
    registerPromptInjector: (name: string, injector: () => string) => {
      console.log(`[Music] Mock registerPromptInjector called for ${name}`);
      // No-op in mock context
    },
    characterId: null,
    eventSource: {
      on: (event: string, callback: (...args: any[]) => void) => {
        console.log(`[Music] Mock eventSource.on(${event}) registered`);
        // No-op in mock context
      }
    },
    event_types: {
      SETTINGS_UPDATED: 'settings_updated',
      CHAT_CHANGED: 'chat_changed'
    }
  };
}

function getSettings() {
  const ctx = getContext();
  if (!ctx.extensionSettings[MODULE_NAME]) {
    ctx.extensionSettings[MODULE_NAME] = {
      neteaseMusicServiceEnabled: false,
      neteaseMusicCookie: '',
      floatingBallEnabled: false,
      syncInterval: 3000,
      autoPaused: false, // Add autoPaused setting
      neteaseMusicBaseUrl: 'http://localhost:3000',
      neteaseMusicApiToken: '',
    };
  }
  return ctx.extensionSettings[MODULE_NAME];
}

function saveSettings() {
  const ctx = getContext();
  if (ctx.saveSettingsDebounced) {
    ctx.saveSettingsDebounced();
  } else if (ctx.saveSettings) {
    ctx.saveSettings();
  } else {
    console.warn('[Music] No saveSettings method available in context');
  }
}

function startMusicService() {
  if (MusicApi.isServiceActive) {
    console.log('[Music] Service already active.');
    return;
  }

  MusicApi.loadCookie(); // Load cookie from settings
  if (!MusicApi.cookie) {
    getContext().showWarningMessage('网易云音乐服务未启动：请先设置 Cookie。');
    return;
  }

  MusicApi.isServiceActive = true;
  MusicApi.autoPaused = false; // Reset autoPaused when service is explicitly started
  PlayerState.init(); // This will start polling
  getContext().registerPromptInjector('neteaseMusic', musicPromptGenerator);
  getContext().registerPromptInjector('neteaseMusicText', musicPromptTextGenerator);
  getContext().showSuccessMessage('网易云音乐服务已启动。');
  console.log('[Music] Service started.');
}

function stopMusicService(autoPaused: boolean = false) {
  if (!MusicApi.isServiceActive) {
    console.log('[Music] Service already inactive.');
    return;
  }

  MusicApi.isServiceActive = false;
  MusicApi.autoPaused = autoPaused; // Set autoPaused flag
  if (PlayerState.pollingInterval) {
    clearInterval(PlayerState.pollingInterval);
    PlayerState.pollingInterval = null;
  }
  // Unregister prompt injector if possible (SillyTavern API might not have this directly)
  // For now, the injector will just return empty string if service is inactive.
  
  if (!autoPaused) {
    getContext().showInfoMessage('网易云音乐服务已停止。');
  }
  console.log('[Music] Service stopped.');
}

async function initializePlugin() {
  if (pluginInitialized) {
    return;
  }
  console.log('[Music] Initializing Netease Music Companion plugin...');
  context = getContext(); // Initialize context early

  // Load initial settings
  const settings = getSettings();
  MusicApi.cookie = settings.neteaseMusicCookie || '';
  MusicApi.autoPaused = settings.autoPaused || false; // Load autoPaused state
  if (settings.neteaseMusicBaseUrl) {
    MusicApi.baseUrl = settings.neteaseMusicBaseUrl;
  }
  await MusicApi.autoDetectBaseUrl();

  // Initialize ImageCache
  await ImageCache.init();

  // Register prompt injector (it will only return data if service is active)
  if (context.registerPromptInjector) {
    context.registerPromptInjector('neteaseMusic', musicPromptGenerator);
    context.registerPromptInjector('neteaseMusicText', musicPromptTextGenerator);
  } else {
    console.warn('[Music] registerPromptInjector not available, skipping prompt injection registration.');
  }
  
  // Bind APP_READY to ensure panel initializes as soon as app is ready
  if ((window as any).SillyTavern?.eventSource && (window as any).SillyTavern?.event_types?.APP_READY) {
    (window as any).SillyTavern.eventSource.on((window as any).SillyTavern.event_types.APP_READY, () => {
      initExtensionPanel();
    });
  }

  // If service was enabled in settings, start it
  if (settings.neteaseMusicServiceEnabled) {
    startMusicService();
  }

  // Listen for settings updates
  if (context.eventSource && context.event_types && context.event_types.SETTINGS_UPDATED) {
    context.eventSource.on(context.event_types.SETTINGS_UPDATED, () => {
      console.log('[Music] Settings updated, re-evaluating service status.');
      const currentSettings = getSettings();
      if (currentSettings.neteaseMusicServiceEnabled && !MusicApi.isServiceActive) {
        startMusicService();
      } else if (!currentSettings.neteaseMusicServiceEnabled && MusicApi.isServiceActive) {
        stopMusicService();
      }
      // Update cookie if changed in settings
      if (MusicApi.cookie !== currentSettings.neteaseMusicCookie) {
        MusicApi.cookie = currentSettings.neteaseMusicCookie || '';
        if (MusicApi.isServiceActive) {
          getContext().showInfoMessage('网易云音乐 Cookie 已更新。');
        }
      }
    });
  } else {
    console.warn('[Music] eventSource or SETTINGS_UPDATED event type not available, skipping settings update listener.');
  }

  // Listen for chat changes to auto-pause/resume service
  if (context.eventSource && context.event_types && context.event_types.CHAT_CHANGED) {
    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
      console.log('[Music] Chat changed event detected.');
      const currentCharacterId = getContext().characterId;

      if (currentCharacterId === null) {
        // Exiting a character chat (e.g., going to main menu or character selection)
        if (MusicApi.isServiceActive && !MusicApi.autoPaused) {
          console.log('[Music] Exiting character chat, auto-pausing service.');
          stopMusicService(true); // Auto-pause
          getContext().showInfoMessage('已退出角色聊天，网易云音乐服务已自动暂停。');
        }
      } else {
        // Entering a character chat
        if (!MusicApi.isServiceActive && MusicApi.autoPaused) {
          console.log('[Music] Entering character chat, auto-resuming service.');
          startMusicService(); // Auto-resume
          getContext().showInfoMessage('已进入角色聊天，网易云音乐服务已自动恢复。');
        }
      }
    });
  } else {
    console.warn('[Music] eventSource or CHAT_CHANGED event type not available, skipping chat change listener.');
  }

  // Expose functions to global scope for UI interaction
  window.NeteaseMusicPlugin = {
    startService: startMusicService,
    stopService: stopMusicService,
    setCookie: MusicApi.setCookie.bind(MusicApi),
    setCookieFromInput: MusicApi.setCookieFromInput.bind(MusicApi),
    setBaseUrl: MusicApi.setBaseUrl.bind(MusicApi),
    autoDetectBaseUrl: MusicApi.autoDetectBaseUrl.bind(MusicApi),
    getServiceStatus: () => MusicApi.isServiceActive,
    getCookie: () => MusicApi.cookie,
    getSettings: getSettings,
    saveSettings: saveSettings,
    refreshSync: MusicApi.refreshSync.bind(MusicApi),
    showCookiePopup: SyncStatusBar.showCookiePopup.bind(SyncStatusBar),
    loginWithCellphone: MusicApi.loginWithCellphone.bind(MusicApi),
    createFloatingBall: FloatingBall.create,
    hideFloatingBall: FloatingBall.hide,
    refreshPlayback: PlayerState.startPolling.bind(PlayerState),
  };
  window.MusicApi = MusicApi;
  window.FloatingBall = FloatingBall;
  window.MusicWindow = MusicWindow;
  window.SyncStatusBar = SyncStatusBar;

  console.log('[Music] Netease Music Companion plugin initialized.');
  pluginInitialized = true;
}

async function bootstrapPlugin(attempt = 0) {
  try {
    await initializePlugin();
    if (attempt === 0) {
      PlayerState.init();
      initExtensionPanel(); // 初始化扩展栏而不是状态栏
    }
  } catch (e) {
    if (attempt < 10) {
      setTimeout(() => {
        bootstrapPlugin(attempt + 1);
      }, 1000);
    } else {
      console.error('[Music] Failed to initialize plugin after multiple attempts', e);
    }
  }
}

bootstrapPlugin();

// ------------------------------------------------------------------------------------------------
// 2. 歌词解析器 (LyricParser)
// ------------------------------------------------------------------------------------------------

const LyricParser = {
  parse(lrc: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
    
    lrc.split('\n').forEach(line => {
      line = line.trim();
      const match = line.match(regex);
      if (match) {
        const min = parseInt(match[1]);
        const sec = parseInt(match[2]);
        const ms = parseInt(match[3]) * (match[3].length === 2 ? 10 : 1);
        const text = match[4].trim();
        if (text) {
          lines.push({
            time: min * 60000 + sec * 1000 + ms,
            text: text
          });
        }
      }
    });
    return lines.sort((a, b) => a.time - b.time);
  },

  // 获取当前时间点的歌词切片
  getSlice(lines: LyricLine[], currentTime: number, bufferMs: number = 3000) {
    const pastAndNow: LyricLine[] = [];
    const nearFuture: LyricLine[] = [];

    for (const line of lines) {
      if (line.time <= currentTime) {
        pastAndNow.push(line);
      } else if (line.time <= currentTime + bufferMs) {
        nearFuture.push(line);
      } else {
        break; // 后面的不需要了
      }
    }
    
    // pastAndNow 只取最近的 5 行，避免 token 爆炸
    const recentPast = pastAndNow.slice(-5);
    
    return { recentPast, nearFuture };
  }
};

// ------------------------------------------------------------------------------------------------
// 3. 播放器状态管理 (PlayerState)
// ------------------------------------------------------------------------------------------------

const PlayerState = {
  currentSong: null as SongInfo | null,
  isPlaying: false,
  currentTime: 0, // 毫秒
  audioElement: null as HTMLAudioElement | null,
  pollingInterval: null as ReturnType<typeof setInterval> | null,

  init() {
    MusicCache.load();
    // 创建一个全局 audio 元素
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.addEventListener('timeupdate', () => {
        if (this.audioElement) {
          this.currentTime = this.audioElement.currentTime * 1000;
        }
      });
      this.audioElement.addEventListener('ended', () => {
        this.isPlaying = false;
        toastr.info('播放结束');
      });
      this.audioElement.addEventListener('error', (e) => {
        console.error('[Music] 播放出错', e);
        toastr.error('无法播放此歌曲 (可能是 VIP 歌曲或版权限制)');
        this.isPlaying = false;
      });
      document.body.appendChild(this.audioElement);
    }
    // 开始轮询当前播放状态
    this.startPolling();
  },

  async play(song: SongInfo) {
    if (!this.audioElement) this.init();
    
    // 如果是同一首，直接播放
    if (this.currentSong?.id === song.id && this.audioElement?.src) {
        this.audioElement.play();
        this.isPlaying = true;
        return;
    }

    // 获取 URL
    const url = await MusicApi.getSongUrl(song.id);
    if (!url) {
        toastr.error('无法获取歌曲链接');
        return;
    }

    // 切歌
    this.currentSong = song;
    if (this.audioElement) {
        this.audioElement.src = url;
        this.audioElement.play();
        this.isPlaying = true;
        
        // 加载歌词
        if (!song.lrcLines) {
            const lrc = await MusicApi.getLyric(song.id);
            song.lrc = lrc;
            song.lrcLines = LyricParser.parse(lrc);
        }
        
        toastr.success(`正在播放: ${song.name} - ${song.artist}`);
    }
  },

  pause() {
    this.audioElement?.pause();
    this.isPlaying = false;
  },

  // 轮询当前播放状态
  startPolling(intervalMs: number = 3000) {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      const playback = await MusicApi.getCurrentPlayback();
      if (!playback) {
        // 更新扩展栏：未连接
        dispatchStatusUpdate(null);
        return;
      }
      
      // 更新扩展栏
      dispatchStatusUpdate(playback);
      
      // 如果有网易云 ID，尝试切换歌曲
      if (playback.neteaseId && playback.neteaseId !== this.currentSong?.id) {
        // 创建歌曲信息对象
        const song: SongInfo = {
          id: playback.neteaseId,
          name: playback.title || '未知歌曲',
          artist: playback.artist || '未知艺术家',
          coverUrl: playback.coverUrl || '',
          duration: playback.duration || 0
        };
        // 播放歌曲（如果正在播放）
        if (playback.isPlaying) {
          await this.play(song);
        } else {
          // 更新当前歌曲信息但不播放
          this.currentSong = song;
        }
      } else if (playback.isPlaying !== this.isPlaying) {
        // 播放状态变化
        if (playback.isPlaying) {
          // 恢复播放
          this.audioElement?.play();
          this.isPlaying = true;
        } else {
          this.pause();
        }
      }
    }, intervalMs);
  }
};

// ------------------------------------------------------------------------------------------------
// 4. 注入提示词逻辑 (Prompt Injection)
// ------------------------------------------------------------------------------------------------

const musicPromptGenerator = () => {
    if (!PlayerState.currentSong || !PlayerState.isPlaying) {
        return ''; // 不播放时不注入
    }
    
    const { recentPast, nearFuture } = LyricParser.getSlice(
        PlayerState.currentSong.lrcLines || [], 
        PlayerState.currentTime
    );

    const statusJson = {
        song: {
            id: PlayerState.currentSong.id,
            title: PlayerState.currentSong.name,
            artist: PlayerState.currentSong.artist
        },
        playback: {
            current_position_ms: Math.floor(PlayerState.currentTime),
            duration_ms: PlayerState.currentSong.duration,
            is_playing: PlayerState.isPlaying
        },
        lyrics: {
            current: recentPast.map(l => l.text),
            next: nearFuture.map(l => l.text)
        }
    };

    return JSON.stringify(statusJson);
};

const musicPromptTextGenerator = () => {
    if (!PlayerState.currentSong || !PlayerState.isPlaying) {
        return '';
    }
    const title = PlayerState.currentSong.name || '';
    const artist = PlayerState.currentSong.artist || '';
    const { recentPast, nearFuture } = LyricParser.getSlice(
        PlayerState.currentSong.lrcLines || [],
        PlayerState.currentTime
    );
    const currentLine = recentPast.length ? recentPast[recentPast.length - 1].text : '';
    const nextLine = nearFuture.length ? nearFuture[0].text : '';
    const pieces = [
        `正在播放：${title} - ${artist}`,
        currentLine ? `当前歌词：${currentLine}` : '',
        nextLine ? `下一句：${nextLine}` : ''
    ].filter(Boolean);
    return pieces.join('\n');
};
// ------------------------------------------------------------------------------------------------
// 5. 界面组件 (UI Components)
// ------------------------------------------------------------------------------------------------

// 同步状态栏组件
const SyncStatusBar = {
  element: null as HTMLElement | null,
  
  init() {
    // 如果已存在则移除
    const existing = document.getElementById('netease-music-status-bar');
    if (existing) existing.remove();
    
    // 创建状态栏元素
    const statusBar = document.createElement('div');
    statusBar.id = 'netease-music-status-bar';
    
    // 左侧状态信息
    const statusText = document.createElement('div');
    statusText.id = 'netease-music-status-text';
    statusText.textContent = '未连接到网易云音乐';
    
    // 右侧操作按钮
    const buttonContainer = document.createElement('div');
    
    // 设置 Cookie 按钮
    const cookieButton = document.createElement('button');
    cookieButton.textContent = '设置 Cookie';
    cookieButton.addEventListener('click', () => {
      this.showCookiePopup();
    });
    
    // 隐藏按钮
    const hideButton = document.createElement('button');
    hideButton.textContent = '隐藏';
    hideButton.addEventListener('click', () => {
      this.toggleVisibility();
    });
    
    buttonContainer.appendChild(cookieButton);
    buttonContainer.appendChild(hideButton);
    
    statusBar.appendChild(statusText);
    statusBar.appendChild(buttonContainer);
    
    document.body.appendChild(statusBar);
    this.element = statusBar;
    // 插件加载成功提示
    if (window.SillyTavern && window.SillyTavern.getContext) {
      const context = window.SillyTavern.getContext();
      if (context && context.showSuccessMessage) {
        context.showSuccessMessage('网易云音乐伴侣插件加载成功！');
      }
    }
  },
  
  showCookiePopup: async function() {
    if (window.SillyTavern && window.SillyTavern.getContext) {
      const { Popup } = window.SillyTavern.getContext() as any;
      const currentCookie = MusicApi.cookie || '';
      let value: string | null = null;
      if (Popup && Popup.show && typeof Popup.show.input === 'function') {
        const inputRes = await Popup.show.input('设置 Cookie', '登录网页版后，粘贴网页地址或完整 Cookie:', currentCookie);
        value = inputRes;
      } else {
        value = prompt('设置 Cookie\n\n登录网页版后，粘贴网页地址或完整 Cookie:', currentCookie);
      }
      if (value !== null) {
        MusicApi.setCookieFromInput(value);
        MusicApi.refreshSync();
      }
    } else {
      const cookie = prompt('请输入您的网易云音乐 Cookie (NCM_A2ID):', MusicApi.cookie);
      if (cookie !== null) {
        MusicApi.setCookie(cookie);
        MusicApi.refreshSync(); // 刷新服务状态
      }
    }
  },

  toggleVisibility() {
    if (!this.element) {
      return;
    }
    const isHidden = this.element.style.display === 'none';
    const hideButton = this.element.querySelector('button:nth-child(2)') as HTMLButtonElement;
    if (isHidden) {
      this.element.style.display = 'flex';
      if (hideButton) {
        hideButton.textContent = '隐藏';
      }
      FloatingBall.hide();
    } else {
      this.element.style.display = 'none';
      if (hideButton) {
        hideButton.textContent = '显示';
      }
      FloatingBall.create();
    }
  },
  
  updateStatus(status: string) {
    const statusElement = document.getElementById('netease-music-status-text');
    if (statusElement) {
      statusElement.textContent = status;
    }
  },
  
  updatePlaybackStatus(playback: { title?: string; artist?: string; isPlaying?: boolean } | null) {
    // 调用统一的状态更新分发函数
    dispatchStatusUpdate(playback);
    
    // 如果状态栏元素存在，也更新状态栏（保持向后兼容）
    if (this.element) {
      if (!playback) {
        this.updateStatus('未连接到网易云音乐');
        return;
      }
      
      if (playback.title && playback.artist) {
        const status = `${playback.isPlaying ? '▶️' : '⏸️'} ${playback.title} - ${playback.artist}`;
        this.updateStatus(status);
      } else {
        this.updateStatus('正在同步播放状态...');
      }
    }
  }
};



// ---------------------------------------------------------------------------------------------//---
// 6. 悬浮球与音乐窗口组件
// ------------------------------------------------------------------------------------------------

// 悬浮球组件
const FloatingBall = {
  element: null as HTMLElement | null,
  isVisible: false,
  
  create() {
    // 如果已存在则移除
    const existing = document.getElementById('netease-music-floating-ball');
    if (existing) existing.remove();
    
    // 创建悬浮球元素
    const ball = document.createElement('div');
    ball.id = 'netease-music-floating-ball';
    
    // 添加音乐图标
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-music';
    ball.appendChild(icon);
    
    // 点击显示音乐窗口（跟随悬浮球位置）
    ball.addEventListener('click', () => {
      if (isDragging) return;
      MusicWindow.showAtElement(ball);
    });
    
    // 拖拽功能
    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    
    ball.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = ball.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      MusicWindow.hide();
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      ball.style.left = `${startLeft + dx}px`;
      ball.style.top = `${startTop + dy}px`;
      ball.style.right = 'auto';
      ball.style.bottom = 'auto';
    };
    
    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.body.appendChild(ball);
    this.element = ball;
    this.isVisible = true;
    
    // 显示创建提示
    toastr.info('悬浮球已创建，点击打开音乐窗口');
  },
  
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  },
  
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
    }
 }
 };

// 音乐悬浮窗组件（纯展示型，无播放控制）
const MusicWindow = {
  element: null as HTMLElement | null,
  isVisible: false,
  dockedInPanel: false,
  
  create() {
    // 如果已存在则移除
    const existing = document.getElementById('netease-music-window');
    if (existing) existing.remove();
    
    // 创建音乐窗口元素
    const windowEl = document.createElement('div');
    windowEl.id = 'netease-music-window';
    
    // 窗口标题栏   
    const titleBar = document.createElement('div');
    titleBar.className = 'nmw-title-bar';
    
    const titleText = document.createElement('div');
    titleText.textContent = '当前播放';
    titleText.className = 'nmw-title';
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'nmw-close';
    closeButton.addEventListener('click', () => {
      this.hide();
    });
    
    titleBar.appendChild(titleText);
    titleBar.appendChild(closeButton);
    
    // 内容区域
    const content = document.createElement('div');
    content.className = 'nmw-content';
    
    // 歌曲封面
    const coverContainer = document.createElement('div');
    coverContainer.className = 'nmw-cover-container';
    
    const coverImg = document.createElement('img');
    coverImg.id = 'music-window-cover';
    coverImg.src = '';
    
    const coverFallback = document.createElement('div');
    coverFallback.id = 'music-window-cover-fallback';
    coverFallback.innerHTML = '<i class="fa-solid fa-music" style="font-size: 48px; color: rgba(255, 255, 255, 0.5);"></i>';
    
    coverContainer.appendChild(coverImg);
    coverContainer.appendChild(coverFallback);
    
    // 歌曲信息
    const infoContainer = document.createElement('div');
    infoContainer.className = 'nmw-info';
    
    const songTitle = document.createElement('div');
    songTitle.id = 'music-window-title';
    songTitle.textContent = '无歌曲播放';
    
    const songArtist = document.createElement('div');
    songArtist.id = 'music-window-artist';
    songArtist.textContent = '未知艺术家';
    
    // 播放状态
    const statusContainer = document.createElement('div');
    statusContainer.className = 'nmw-status';
    
    const statusIcon = document.createElement('div');
    statusIcon.id = 'music-window-status-icon';
    statusIcon.textContent = '⏸️';
    
    const statusText = document.createElement('div');
    statusText.id = 'music-window-status-text';
    statusText.textContent = '未连接';
    
    statusContainer.appendChild(statusIcon);
    statusContainer.appendChild(statusText);
    
    infoContainer.appendChild(songTitle);
    infoContainer.appendChild(songArtist);
    infoContainer.appendChild(statusContainer);
    
    // 简化：移除操作按钮，只保留展示信息
    
    content.appendChild(coverContainer);
    content.appendChild(infoContainer);
    
    windowEl.appendChild(titleBar);
    windowEl.appendChild(content);
    
    document.body.appendChild(windowEl);
    this.element = windowEl;
    
    // 初始化歌曲信息更新监听
    this.startInfoUpdater();
  },
  
  showAtElement(anchor: HTMLElement) {
    if (!this.element) this.create();
    if (!this.element) return;
    const rect = anchor.getBoundingClientRect();
    const win = this.element;
    win.style.position = 'fixed';
    win.style.display = 'block';
    win.style.bottom = '';
    win.style.right = '';
    const margin = 8;
    let left = rect.right + margin;
    let top = rect.top;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = 260;
    const height = 120;
    if (left + width > vw) {
      left = rect.left - width - margin;
    }
    if (top + height > vh) {
      top = Math.max(0, vh - height - margin);
    }
    win.style.left = `${Math.max(0, left)}px`;
    win.style.top = `${Math.max(0, top)}px`;
    this.isVisible = true;
    this.dockedInPanel = false;
    this.updateDisplay();
  },
  
  showDockedInPanel() {
    if (!this.element) this.create();
    if (!this.element) return;
    const panel = document.querySelector('.netease-music-panel-content') as HTMLElement
      || document.getElementById('extensions_settings') as HTMLElement;
    const win = this.element;
    win.style.position = 'relative';
    win.style.display = 'block';
    win.style.width = '220px';
    win.style.marginTop = '8px';
    win.style.left = '';
    win.style.top = '';
    win.style.bottom = '';
    win.style.right = '';
    if (panel) {
      panel.appendChild(win);
    } else {
      document.body.appendChild(win);
    }
    this.isVisible = true;
    this.dockedInPanel = true;
    this.updateDisplay();
  },
  
  startInfoUpdater() {
    // 每3秒更新一次显示信息
    setInterval(() => {
      this.updateDisplay();
    }, 3000);
  },
  
  updateDisplay() {
    if (!this.element || !this.isVisible) return;
    
    const currentSong = PlayerState.currentSong;
    const isPlaying = PlayerState.isPlaying;
    
    // 更新封面
    const coverImg = document.getElementById('music-window-cover') as HTMLImageElement;
    const coverFallback = document.getElementById('music-window-cover-fallback');
    
    if (currentSong && currentSong.coverUrl) {
      if (coverImg) {
        coverImg.src = currentSong.coverUrl;
        coverImg.style.display = 'block';
      }
      if (coverFallback) {
        coverFallback.style.display = 'none';
      }
    } else {
      if (coverImg) {
        coverImg.style.display = 'none';
      }
      if (coverFallback) {
        coverFallback.style.display = 'flex';
      }
    }
    
    // 更新歌曲信息
    const titleEl = document.getElementById('music-window-title');
    const artistEl = document.getElementById('music-window-artist');
    const statusIcon = document.getElementById('music-window-status-icon');
    const statusText = document.getElementById('music-window-status-text');
    
    if (currentSong) {
      if (titleEl) titleEl.textContent = currentSong.name || '未知歌曲';
      if (artistEl) artistEl.textContent = currentSong.artist || '未知艺术家';
      if (statusIcon) statusIcon.textContent = isPlaying ? '▶️' : '⏸️';
      if (statusText) statusText.textContent = isPlaying ? '播放中' : '已暂停';
    } else {
      if (titleEl) titleEl.textContent = '无歌曲播放';
      if (artistEl) artistEl.textContent = '未知艺术家';
      if (statusIcon) statusIcon.textContent = '⏸️';
      if (statusText) statusText.textContent = '未连接';
    }
  },
  
  show() {
    if (!this.element) {
      this.create();
    }
    if (this.element) {
      if (FloatingBall.isVisible) {
        const anchor = FloatingBall.element!;
        this.showAtElement(anchor);
      } else {
        this.showDockedInPanel();
      }
    }
  },
  
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  },
  
  toggle() {
    if (!this.isVisible) {
      this.show();
    } else {
      this.hide();
    }
  }
};

// ------------------------------------------------------------------------------------------------
// 7. Slash 命令和助手集成功能已移除，核心逻辑依托 SillyTavern 扩展接口运行
// ------------------------------------------------------------------------------------------------

// 扩展栏组件初始化
let extensionPanelApp: any = null;

async function initExtensionPanel() {
  if (extensionPanelApp) {
    return;
  }
  
  const waitForElementByIds = (ids: string[], timeoutMs = 10000): Promise<HTMLElement | null> => {
    return new Promise((resolve) => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          resolve(el);
          return;
        }
      }
      const started = Date.now();
      const observer = new MutationObserver(() => {
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el) {
            observer.disconnect();
            resolve(el);
            return;
          }
        }
        if (Date.now() - started > timeoutMs) {
          observer.disconnect();
          resolve(null);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  };
  
  // 1. 优先尝试使用 ST_API 注册面板（如果 ST API Wrapper 插件已安装）
  if ((window as any).ST_API?.ui?.registerSettingsPanel) {
    try {
      console.log('[Music] Using ST_API to register settings panel');
      await (window as any).ST_API.ui.registerSettingsPanel({
        id: 'st-netease-music.settings',
        title: '网易云音乐伴侣',
        target: 'extensions_settings',
        expanded: false,
        content: {
          kind: 'render',
          render: (container: HTMLElement) => {
            const app = createApp(Panel);
            const instance = app.mount(container);
            extensionPanelApp = app;
            
            // 暴露更新函数
            window.NeteaseMusicExtensionPanel = {
              updateStatus: (status: string) => (instance as any).updateStatus?.(status),
              updatePlaybackStatus: (playback: any) => (instance as any).updatePlaybackStatus?.(playback),
              showCookiePopup: () => (instance as any).showCookiePopup?.(),
              refreshSync: () => (instance as any).refreshSync?.()
            };
            
            return () => app.unmount();
          },
        },
      });
      return;
    } catch (e) {
      console.warn('[Music] ST_API registration failed, falling back to manual injection', e);
    }
  }

  // 2. 手动注入回退方案
  // 查找可能的容器 ID
  const containerIds = ['extensions_settings', 'extensions_settings2', 'extension_settings'];
  let extensionsSettings: HTMLElement | null = null;
  
  for (const id of containerIds) {
    extensionsSettings = document.getElementById(id);
    if (extensionsSettings) break;
  }
  
  if (!extensionsSettings) {
    console.log('[Music] Waiting for extensions settings container...');
    const found = await waitForElementByIds(containerIds, 10000);
    if (!found) {
      console.warn('[Music] Extensions settings container not found in time, skipping panel init.');
      return;
    }
    extensionsSettings = found;
  }

  console.log(`[Music] Found extensions settings container (#${extensionsSettings.id}), initializing panel...`);
  
  try {
     // 创建挂载点
     let mountPoint = document.getElementById('netease-music-extension-panel');
     if (!mountPoint) {
       mountPoint = document.createElement('div');
       mountPoint.id = 'netease-music-extension-panel';
       mountPoint.className = 'inline-drawer';
       
       // 创建 HTML 结构
       mountPoint.innerHTML = `
         <div class="inline-drawer-toggle inline-drawer-header">
           <b>网易云音乐伴侣</b>
           <div class="inline-drawer-icon fa-solid fa-circle-chevron-right"></div>
         </div>
         <div class="inline-drawer-content" style="display: none;">
           <div id="netease-music-vue-mount"></div>
         </div>
       `;
       
       extensionsSettings.appendChild(mountPoint);
       
       // 绑定折叠逻辑
       const toggle = mountPoint.querySelector('.inline-drawer-toggle');
       const content = mountPoint.querySelector('.inline-drawer-content') as HTMLElement;
       const icon = mountPoint.querySelector('.inline-drawer-icon');
       
       if (toggle && content && icon) {
         toggle.addEventListener('click', () => {
           const isCollapsed = content.style.display === 'none';
           if (isCollapsed) {
             content.style.display = 'block';
             icon.classList.replace('fa-circle-chevron-right', 'fa-circle-chevron-down');
           } else {
             content.style.display = 'none';
             icon.classList.replace('fa-circle-chevron-down', 'fa-circle-chevron-right');
           }
         });
       }
     }
     
     // 创建并挂载 Vue 应用
     extensionPanelApp = createApp(Panel);
     const panelInstance = extensionPanelApp.mount('#netease-music-vue-mount');
     
     console.log('[Music] Extension panel mounted successfully (Manual).');
    
    // 暴露更新函数
    window.NeteaseMusicExtensionPanel = {
      updateStatus: (status: string) => (panelInstance as any).updateStatus?.(status),
      updatePlaybackStatus: (playback: any) => (panelInstance as any).updatePlaybackStatus?.(playback),
      showCookiePopup: () => (panelInstance as any).showCookiePopup?.(),
      refreshSync: () => (panelInstance as any).refreshSync?.()
    };
  } catch (error) {
    console.error('[Music] Failed to initialize extension panel:', error);
    // 如果失败，尝试重新初始化
    extensionPanelApp = null;
    setTimeout(initExtensionPanel, 2000);
  }
}

// 状态更新事件分发函数
function dispatchStatusUpdate(playback: { title?: string; artist?: string; isPlaying?: boolean } | null) {
  // 更新扩展栏面板
  if (window.NeteaseMusicExtensionPanel) {
    window.NeteaseMusicExtensionPanel.updatePlaybackStatus(playback);
  }
  
  // 更新全局插件对象（保持向后兼容）
  if (window.NeteaseMusicPlugin) {
    // 这里可以添加全局状态更新逻辑
  }
  
  // 派发自定义事件
  const event = new CustomEvent('netease-music-status-update', {
    detail: playback
  });
  window.dispatchEvent(event);
}
