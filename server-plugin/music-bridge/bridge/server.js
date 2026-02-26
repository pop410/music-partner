const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const NCM = require('NeteaseCloudMusicApi');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const http = require('http');
const { cloudsearch, lyric, song_url, login_status, login_cellphone, user_playlist, playlist_detail } = NCM;
const login_qr_key = NCM.login_qr_key;
const login_qr_create = NCM.login_qr_create;
const login_qr_check = NCM.login_qr_check;

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const allowedOrigin = process.env.ALLOW_ORIGIN || '*';
let apiToken = process.env.API_TOKEN || '';
try {
  if (!apiToken) {
    const tokenFile = path.join(__dirname, 'api_token.txt');
    if (fs.existsSync(tokenFile)) {
      apiToken = String(fs.readFileSync(tokenFile, 'utf8') || '').trim();
    }
    if (!apiToken) {
      apiToken = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(tokenFile, apiToken, 'utf8');
    }
  }
} catch {}

app.use(cors({
  origin: function (origin, callback) {
    if (allowedOrigin === '*' || !origin) return callback(null, true);
    if (origin === allowedOrigin) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: false,
}));
app.use(bodyParser.json());

// In-memory mobile playback state
let mobilePlayback = null;
let mobileLastUpdate = 0;

// Helper function to call Netease API
const callApi = async (func, query, res) => {
  try {
    const result = await func({
      ...query,
      cookie: query.cookie || ''
    });
    res.json(result);
  } catch (error) {
    // Simplify error logging
    const status = error.status || 500;
    const msg = error.body?.msg || error.message || 'Unknown Error';
    console.warn(`[bridge] Netease API Error (${status}): ${msg}`);
    res.status(500).json({ error: msg });
  }
};

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, port });
});

// Search
app.post('/search', (req, res) => {
  callApi(cloudsearch, req.body, res);
});

// Lyric
app.post('/lyric', (req, res) => {
  callApi(lyric, req.body, res);
});

// Song URL
app.post('/url', (req, res) => {
  callApi(song_url, req.body, res);
});

// Login Status
app.post('/login/status', (req, res) => {
  callApi(login_status, req.body, res);
});

