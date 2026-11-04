param([switch]$RefreshPage,[switch]$Replay)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class DemoWin {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 public delegate bool EnumProc(IntPtr h, IntPtr x);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p,IntPtr x);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr x);
 public struct Rect {public int L,T,R,B;}
}
"@
$latest=Get-Content 'output/monitor-alerts-2026-11-03/live-demo-latest.json' -Raw | ConvertFrom-Json
$demoPath=$latest.out
$mainProc=Get-Process '小木' | Where-Object MainWindowTitle | Select-Object -First 1
$targetPid=$mainProc.Id
$script:found=New-Object System.Collections.ArrayList
$cb=[DemoWin+EnumProc]{param($h,$x);$nativePid=[uint32]0;[DemoWin]::GetWindowThreadProcessId($h,[ref]$nativePid)|Out-Null;if($nativePid -eq $targetPid){$name=New-Object Text.StringBuilder 300;[DemoWin]::GetWindowText($h,$name,300)|Out-Null;if($name.Length){[void]$script:found.Add([pscustomobject]@{handle=$h;title=$name.ToString();visible=[DemoWin]::IsWindowVisible($h)})}};return $true}
[DemoWin]::EnumWindows($cb,[IntPtr]::Zero)|Out-Null
$main=$found | Where-Object title -like '全品种监控*' | Select-Object -First 1
$alarm=$found | Where-Object title -like '*均线拐点警报*' | Select-Object -First 1
if($RefreshPage -and $main){[DemoWin]::ShowWindow($main.handle,9)|Out-Null;[DemoWin]::SetForegroundWindow($main.handle)|Out-Null;$shell=New-Object -ComObject WScript.Shell;$shell.AppActivate('全品种监控 · 小木市场全景')|Out-Null;$shell.SendKeys('^r');Start-Sleep -Milliseconds 1000}
if($Replay -and $alarm){[DemoWin]::ShowWindow($alarm.handle,5)|Out-Null;[DemoWin]::SetForegroundWindow($alarm.handle)|Out-Null; $root=[System.Windows.Automation.AutomationElement]::FromHandle($alarm.handle); $button=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'已静音 · 警报保留'));if($button){$r=$button.Current.BoundingRectangle;[DemoWin]::SetCursorPos([int]($r.X+$r.Width/2),[int]($r.Y+$r.Height/2))|Out-Null;[DemoWin]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[DemoWin]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}}
Start-Sleep -Milliseconds 500
$observed=@(foreach($entry in $found | Where-Object {$_.title -like '*小木*' -or $_.title -like '*均线*'}){$root=[System.Windows.Automation.AutomationElement]::FromHandle($entry.handle);$nodes=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);$names=@(foreach($n in $nodes){if($n.Current.Name -match '测试|播放|已收到|向下拐头|向上拐头|静音'){[ordered]@{name=$n.Current.Name;id=$n.Current.AutomationId;type=$n.Current.ControlType.ProgrammaticName;offscreen=$n.Current.IsOffscreen}}});[ordered]@{title=$entry.title;visible=[DemoWin]::IsWindowVisible($entry.handle);items=$names}})
$json=[ordered]@{at=(Get-Date).ToString('o');windows=$observed}|ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText((Join-Path $demoPath 'native-observation.json'),$json)
[DemoWin]::SetThreadDpiAwarenessContext([IntPtr](-4))|Out-Null
foreach($entry in @($main,$alarm)){if($entry -and [DemoWin]::IsWindowVisible($entry.handle)){$rect=New-Object DemoWin+Rect;[DemoWin]::GetWindowRect($entry.handle,[ref]$rect)|Out-Null;$width=$rect.R-$rect.L;$height=$rect.B-$rect.T;if($width -gt 0 -and $height -gt 0){$bitmap=New-Object Drawing.Bitmap $width,$height;$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.CopyFromScreen($rect.L,$rect.T,0,0,$bitmap.Size);$file=if($entry -eq $alarm){'popup-live.png'}else{'page-live.png'};$bitmap.Save((Join-Path $demoPath $file),[Drawing.Imaging.ImageFormat]::Png);$graphics.Dispose();$bitmap.Dispose()}}}
$json
