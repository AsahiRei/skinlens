# Fast release build + install to the connected phone (USB or wireless adb).
# Usage: npm run deploy:android            (uses the only connected device)
#        npm run deploy:android -- 192.168.1.23:41567   (connects first)
param([string]$Device)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if ($Device) { adb connect $Device | Out-Host }
$adbArgs = @()
if ($Device) { $adbArgs = @('-s', $Device) }

# Build only for the phone's CPU architecture.
$abi = (& adb @adbArgs shell getprop ro.product.cpu.abi).Trim()
if (-not $abi) { throw 'No device found. Run: adb connect <ip:port>' }
Write-Host "Building for $abi" -ForegroundColor Cyan

Push-Location "$root\android"
try {
  .\gradlew.bat assembleRelease `
    "-PreactNativeArchitectures=$abi" `
    -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease `
    --build-cache --parallel --console=plain
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
} finally { Pop-Location }

$apk = "$root\android\app\build\outputs\apk\release\app-release.apk"
& adb @adbArgs install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Install failed (if signature mismatch: adb uninstall com.asahirei.skinlens)' }

& adb @adbArgs shell monkey -p com.asahirei.skinlens -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host 'Installed and launched.' -ForegroundColor Green
