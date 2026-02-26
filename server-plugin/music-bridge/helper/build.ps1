$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
dotnet publish "$root\netease-helper.csproj" -c Release -r win-x64 -p:PublishSingleFile=true -p:SelfContained=true -p:IncludeNativeLibrariesForSelfExtract=true -o "$root\dist"
Copy-Item "$root\dist\netease-helper.exe" "$root\netease-helper.exe" -Force
