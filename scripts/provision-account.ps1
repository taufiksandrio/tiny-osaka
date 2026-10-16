param(
    [ValidateSet('owner','staff')][string]$Role = 'owner',
    [string]$Email = '',
    [string]$DisplayName = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$accountEmail = if ($Email) { $Email } else { Read-Host 'Internal account email' }
$accountName = if ($DisplayName) { $DisplayName } else { Read-Host 'Account display name' }
$password = Read-Host 'New unique password (6-128 characters)' -AsSecureString
$confirm = Read-Host 'Repeat password' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$confirmation = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmation)) { throw 'Passwords do not match.' }
    $payload = @{ email=$accountEmail; name=$accountName; role=$Role; password=$plain } | ConvertTo-Json -Compress
    $previousEncoding = $OutputEncoding
    $OutputEncoding = New-Object Text.UTF8Encoding($false)
    Push-Location -LiteralPath $repoRoot
    try {
        $payload | node --conditions=react-server --env-file=.env.dev-migrator.local scripts/provision-account.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed.' }
    } finally { Pop-Location; $OutputEncoding = $previousEncoding }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmation)
    $password.Dispose(); $confirm.Dispose()
    $plain=$null; $payload=$null
}