// Login via QR (start)
app.post('/login/qr/start', async (req, res) => {
  try {
    if (!login_qr_key || !login_qr_create) {
      return res.status(501).json({ error: 'QR login not supported by current NeteaseCloudMusicApi version' });
    }
    const keyRes = await login_qr_key({});
    const unikey = keyRes?.data?.unikey || keyRes?.body?.data?.unikey;
    if (!unikey) return res.status(500).json({ error: 'Failed to get QR key' });
    const createRes = await login_qr_create({ key: unikey, qrimg: true });
    const qrimg = createRes?.data?.qrimg || createRes?.body?.data?.qrimg;
    const qrurl = createRes?.data?.qrurl || createRes?.body?.data?.qrurl;
    res.json({ key: unikey, qrimg, qrurl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Login via QR (check)
app.post('/login/qr/check', async (req, res) => {
  try {
    if (!login_qr_check) {
      return res.status(501).json({ error: 'QR check not supported by current NeteaseCloudMusicApi version' });
    }
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Missing key' });
    const checkRes = await login_qr_check({ key });
    const body = checkRes?.body || checkRes;
    // code: 803 -> 授权成功，返回 cookie
    const code = body?.code ?? checkRes?.code;
    const cookie =
      body?.cookie ||
      checkRes?.cookie ||
      (Array.isArray(checkRes?.cookies) ? checkRes.cookies.join('; ') : undefined);
    res.json({ code, cookie: cookie || '', body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// User Playlist
app.post('/user/playlist', (req, res) => {
  callApi(user_playlist, req.body, res);
});

// Playlist Detail
app.post('/playlist/detail', (req, res) => {
  callApi(playlist_detail, req.body, res);
});

// Get current playback status from helper exe or Windows Media Control (fallback)
let useRealApiFlag = false;
let mobileRealtimeEnabled = false;
const mediaCfgFile = path.join(__dirname, 'media_enable.json');
const helperPort = Number(process.env.MUSIC_HELPER_PORT || 3131);
let helperProcess = null;
try {
  if (fs.existsSync(mediaCfgFile)) {
    const raw = JSON.parse(fs.readFileSync(mediaCfgFile, 'utf8') || '{}');
    if (typeof raw.enabled === 'boolean') useRealApiFlag = raw.enabled;
  } else {
    useRealApiFlag = false;
    fs.writeFileSync(mediaCfgFile, JSON.stringify({ enabled: false }, null, 2), 'utf8');
  }
} catch {}

function getHelperPath() {
  const envPath = process.env.MUSIC_HELPER_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // Debug: log __dirname to see where we actually are
  const debugLog = path.join(__dirname, 'debug_helper.log');
  
  // Strategy 1: Standard Plugin Structure (Production)
  // Structure: 
  //   /plugins/music-bridge/
  //     ├── bridge/server.js  <-- __dirname
  //     └── helper/netease-helper.exe
  // Target: ../helper/netease-helper.exe
  const pluginPath = path.resolve(__dirname, '..', 'helper', 'netease-helper.exe');
  
  // Strategy 2: Development Structure (Source)
  // Structure:
  //   /extensions/st-netease-music/
  //     ├── server-plugin/music-bridge/bridge/server.js <-- __dirname
  //     └── helper/netease-helper.exe
  // Target: ../../../helper/netease-helper.exe
  const devPath = path.resolve(__dirname, '../../..', 'helper', 'netease-helper.exe');

  if (fs.existsSync(pluginPath)) {
    return pluginPath;
  }
  
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // Fallback: log failure
  try {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] Helper not found.\nChecked Plugin Path: ${pluginPath}\nChecked Dev Path: ${devPath}\n`);
  } catch {}
  
  return pluginPath; // Default to plugin path for error message
}

function startHelper() {
  if (helperProcess) return true;
  const exe = getHelperPath();
  
  // Debug log
  const debugLog = path.join(__dirname, 'debug_helper.log');
  fs.appendFileSync(debugLog, `[${new Date().toISOString()}] Trying to start helper at: ${exe}\n`);
  
  if (!fs.existsSync(exe)) {
    const msg = `[bridge] helper exe not found at ${exe}`;
    console.warn(msg);
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] Error: ${msg}\n`);
    return false;
  }
  try {
    helperProcess = cp.spawn(exe, [], {
      cwd: path.dirname(exe),
      detached: true,
      stdio: 'ignore',
    });
    helperProcess.unref();
    console.log('[bridge] helper started:', exe);
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] Success: Helper started\n`);
    return true;
  } catch (e) {
    const msg = `[bridge] failed to start helper: ${e.message}`;
    console.warn(msg);
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] Exception: ${msg}\n`);
    helperProcess = null;
    return false;
  }
}

function stopHelper() {
  if (!helperProcess) return;
  try {
    helperProcess.kill();
    console.log('[bridge] helper stopped');
  } catch {}
  helperProcess = null;
}

function callHelperCurrent() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: helperPort,
        path: '/current',
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            // console.log('[bridge] helper response:', json);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', (err) => {
      // console.warn('[bridge] helper connection failed:', err.message);
      reject(err);
    });
    req.end();
  });
}

async function getTermuxPlayback() {
  const isTermux = 'TERMUX_VERSION' in process.env;
  if (!isTermux || !mobileRealtimeEnabled) return null;

  return new Promise(resolve => {
    const proc = cp.spawn('termux-notification-list', [], { shell: false });
    let stdout = '';
    proc.stdout.on('data', (data) => (stdout += data));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const notifications = JSON.parse(stdout);
        const musicNotification = notifications.find(n => n.packageName === 'com.netease.cloudmusic');
        if (musicNotification) {
          resolve({
            source: 'termux',
            isPlaying: true, // Assume playing if notification is present
            title: musicNotification.title,
            artist: musicNotification.content,
            album: '',
          });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
    proc.on('error', () => resolve(null));
  });
}

const getCurrentPlayback = async () => {
  // Try Termux-API first if in Termux environment
  const termuxPlayback = await getTermuxPlayback();
  if (termuxPlayback) {
    return termuxPlayback;
  }

  if (useRealApiFlag) {
    // 1. 优先尝试 helper exe
    try {
      const helperData = await callHelperCurrent();
      if (helperData && !helperData.error) return helperData;
    } catch (e) {
      // console.warn('[bridge] helper /current failed:', e.message);
    }
  }
  // 如果没有开启实时监听，或者获取失败，返回空状态
  return {
    isPlaying: false,
    title: "",
    artist: "",
    album: ""
  };
};

app.get('/media/status', (_req, res) => {
  res.json({ enabled: useRealApiFlag, helper: !!helperProcess });
});

app.post('/media/enable-mobile', (req, res) => {
  mobileRealtimeEnabled = !!req.body?.enable;
  res.json({ ok: true, enabled: mobileRealtimeEnabled });
});

app.post('/media/enable', (req, res) => {
  const enable = !!req.body?.enable;
  
  if (enable) {
    // 尝试启动助手
    const started = startHelper();
    if (!started) {
      // 启动失败，回滚状态
      useRealApiFlag = false;
      try {
        fs.writeFileSync(mediaCfgFile, JSON.stringify({ enabled: false }, null, 2), 'utf8');
      } catch {}
      return res.status(500).json({ ok: false, enabled: false, error: 'helper_not_found_or_failed' });
    }
    // 启动成功
    useRealApiFlag = true;
  } else {
    // 关闭
    stopHelper();
    useRealApiFlag = false;
  }

  try {
    fs.writeFileSync(mediaCfgFile, JSON.stringify({ enabled: useRealApiFlag }, null, 2), 'utf8');
  } catch {}
  
  res.json({ ok: true, enabled: useRealApiFlag, helper: !!helperProcess });
});
// Mobile device push endpoint
app.post('/device/push', (req, res) => {
  if (apiToken) {
    const auth = req.headers.authorization || '';
    const expected = `Bearer ${apiToken}`;
    if (auth !== expected) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const payload = req.body || {};
  mobilePlayback = {
    source: 'mobile',
    isPlaying: !!payload.isPlaying,
    title: payload.title || '',
    artist: payload.artist || '',
    album: payload.album || '',
    coverUrl: payload.coverUrl || '',
    duration: typeof payload.durationMs === 'number' ? payload.durationMs : undefined,
    position: typeof payload.positionMs === 'number' ? payload.positionMs : undefined,
    deviceId: payload.deviceId || '',
    lyrics: payload.lyrics || null,
  };
  mobileLastUpdate = Date.now();
  res.json({ ok: true, ts: mobileLastUpdate });
});

app.get('/mobile/status', (_req, res) => {
  const now = Date.now();
  const hasData = !!mobilePlayback && mobileLastUpdate > 0;
  const ageMs = hasData ? Math.max(0, now - mobileLastUpdate) : null;
  res.json({
    ok: true,
    hasData,
    lastUpdate: hasData ? mobileLastUpdate : null,
    ageMs,
    active: hasData ? ageMs < 2 * 60 * 1000 : false,
  });
});

app.post('/current', async (req, res) => {
  try {
    // Prefer mobile push if fresh within 5 minutes
    const now = Date.now();
    if (mobilePlayback && (now - mobileLastUpdate) < 5 * 60 * 1000) {
      return res.json({ ...mobilePlayback, lastUpdate: mobileLastUpdate });
    }
    const playback = await getCurrentPlayback();
    // If we have title and artist, try to search for the song on Netease
    if (playback.title && playback.artist) {
      try {
        // Add a 2s timeout for search to prevent UI freezing
        const searchPromise = cloudsearch({
          keywords: `${playback.title} ${playback.artist}`,
          limit: 1,
          cookie: req.body.cookie || ''
        });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Search timeout')), 2000)
        );

        const searchRes = await Promise.race([searchPromise, timeoutPromise]);

        if (searchRes.result && searchRes.result.songs && searchRes.result.songs.length > 0) {
          const song = searchRes.result.songs[0];
          playback.neteaseId = song.id;
          playback.duration = song.dt;
          playback.coverUrl = song.al.picUrl;
        }
      } catch (searchErr) {
        // Only warn if it's not a timeout (to reduce noise)
        if (searchErr.message !== 'Search timeout') {
           const status = searchErr.status || 'Unknown';
           const msg = searchErr.body?.msg || searchErr.message;
           console.warn(`[bridge] search failed for playback (${status}): ${msg}`);
        } else {
           // console.log('[bridge] search timed out, returning basic info');
        }
        // Continue without extra info
      }
    }
    res.json(playback);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Simple mobile setup page (instructions + download)
app.get('/mobile/setup', (req, res) => {
  const baseUrl = `http://127.0.0.1:${port}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`
    <html><head><title>Mobile Setup</title></head>
    <body>
      <h3>Android 一键配置</h3>
      <p>请在同一 Wi-Fi 下，安装 Tasker（官方版本）。</p>
      <p>桥接地址：<code>${baseUrl}</code></p>
      <p>令牌：<code>${apiToken || '(未设置)'}</code></p>
      <p><a href="/mobile/tasker.xml" download>下载 Tasker 配置（XML）</a></p>
      <p>导入后授予通知读取与网络权限即可自动上报当前播放。</p>
    </body></html>
  `);
});

app.get('/mobile/tasker.xml', (req, res) => {
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = apiToken || '';
  // Tasker Project: Notification -> HTTP Request
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<TaskerData sr="" dvi="1" tv="5.15.5">
  <Profile sr="prof1" ve="2">
    <cdate>1672531200000</cdate>
    <edate>1672531200000</edate>
    <flags>8</flags>
    <id>1</id>
    <mid0>101</mid0>
    <nme>云音乐推送</nme>
    <Event sr="con0" ve="2">
      <code>461</code>
      <App sr="arg0">
        <appPkg>com.netease.cloudmusic</appPkg>
        <label>网易云音乐</label>
      </App>
      <Str sr="arg1" ve="3"/>
      <Int sr="arg2" val="0"/>
      <Str sr="arg3" ve="3"/>
    </Event>
  </Profile>
  <Task sr="task101" ve="2">
    <cdate>1672531200000</cdate>
    <edate>1672531200000</edate>
    <id>101</id>
    <nme>上报播放</nme>
    <Action sr="act0" ve="7">
      <code>339</code>
      <Bundle sr="arg0">
        <Vals sr="val">
          <net.dinglisch.android.tasker.HTTP_URI>${baseUrl}/device/push</net.dinglisch.android.tasker.HTTP_URI>
          <net.dinglisch.android.tasker.HTTP_METHOD>POST</net.dinglisch.android.tasker.HTTP_METHOD>
          <net.dinglisch.android.tasker.HTTP_HEADERS>Authorization: Bearer ${token}</net.dinglisch.android.tasker.HTTP_HEADERS>
          <net.dinglisch.android.tasker.HTTP_TIMEOUT>10</net.dinglisch.android.tasker.HTTP_TIMEOUT>
          <net.dinglisch.android.tasker.HTTP_DATA>{"title":"%evtprm1","artist":"%evtprm2","album":"","coverUrl":"","isPlaying":true}</net.dinglisch.android.tasker.HTTP_DATA>
        </Vals>
      </Bundle>
      <Int sr="arg1" val="0"/>
      <Int sr="arg10" val="0"/>
      <Int sr="arg11" val="0"/>
      <Str sr="arg2" ve="3"/>
      <Int sr="arg3" val="0"/>
      <Int sr="arg4" val="0"/>
      <Int sr="arg5" val="3"/>
      <Str sr="arg6" ve="3"/>
      <Str sr="arg7" ve="3"/>
      <Str sr="arg8" ve="3"/>
      <Str sr="arg9" ve="3"/>
    </Action>
  </Task>
  <Project sr="proj0" ve="2">
    <cdate>1672531200000</cdate>
    <mdate>1672531200000</mdate>
    <name>NeteaseBridge</name>
    <pids>1</pids>
    <tids>101</tids>
  </Project>
</TaskerData>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="netease.prj.xml"');
  res.end(xml);
});

app.listen(port, host, () => {
  console.log(`Music Tavern Bridge running at http://${host}:${port}`);
});
