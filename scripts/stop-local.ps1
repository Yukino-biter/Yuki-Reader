# 停止 scripts\start-local.ps1 启动的服务（后端 jar + 假 LLM 上游），并清理 PID 文件。
# 用法（仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\stop-local.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'scripts\data'
$pidFiles = @(
    (Join-Path $dataDir 'server.pid'),
    (Join-Path $dataDir 'fake-upstream.pid')
)

$foundPids = [System.Collections.Generic.List[int]]::new()

foreach ($pidFile in $pidFiles) {
    $pidValue = $null
    if (Test-Path -LiteralPath $pidFile) {
        $raw = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        if ($raw -match '^\d+$') {
            $pidValue = [int]$raw
        }
    }
    $name = if ($pidFile -like '*server*') { '后端' } else { '假上游' }
    if ($pidValue) {
        $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $pidValue -Force
            Write-Host "已停止 $name（PID $pidValue，$($proc.ProcessName)）"
            $foundPids.Add($pidValue)
        } else {
            Write-Host "$name（PID $pidValue）已不在运行"
        }
    } else {
        Write-Host "$name：无有效 PID 文件"
    }
    if (Test-Path -LiteralPath $pidFile) {
        Remove-Item -LiteralPath $pidFile -Force
    }
}

if ($foundPids.Count -eq 0) {
    # 兜底：PID 文件缺失（如进程被外部中止前未写完）时，按命令行特征查找。
    Write-Host "PID 文件未命中任何进程，尝试按命令行匹配查找服务进程…"
    try {
        $matches = Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='node.exe'" |
            Where-Object {
                ($_.Name -eq 'java.exe' -and $_.CommandLine -like '*yuki-reader.jar*') -or
                ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*fake-upstream.js*')
            }
        foreach ($m in $matches) {
            Stop-Process -Id $m.ProcessId -Force
            Write-Host "已停止 $($m.Name)（PID $($m.ProcessId)，按命令行匹配）"
            $foundPids.Add([int]$m.ProcessId)
        }
        if ($matches.Count -eq 0) {
            Write-Host "未找到 yuki-reader.jar / fake-upstream.js 相关进程，无需停止。"
        }
    } catch {
        Write-Warning "按命令行匹配失败：$($_.Exception.Message)（可用管理员终端重试）"
    }
}

Start-Sleep -Milliseconds 500
foreach ($port in 8080, 8123) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Warning "端口 $port 仍被 PID $($listener.OwningProcess) 占用（若非本脚本管理，请手动处理）"
    } else {
        Write-Host "端口 $port 已释放"
    }
}
