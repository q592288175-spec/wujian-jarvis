$ErrorActionPreference='Stop'
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(!$admin){
 try{$child=Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath);exit $child.ExitCode}
 catch{Write-Error 'Windows管理员授权未完成，局域网防火墙规则尚未添加。';exit 1}
}
& (Join-Path $PSScriptRoot 'allow-lan-firewall.ps1') -Port 4321
$rule=Get-NetFirewallRule -Name 'Xiaomu-LAN-4321' -ErrorAction Stop
$dir=Join-Path (Split-Path $PSScriptRoot -Parent) '.runtime/private'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
@{at=(Get-Date).ToString('o');name=$rule.Name;enabled=[string]$rule.Enabled;port=4321;remoteAddress='LocalSubnet'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dir 'lan-firewall-status.json') -Encoding UTF8
