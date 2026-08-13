# 启动本地开发/验收服务：
#   1. 后端 fat jar（http://localhost:8080，日志 scripts/data/server.log*）
#   2. 本地假 LLM 上游（http://127.0.0.1:8123，日志 scripts/data/fake-upstream.log*）
# 用法（仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -SkipFakeUpstream
# 注意：在本 Codex 沙箱内执行会因长驻子进程导致命令挂起，请以提权方式运行；
# 普通交互终端直接运行即可。
param(
    [switch]$SkipFakeUpstream,
    [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'scripts\data'
$jar = Join-Path $root 'backend\target\yuki-reader.jar'
$javaLog = Join-Path $dataDir 'server.log'
$upstreamScript = Join-Path $root 'scripts\data\fake-upstream.js'
$upstreamLog = Join-Path $dataDir 'fake-upstream.log'
$serverPidFile = Join-Path $dataDir 'server.pid'
$upstreamPidFile = Join-Path $dataDir 'fake-upstream.pid'

if (-not (Test-Path -LiteralPath $jar)) {
    throw "未找到 $jar，请先执行 mvn -f backend\pom.xml clean package"
}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Read-PidFile([string]$path) {
    if (Test-Path -LiteralPath $path) {
        $value = (Get-Content -LiteralPath $path -Raw).Trim()
        if ($value -match '^\d+$') {
            return [int]$value
        }
    }
    return $null
}

$serverPid = Read-PidFile $serverPidFile
if ($serverPid -and (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
    Write-Output "后端已在运行（PID $serverPid），跳过启动。"
} else {
    $env:YUKI_DB_PATH = Join-Path $root 'backend\data\yuki.db'
    $env:YUKI_JMDICT_XML = Join-Path $root 'backend\data\jmdict\JMdict_e'
    $env:YUKI_JMDICT_AUTO_IMPORT = 'false'
    $proc = Start-Process -FilePath 'java' `
        -ArgumentList @('-jar', ('"{0}"' -f $jar)) `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $javaLog `
        -RedirectStandardError ($javaLog + '.err') `
        -PassThru
    $serverPid = $proc.Id
    Set-Content -LiteralPath $serverPidFile -Value $serverPid
    Write-Output "后端启动中（PID $serverPid），日志：$javaLog"
}

$upstreamPid = $null
if (-not $SkipFakeUpstream) {
    $upstreamPid = Read-PidFile $upstreamPidFile
    if ($upstreamPid -and (Get-Process -Id $upstreamPid -ErrorAction SilentlyContinue)) {
        Write-Output "假上游已在运行（PID $upstreamPid），跳过启动。"
    } elseif (-not (Test-Path -LiteralPath $upstreamScript)) {
        Write-Output "警告：未找到 $upstreamScript，跳过假上游。"
    } else {
        $proc = Start-Process -FilePath 'node' `
            -ArgumentList @('"{0}"' -f $upstreamScript) `
            -WorkingDirectory $root `
            -WindowStyle Hidden `
            -RedirectStandardOutput $upstreamLog `
            -RedirectStandardError ($upstreamLog + '.err') `
            -PassThru
        $upstreamPid = $proc.Id
        Set-Content -LiteralPath $upstreamPidFile -Value $upstreamPid
        Write-Output "假上游启动中（PID $upstreamPid），日志：$upstreamLog"
    }
}

if (-not $SkipHealthCheck) {
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $res = Invoke-WebRequest -Uri 'http://localhost:8080/' -UseBasicParsing -TimeoutSec 2
            if ($res.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        Write-Output "警告：后端 60 秒内未就绪，请查看 $javaLog"
    } else {
        Write-Output "后端就绪：http://localhost:8080/"
        try {
            $tokenize = Invoke-RestMethod -Uri 'http://localhost:8080/api/tokenize' `
                -Method Post -ContentType 'application/json' `
                -Body '{"sentences":["テスト"]}' -TimeoutSec 10
            Write-Output ("/api/tokenize 验证通过：rows=" + $tokenize.rows.Count)
        } catch {
            Write-Output "警告：/api/tokenize 验证失败：$($_.Exception.Message)"
        }
    }
    if ($upstreamPid) {
        try {
            $up = Invoke-WebRequest -Uri 'http://127.0.0.1:8123/' -UseBasicParsing -TimeoutSec 3
            Write-Output "假上游就绪：http://127.0.0.1:8123/（HTTP $($up.StatusCode)）"
        } catch {
            Write-Output "警告：假上游未就绪，请查看 $upstreamLog"
        }
    }
}
