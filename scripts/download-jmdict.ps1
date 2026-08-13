<#
  Download the official JMDict data (CC BY-SA 4.0) for the one-time SQLite import.

  Outputs:
    backend/data/jmdict/JMdict_e       (UTF-8 XML)

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts/download-jmdict.ps1
#>
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $root 'backend\data\jmdict'
$xmlUrl = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
$gzPath = Join-Path $destDir 'JMdict_e.gz'
$xmlPath = Join-Path $destDir 'JMdict_e'

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

Write-Host "Downloading $xmlUrl ..."
Invoke-WebRequest -Uri $xmlUrl -OutFile $gzPath -UserAgent 'Mozilla/5.0 YukiReader/1.0'

Write-Host 'Extracting JMdict_e ...'
$input = [System.IO.File]::OpenRead($gzPath)
$output = [System.IO.File]::Create($xmlPath)
try {
    $gzip = [System.IO.Compression.GzipStream]::new($input, [System.IO.Compression.CompressionMode]::Decompress)
    try {
        $gzip.CopyTo($output)
    } finally {
        $gzip.Dispose()
    }
} finally {
    $output.Dispose()
    $input.Dispose()
}

$xml = Get-Content -LiteralPath $xmlPath -Raw -Encoding utf8
if (-not $xml.StartsWith('<?xml')) {
    throw 'JMdict_e 解压后不是预期的 XML 文件'
}

$size = (Get-Item -LiteralPath $xmlPath).Length
Write-Host "Done. JMdict_e ($([math]::Round($size / 1MB, 1)) MB) is ready at $destDir"
Write-Host 'Start the backend once to import: java -jar backend/target/yuki-reader.jar'
