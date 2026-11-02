param([ValidateSet('encrypt','decrypt')][string]$Mode)
$ErrorActionPreference='Stop'
try {
 Add-Type -AssemblyName System.Security
 $inputData=[Console]::In.ReadToEnd() | ConvertFrom-Json
 $bytes=[Convert]::FromBase64String($inputData.data)
 $scope=[System.Security.Cryptography.DataProtectionScope]::CurrentUser
 if($Mode -eq 'encrypt'){$result=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,$scope)}
 else{$result=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,$scope)}
 @{data=[Convert]::ToBase64String($result)} | ConvertTo-Json -Compress
} catch {
 [Console]::Error.WriteLine('Local credential encryption failed')
 exit 1
}
