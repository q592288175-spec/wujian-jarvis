$ErrorActionPreference='Stop'
$project='D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis'
$executable=Join-Path $project '.runtime\desktop-unified-20261025\小木-win32-x64\小木.exe'
if(-not (Test-Path -LiteralPath $executable)){throw '新版桌面构建不存在'}
$checkpoint=(Get-Content -LiteralPath (Join-Path $project 'output\unified-workbench-2026-10-25\checkpoint.json') -Raw|ConvertFrom-Json).destination
$backupFolder=Join-Path $checkpoint 'shortcuts';New-Item -ItemType Directory -Path $backupFolder -Force|Out-Null
$ws=New-Object -ComObject WScript.Shell
$locations=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('StartMenu'),'C:\Users\Public\Desktop')
$results=@();$number=0
foreach($folder in $locations){
 if(-not(Test-Path -LiteralPath $folder)){continue}
 foreach($file in Get-ChildItem -LiteralPath $folder -Filter '*小木*.lnk' -Recurse -ErrorAction SilentlyContinue){
  $link=$ws.CreateShortcut($file.FullName)
  if(-not [IO.Path]::GetFullPath($link.TargetPath).StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase)){continue}
  $number++;$before=@{path=$file.FullName;target=$link.TargetPath;arguments=$link.Arguments;workingDirectory=$link.WorkingDirectory;icon=$link.IconLocation}
  Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $backupFolder ($number.ToString()+'-'+$file.Name))
  $link.TargetPath=$executable;$link.WorkingDirectory=$project;$link.IconLocation=$executable+',0';$link.Save()
  $check=$ws.CreateShortcut($file.FullName);if($check.TargetPath -ne $executable){throw '快捷方式核验失败'}
  $results+=@{before=$before;target=$check.TargetPath;verified=$true}
 }
}
$results|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $project 'output\unified-workbench-2026-10-25\shortcuts-verification.json') -Encoding utf8
$results|ConvertTo-Json -Depth 5 -Compress
