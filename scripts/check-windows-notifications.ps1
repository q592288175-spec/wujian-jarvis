param([string]$AppId='com.wujian.jarvis')
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XiaomuNotificationState {
 [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
}
'@
$state=0
$result=[XiaomuNotificationState]::SHQueryUserNotificationState([ref]$state)
$report=[ordered]@{CheckedAt=[DateTimeOffset]::Now.ToString('o');AppId=$AppId;ShellResult=$result;ShellState=$state;PowerShell=$PSVersionTable.PSVersion.ToString()}
try {
 $null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]
 $report.Setting=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Setting.ToString()
 $history=[Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory($AppId)
 $report.HistoryCount=@($history).Count
 $report.History=@($history | ForEach-Object { @{Tag=$_.Tag;Group=$_.Group;ExpirationTime=$_.ExpirationTime} })
} catch { $report.QueryError=$_.Exception.Message }
$report | ConvertTo-Json -Depth 5
