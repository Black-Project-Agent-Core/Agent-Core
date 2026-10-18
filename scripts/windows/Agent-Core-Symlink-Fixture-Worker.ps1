#requires -Version 5.1
# Fixed on-demand Scheduled Task action. Install the COPY under protected NTFS only.
# SYSTEM accepts one bounded fixed-file request; it never accepts paths or commands.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$auditReady = $false
$auditReceipts = $null
$env:PSModulePath = [IO.Path]::Combine($PSHOME,'Modules')
trap {
    $bootstrapError = $_
    $message = [string]$bootstrapError.Exception.Message
    if ($message.Length -gt 600) { $message = $message.Substring(0,600) }
    if ($auditReady) {
        try {
            # This path is fixed, regular and ACL-verified before auditReady is set.
            # Keep at most 16 diagnostics; never overwrite or purge earlier evidence.
            $count = 0
            foreach ($entryPath in [IO.Directory]::EnumerateFileSystemEntries(
                $auditReceipts,'*.bootstrap-error.json',[IO.SearchOption]::TopDirectoryOnly)) {
                if ([IO.Path]::GetFileName($entryPath) -cmatch
                    '^[0-9a-f]{32}\.bootstrap-error\.json$') { $count++ }
                if ($count -ge 16) { break }
            }
            if ($count -lt 16) {
                $diagnostic = [ordered]@{
                    version=1; status='failed'; error=$message
                    lineNumber=[int]$bootstrapError.InvocationInfo.ScriptLineNumber
                    at=[DateTimeOffset]::UtcNow.ToString('o')
                }
                $auditPath = [IO.Path]::Combine($auditReceipts,
                    ([Guid]::NewGuid().ToString('N') + '.bootstrap-error.json'))
                $auditBytes = [Text.Encoding]::UTF8.GetBytes(
                    ($diagnostic | ConvertTo-Json -Depth 3 -Compress))
                $auditStream = [IO.File]::Open($auditPath,[IO.FileMode]::CreateNew,
                    [IO.FileAccess]::Write,[IO.FileShare]::None)
                try { $auditStream.Write($auditBytes,0,$auditBytes.Length); $auditStream.Flush() }
                finally { $auditStream.Dispose() }
            }
        }
        catch { } # Diagnostics must not mask the original failure or retry work.
    }
    [Console]::Error.WriteLine($message)
    exit 1
}
$base = [IO.Path]::GetFullPath($PSScriptRoot)
$configPath = Join-Path $base 'settings.json'
$requestPath = Join-Path $base 'request.json'
$cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($cfg.version -ne 1 -or $cfg.userSid -notmatch '^S-1-5-21-(?:\d+-){3}\d+$' -or
    $cfg.installId -notmatch '^[0-9a-f]{32}$') { throw 'FIXTURE_PROTECTED_CONFIG_INVALID' }
$actualSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($actualSid -ne 'S-1-5-18') { throw 'FIXTURE_TASK_MUST_RUN_AS_LOCAL_SYSTEM' }
$hash = [Security.Cryptography.SHA256]::Create()
try {
    $bytes = $hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($cfg.userSid))
    $key = ([BitConverter]::ToString($bytes)).Replace('-','').Substring(0,16).ToLowerInvariant()
} finally { $hash.Dispose() }
$expected = Join-Path $env:ProgramData ('AgentCore-SymlinkFixture-' + $key)
if ($expected -ine $base) { throw 'FIXTURE_INSTALL_LOCATION_INVALID' }
function Assert-RegularDirectory([string]$value) {
    $entry = Get-Item -LiteralPath $value -Force -ErrorAction Stop
    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'FIXTURE_DIRECTORY_NOT_REGULAR'
    }
}
Assert-RegularDirectory $base
Assert-RegularDirectory (Join-Path $base 'fixtures')
Assert-RegularDirectory (Join-Path $base 'receipts')
$requestItem = Get-Item -LiteralPath $requestPath -Force
if ($requestItem.PSIsContainer -or
    ($requestItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'FIXTURE_REQUEST_FILE_NOT_REGULAR'
}
$requestWritable = $false
foreach ($p in @($base,$PSCommandPath,$configPath,$requestPath,
    (Join-Path $base 'fixtures'),(Join-Path $base 'receipts'))) {
    $acl = Get-Acl -LiteralPath $p
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($owner -notin @('S-1-5-18','S-1-5-32-544') -or
        ($p -eq $base -and -not $acl.AreAccessRulesProtected)) {
        throw 'FIXTURE_PROTECTED_ACL_INVALID'
    }
    foreach ($entry in $acl.Access) {
        if ($entry.AccessControlType -ne 'Allow') { continue }
        $aceSid = $entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($aceSid -notin @('S-1-5-18','S-1-5-32-544',$cfg.userSid)) {
            throw 'FIXTURE_PROTECTED_ACL_UNEXPECTED_PRINCIPAL'
        }
        $writeMask = [int][Security.AccessControl.FileSystemRights]::WriteData -bor
            [int][Security.AccessControl.FileSystemRights]::AppendData -bor
            [int][Security.AccessControl.FileSystemRights]::WriteAttributes -bor
            [int][Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
            [int][Security.AccessControl.FileSystemRights]::Delete -bor
            [int][Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
            [int][Security.AccessControl.FileSystemRights]::ChangePermissions -bor
            [int][Security.AccessControl.FileSystemRights]::TakeOwnership
        if ($aceSid -eq $cfg.userSid) {
            $userWrite = [int]$entry.FileSystemRights -band $writeMask
            $allowedWrite = 0
            if ($p -eq $requestPath) {
                $allowedWrite = [int][Security.AccessControl.FileSystemRights]::WriteData
                if (($userWrite -band $allowedWrite) -ne 0) {
                    if ($entry.IsInherited) { throw 'FIXTURE_REQUEST_WRITE_MUST_BE_EXPLICIT' }
                    $requestWritable = $true
                }
            }
            if (($userWrite -band (-bnot $allowedWrite)) -ne 0) {
                throw 'FIXTURE_PROTECTED_ACL_USER_CAN_WRITE'
            }
        }
    }
}
if (-not $requestWritable) { throw 'FIXTURE_REQUEST_WRITE_ACCESS_MISSING' }
$auditReceipts = Join-Path $base 'receipts'
$auditReady = $true
# Hash command discovery errors are now observable after the protected path gate.
if ((Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne
    [string]$cfg.workerSha256) { throw 'FIXTURE_WORKER_DIGEST_CHANGED' }
$requestStream = [IO.File]::Open($requestPath,[IO.FileMode]::Open,
    [IO.FileAccess]::Read,[IO.FileShare]::None)
try {
    if ($requestStream.Length -gt 4096 -or $requestStream.Length -lt 2) {
        throw 'FIXTURE_REQUEST_SIZE_INVALID'
    }
    $requestBytes = New-Object byte[] ([int]$requestStream.Length)
    $read = 0
    while ($read -lt $requestBytes.Length) {
        $count = $requestStream.Read($requestBytes,$read,$requestBytes.Length-$read)
        if ($count -le 0) { throw 'FIXTURE_REQUEST_READ_TRUNCATED' }
        $read += $count
    }
    $requestJson = [Text.UTF8Encoding]::new($false,$true).GetString($requestBytes)
}
finally { $requestStream.Dispose() }
if (-not ($requestJson -is [string]) -or $requestJson.Length -gt 750) {
    throw 'FIXTURE_REQUEST_INVALID'
}
$request = $requestJson | ConvertFrom-Json
$operation = [string]$request.operation
$runId = [string]$request.runId
if ($request.version -ne 1 -or $operation -cnotin @('prepare','cleanup','workflows','cleanup-workflows') -or
    $runId -cnotmatch '^[0-9a-f]{32}$' -or [string]$request.installId -cne $cfg.installId) {
    throw 'FIXTURE_REQUEST_FIELDS_INVALID'
}
$issued = [DateTimeOffset]::Parse([string]$request.issuedAt)
if ([Math]::Abs(([DateTimeOffset]::UtcNow - $issued).TotalSeconds) -gt 120) {
    throw 'FIXTURE_REQUEST_EXPIRED'
}
$fixture = Join-Path (Join-Path $base 'fixtures') $runId
$inside = Join-Path $fixture 'inside'
$outside = Join-Path $fixture 'outside'
$links = @((Join-Path $inside 'linked-root'),(Join-Path $inside 'parent-alias'))
$receiptPath = Join-Path (Join-Path $base 'receipts') ($runId + '.' + $operation + '.json')
if (Test-Path -LiteralPath $receiptPath) { throw 'FIXTURE_RECEIPT_ALREADY_EXISTS' }
function Assert-RealLink([string]$link) {
    $item = Get-Item -LiteralPath $link -Force -ErrorAction Stop
    if ($item.LinkType -cne 'SymbolicLink' -or
        -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'FIXTURE_LINK_NOT_SYMBOLIC'
    }
    $targetText = [string](@($item.Target)[0])
    if (-not [IO.Path]::IsPathRooted($targetText)) { throw 'FIXTURE_LINK_TARGET_CHANGED' }
    $dest = [IO.Path]::GetFullPath($targetText)
    if ($dest -ine $outside) { throw 'FIXTURE_LINK_TARGET_CHANGED' }
}
function Get-WorkflowsLayout {
    $fixtureRoot = Join-Path (Join-Path $base 'fixtures') 'workflows'
    $root = Join-Path $fixtureRoot 'root'
    $outsideRoot = Join-Path $fixtureRoot 'outside'
    return @{
        fixtureRoot=$fixtureRoot; root=$root; outside=$outsideRoot
        source=Join-Path $root 'src'; subproject=Join-Path $root 'SubProject'
        private=Join-Path $outsideRoot 'private'
        linkedFile=Join-Path (Join-Path $root 'src') 'linked.ts'
        linkedDirectory=Join-Path (Join-Path $root 'src') 'linked-dir'
        excludedLink=Join-Path (Join-Path $root 'SubProject') 'excluded-fixture'
        projectLink=Join-Path $outsideRoot 'project-link'
    }
}
function Assert-WorkflowsAcl([string]$value) {
    $acl = Get-Acl -LiteralPath $value
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin
        @('S-1-5-18','S-1-5-32-544') -or $acl.AreAccessRulesProtected) {
        throw 'WORKFLOWS_FIXTURE_PROTECTED_ACL_INVALID'
    }
    $userRead = $false
    $readMask = [int][Security.AccessControl.FileSystemRights]::ReadAndExecute
    $writeMask = [int][Security.AccessControl.FileSystemRights]::WriteData -bor
        [int][Security.AccessControl.FileSystemRights]::AppendData -bor
        [int][Security.AccessControl.FileSystemRights]::WriteAttributes -bor
        [int][Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
        [int][Security.AccessControl.FileSystemRights]::Delete -bor
        [int][Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
        [int][Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [int][Security.AccessControl.FileSystemRights]::TakeOwnership
    foreach ($entry in $acl.Access) {
        if ($entry.AccessControlType -ne 'Allow') { continue }
        $entrySid = $entry.IdentityReference.Translate(
            [Security.Principal.SecurityIdentifier]).Value
        if ($entrySid -notin @('S-1-5-18','S-1-5-32-544',$cfg.userSid)) {
            throw 'WORKFLOWS_FIXTURE_UNEXPECTED_PRINCIPAL'
        }
        if ($entrySid -eq $cfg.userSid) {
            if (-not $entry.IsInherited -or
                (([int]$entry.FileSystemRights -band $writeMask) -ne 0)) {
                throw 'WORKFLOWS_FIXTURE_USER_CAN_MODIFY'
            }
            if (([int]$entry.FileSystemRights -band $readMask) -eq $readMask) {
                $userRead = $true
            }
        }
    }
    if (-not $userRead) { throw 'WORKFLOWS_FIXTURE_USER_READ_ACCESS_MISSING' }
}
function Assert-WorkflowsChildren([string]$value,[string[]]$names) {
    $entries = @(Get-ChildItem -LiteralPath $value -Force)
    if ($entries.Count -ne $names.Count) { throw 'WORKFLOWS_FIXTURE_FOREIGN_ENTRIES' }
    foreach ($entry in $entries) {
        if ($entry.Name -cnotin $names) { throw 'WORKFLOWS_FIXTURE_FOREIGN_ENTRIES' }
    }
}
function Assert-WorkflowsFile([string]$value,[string]$content) {
    $item = Get-Item -LiteralPath $value -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        -not ($item.Attributes -band [IO.FileAttributes]::ReadOnly)) {
        throw 'WORKFLOWS_FIXTURE_SOURCE_NOT_REGULAR_READONLY'
    }
    Assert-WorkflowsAcl $value
    $expectedBytes = [Text.Encoding]::UTF8.GetBytes($content)
    if ($item.Length -ne $expectedBytes.Length -or
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($value)) -cne
        [Convert]::ToBase64String($expectedBytes)) {
        throw 'WORKFLOWS_FIXTURE_SOURCE_CONTENT_CHANGED'
    }
}
function Assert-WorkflowsLink([string]$value,[string]$target,[bool]$directory) {
    $item = Get-Item -LiteralPath $value -Force
    if ($item.LinkType -cne 'SymbolicLink' -or
        -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        [bool]$item.PSIsContainer -ne $directory -or @($item.Target).Count -ne 1) {
        throw 'WORKFLOWS_FIXTURE_LINK_NOT_SYMBOLIC'
    }
    $targetText = [string](@($item.Target)[0])
    if (-not [IO.Path]::IsPathRooted($targetText) -or
        $targetText -ine $target -or [IO.Path]::GetFullPath($targetText) -ine $target) {
        throw 'WORKFLOWS_FIXTURE_LINK_TARGET_CHANGED'
    }
}
function Test-WorkflowsFixture($layout) {
    $existing = @(Get-ChildItem -LiteralPath (Join-Path $base 'fixtures') -Force |
        Where-Object { $_.Name -ieq 'workflows' })
    if ($existing.Count -eq 0) { return $false }
    foreach ($directory in @($layout.fixtureRoot,$layout.root,$layout.source,
        $layout.subproject,$layout.outside,$layout.private)) {
        Assert-RegularDirectory $directory
        Assert-WorkflowsAcl $directory
    }
    Assert-WorkflowsChildren $layout.fixtureRoot @('root','outside')
    Assert-WorkflowsChildren $layout.root @('src','SubProject')
    Assert-WorkflowsChildren $layout.source @('index.ts','linked.ts','linked-dir')
    Assert-WorkflowsChildren $layout.subproject @('excluded-fixture')
    Assert-WorkflowsChildren $layout.outside @('outside.ts','private','project-link')
    Assert-WorkflowsChildren $layout.private @('file.ts')
    Assert-WorkflowsFile (Join-Path $layout.source 'index.ts') ([string]::Join(
        [char]10,@('import "../outside.ts";','import "./linked.ts";')))
    Assert-WorkflowsFile (Join-Path $layout.outside 'outside.ts') 'export const secret = 1;'
    Assert-WorkflowsFile (Join-Path $layout.private 'file.ts') ''
    Assert-WorkflowsLink $layout.linkedFile (Join-Path $layout.outside 'outside.ts') $false
    Assert-WorkflowsLink $layout.linkedDirectory $layout.private $true
    Assert-WorkflowsLink $layout.excludedLink $layout.outside $true
    Assert-WorkflowsLink $layout.projectLink $layout.root $true
    return $true
}
function Save-Receipt([object]$value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($value | ConvertTo-Json -Depth 6 -Compress))
    $stream = [IO.File]::Open($receiptPath,[IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush() }
    finally { $stream.Dispose() }
}
$success = $false
$problem = $null
$workflowsLayout = $null
$reusedExisting = $false
try {
    if ($operation -cin @('workflows','cleanup-workflows')) {
        $workflowsLayout = Get-WorkflowsLayout
        $fixture = $workflowsLayout.fixtureRoot
        $reusedExisting = Test-WorkflowsFixture $workflowsLayout
        if ($operation -ceq 'cleanup-workflows') {
            if (-not $reusedExisting) { throw 'WORKFLOWS_FIXTURE_MISSING' }
            # All targets, parents, files, ACLs and exact child lists were validated.
            # Delete link entries only; never recursively traverse their targets.
            [IO.File]::Delete($workflowsLayout.linkedFile)
            foreach ($link in @($workflowsLayout.linkedDirectory,
                $workflowsLayout.excludedLink,$workflowsLayout.projectLink)) {
                [IO.Directory]::Delete($link,$false)
            }
            foreach ($file in @((Join-Path $workflowsLayout.source 'index.ts'),
                (Join-Path $workflowsLayout.outside 'outside.ts'),
                (Join-Path $workflowsLayout.private 'file.ts'))) {
                [IO.File]::SetAttributes($file,[IO.FileAttributes]::Normal)
                [IO.File]::Delete($file)
            }
            foreach ($directory in @($workflowsLayout.source,$workflowsLayout.subproject,
                $workflowsLayout.private,$workflowsLayout.root,$workflowsLayout.outside,
                $workflowsLayout.fixtureRoot)) {
                [IO.Directory]::Delete($directory,$false)
            }
        }
        elseif (-not $reusedExisting) {
            foreach ($directory in @($workflowsLayout.fixtureRoot,$workflowsLayout.root,
                $workflowsLayout.source,$workflowsLayout.subproject,
                $workflowsLayout.outside,$workflowsLayout.private)) {
                [IO.Directory]::CreateDirectory($directory) | Out-Null
                Assert-RegularDirectory $directory
                Assert-WorkflowsAcl $directory
            }
            $files = @(
                @{path=Join-Path $workflowsLayout.source 'index.ts'; content=[string]::Join(
                    [char]10,@('import "../outside.ts";','import "./linked.ts";'))},
                @{path=Join-Path $workflowsLayout.outside 'outside.ts'; content='export const secret = 1;'},
                @{path=Join-Path $workflowsLayout.private 'file.ts'; content=''}
            )
            foreach ($file in $files) {
                $bytes = [Text.Encoding]::UTF8.GetBytes($file.content)
                $stream = [IO.File]::Open($file.path,[IO.FileMode]::CreateNew,
                    [IO.FileAccess]::Write,[IO.FileShare]::None)
                try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush() }
                finally { $stream.Dispose() }
                [IO.File]::SetAttributes($file.path,
                    [IO.File]::GetAttributes($file.path) -bor [IO.FileAttributes]::ReadOnly)
            }
            $null = New-Item -ItemType SymbolicLink -Path $workflowsLayout.linkedFile -Target (Join-Path $workflowsLayout.outside 'outside.ts')
            $null = New-Item -ItemType SymbolicLink -Path $workflowsLayout.linkedDirectory -Target $workflowsLayout.private
            $null = New-Item -ItemType SymbolicLink -Path $workflowsLayout.excludedLink -Target $workflowsLayout.outside
            $null = New-Item -ItemType SymbolicLink -Path $workflowsLayout.projectLink -Target $workflowsLayout.root
            if (-not (Test-WorkflowsFixture $workflowsLayout)) {
                throw 'WORKFLOWS_FIXTURE_CREATION_NOT_OBSERVED'
            }
        }
    }
    elseif ($operation -ceq 'prepare') {
        if ((Get-ChildItem -LiteralPath (Join-Path $base 'fixtures') -Force |
            Where-Object { $_.Name -cne 'workflows' } |
            Measure-Object).Count -ge 16) { throw 'FIXTURE_CAPACITY_LIMIT_REQUIRES_CLEANUP' }
        if (Test-Path -LiteralPath $fixture) { throw 'FIXTURE_RUN_ID_ALREADY_EXISTS' }
        [IO.Directory]::CreateDirectory($fixture) | Out-Null
        [IO.Directory]::CreateDirectory($inside) | Out-Null
        [IO.Directory]::CreateDirectory($outside) | Out-Null
        foreach ($link in $links) {
            $null = New-Item -ItemType SymbolicLink -Path $link -Target $outside
            Assert-RealLink $link
        }
        if ((Get-ChildItem -LiteralPath $outside -Force | Measure-Object).Count -ne 0) {
            throw 'FIXTURE_SYNTHETIC_TARGET_NOT_EMPTY'
        }
    }
    else {
        Assert-RegularDirectory $fixture
        Assert-RegularDirectory $inside
        Assert-RegularDirectory $outside
        foreach ($link in $links) { Assert-RealLink $link }
        if ((Get-ChildItem -LiteralPath $outside -Force | Measure-Object).Count -ne 0) {
            throw 'FIXTURE_CLEANUP_FOREIGN_TARGET_CONTENT'
        }
        if ((Get-ChildItem -LiteralPath $inside -Force | Measure-Object).Count -ne 2) {
            throw 'FIXTURE_CLEANUP_FOREIGN_ENTRIES'
        }
        foreach ($link in $links) { [IO.Directory]::Delete($link, $false) }
        [IO.Directory]::Delete($inside,$false)
        [IO.Directory]::Delete($outside,$false)
        [IO.Directory]::Delete($fixture,$false)
    }
    $success = $true
}
catch { $problem = $_.Exception.Message }
$receipt = if ($operation -cin @('workflows','cleanup-workflows')) {
    [ordered]@{
        version=1; runId=$runId; operation=$operation; fixtureKind='workflows'
        installId=[string]$cfg.installId; userSid=[string]$cfg.userSid
        status=$(if ($success) { 'ok' } else { 'failed' }); error=$problem
        fixtureRoot=$workflowsLayout.fixtureRoot; root=$workflowsLayout.root
        outside=$workflowsLayout.outside; linkedFile=$workflowsLayout.linkedFile
        linkedDirectory=$workflowsLayout.linkedDirectory
        excludedLink=$workflowsLayout.excludedLink; projectLink=$workflowsLayout.projectLink
        reusedExisting=$reusedExisting; at=[DateTimeOffset]::UtcNow.ToString('o')
    }
}
else {
    [ordered]@{
        version = 1; runId = $runId; operation = $operation
        installId = [string]$cfg.installId; userSid = [string]$cfg.userSid
        status = $(if ($success) { 'ok' } else { 'failed' })
        error = $problem; fixtureRoot = $fixture; inside = $inside
        outside = $outside; linkedRoot = $links[0]; parentAlias = $links[1]
        at = [DateTimeOffset]::UtcNow.ToString('o')
    }
}
Save-Receipt $receipt
$auditReady = $false # Ordinary request receipt already records success or failure.
if (-not $success) { throw ('FIXTURE_WORKER_FAILED:' + $problem) }
