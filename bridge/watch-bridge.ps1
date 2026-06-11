# watch-bridge.ps1
# GPT<->Claude Code ブリッジ監視スクリプト (Phase2)
# 文字コード: UTF-8
# 実行方法: powershell -ExecutionPolicy Bypass -File watch-bridge.ps1

param(
    [string]$InboxPath  = "$PSScriptRoot\inbox",
    [string]$OutboxPath = "$PSScriptRoot\outbox",
    [string]$LogPath    = "$PSScriptRoot\logs",
    [int]   $IntervalSec = 5
)

# ディレクトリ保証
foreach ($dir in @($InboxPath, $OutboxPath, $LogPath)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

$logFile = Join-Path $LogPath ("bridge-" + (Get-Date -Format "yyyyMMdd") + ".log")

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts  = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts][$Level] $Message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Process-InboxFile {
    param([System.IO.FileInfo]$File)

    Write-Log "受信: $($File.Name)"

    # ファイル内容を読み込む
    $content = Get-Content -Path $File.FullName -Raw -Encoding UTF8

    # 禁止チェック: ゴリを中継させない指示が含まれているか
    if ($content -match "ゴリ.*中継|中継.*ゴリ|Make API|MCP Toolboxes") {
        Write-Log "禁止パターン検出: $($File.Name) — 処理をスキップします" "WARN"
        $skipPath = Join-Path $OutboxPath ("SKIP-" + $File.Name)
        Move-Item -Path $File.FullName -Destination $skipPath
        return
    }

    # 処理済みとしてoutboxへ移動
    $processedPath = Join-Path $OutboxPath ("DONE-" + $File.Name)
    Move-Item -Path $File.FullName -Destination $processedPath
    Write-Log "処理完了: $($File.Name) -> outbox/DONE-$($File.Name)"
}

Write-Log "=== GPT<->Claude Code ブリッジ Phase2 監視開始 ==="
Write-Log "Inbox : $InboxPath"
Write-Log "Outbox: $OutboxPath"
Write-Log "間隔  : ${IntervalSec}秒"

# 監視ループ
try {
    while ($true) {
        $files = Get-ChildItem -Path $InboxPath -Filter "*.md" -File -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            Process-InboxFile -File $file
        }
        Start-Sleep -Seconds $IntervalSec
    }
}
catch [System.Management.Automation.StopUpstreamCommandsException] {
    Write-Log "監視を停止しました (Ctrl+C)" "INFO"
}
catch {
    Write-Log "予期しないエラー: $_" "ERROR"
    exit 1
}
