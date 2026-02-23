# Music Tavern Bridge Setup

这个桥接程序用于连接网易云音乐 API，解决浏览器跨域问题，并支持获取高音质歌曲和私密歌单，同时支持自动同步网易云客户端当前播放状态。

## 1. 安装依赖

请确保你已经安装了 Node.js (推荐 v18+)。
在当前目录 (`bridge`) 打开终端，运行以下命令：

```bash
npm install
```

这将自动安装 `NeteaseCloudMusicApi`, `express`, `cors` 等必要组件。

## 2. 启动服务

运行以下命令启动桥接服务：

```bash
node server.js
```

如果看到 "Music Tavern Bridge running at http://localhost:3000"，说明服务启动成功。

## 3. 自动同步网易云播放状态

**新功能**: 现在脚本会自动检测网易云桌面客户端当前播放的歌曲，并同步到酒馆的 AI 提示词中。

工作原理:
1. 脚本每 3 秒轮询一次 `/current` 端点，获取 Windows 媒体控制信息
2. 如果检测到正在播放的歌曲变化，会自动切换并获取歌词
3. 当前播放状态（歌曲信息、歌词片段）会动态注入到 AI 的提示词中

**默认使用模拟数据**（陈绮贞 - 还是会寂寞）进行测试。要使用真实的 Windows 媒体控制 API，请参见第 6 节。

## 4. 在酒馆中使用

1. 确保酒馆脚本 `music_companion.ts` 已加载（位于 `music-tavern-plugin/src/` 目录）。
2. 在酒馆聊天框输入命令：
   - `/163 cookie [你的Cookie]` (如果需要播放 VIP 歌曲或私密歌单)

**注意**: 移除了 `/163 play` 和 `/163 pause` 命令，因为现在采用自动同步模式。

## 5. 获取 Cookie (可选)

如果你需要访问私密歌单，可以在浏览器登录网易云音乐网页版，按 F12 打开开发者工具，找到 Network 选项卡，刷新页面，找到任意一个请求，查看 Request Headers 中的 Cookie 字段，复制全部内容。
然后使用 `/163 cookie <粘贴内容>` 设置。

## 6. 使用真实 Windows 媒体控制 API (可选)

要获取真实的网易云客户端播放状态（而不是模拟数据），需要安装额外的依赖：

```bash
npm install @nodert-win11/windows.media.control
```

然后在启动服务前设置环境变量：

**Windows PowerShell:**
```powershell
$env:USE_REAL_MEDIA_API="true"
node server.js
```

**Windows 命令提示符:**
```cmd
set USE_REAL_MEDIA_API=true
node server.js
```

**注意**: 
- 该功能仅适用于 Windows 10/11 系统
- 需要网易云音乐桌面客户端正在运行
- 如果 API 调用失败，会自动回退到模拟数据

## 7. 故障排除

- **桥接服务无法启动**: 检查端口 3000 是否被占用，或依赖是否安装成功
- **无法获取歌曲**: 检查网络连接，网易云 API 可能需要科学上网
- **Cookie 无效**: 确保 Cookie 完整且未过期
- **媒体控制不工作**: 确保网易云客户端正在播放音乐，且已正确设置环境变量
- **歌词不显示**: 可能是该歌曲暂无歌词，或歌词格式解析失败

## 8. 开发说明

- 脚本位置: `music-tavern-plugin/src/music_companion.ts`
- 桥接服务: `bridge/server.js`
- 缓存: 歌词和封面图片会缓存在 localStorage 中（键: `music_companion_cache`）
- 轮询间隔: 默认 3 秒，可在 `PlayerState.startPolling()` 中调整