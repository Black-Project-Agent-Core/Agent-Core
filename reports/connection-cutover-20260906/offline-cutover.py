"""Authorized OFFLINE Agent Core repair. No process termination, ACL takeover, token reset or network transfer.
Run --preflight first; --apply requires all Agent Code/server/tunnel processes already closed by the user.
Only the reviewed six source files, seven tests and matching JS/maps are deployed. Existing data stays intact.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, os, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/connection-cutover-20260906'
PRIOR = ROOT / 'reports/connection-repair-20260906'
CANDIDATE = ROOT / '.worktrees/connection-review-20260906'
GENERATION = ROOT / 'runtime/persistence-20260906'
POINTER = ROOT / 'runtime/persistence.json'
SOURCES = ['src/config.ts', 'src/oauth/store.ts', 'src/oauth/service.ts', 'src/oauth/file-lock.ts', 'src/oauth/atomic-file.ts', 'src/runtime/persistence-paths.ts']
TESTS = ['tests/'+name+'.test.ts' for name in ['oauth-concurrency-review','oauth-atomic-exchange-review','mcp-multiclient-review','persist-selection-repair','oauth-rename-repair','oauth-crossprocess-repair','oauth-lock-recovery-repair']]
BUILDS = ['dist/'+name[4:-3]+suffix for name in SOURCES for suffix in ['.js','.js.map']]
NODE = 'C:/Program Files/nodejs/node.exe'

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read_json(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def save(name,value): (REPORT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def check(ok,message):
    if not ok: raise RuntimeError(message)

def powershell_json(code):
    result=subprocess.run(['powershell.exe','-NoLogo','-NoProfile','-Command',code],cwd=ROOT,capture_output=True,text=True,timeout=25)
    check(result.returncode==0,'Read-only Windows preflight failed')
    return json.loads(result.stdout.lstrip('\ufeff').strip())

def require_offline():
    result=powershell_json(r"$ErrorActionPreference='Stop'; $p=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'Agent Code*' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'Agent-Core[\\/]dist[\\/]index.js') -or $_.Name -eq 'tunnel-client.exe' }); $ports=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalPort -in @(8765,8787)}); [pscustomobject]@{processCount=$p.Count;listenerCount=$ports.Count;processes=@($p|Select-Object ProcessId,Name);listeners=@($ports|Select-Object LocalPort,OwningProcess)}|ConvertTo-Json -Depth 4 -Compress")
    check(result['processCount']==0 and result['listenerCount']==0,'Application restarted or port occupied: STOP, no automatic termination')
    return result

def require_private_generation():
    check(GENERATION.is_dir() and not GENERATION.is_symlink(),'Expected private generation directory is absent or redirected')
    result=powershell_json(r"$ErrorActionPreference='Stop'; $path='E:\Projects\Agent-Core\runtime\persistence-20260906';$a=Get-Acl -LiteralPath $path;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;$rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$bad=@($rules|Where-Object {$_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')});[pscustomobject]@{ownedByCurrentUser=($owner -eq $sid);inheritanceProtected=$a.AreAccessRulesProtected;unexpectedAllowCount=$bad.Count}|ConvertTo-Json -Compress")
    check(result['ownedByCurrentUser'] and result['inheritanceProtected'] and result['unexpectedAllowCount']==0,'Generation privacy or ownership preflight failed')
    return result

def verify_chain(audit_path):
    code="import {verifyAuditJournal} from './dist/observability/audit-journal.js'; const r=await verifyAuditJournal(process.argv[1]); console.log(JSON.stringify(r)); if(!r.ok)process.exitCode=1;"
    result=subprocess.run([NODE,'--input-type=module','-e',code,str(audit_path)],cwd=ROOT,capture_output=True,text=True,timeout=30)
    check(result.returncode==0,'Audit integrity verifier failed; originals must be preserved')
    value=json.loads(result.stdout.strip());check(value.get('ok') is True,'Audit chain is not valid');return value

def migration_files():
    files=[]
    for name in ['keys.json','oauth.json']:
        source=ROOT/'runtime/data'/name
        check(source.is_file() and not source.is_symlink(),'Required authentication snapshot missing or redirected')
        files.append((source,GENERATION/'data'/name))
    logroot=ROOT/'runtime/logs'
    for source in sorted(logroot.rglob('*')):
        check(not source.is_symlink(),'Log tree contains a symlink: refusing implicit traversal')
        if source.is_file(): files.append((source,GENERATION/'logs'/source.relative_to(logroot)))
    check(len(files)>=5,'Required audit files missing')
    return files

def preflight():
    check(ROOT==Path(r'E:\Projects\Agent-Core'),'Unexpected project root')
    state=require_offline();privacy=require_private_generation()
    check(not POINTER.exists(),'Persistence pointer already exists: inspect instead of overwriting')
    check(not any(GENERATION.iterdir()),'Generation is no longer empty: inspect before retrying')
    baseline=read_json(PRIOR/'baseline-hashes.json')
    for item in baseline: check(digest(ROOT/item['file'])==item['sha256'].lower(),'Production changed: '+item['file'])
    candidates=read_json(PRIOR/'candidate-files.json')
    check(set(i['path'] for i in candidates)==set(SOURCES+TESTS),'Candidate whitelist mismatch')
    for item in candidates: check(digest(CANDIDATE/item['path'])==item['sha256'].lower(),'Candidate changed: '+item['path'])
    for name in BUILDS: check((CANDIDATE/name).is_file(),'Missing candidate build: '+name)
    tests=read_json(REPORT/'full-candidate-retest.json')
    check(tests['numFailedTests']==0 and tests['numPassedTests']==71,'Fresh 71-test gate is missing or failed')
    for name in SOURCES+TESTS+BUILDS:
        target=ROOT/name
        check(not target.is_symlink(),'Production file is redirected: '+name)
        if name in TESTS or name in SOURCES[3:]: check(not target.exists(),'New file already exists: '+name)
    chain=verify_chain(ROOT/'runtime/logs/audit')
    files=migration_files()
    data=[{'source':str(s.relative_to(ROOT)),'destination':str(t.relative_to(ROOT)),'bytes':s.stat().st_size,'sha256':digest(s)} for s,t in files]
    value={'at':now(),'status':'OFFLINE_PREFLIGHT_PASS','offline':state,'privateGeneration':privacy,'candidateTests':71,'auditBefore':chain,'sourceCount':len(SOURCES),'testCount':len(TESTS),'builtFileCount':len(BUILDS),'dataFiles':data,'productionChanged':False}
    save('offline-preflight.json',value)
    return value,files

def apply():
    before,files=preflight()
    check(not (REPORT/'apply-started.json').exists(),'An apply attempt is already recorded: inspect before retry')
    save('apply-started.json',{'at':now(),'mode':'OFFLINE_USER_CLOSED_APPLICATION','noProcessTermination':True})
    backups=REPORT/'preapply-source-backup';backups.mkdir()
    existing={};changed=[];pointer_created=False
    try:
        for name in SOURCES+TESTS+BUILDS:
            target=ROOT/name;existing[name]=target.exists()
            if target.exists():
                backup=backups/name;backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(target.read_bytes())
                check(digest(backup)==digest(target),'Backup hash mismatch: '+name)
        # Write bytes to the already private generation. Never copy the old Windows ACL.
        copied=[]
        for source,target in files:
            target.parent.mkdir(parents=True,exist_ok=True)
            with target.open('xb') as stream:
                stream.write(source.read_bytes());stream.flush();os.fsync(stream.fileno())
            check(digest(source)==digest(target),'Snapshot copy mismatch')
            copied.append({'source':str(source.relative_to(ROOT)),'destination':str(target.relative_to(ROOT)),'sha256':digest(target),'identical':True})
        chain=verify_chain(GENERATION/'logs/audit')
        check(chain['headHash']==before['auditBefore']['headHash'] and chain['lastSequence']==before['auditBefore']['lastSequence'],'Audit chain changed during copy')
        # Synthetic replacement probe only; do not consume or mint any real OAuth grant.
        a=GENERATION/'.replace-probe-old';b=GENERATION/'.replace-probe-new'
        a.write_text('old',encoding='utf-8');b.write_text('new',encoding='utf-8');os.replace(b,a)
        check(a.read_text(encoding='utf-8')=='new','New directory replacement probe failed');a.unlink()
        require_offline()
        for name in SOURCES+TESTS+BUILDS:
            target=ROOT/name;target.parent.mkdir(parents=True,exist_ok=True)
            changed.append(name);target.write_bytes((CANDIDATE/name).read_bytes())
            check(digest(target)==digest(CANDIDATE/name),'Deployment readback mismatch: '+name)
        require_offline()
        payload={'schemaVersion':1,'generation':'20260906','activatedAt':now(),'reason':'verified recovery from migrated file ACL; authentication snapshot preserved'}
        temporary=POINTER.with_suffix('.json.cutover-tmp')
        with temporary.open('x',encoding='utf-8') as stream:
            json.dump(payload,stream);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,POINTER);pointer_created=True
        code="import {loadConfig} from './dist/config.js';let a=loadConfig({},process.cwd());let b=loadConfig({AGENT_CORE_DATA_DIR:process.cwd()+'/runtime/data',AGENT_CORE_LOG_DIR:process.cwd()+'/runtime/logs'},process.cwd());console.log(JSON.stringify({direct:{data:a.dataDir,logs:a.logDir},launcher:{data:b.dataDir,logs:b.logDir}}));"
        result=subprocess.run([NODE,'--input-type=module','-e',code],cwd=ROOT,capture_output=True,text=True,timeout=15)
        check(result.returncode==0,'Deployed configuration failed')
        selection=json.loads(result.stdout.strip())
        for config in selection.values():
            check(Path(config['data'])==GENERATION/'data' and Path(config['logs'])==GENERATION/'logs','Direct/native launcher selected wrong persistence paths')
        require_offline()
        after={'at':now(),'status':'DEPLOYED_OFFLINE_PENDING_NATIVE_RESTART','sourceFiles':SOURCES,'testFiles':TESTS,'builtFiles':BUILDS,'copiedData':copied,'auditCopied':chain,'configurationReadback':selection,'originalDataDeleted':False,'oldAclChanged':False,'realGrantsCreatedOrRevoked':False,'nativeBinaryModified':False,'restartPerformed':False,'manifestSha256':digest(POINTER),'deployedHashes':{name:digest(ROOT/name) for name in changed}}
        save('offline-deployment.json',after)
        print(json.dumps({'status':after['status'],'sourceFiles':len(SOURCES),'testFiles':len(TESTS),'buildFiles':len(BUILDS),'allCopiesIdentical':True,'auditRecords':chain['records'],'requiresNativeRestart':True}))
    except Exception as error:
        safe=False
        try: require_offline();safe=True
        except Exception: pass
        if safe:
            if pointer_created: POINTER.unlink()
            for name in reversed(changed):
                if existing[name]: (ROOT/name).write_bytes((backups/name).read_bytes())
                elif (ROOT/name).exists(): (ROOT/name).unlink()
        save('apply-failure.json',{'at':now(),'error':type(error).__name__+': '+str(error),'rolledBackSourceWhileOffline':safe,'newCopiedDataPreserved':True,'requiresInspectionBeforeRetry':True})
        raise

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--preflight',action='store_true');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    check(args.preflight != args.apply,'Choose exactly one mode')
    if args.preflight:
        summary,_=preflight();print(json.dumps({key:summary[key] for key in ['status','candidateTests','sourceCount','testCount','builtFileCount','productionChanged']}))
    else: apply()