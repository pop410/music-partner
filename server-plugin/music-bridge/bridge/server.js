const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { cloudsearch, lyric, song_url, login_status, login_cellphone, user_playlist, playlist_detail } = require('NeteaseCloudMusicApi');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const allowedOrigin = process.env.ALLOW_ORIGIN || '*';
const apiToken = process.env.API_TOKEN || '';

app.use(cors({
  origin: function (origin, callback) {
    if (allowedOrigin === '*' || !origin) return callback(null, true);
    if (origin === allowedOrigin) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: false,
}));
app.use(bodyParser.json());

// Helper function to call Netease API
const callApi = async (func, query, res) => {
  try {
    const result = await func({
      ...query,
      cookie: query.cookie || ''
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
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

// Login (Cellphone) - Optional, for getting cookie
app.post('/login/cellphone', async (req, res) => {
  if (apiToken) {
    const auth = req.headers.authorization || '';
    const expected = `Bearer ${apiToken}`;
    if (auth !== expected) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  try {
    const result = await login_cellphone({
      phone: req.body.phone,
      password: req.body.password,
      md5_password: req.body.md5_password,
    });
    const body = result?.body || {};
    const cookie =
      body?.cookie ||
      result?.cookie ||
      (Array.isArray(result?.cookies) ? result.cookies.join('; ') : undefined);
    res.json({
      code: body?.code ?? result?.code ?? 0,
      cookie: cookie || '',
      body,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
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

// Get current playback status from Windows Media Control (simulated for now)
// To use real Windows Media Control API, install @nodert-win11/windows.media.control
const getCurrentPlayback = async () => {
  const useRealApi = process.env.USE_REAL_MEDIA_API === 'true';
  if (useRealApi) {
    try {
      // Attempt to load Windows.Media.Control module
      const { GlobalSystemMediaTransportControlsSessionManager } = require('@nodert-win11/windows.media.control');
      const manager = await GlobalSystemMediaTransportControlsSessionManager.requestAsync();
      const sessions = manager.getSessions();
      if (sessions.length > 0) {
        const session = sessions[0]; // Use the first session (most likely the active media app)
        const playbackInfo = session.getPlaybackInfo();
        const mediaProperties = await session.tryGetMediaPropertiesAsync();
        return {
          isPlaying: playbackInfo.playbackStatus === 4, // 4 = Playing, see Windows.Media.MediaPlaybackStatus
          title: mediaProperties.title || '',
          artist: mediaProperties.artist || '',
          album: mediaProperties.albumTitle || '',
          // Additional fields can be added
        };
      }
    } catch (error) {
      console.warn('Failed to use real Windows Media Control API, falling back to mock data:', error.message);
    }
  }
  // Mock data - replace with real Windows.Media.Control API
  return {
    isPlaying: true,
    title: "还是会寂寞",
    artist: "陈绮贞",
    album: "Demo",
    // Add more fields as needed
  };
};

app.post('/current', async (req, res) => {
  try {
    const playback = await getCurrentPlayback();
    // If we have title and artist, try to search for the song on Netease
    if (playback.title && playback.artist) {
      const searchRes = await cloudsearch({
        keywords: `${playback.title} ${playback.artist}`,
        limit: 1,
        cookie: req.body.cookie || ''
      });
      if (searchRes.result && searchRes.result.songs && searchRes.result.songs.length > 0) {
        const song = searchRes.result.songs[0];
        playback.neteaseId = song.id;
        playback.duration = song.dt;
        playback.coverUrl = song.al.picUrl;
      }
    }
    res.json(playback);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, host, () => {
  console.log(`Music Tavern Bridge running at http://${host}:${port}`);
});
