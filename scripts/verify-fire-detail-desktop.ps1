param([int]$AppProcessId,[switch]$Reload,[string]$ProductName='甲醇',[string]$EvidenceFolder='fire-detail-2026-10-10')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public class FireDetailWindow {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 public struct Rect {public int Left,Top,Right,Bottom;}
 public static IntPtr Find(uint pid){IntPtr result=IntPtr.Zero;EnumWindows((h,p)=>{uint id;GetWindowThreadProcessId(h,out id);var title=new StringBuilder(512);GetWindowText(h,title,512);if(id==pid&&title.ToString().Contains("小木"))result=h;return true;},IntPtr.Zero);return result;}
}
'@
$project=Split-Path $PSScriptRoot -Parent
$out=Join-Path $project ('output/playwright/'+$EvidenceFolder)
[void](New-Item -ItemType Directory -Force -Path $out)
[void][FireDetailWindow]::SetProcessDPIAware()
$handle=(Get-Process -Id $AppProcessId).MainWindowHandle
if($handle -eq [IntPtr]::Zero){$handle=[FireDetailWindow]::Find($AppProcessId)}
if($handle -eq [IntPtr]::Zero){throw '没有找到验收APP窗口'}
[void][FireDetailWindow]::ShowWindow($handle,3)
[void][FireDetailWindow]::SetForegroundWindow($handle)
$window=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
function ById([string]$id){return $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$id)))}
function Buttons(){return $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)))}
function Click($node){
 if(!$node){throw '控件不存在'}
 $invoke=$null
 if($node.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){$invoke.Invoke()}
 else{$rect=$node.Current.BoundingRectangle;if($rect.IsEmpty -or $node.Current.IsOffscreen){throw '控件不可点击'};[void][FireDetailWindow]::SetCursorPos([int]($rect.Left+$rect.Width/2),[int]($rect.Top+$rect.Height/2));[FireDetailWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[FireDetailWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 Start-Sleep -Milliseconds 400
}
function Link([string]$name){return $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
function Shot([string]$name){
 $rect=New-Object FireDetailWindow+Rect;[void][FireDetailWindow]::GetWindowRect($handle,[ref]$rect)
 $image=New-Object System.Drawing.Bitmap(($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
 $graphics=[System.Drawing.Graphics]::FromImage($image)
 try{$graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$image.Size);$image.Save((Join-Path $out "$name.png"))}finally{$graphics.Dispose();$image.Dispose()}
}
if($Reload){
 foreach($id in @('metalForm','waterForm','executionForm','reviewForm')){if(ById $id){throw '存在业务表单，不自动重载用户页面'}}
 $close=ById 'modalClose';if($close -and !$close.Current.IsOffscreen){Click $close}
 $full=Link '全息版';if($full){Click $full;Start-Sleep -Seconds 1}
 Click (Link '稳定版');Start-Sleep -Seconds 1
}
if(!(ById 'detailResearch')){
 Click (Buttons | Where-Object {$_.Current.Name -match '识别机会'} | Select-Object -First 1)
 for($i=0;$i -lt 30;$i++){$target=Buttons | Where-Object {$_.Current.Name -match [regex]::Escape($ProductName) -and $_.Current.Name -notmatch '提醒'} | Select-Object -First 1;if($target){break};Start-Sleep -Milliseconds 200}
 Click $target
}
if(!(ById 'detailResearch') -or !(ById 'detailMonitor')){throw '详情缺少研究或提醒入口'}
$all=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$names=$all | ForEach-Object {$_.Current.Name} | Where-Object {$_}
foreach($label in @('周K结构（辅助）','日K结构（辅助）')){if($names -notcontains $label){throw "详情缺少：$label"}}
for($i=0;$i -lt 50;$i++){$chart=ById 'contractChart';if($chart -and $chart.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition).Count -gt 1){break};Start-Sleep -Milliseconds 200}
Start-Sleep -Milliseconds 500
Shot ('WindowsAPP-'+$ProductName+'详情')
Write-Output "新版Windows APP实际点击：$ProductName 详情、周日结构、提醒和研究入口通过。没有创建正式交易卡或启动AI。"
