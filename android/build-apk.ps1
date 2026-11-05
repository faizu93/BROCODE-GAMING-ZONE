# Builds BroCode-Gaming-Zone.apk without Gradle.
#
#   powershell -ExecutionPolicy Bypass -File build-apk.ps1
#
# Pipeline: aapt2 compile -> aapt2 link -> javac -> d8 -> zip -> zipalign -> apksigner
#
# Needs: a JDK 17 and the Android SDK build-tools + a platform android.jar.
# The release keystore is created on first run and must be kept safe: without it
# you cannot publish an update for an app that is already installed.

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$sdk  = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$jdk  = Join-Path $env:LOCALAPPDATA 'Android\tools\jdk17\jdk-17.0.20.1+1'
$bt   = Join-Path $sdk 'build-tools\36.1.0'
$jar  = Join-Path $sdk 'platforms\android-36.1\android.jar'

$storePass = 'brocode2026'
$keyPass   = 'brocode2026'
$alias     = 'brocode'

# ---------------------------------------------------------------- environment
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path', 'User')
$env:JAVA_HOME = $jdk
$env:Path = (Join-Path $jdk 'bin') + ';' + $env:Path

function Assert-Tool([string] $path, [string] $label) {
  if (-not (Test-Path $path)) { throw "Missing $label at $path" }
}

Assert-Tool (Join-Path $bt 'aapt2.exe')    'aapt2'
Assert-Tool (Join-Path $bt 'd8.bat')       'd8'
Assert-Tool (Join-Path $bt 'zipalign.exe') 'zipalign'
Assert-Tool (Join-Path $bt 'apksigner.bat') 'apksigner'
Assert-Tool (Join-Path $jdk 'bin\javac.exe') 'javac'
Assert-Tool (Join-Path $jdk 'bin\keytool.exe') 'keytool'
Assert-Tool $jar                            'android.jar'

# --------------------------------------------------------------------- folders
$build = Join-Path $root 'build'
if (Test-Path $build) { Remove-Item $build -Recurse -Force }

$compiled = Join-Path $build 'compiled'
$gen      = Join-Path $build 'gen'
$classes  = Join-Path $build 'classes'
$dex      = Join-Path $build 'dex'

foreach ($dir in @($compiled, $gen, $classes, $dex)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

function Step([string] $message) { Write-Host "==> $message" -ForegroundColor Cyan }

# --------------------------------------------------------------- 1. resources
Step 'Compiling resources (aapt2 compile)'
& (Join-Path $bt 'aapt2.exe') compile --dir (Join-Path $root 'res') -o (Join-Path $compiled 'resources.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

Step 'Linking resources (aapt2 link)'
& (Join-Path $bt 'aapt2.exe') link `
  -o (Join-Path $build 'resources.apk') `
  -I $jar `
  --manifest (Join-Path $root 'AndroidManifest.xml') `
  --java $gen `
  -A (Join-Path $root 'assets') `
  --min-sdk-version 24 `
  --target-sdk-version 34 `
  --version-code 1 `
  --version-name 1.0 `
  (Join-Path $compiled 'resources.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

# ------------------------------------------------------------------ 2. javac
Step 'Compiling Java (javac)'
$sources = @()
$sources += (Get-ChildItem $gen -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$sources += (Get-ChildItem (Join-Path $root 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName })

& (Join-Path $jdk 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 -Xlint:-options `
  -classpath $jar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

# --------------------------------------------------------------------- 3. d8
Step 'Dexing (d8)'
$classFiles = (Get-ChildItem $classes -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& (Join-Path $bt 'd8.bat') --min-api 24 --lib $jar --output $dex $classFiles
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

# ------------------------------------------------------- 4. assemble the apk
# aapt2 already packed res/, assets/ and — importantly — stores resources.arsc
# uncompressed, which Android 11+ requires for targetSdk 30 and up. So the linked
# APK is kept as-is and classes.dex is appended to it.
Step 'Assembling the APK'
$unsigned = Join-Path $build 'unsigned.apk'
if (Test-Path $unsigned) { Remove-Item $unsigned -Force }
Copy-Item (Join-Path $build 'resources.apk') $unsigned

Push-Location $dex
try {
  & (Join-Path $bt 'aapt.exe') add $unsigned 'classes.dex'
  if ($LASTEXITCODE -ne 0) { throw 'aapt add failed' }
} finally {
  Pop-Location
}

# ------------------------------------------------------------- 5. signing key
Step 'Preparing the signing key'
$keystoreDir = Join-Path $root 'keystore'
$keystore    = Join-Path $keystoreDir 'brocode-release.jks'

if (-not (Test-Path $keystore)) {
  New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null
  Write-Host '    creating a new release keystore (keep this file safe!)'
  & (Join-Path $jdk 'bin\keytool.exe') -genkeypair -v `
    -keystore $keystore `
    -storetype PKCS12 `
    -storepass $storePass `
    -keypass $keyPass `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10950 `
    -dname 'CN=Bro Code Gaming Zone, OU=Mobile App, O=Bro Code Gaming Zone, L=Thane, ST=Maharashtra, C=IN'
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

# ------------------------------------------------------ 6. align, sign, verify
Step 'Aligning (zipalign)'
$aligned = Join-Path $build 'aligned.apk'
& (Join-Path $bt 'zipalign.exe') -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

Step 'Signing (apksigner)'
$apk = Join-Path $root 'BroCode-Gaming-Zone.apk'
if (Test-Path $apk) { Remove-Item $apk -Force }

& (Join-Path $bt 'apksigner.bat') sign `
  --ks $keystore `
  --ks-key-alias $alias `
  --ks-pass "pass:$storePass" `
  --key-pass "pass:$keyPass" `
  --v1-signing-enabled true `
  --v2-signing-enabled true `
  --v3-signing-enabled true `
  --out $apk `
  $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }

Step 'Verifying the signature'
& (Join-Path $bt 'apksigner.bat') verify --verbose $apk
if ($LASTEXITCODE -ne 0) { throw 'the APK signature did not verify' }

$size = [Math]::Round((Get-Item $apk).Length / 1KB, 1)
Write-Host ''
Write-Host "Built $apk ($size KB)" -ForegroundColor Green
