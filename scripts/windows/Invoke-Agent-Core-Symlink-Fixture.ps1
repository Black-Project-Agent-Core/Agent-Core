#requires -Version 5.1
# Normal-user CLI only. Never elevates, never installs, never accepts filesystem paths.
[CmdletBinding()]
param(
    [ValidateSet('Status','Prepare','Cleanup','Workflows','CleanupWorkflows')][string]$Operation = 'Status',
    [string]$RunId = ''
)
# Keep Windows PowerShell module discovery independent of the calling shell.
if ($PSEdition -eq 'Desktop') { $env:PSModulePath=Join-Path $PSHOME 'Modules' }
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$hash = [Security.Cryptography.SHA256]::Create()
function Get-WorkflowsLayout {
    $fixtureRoot = Join-Path (Join-Path $installRoot 'fixtures') 'workflows'
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
        if ($entrySid -notin @('S-1-5-18','S-1-5-32-544',$sid)) {
            throw 'WORKFLOWS_FIXTURE_UNEXPECTED_PRINCIPAL'
        }
        if ($entrySid -eq $sid) {
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
    $existing = @(Get-ChildItem -LiteralPath (Join-Path $installRoot 'fixtures') -Force |
        Where-Object { $_.Name -ieq 'workflows' })
    if ($existing.Count -eq 0) { return $false }
    foreach ($directory in @($layout.fixtureRoot,$layout.root,$layout.source,
        $layout.subproject,$layout.outside,$layout.private)) {
        $item = Get-Item -LiteralPath $directory -Force
        if (-not $item.PSIsContainer -or
            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'WORKFLOWS_FIXTURE_DIRECTORY_NOT_REGULAR'
        }
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
function Assert-WorkflowsReceipt($value,$layout) {
    if ($value.version -ne 1 -or $value.fixtureKind -cne 'workflows' -or
        -not ($value.reusedExisting -is [bool])) {
        throw 'SYMLINK_RECEIPT_WORKFLOWS_FIELDS_INVALID'
    }
    foreach ($field in @('fixtureRoot','root','outside','linkedFile','linkedDirectory',
        'excludedLink','projectLink')) {
        if ([string]$value.$field -ine [string]$layout[$field]) {
            throw 'SYMLINK_RECEIPT_WORKFLOWS_PATH_MISMATCH'
        }
    }
}
try {
    $key = ([BitConverter]::ToString($hash.ComputeHash(
        [Text.Encoding]::UTF8.GetBytes($sid)))).Replace('-','').Substring(0,16).ToLowerInvariant()
} finally { $hash.Dispose() }
$installRoot = Join-Path $env:ProgramData ('AgentCore-SymlinkFixture-' + $key)
$taskName = 'AgentCore-MemorySymlink-' + $key
$worker = Join-Path $installRoot 'Worker.ps1'
$config = Join-Path $installRoot 'settings.json'
$requestPath = Join-Path $installRoot 'request.json'
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$expectedArguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '"'
function Assert-Install {
    if (-not (Test-Path -LiteralPath $config -PathType Leaf) -or
        -not (Test-Path -LiteralPath $worker -PathType Leaf)) {
        throw 'SYMLINK_SETUP_REQUIRED:Protected helper is absent.'
    }
    if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf)) {
        throw 'SYMLINK_SETUP_REQUIRED:Fixed request file is absent.'
    }
    $meta = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
    if ($meta.version -ne 1 -or $meta.userSid -cne $sid -or
        $meta.installId -cnotmatch '^[0-9a-f]{32}$') {
        throw 'SYMLINK_SETUP_REQUIRED:Installation identity differs.'
    }
    if ((Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.ToLowerInvariant() -cne
        [string]$meta.workerSha256) {
        throw 'SYMLINK_SETUP_REQUIRED:Protected helper digest differs.'
    }
    $sourceWorker = Join-Path $PSScriptRoot 'Agent-Core-Symlink-Fixture-Worker.ps1'
    if (-not (Test-Path -LiteralPath $sourceWorker -PathType Leaf) -or
        (Get-FileHash -LiteralPath $sourceWorker -Algorithm SHA256).Hash.ToLowerInvariant() -cne
        [string]$meta.workerSha256) {
        throw 'SYMLINK_SETUP_REQUIRED:Worker version differs from this checkout.'
    }
    $requestWritable = $false
    foreach ($p in @($installRoot,$worker,$config,$requestPath,(Join-Path $installRoot 'fixtures'),
        (Join-Path $installRoot 'receipts'))) {
        $item = Get-Item -LiteralPath $p -Force -ErrorAction Stop
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'SYMLINK_SETUP_REQUIRED:Protected installation contains a reparse point.'
        }
        if ($p -eq $requestPath -and $item.PSIsContainer) {
            throw 'SYMLINK_SETUP_REQUIRED:Fixed request file is not regular.'
        }
        $acl = Get-Acl -LiteralPath $p
        if ($p -eq $installRoot -and -not $acl.AreAccessRulesProtected) {
            throw 'SYMLINK_SETUP_REQUIRED:Installation root inherits unsafe ACL.'
        }
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        if ($owner -notin @('S-1-5-18','S-1-5-32-544')) {
            throw 'SYMLINK_SETUP_REQUIRED:Installation owner differs.'
        }
        foreach ($entry in $acl.Access) {
            $entrySid = $entry.IdentityReference.Translate(
                [Security.Principal.SecurityIdentifier]).Value
            if ($entry.AccessControlType -ne 'Allow') { continue }
            if ($entrySid -notin @('S-1-5-18','S-1-5-32-544',$sid)) {
                throw 'SYMLINK_SETUP_REQUIRED:Unexpected installation ACL.'
            }
            $writeBits = [int][Security.AccessControl.FileSystemRights]::WriteData -bor
                [int][Security.AccessControl.FileSystemRights]::AppendData -bor
                [int][Security.AccessControl.FileSystemRights]::WriteAttributes -bor
                [int][Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
                [int][Security.AccessControl.FileSystemRights]::Delete -bor
                [int][Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
                [int][Security.AccessControl.FileSystemRights]::ChangePermissions -bor
                [int][Security.AccessControl.FileSystemRights]::TakeOwnership
            if ($entrySid -eq $sid) {
                $userWrite = [int]$entry.FileSystemRights -band $writeBits
                $allowedWrite = 0
                if ($p -eq $requestPath) {
                    $allowedWrite = [int][Security.AccessControl.FileSystemRights]::WriteData
                    if (($userWrite -band $allowedWrite) -ne 0) {
                        if ($entry.IsInherited) {
                            throw 'SYMLINK_SETUP_REQUIRED:Request write access must be explicit.'
                        }
                        $requestWritable = $true
                    }
                }
                if (($userWrite -band (-bnot $allowedWrite)) -ne 0) {
                    throw 'SYMLINK_SETUP_REQUIRED:User can modify elevated helper.'
                }
            }
        }
    }
    if (-not $requestWritable) {
        throw 'SYMLINK_SETUP_REQUIRED:Request WriteData access is missing.'
    }
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $task = $scheduler.GetFolder('\').GetTask($taskName)
    $d = $task.Definition
    if ($task.Name -cne $taskName -or $d.Triggers.Count -ne 0 -or
        $d.Actions.Count -ne 1 -or $d.Principal.UserId -notin @('SYSTEM','S-1-5-18') -or
        $d.Principal.LogonType -ne 5 -or $d.Principal.RunLevel -ne 1 -or
        -not $task.Enabled -or -not $d.Settings.AllowDemandStart -or
        $d.Settings.MultipleInstances -ne 2) {
        throw 'SYMLINK_SETUP_REQUIRED:Task definition differs.'
    }
    $action = $d.Actions.Item(1)
    if ($action.Type -ne 0 -or $action.Path -ine $powerShell -or
        $action.WorkingDirectory -ine $installRoot -or
        $action.Arguments -cne $expectedArguments) {
        throw 'SYMLINK_SETUP_REQUIRED:Scheduled task action differs.'
    }
    $security = [Security.AccessControl.RawSecurityDescriptor]::new(
        $task.GetSecurityDescriptor(7))
    if ($security.Owner.Value -ne 'S-1-5-32-544') {
        throw 'SYMLINK_SETUP_REQUIRED:Task ACL owner differs.'
    }
    # Task Scheduler maps generic GA/GRGX onto its native file-access mask.
    # Both wire (generic) and normalized masks are accepted, never broader rights.
    $expectedAces = @{
        'S-1-5-18' = @('10000000','001F01FF')
        'S-1-5-32-544' = @('10000000','001F01FF')
    }
    $expectedAces[$sid] = @('A0000000','001200A9') # Read + Execute only.
    if ($security.DiscretionaryAcl.Count -ne 3) {
        throw 'SYMLINK_SETUP_REQUIRED:Task ACL entries differ.'
    }
    foreach ($ace in $security.DiscretionaryAcl) {
        $actualSid = $ace.SecurityIdentifier.Value
        $actualMask = $ace.AccessMask.ToString('X8')
        if ($ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed -or
            -not $expectedAces.ContainsKey($actualSid) -or
            -not ($expectedAces[$actualSid] -ccontains $actualMask)) {
            throw 'SYMLINK_SETUP_REQUIRED:Task grants excessive privilege.'
        }
    }
    return @{ task = $task; installId = [string]$meta.installId }
}
try {
    $current = Assert-Install
    if ($Operation -eq 'Status') {
        @{status='installed';taskName=$taskName;installRoot=$installRoot} |
            ConvertTo-Json -Compress
        exit 0
    }
    if ($Operation -eq 'Cleanup' -and $RunId -cnotmatch '^[0-9a-f]{32}$') {
        throw 'SYMLINK_RUN_ID_REQUIRED'
    }
    $workerOperation = if ($Operation -eq 'CleanupWorkflows') {
        'cleanup-workflows'
    } else { $Operation.ToLowerInvariant() }
    $mutex = [Threading.Mutex]::new($false,'Local\AgentCoreSymlink-' + $key)
    $held = $false
    try {
        try { $held = $mutex.WaitOne(30000) }
        catch [Threading.AbandonedMutexException] { $held = $true }
        if (-not $held) { throw 'SYMLINK_REQUEST_BUSY' }
        $workflowsLayout = $null
        if ($Operation -in @('Workflows','CleanupWorkflows')) {
            $workflowsLayout = Get-WorkflowsLayout
            $exists = Test-WorkflowsFixture $workflowsLayout
            if ($Operation -eq 'Workflows' -and $exists) {
                [ordered]@{
                    version=1; runId=$null; operation='workflows'; fixtureKind='workflows'
                    installId=$current.installId; userSid=$sid; status='ok'; error=$null
                    fixtureRoot=$workflowsLayout.fixtureRoot; root=$workflowsLayout.root
                    outside=$workflowsLayout.outside; linkedFile=$workflowsLayout.linkedFile
                    linkedDirectory=$workflowsLayout.linkedDirectory
                    excludedLink=$workflowsLayout.excludedLink
                    projectLink=$workflowsLayout.projectLink; reusedExisting=$true
                    at=[DateTimeOffset]::UtcNow.ToString('o')
                } | ConvertTo-Json -Depth 5 -Compress
                return
            }
            if ($Operation -eq 'CleanupWorkflows' -and -not $exists) {
                throw 'WORKFLOWS_FIXTURE_MISSING'
            }
        }
        if ($Operation -in @('Prepare','Workflows','CleanupWorkflows')) {
            $RunId = [Guid]::NewGuid().ToString('N')
        }
        # A previous timed-out worker may still run after releasing the client mutex.
        # Never overwrite its fixed request or submit an ignored overlapping run.
        if ($current.task.State -in @(2,4)) { throw 'SYMLINK_REQUEST_BUSY' }
        $request = @{ version=1;operation=$workerOperation;runId=$RunId
            installId=$current.installId;issuedAt=[DateTimeOffset]::UtcNow.ToString('o') } |
            ConvertTo-Json -Compress
        $requestBytes = [Text.Encoding]::UTF8.GetBytes($request)
        if ($request.Length -gt 750 -or $requestBytes.Length -gt 4096) {
            throw 'SYMLINK_REQUEST_SIZE_INVALID'
        }
        # Open the existing fixed file with WriteData only, never replace/create it.
        $requestStream = [IO.FileStream]::new($requestPath,[IO.FileMode]::Open,
            [Security.AccessControl.FileSystemRights]::WriteData,[IO.FileShare]::None,
            4096,[IO.FileOptions]::None)
        try {
            $requestStream.SetLength(0)
            $requestStream.Write($requestBytes,0,$requestBytes.Length)
            $requestStream.Flush()
        }
        finally { $requestStream.Dispose() }
        $null = $current.task.Run($null) # No dynamically substituted command arguments.
        $receipt = Join-Path $installRoot ('receipts\' + $RunId + '.' +
            $workerOperation + '.json')
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $value = $null
        while ($null -eq $value) {
            if ($timer.Elapsed.TotalSeconds -ge 30) { throw 'SYMLINK_RESULT_UNKNOWN_NO_RETRY' }
            if (Test-Path -LiteralPath $receipt -PathType Leaf) {
                try {
                    # The SYSTEM writer opens with FileShare.None, so existence alone
                    # is not publication. Read the completed receipt without Run retry.
                    $bytes = [IO.File]::ReadAllText($receipt)
                    if ($bytes) { $value = $bytes | ConvertFrom-Json }
                }
                catch [IO.IOException] {
                    # The already-running fixed worker still owns the file handle.
                }
            }
            if ($null -eq $value) { Start-Sleep -Milliseconds 200 }
        }
        if ($value.runId -cne $RunId -or $value.installId -cne $current.installId -or
            $value.userSid -cne $sid -or
            $value.operation -cne $workerOperation) {
            throw 'SYMLINK_RECEIPT_IDENTITY_MISMATCH'
        }
        if ($value.status -ne 'ok') { throw ('SYMLINK_WORKER_REJECTED:' + $value.error) }
        if ($null -ne $workflowsLayout) {
            Assert-WorkflowsReceipt $value $workflowsLayout
            $exists = Test-WorkflowsFixture $workflowsLayout
            if (($Operation -eq 'Workflows' -and -not $exists) -or
                ($Operation -eq 'CleanupWorkflows' -and $exists)) {
                throw 'SYMLINK_WORKFLOWS_RESULT_NOT_OBSERVED'
            }
        }
        $value | ConvertTo-Json -Depth 5 -Compress
    }
    finally {
        if ($held) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 3
}
