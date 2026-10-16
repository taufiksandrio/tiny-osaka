param([switch]$CompleteExistingRoles)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$devPath = Join-Path $repoRoot '.env.local'
$testPath = Join-Path $repoRoot '.env.test.local'
$statusDir = Join-Path $repoRoot 'test-results'
$statusPath = Join-Path $statusDir 'local-db-setup-status.json'
$rolesProvisioned = [bool]$CompleteExistingRoles
$setupPhase = 'preflight'
$psqlExitCode = $null

function Write-PrivateEnv {
    param([string]$Path, [string]$Key, [string]$Role, [string]$Database, [Security.SecureString]$Password)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    # Protect the empty file BEFORE writing a secret. Fail closed if ACL cannot be set.
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    try {
        $encoded = [Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
        $line = '{0}=postgresql://{1}:{2}@127.0.0.1:5432/{3}' -f $Key, $Role, $encoded, $Database
        [IO.File]::WriteAllText($Path, $line + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $encoded = $null
        $line = $null
    }
}

try {
    if ((Test-Path -LiteralPath $devPath) -or (Test-Path -LiteralPath $testPath)) {
        throw 'Existing env file; refusing to overwrite.'
    }
    $psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    if (-not (Test-Path -LiteralPath $psql)) { throw 'PostgreSQL 18 psql not found.' }
    if (-not (Test-Path -LiteralPath $statusDir)) {
        New-Item -ItemType Directory -Path $statusDir | Out-Null
    }
    @{ state = 'awaiting-passwords'; rolesProvisioned = $rolesProvisioned;
        completingExistingRoles = [bool]$CompleteExistingRoles } |
        ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    Write-Host 'LOCAL PostgreSQL only. First enter your postgres administrator password.'
    Write-Host 'Then set two DIFFERENT app passwords, BOTH at least 20 characters.'
    if ($CompleteExistingRoles) {
        Write-Host 'RECOVERY: verify the two existing app roles, then reset only their passwords.'
        Write-Host 'No roles/databases/tables will be created in this mode.'
    }
    Write-Host 'Passwords stay in this terminal. Do not paste them into chat.'
    $setupPhase = 'psql-provisioning'
    $existingMode = if ($CompleteExistingRoles) { 'true' } else { 'false' }
    & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -v ON_ERROR_STOP=1 -v "complete_existing_roles=$existingMode" --single-transaction -f (Join-Path $PSScriptRoot 'setup-local-db.sql')
    $psqlExitCode = $LASTEXITCODE
    if ($psqlExitCode -ne 0) { throw 'Database provisioning failed; inspect the terminal, not secret logs.' }
    $rolesProvisioned = $true
    $setupPhase = 'env-password-entry'
    Write-Host 'Now re-enter each app password to save its private env file.'
    $devSecret = Read-Host 'Password just set for tiny_osaka_dev_app' -AsSecureString
    $testSecret = Read-Host 'Password just set for tiny_osaka_test_app' -AsSecureString
    try {
        if ($devSecret.Length -lt 20 -or $testSecret.Length -lt 20) {
            $setupPhase = 'password-too-short'
            throw 'Use passwords of at least 20 characters; roles exist but env files were not written.'
        }
        $devPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($devSecret)
        $testPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($testSecret)
        try {
            if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($devPointer) -ceq
                [Runtime.InteropServices.Marshal]::PtrToStringBSTR($testPointer)) {
                $setupPhase = 'passwords-not-distinct'
                throw 'Use different dev/test passwords; env files were not written.'
            }
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($devPointer)
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($testPointer)
        }
        $setupPhase = 'dev-env-write'
        Write-PrivateEnv -Path $devPath -Key 'DATABASE_URL' -Role 'tiny_osaka_dev_app' -Database 'tiny_osaka_dev' -Password $devSecret
        $setupPhase = 'test-env-write'
        Write-PrivateEnv -Path $testPath -Key 'TEST_DATABASE_URL' -Role 'tiny_osaka_test_app' -Database 'tiny_osaka_test' -Password $testSecret
    } finally {
        if ($devSecret) { $devSecret.Dispose() }
        if ($testSecret) { $testSecret.Dispose() }
    }
    @{ state = 'configured'; rolesProvisioned = $true; connectionsVerified = $false } |
        ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    Write-Host 'SUCCESS: roles and private env files created. Connection tests are next.' -ForegroundColor Green
} catch {
    # Do not persist exception details, URLs, password verifiers or credentials.
    $failureLine = $_.InvocationInfo.ScriptLineNumber
    $failureType = $_.Exception.GetType().FullName
    if (Test-Path -LiteralPath $statusDir) {
        @{ state = 'failed'; rolesProvisioned = $rolesProvisioned; phase = $setupPhase;
            psqlExitCode = $psqlExitCode; errorType = $failureType; line = $failureLine } |
            ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    }
    Write-Host 'Setup stopped. Existing roles/env files are never overwritten automatically.' -ForegroundColor Red
    Write-Host ('Roles provisioned: ' + $rolesProvisioned)
    Write-Host ('Phase: ' + $setupPhase + '; psql exit code: ' + $psqlExitCode)
    Write-Host ('Error type: ' + $failureType + '; script line: ' + $failureLine)
    if ($setupPhase -eq 'password-too-short') {
        Write-Host 'At least one re-entered app password is shorter than 20 characters.'
    }
    if ($setupPhase -eq 'passwords-not-distinct') {
        Write-Host 'The two re-entered app passwords must be different.'
    }
    Write-Host 'The original psql error, if any, is ABOVE this summary.'
    Write-Host 'Do not rerun blindly; check setup state before recovery.'
    exit 1
}
