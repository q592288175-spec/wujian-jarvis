$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$output=Join-Path $project 'output/tq-release-20261028'
$executable=Join-Path $project '.runtime/desktop-tq-verified-20261028/小木-win32-x64/小木.exe'
if(-not(Test-Path -LiteralPath $executable)){throw '已验收的天勤登录桌面程序缺失'}
New-Item -ItemType Directory -Path $output -Force | Out-Null
$ws=New-Object -ComObject WScript.Shell
$previous=Get-Content -LiteralPath (Join-Path $project 'output/chart-sizing-zoom-2026-10-25/shortcuts-before.json') -Raw -Encoding utf8 | ConvertFrom-Json
$before=foreach($row in $previous){if(Test-Path -LiteralPath $row.path){$link=$ws.CreateShortcut($row.path);[pscustomobject]@{path=$row.path;target=$link.TargetPath;workingDirectory=$link.WorkingDirectory;arguments=$link.Arguments;icon=$link.IconLocation}}}
$before | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'shortcuts-before.json') -Encoding utf8
$after=foreach($row in $before){
 $link=$ws.CreateShortcut($row.path);$link.TargetPath=$executable;$link.WorkingDirectory=$project;$link.IconLocation=$executable+',0';$link.Save()
 $check=$ws.CreateShortcut($row.path);if($check.TargetPath -ne $executable){throw '快捷方式核验失败'}
 [pscustomobject]@{path=$row.path;target=$check.TargetPath;verified=$true}
}
$after | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'shortcuts-updated.json') -Encoding utf8
$after | ConvertTo-Json -Compress
