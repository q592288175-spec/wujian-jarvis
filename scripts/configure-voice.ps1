$ErrorActionPreference='Stop'
function Read-Hidden([string]$Prompt) {
 $secure=Read-Host $Prompt -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
 finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}
$root=Split-Path $PSScriptRoot -Parent
$node=Join-Path $root '.runtime/node/node.exe'
if(!(Test-Path -LiteralPath $node)) { $node=(Get-Command node -ErrorAction Stop).Source }
Push-Location -LiteralPath $root
try {
 $mode=Read-Host '新版 API Key 输入 1；旧版 APP ID + Access Token 输入 2'
 if($mode -eq '1') { $value=@{protocol='duplex';apiKey=(Read-Hidden '豆包语音 API Key（隐藏输入）')} }
 elseif($mode -eq '2') { $value=@{protocol='duplex';appId=(Read-Host '语音 APP ID');accessToken=(Read-Hidden '语音 Access Token（隐藏输入）')} }
 else { throw '已取消，未保存配置。' }
 if($value.apiKey -eq '' -or $value.accessToken -eq '') { throw '密钥为空，未保存配置。' }
 $value | ConvertTo-Json -Compress | & $node scripts/configure-voice.mjs
 if($LASTEXITCODE -ne 0) { throw '配置失败，未保存新凭据。' }
} finally { $value=$null; Pop-Location }
