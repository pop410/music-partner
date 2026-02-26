using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Windows.Media.Control;

var port = Environment.GetEnvironmentVariable("MUSIC_HELPER_PORT");
if (string.IsNullOrWhiteSpace(port)) port = "3131";

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => Results.Json(new { ok = true }));

app.MapGet("/current", async () =>
{
    var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
    var session = manager.GetCurrentSession();
    if (session == null)
    {
        return Results.Json(new { error = "no_session" });
    }

    var playback = session.GetPlaybackInfo();
    var props = await session.TryGetMediaPropertiesAsync();

    var isPlaying = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
    var title = props.Title ?? string.Empty;
    var artist = props.Artist ?? string.Empty;
    var album = props.AlbumTitle ?? string.Empty;

    return Results.Json(new
    {
        source = "pc",
        isPlaying,
        title,
        artist,
        album
    });
});

app.Urls.Add($"http://127.0.0.1:{port}");
await app.RunAsync();
