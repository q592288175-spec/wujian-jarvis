$ErrorActionPreference='Stop'
$project='D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis'
$out=Join-Path $project 'output\chart-sizing-zoom-2026-10-25'
$executable=Join-Path $project '.runtime\desktop-chart-sizing-zoom-20261025\小木-win32-x64\小木.exe'
if(-not(Test-Path -LiteralPath $executable)){throw '已验收的新桌面程序缺失'}
$ws=New-Object -ComObject WScript.Shell
$rows=Get-Content -LiteralPath (Join-Path $out 'shortcuts-before.json') -Raw|ConvertFrom-Json
$results=foreach($before in $rows){
 if(-not(Test-Path -LiteralPath $before.path)){continue}
 $link=$ws.CreateShortcut($before.path);$link.TargetPath=$executable;$link.WorkingDirectory=$project;$link.IconLocation=$executable+',0';$link.Save()
 $verify=$ws.CreateShortcut($before.path);if($verify.TargetPath -ne $executable){throw '快捷方式未指向新版'}
 [pscustomobject]@{path=$before.path;target=$verify.TargetPath;verified=$true}
}
$results|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $out 'shortcuts-updated.json') -Encoding utf8
$results|ConvertTo-Json -Compress
