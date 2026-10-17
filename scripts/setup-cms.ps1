$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $repoRoot '.env.cms.local'
if (Test-Path -LiteralPath $envPath) { throw 'CMS configuration exists; refusing overwrite.' }
$adminSecret = Read-Host 'Local PostgreSQL postgres administrator password (never send through chat)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
try {
    $stream = [IO.File]::Open($envPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $stream.Dispose()
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
    Set-Acl -LiteralPath $envPath -AclObject $acl
    $env:TINY_OSAKA_SETUP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    Push-Location $repoRoot
    try {
        & node scripts/setup-cms.mjs
        if ($LASTEXITCODE -ne 0) { throw 'CMS setup failed. Inspect roles and private config before retry; no automatic overwrite.' }
    } finally { Pop-Location }
} finally {
    Remove-Item Env:TINY_OSAKA_SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $adminSecret.Dispose()
}
