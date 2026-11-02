$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path -LiteralPath '.').Path
if($projectRoot -ne 'D:\五简个人资料\2026年10月文件\小木工作台\wujian-jarvis'){throw '归档必须从唯一项目根目录执行'}
$archiveRoot=[System.IO.Path]::GetFullPath((Join-Path $projectRoot '..\历史归档\2026-10-25_产品整改'))
$allowedRoot='D:\五简个人资料\2026年10月文件\小木工作台\历史归档\'
if(!$archiveRoot.StartsWith($allowedRoot,[System.StringComparison]::OrdinalIgnoreCase)){throw '归档目标越界'}
$plan=Get-Content -LiteralPath 'output\redesign-2026-10-25\archive-plan.json' -Raw | ConvertFrom-Json
$moved=@()
foreach($item in $plan.items | Where-Object decision -eq 'archive'){
 $source=[System.IO.Path]::GetFullPath((Join-Path $projectRoot $item.path));$target=[System.IO.Path]::GetFullPath((Join-Path $archiveRoot $item.path))
 if(!$source.StartsWith($projectRoot+'\',[System.StringComparison]::OrdinalIgnoreCase) -or !$target.StartsWith($archiveRoot+'\',[System.StringComparison]::OrdinalIgnoreCase)){throw '归档路径越界'}
 if(!(Test-Path -LiteralPath $source)){continue}
 if(Test-Path -LiteralPath $target){throw "归档目标已存在，禁止覆盖：$target"}
 $resolved=(Resolve-Path -LiteralPath $source).Path
 if(!$resolved.StartsWith($projectRoot+'\',[System.StringComparison]::OrdinalIgnoreCase)){throw '源解析路径越界'}
 if((Get-Item -LiteralPath $source).Attributes -band [System.IO.FileAttributes]::ReparsePoint){throw '归档源为联接，需单独核对'}
 if($item.kind -eq 'runtime'){
  $active=@(Get-Process | Where-Object {$_.Path -and $_.Path.StartsWith($source+'\',[System.StringComparison]::OrdinalIgnoreCase)})
  if($active.Count){throw "构建仍在使用：$source"}
 }
 New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
 Move-Item -LiteralPath $source -Destination $target
 $moved+=[pscustomobject]@{source=$source;target=$target;kind=$item.kind}
}
$moved | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath 'output\redesign-2026-10-25\archive-result.json' -Encoding UTF8
Write-Output "已可恢复归档 $($moved.Count) 项；未永久删除"
