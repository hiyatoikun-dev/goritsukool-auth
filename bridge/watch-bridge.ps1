# watch-bridge.ps1
# GPT<->Claude Code ブリッジ監視スクリプト (Phase2)
# 監視対象: bridge\inbox.md
# 文字コード: UTF-8
# 実行方法: powershell -ExecutionPolicy Bypass -File watch-bridge.ps1

param(
    [string]$InboxFile   = "$PSScriptRoot\inbox.md",
    [string]$OutboxFile  = "$PSScriptRoot\outbox.md",
    [string]$LogPath     = "$PSScriptRoot\logs",
    [int]   $IntervalSec = 5
)

# ログディレクトリ保証
if (-not (Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath | Out-Null
}

$logFile = Join-Path $LogPath ("bridge-" + (Get-Date -Format "yyyyMMdd") + ".log")

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts][$Level] $Message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

# inbox.md がなければ空ファイルを作成
if (-not (Test-Path $InboxFile)) {
    "# inbox" | Set-Content -Path $InboxFile -Encoding UTF8
    Write-Log "inbox.md を新規作成しました: $InboxFile"
}

# outbox.md がなければ作成
if (-not (Test-Path $OutboxFile)) {
    "# outbox`n" | Set-Content -Path $OutboxFile -Encoding UTF8
    Write-Log "outbox.md を新規作成しました: $OutboxFile"
}

# 処理済みエントリのセット（起動時のスナップショット）
$lastContent = Get-Content -Path $InboxFile -Raw -Encoding UTF8

function Process-Inbox {
    param([string]$CurrentContent, [string]$PreviousContent)

    # 差分（新規追加行）を検出
    $prevLines = $PreviousContent -split "`n"
    $currLines = $CurrentContent  -split "`n"
    $newLines  = $currLines | Where-Object { $_ -notin $prevLines -and $_.Trim() -ne "" }

    if (-not $newLines) { return }

    foreach ($line in $newLines) {
        Write-Log "新規エントリ検出: $line"

        # 禁止パターンチェック
        if ($line -match "ゴリ.*中継|中継.*ゴリ|Make API|MCP Toolboxes") {
            Write-Log "禁止パターンをスキップ: $line" "WARN"
            continue
        }

        # outbox.md に追記
        $ts      = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $record  = "- [$ts] 受信: $line"
        Add-Content -Path $OutboxFile -Value $record -Encoding UTF8
        Write-Log "outbox.md に記録しました"
    }
}

Write-Log "=== GPT<->Claude Code ブリッジ Phase2 起動 ==="
Write-Log "監視ファイル: $InboxFile"
Write-Log "出力ファイル: $OutboxFile"
Write-Log "間隔        : ${IntervalSec}秒"

# FileSystemWatcher でファイル変更を効率的に検知
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path   = Split-Path $InboxFile
$watcher.Filter = Split-Path $InboxFile -Leaf
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite
$watcher.EnableRaisingEvents = $true

# 監視ループ
try {
    while ($true) {
        $changed = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed, ($IntervalSec * 1000))
        if (-not $changed.TimedOut) {
            Start-Sleep -Milliseconds 200  # 書き込み完了待ち
            $currentContent = Get-Content -Path $InboxFile -Raw -Encoding UTF8
            Process-Inbox -CurrentContent $currentContent -PreviousContent $lastContent
            $lastContent = $currentContent
        }
    }
}
finally {
    $watcher.Dispose()
    Write-Log "監視を停止しました"
}
