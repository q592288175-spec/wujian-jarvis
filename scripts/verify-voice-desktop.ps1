param([switch]$Connect)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public class VoiceWindowNative {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 public struct Rect {public int Left,Top,Right,Bottom;}
 public static IntPtr Find(uint target){IntPtr result=IntPtr.Zero;EnumWindows((h,p)=>{uint id;GetWindowThreadProcessId(h,out id);var t=new StringBuilder(512);GetWindowText(h,t,512);if(id==target&&t.ToString().Contains("小木 ·"))result=h;return true;},IntPtr.Zero);return result;}
}
'@
$project=Split-Path $PSScriptRoot -Parent
$exe=Join-Path $project '.runtime/desktop-build/小木-win32-x64/小木.exe'
$process=Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $exe -and $_.CommandLine -notmatch '--type=|server.mjs'} | Select-Object -First 1
if(!$process){throw 'Windows 小木 APP 未启动'}
[void][VoiceWindowNative]::SetProcessDPIAware()
$handle=[VoiceWindowNative]::Find($process.ProcessId)
if($handle -eq [IntPtr]::Zero){throw '没有找到小木窗口'}
[void][VoiceWindowNative]::ShowWindow($handle,9)
[void][VoiceWindowNative]::SetForegroundWindow($handle)
$window=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
$out=Join-Path $project 'output/playwright/voice-2026-10-10'
[void][System.IO.Directory]::CreateDirectory($out)
function Find-Control([string]$Id){
 $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$Id)
 return $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
}
function Click-Control([string]$Id){
 $control=Find-Control $Id
 if(!$control){throw "找不到控件：$Id"}
 Click-Element $control
 Start-Sleep -Milliseconds 160
}
function Click-Element($control){
 $pattern=$null
 if($control.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke();return}
 $r=$control.Current.BoundingRectangle
 if($r.IsEmpty -or $control.Current.IsOffscreen -or !$control.Current.IsEnabled){throw '控件不可点击'}
 [void][VoiceWindowNative]::SetForegroundWindow($handle)
 [void][VoiceWindowNative]::SetCursorPos([int]($r.Left+$r.Width/2),[int]($r.Top+$r.Height/2))
 [VoiceWindowNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [VoiceWindowNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
function Shot([string]$Name){
 $r=New-Object VoiceWindowNative+Rect
 [void][VoiceWindowNative]::GetWindowRect($handle,[ref]$r)
 $bitmap=New-Object System.Drawing.Bitmap(($r.Right-$r.Left),($r.Bottom-$r.Top))
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 try{$graphics.CopyFromScreen($r.Left,$r.Top,0,0,$bitmap.Size);$bitmap.Save((Join-Path $out "$Name.png"))}
 finally{$graphics.Dispose();$bitmap.Dispose()}
}
Click-Control 'assistantButton'
if(!(Find-Control 'connectCall')){
 Click-Control 'closeAssistant'
 $link=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'全息版')))
 if(!$link){throw '找不到全息版语音入口'}
 Click-Element $link
 Start-Sleep -Seconds 1
 Click-Control 'assistantButton'
 if(!(Find-Control 'connectCall')){throw '全息版语音面板尚未打开'}
}
$before=(Find-Control 'chatInput').GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
$small=(Find-Control 'callPanel').Current.BoundingRectangle
Click-Control 'maxCall'
$large=(Find-Control 'callPanel').Current.BoundingRectangle
if($large.Width -le $small.Width){throw '放大窗口没有生效'}
Shot '对话-放大'
Click-Control 'maxCall'
$restored=(Find-Control 'callPanel').Current.BoundingRectangle
if([Math]::Abs($restored.Width-$small.Width) -gt 2){throw '窗口还原尺寸不一致'}
Click-Control 'minCall'
if(!(Find-Control 'floatingCall')){throw '缩小后没有返回入口'}
Click-Control 'floatingCall'
$after=(Find-Control 'chatInput').GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
if($before -ne $after){throw '窗口缩放丢失未发送的文字'}
Shot '对话-还原'
Write-Output 'Windows APP：放大、还原、缩小、返回均通过；输入内容保留。'
if(!$Connect){return}
function Call-Status(){
 $control=Find-Control 'callStatus'
 if(!$control){return ''}
 $texts=$control.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 return (($texts | ForEach-Object {$_.Current.Name} | Where-Object {$_}) -join ' ')
}
Click-Control 'connectCall'
for($i=0;$i -lt 60;$i++){
 $dialog=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'允许')))
 if($dialog){Click-Element $dialog;break}
 $status=Call-Status
 if((Find-Control 'connectCall').Current.Name -eq '已接通'){break}
 if($status -match '失败|未就绪|未配置|不可用|拒绝|不支持|超时'){throw $status}
 Start-Sleep -Milliseconds 250
}
for($i=0;$i -lt 100;$i++){
 $status=Call-Status
 if((Find-Control 'connectCall').Current.Name -eq '已接通'){break}
 if($status -match '失败|未就绪|未配置|不可用|拒绝|不支持|超时'){throw $status}
 Start-Sleep -Milliseconds 200
}
if((Find-Control 'connectCall').Current.Name -ne '已接通'){throw "通话尚未接通：$status"}
Shot '对话-接通'
Write-Output "通话状态：$status"
Write-Output '保留真实麦克风通话，等待用户试听；未将真人音频保存为文件。'
