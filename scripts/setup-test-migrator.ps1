param([switch]$CompleteExistingRole)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $repoRoot '.env.test-migrator.local'
$statusDir = Join-Path $repoRoot 'test-results'
$statusPath = Join-Path $statusDir 'test-migrator-setup-status.json'
$phase = 'preflight'
$roleProvisioned = [bool]$CompleteExistingRole
$psqlExitCode = $null
$migratorSecret = $null
try {
    if (Test-Path -LiteralPath $envPath) { throw 'Private migrator env already exists; refusing overwrite.' }
    $psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    if (-not (Test-Path -LiteralPath $psql)) { throw 'PostgreSQL 18 client missing.' }
    if (-not (Test-Path -LiteralPath $statusDir)) { New-Item -ItemType Directory -Path $statusDir | Out-Null }
    @{ state = 'awaiting-passwords'; roleProvisioned = $roleProvisioned } |
        ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    Write-Host 'LOCAL TEST MIGRATOR ONLY. No migration runs from this setup script.'
    Write-Host 'Choose a NEW unique migrator password; do not reuse postgres or app passwords.'
    Write-Host 'It will be requested here, then twice by psql after administrator login.'
    $phase = 'choose-password'
    do {
        if ($migratorSecret) { $migratorSecret.Dispose() }
        $migratorSecret = Read-Host 'NEW tiny_osaka_test_migrator password (at least 20 characters)' -AsSecureString
        if ($migratorSecret.Length -lt 20) { Write-Host 'Too short. Choose at least 20 characters; no DB changes yet.' }
    } while ($migratorSecret.Length -lt 20)
    Write-Host 'Now enter the POSTGRES ADMINISTRATOR password from installation.'
    $phase = 'psql-provisioning'
    $existingMode = if ($CompleteExistingRole) { 'true' } else { 'false' }
    & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -v ON_ERROR_STOP=1 -v "complete_existing_role=$existingMode" --single-transaction -f (Join-Path $PSScriptRoot 'setup-test-migrator.sql')
    $psqlExitCode = $LASTEXITCODE
    if ($psqlExitCode -ne 0) { throw 'Provisioning failed; original psql error is above.' }
    $roleProvisioned = $true
    $phase = 'private-env-write'
    $stream = [IO.File]::Open($envPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')))
    Set-Acl -LiteralPath $envPath -AclObject $acl
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($migratorSecret)
    try {
        $encoded = [Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
        $line = 'TEST_MIGRATION_DATABASE_URL=postgresql://tiny_osaka_test_migrator:{0}@127.0.0.1:5432/tiny_osaka_test' -f $encoded
        [IO.File]::WriteAllText($envPath, $line + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $encoded = $null
        $line = $null
    }
    @{ state = 'configured'; roleProvisioned = $true; migrationApplied = $false } |
        ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    Write-Host 'SUCCESS: test migrator and private env created. Migration is the next separate command.' -ForegroundColor Green
} catch {
    $errorType = $_.Exception.GetType().FullName
    $failureLine = $_.InvocationInfo.ScriptLineNumber
    if (Test-Path -LiteralPath $statusDir) {
        @{ state = 'failed'; roleProvisioned = $roleProvisioned; phase = $phase;
            psqlExitCode = $psqlExitCode; errorType = $errorType; line = $failureLine } |
            ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    }
    Write-Host ('Setup stopped. Phase: ' + $phase + '; psql exit: ' + $psqlExitCode + '; role provisioned: ' + $roleProvisioned) -ForegroundColor Red
    Write-Host 'No secret details logged. Inspect state before retry; no automatic overwrite.'
    exit 1
} finally {
    if ($migratorSecret) { $migratorSecret.Dispose() }
}
