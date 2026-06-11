# register-autostart.ps1
# Windowsログオン時に watch-bridge.ps1 を自動起動するタスクを登録する
# 実行方法（管理者不要・ユーザータスクとして登録）:
#   powershell -ExecutionPolicy Bypass -File register-autostart.ps1

$ErrorActionPreference = "Stop"

$taskName   = "GoritsukoolBridgePhase2"
$scriptPath = Join-Path $PSScriptRoot "watch-bridge.ps1"
$pwshExe    = "powershell.exe"

# 既存タスクを削除（再登録のため）
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[INFO] 既存タスク '$taskName' を削除しました"
}

# アクション: PowerShellでwatch-bridge.ps1を起動（非表示ウィンドウ）
$action = New-ScheduledTaskAction `
    -Execute $pwshExe `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# トリガー: ログオン時（現在のユーザー）
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# 設定: 既に実行中なら新規起動しない
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

# 登録
Register-ScheduledTask `
    -TaskName $taskName `
    -Action   $action `
    -Trigger  $trigger `
    -Settings $settings `
    -RunLevel Limited `
    -Force | Out-Null

Write-Host "[OK] タスクスケジューラに '$taskName' を登録しました"
Write-Host "     次回ログオン時から自動起動します"
Write-Host ""
Write-Host "今すぐ起動する場合:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "または:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$scriptPath`""
