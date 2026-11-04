param([int]$Port=4321)
$ErrorActionPreference='Stop'
if($Port -lt 1024 -or $Port -gt 65535){throw '端口不在允许范围'}
$ruleName="Xiaomu-LAN-$Port"
if(!(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)){
 New-NetFirewallRule -Name $ruleName -DisplayName "小木局域网访问 $Port（仅本地子网）" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Write-Output "已允许本地子网访问TCP $Port；未设置公网端口映射。"
