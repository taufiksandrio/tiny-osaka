$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $repoRoot '.env.auth.local'
if (Test-Path -LiteralPath $envPath) { throw 'Auth configuration exists; refusing overwrite.' }
$bytes = New-Object byte[] 48
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($bytes) } finally { $random.Dispose() }
$secret = [Convert]::ToBase64String($bytes)
$stream = [IO.File]::Open($envPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$stream.Dispose()
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
Set-Acl -LiteralPath $envPath -AclObject $acl
[IO.File]::WriteAllText($envPath,"BETTER_AUTH_SECRET=$secret`nBETTER_AUTH_URL=http://localhost:3000`n",(New-Object Text.UTF8Encoding($false)))
$secret = $null
[Array]::Clear($bytes,0,$bytes.Length)
Write-Host 'Private local auth configuration created. Restart the development server.'
