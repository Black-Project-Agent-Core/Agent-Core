//! Local, bounded reader of the existing audit journal. No network credentials or MCP authority.
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, VecDeque};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
const WINDOW: usize = 4000;
const BUDGET: usize = 2 * 1024 * 1024;
const LINE_LIMIT: usize = 128 * 1024;
fn now_ms() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() }
#[derive(Clone, Default)]
struct Cursor { offset: u64, prefix: Vec<u8>, pending: Vec<u8>, skip_until_newline: bool }
#[derive(Default)]
struct Reader { replaced_current: bool, retained_bytes: usize, cursors: BTreeMap<String, Cursor>, rows: VecDeque<Value>, last_sequence: u64, skipped: u64, malformed: u64 }
pub struct ActivityMonitor { root: PathBuf, reader: Mutex<Reader> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ActivityBatch { pub records: Vec<Value>, pub last_sequence: u64, pub reset: bool, pub skipped: u64, pub malformed: u64, pub pending_bytes: bool, pub desired: Value, pub applied: Value, pub local_logs: Vec<Value>, pub crash: Value, pub scope: &'static str }
fn bounded_json(file: &Path, max: u64) -> Result<Value, String> {
    let meta=fs::symlink_metadata(file).map_err(|e|e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len()>max { return Err("ACTIVITY_FILE_INVALID".into()); }
    let text=fs::read_to_string(file).map_err(|e|e.to_string())?;
    serde_json::from_str(&text).map_err(|_|"ACTIVITY_JSON_INVALID".into())
}
fn atomic_json(file: &Path, value: &Value) -> Result<(), String> {
    let parent=file.parent().ok_or("ACTIVITY_PATH_INVALID")?;fs::create_dir_all(parent).map_err(|e|e.to_string())?;
    let temp=parent.join(format!(".activity-{}-{}.tmp",std::process::id(),now_ms()));
    let bytes=serde_json::to_vec(value).map_err(|e|e.to_string())?;
    let result=(||{let mut out=fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e|e.to_string())?;out.write_all(&bytes).map_err(|e|e.to_string())?;out.sync_all().map_err(|e|e.to_string())?;drop(out);fs::rename(&temp,file).map_err(|e|e.to_string())})();
    if result.is_err(){let _=fs::remove_file(&temp);}result
}
fn valid_segment(name:&str)->bool {
    if name=="audit.current.jsonl" {return true;}
    if !name.starts_with("audit.")||!name.ends_with(".jsonl"){return false;}
    let range=name.trim_start_matches("audit.").split('.').next().unwrap_or("");
    let mut pieces=range.split('-');matches!((pieces.next().and_then(|p|p.parse::<u64>().ok()),pieces.next().and_then(|p|p.parse::<u64>().ok()),pieces.next()),(Some(a),Some(b),None) if a>0&&b>=a)
}
impl ActivityMonitor {
    pub fn new(root:PathBuf)->Self{Self{root,reader:Mutex::new(Reader::default())}}
    fn logs(&self)->PathBuf{self.root.join("runtime").join("logs")}
    fn checked_directory(&self, directory:&Path)->Result<(),String>{
        let root=self.root.canonicalize().map_err(|e|e.to_string())?;
        let relative=directory.strip_prefix(&self.root).map_err(|_|"ACTIVITY_PATH_ESCAPE")?;
        let mut current=self.root.clone();
        for part in relative.components(){current.push(part);if !current.exists(){fs::create_dir(&current).map_err(|e|e.to_string())?;}
            if !current.canonicalize().map_err(|e|e.to_string())?.starts_with(&root){return Err("ACTIVITY_PATH_ESCAPE".into());}}
        Ok(())
    }
    pub fn set_enabled(&self,enabled:bool)->Result<Value,String>{
        self.checked_directory(&self.logs())?;
        let _guard=self.reader.lock().map_err(|_|"ACTIVITY_READER_LOCK")?;
        let value=json!({"schemaVersion":1,"enabled":enabled,"revision":format!("{}-{}",std::process::id(),now_ms())});
        atomic_json(&self.logs().join("activity-control.json"),&value)?;
        let actual=bounded_json(&self.logs().join("activity-control.json"),4096)?;
        if actual!=value{return Err("ACTIVITY_CONTROL_READBACK_MISMATCH".into());}Ok(actual)
    }
    // Summaries only: never forward raw process output, auth headers, or secrets to the webview.
    fn local_logs(&self)->Vec<Value>{
        let sources=[("core.stdout","runtime/tray/agent-core.stdout.log"),("core.stderr","runtime/tray/agent-core.stderr.log"),
          ("tunnel.stdout","runtime/tray/tunnel.stdout.log"),("tunnel.stderr","runtime/tray/tunnel.stderr.log"),
          ("controller.bootstrap","runtime/agent-code-controller/bootstrap.log")];
        sources.iter().map(|(name,relative)|{
            let file=self.root.join(relative);
            let read=(||->Result<Value,String>{
                let meta=fs::symlink_metadata(&file).map_err(|e|e.kind().to_string())?;
                if !meta.is_file()||meta.file_type().is_symlink()||!file.canonicalize().map_err(|_|"resolve")?.starts_with(self.root.canonicalize().map_err(|_|"root")?){return Err("ACTIVITY_UNSAFE_LOG_PATH".into());}
                let mut input=File::open(&file).map_err(|_|"open")?;let offset=meta.len().saturating_sub(32768);
                input.seek(SeekFrom::Start(offset)).map_err(|_|"seek")?;let mut bytes=Vec::new();input.take(32768).read_to_end(&mut bytes).map_err(|_|"read")?;
                let content=String::from_utf8_lossy(&bytes);let mut lines:Vec<&str>=content.lines().collect();if offset>0&&!lines.is_empty(){lines.remove(0);}let total=lines.len();if total>40{lines.drain(..total-40);}
                let observations:Vec<Value>=lines.iter().filter(|s|!s.trim().is_empty()).map(|line|{
                    let lower=line.to_ascii_lowercase();let sensitive=["authorization","token","password","secret","cookie","api_key","apikey","credential","lease","signature"].iter().any(|s|lower.contains(s));
                    let error=["error","failed","failure","fatal","panic","exception","unauthorized","refused","timeout","timed out","502","504"].iter().any(|s|lower.contains(s));
                    let warning=!error&&["warning","warn","retry","reconnect"].iter().any(|s|lower.contains(s));
                    let codes:Vec<&str>=if sensitive{Vec::new()}else{line.split(|c:char|!(c.is_ascii_alphanumeric()||c=='_')).filter(|s|s.len()>3&&s.len()<80&&s.chars().all(|c|c.is_ascii_uppercase()||c.is_ascii_digit()||c=='_')&&(s.starts_with("E")||s.contains('_'))).take(6).collect()};
                    json!({"severity":if error{"error"}else if warning{"warning"}else{"info"},"codes":codes,"lineBytes":line.len(),"textOmitted":true,"sensitive":sensitive,
                      "summary":if error{"Process reported an error/failure; inspect the named local log"}else if warning{"Process reported a warning/retry"}else{"Process output observed"}})
                }).collect();
                let error_count=observations.iter().filter(|r|r["severity"]=="error").count();
                Ok(json!({"source":name,"relativePath":relative,"available":true,"bytes":meta.len(),"tailOffset":offset,
                    "modifiedAtMs":meta.modified().ok().and_then(|v|v.duration_since(UNIX_EPOCH).ok()).map(|v|v.as_millis() as u64),
                    "errorCount":error_count,"boundedTail":offset>0||total>40,"observations":observations}))
            })();
            read.unwrap_or_else(|e|json!({"source":name,"relativePath":relative,"available":false,"error":e}))
        }).collect()
    }
    pub fn read(&self,after_sequence:u64)->Result<ActivityBatch,String>{
        let mut state=self.reader.lock().map_err(|_|"ACTIVITY_READER_LOCK")?;
        let log_dir=self.logs();self.checked_directory(&log_dir)?;let audit=log_dir.join("audit");
        let desired=bounded_json(&log_dir.join("activity-control.json"),4096).unwrap_or_else(|e|json!({"enabled":false,"error":e}));
        let applied=bounded_json(&log_dir.join("activity-status.json"),64*1024).unwrap_or_else(|e|json!({"available":false,"error":e}));
        let mut paths=Vec::new();
        match fs::read_dir(&audit){Ok(entries)=>for item in entries {let entry=item.map_err(|e|e.to_string())?;let name=entry.file_name().to_string_lossy().to_string();if valid_segment(&name){paths.push((name,entry.path()));}},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(format!("ACTIVITY_READ_FAILED: {e}"))}
        paths.sort_by_key(|(name,_)| if name=="audit.current.jsonl"{u64::MAX}else{name.split('.').nth(1).and_then(|s|s.split('-').next()).and_then(|s|s.parse::<u64>().ok()).unwrap_or(0)});
        // Initial view is a bounded tail, not an unbounded scan of the archive.
        if state.cursors.is_empty()&&paths.len()>2 {paths.drain(..paths.len()-2);}
        let mut budget=BUDGET;let mut pending_bytes=false;let mut lineage_reset=false;
        for (name,file) in &paths {
            if name!="audit.current.jsonl" && name.split('.').nth(1).and_then(|r|r.split('-').nth(1)).and_then(|n|n.parse::<u64>().ok()).is_some_and(|last|last<=state.last_sequence){continue;}
            let meta=fs::symlink_metadata(file).map_err(|e|e.to_string())?;
            if !meta.is_file()||meta.file_type().is_symlink(){return Err("ACTIVITY_UNSAFE_LOG_PATH".into());}
            let canonical=file.canonicalize().map_err(|e|e.to_string())?;
            if !canonical.starts_with(self.root.canonicalize().map_err(|e|e.to_string())?){return Err("ACTIVITY_PATH_ESCAPE".into());}
            let mut input=File::open(file).map_err(|e|e.to_string())?;
            let mut prefix=vec![0;meta.len().min(64) as usize];input.read_exact(&mut prefix).map_err(|e|e.to_string())?;
            if name=="audit.current.jsonl"&&state.cursors.get(name).is_some_and(|c|(!c.prefix.is_empty()&&!prefix.starts_with(&c.prefix))||c.offset>meta.len()){state.replaced_current=true;}
            let mut cursor=state.cursors.get(name).cloned().or_else(||state.cursors.values().find(|c|!c.prefix.is_empty()&&prefix.starts_with(&c.prefix)).cloned()).unwrap_or_default();
            if (!cursor.prefix.is_empty()&&!prefix.starts_with(&cursor.prefix))||cursor.offset>meta.len(){cursor=Cursor::default();}
            let fresh=cursor.prefix.is_empty();cursor.prefix=prefix;
            if fresh&&meta.len()>BUDGET as u64 {
                cursor.offset=meta.len()-BUDGET as u64;state.skipped+=1;
                // Only discard a fragment: a tail already aligned to a newline keeps its first row.
                input.seek(SeekFrom::Start(cursor.offset-1)).map_err(|e|e.to_string())?;
                let mut previous=[0u8;1];input.read_exact(&mut previous).map_err(|e|e.to_string())?;
                cursor.skip_until_newline=previous[0]!=b'\n';
            }
            if cursor.offset==meta.len(){state.cursors.insert(name.clone(),cursor);continue;}
            if budget==0 {pending_bytes=true;continue;}
            input.seek(SeekFrom::Start(cursor.offset)).map_err(|e|e.to_string())?;
            let count=(meta.len()-cursor.offset).min(budget as u64) as usize;let mut bytes=vec![0;count];let got=input.read(&mut bytes).map_err(|e|e.to_string())?;bytes.truncate(got);budget-=got;cursor.offset+=got as u64;pending_bytes|=cursor.offset<meta.len();
            cursor.pending.extend(bytes);
            let mut consumed=0;
            for end in cursor.pending.iter().enumerate().filter_map(|(i,b)|(*b==b'\n').then_some(i)) {
                let line=&cursor.pending[consumed..end];consumed=end+1;
                if cursor.skip_until_newline {cursor.skip_until_newline=false;continue;}
                if line.len()>LINE_LIMIT {state.skipped+=1;continue;}
                let row:Value=match serde_json::from_slice(line){Ok(v)=>v,Err(_)=>{state.malformed+=1;continue;}};
                let Some(seq)=row.get("sequence").and_then(Value::as_u64) else {state.malformed+=1;continue;};
                if name=="audit.current.jsonl"&&state.replaced_current{state.replaced_current=false;if seq<=state.last_sequence{state.rows.clear();state.retained_bytes=0;state.last_sequence=0;state.skipped+=1;lineage_reset=true;}}
                if seq<=state.last_sequence {continue;}
                if state.last_sequence>0&&seq>state.last_sequence+1{state.skipped+=seq-state.last_sequence-1;}
                state.last_sequence=seq;state.retained_bytes+=serde_json::to_vec(&row).map(|v|v.len()).unwrap_or(0);state.rows.push_back(row);
                while state.rows.len()>WINDOW||state.retained_bytes>8*1024*1024{if let Some(old)=state.rows.pop_front(){state.retained_bytes=state.retained_bytes.saturating_sub(serde_json::to_vec(&old).map(|v|v.len()).unwrap_or(0));}state.skipped+=1;}
            }
            cursor.pending.drain(..consumed);
            if cursor.skip_until_newline {cursor.pending.clear();}
            else if cursor.pending.len()>LINE_LIMIT{cursor.pending.clear();cursor.skip_until_newline=true;state.skipped+=1;}
            state.cursors.insert(name.clone(),cursor);
        }
        state.cursors.retain(|name,_| paths.iter().any(|(n,_)|n==name));
        let reset=lineage_reset||after_sequence>state.last_sequence;
        let records=state.rows.iter().filter(|row|reset||row["sequence"].as_u64().unwrap_or(0)>after_sequence).cloned().collect();
        Ok(ActivityBatch{records,last_sequence:state.last_sequence,reset,skipped:state.skipped,malformed:state.malformed,pending_bytes,desired,applied,local_logs:self.local_logs(),crash:bounded_json(&log_dir.join("activity-crash.json"),16384).unwrap_or(Value::Null),scope:"Local Agent Core boundary only; transport finish does not prove client receipt. Bounded history; full retained audit available in lnav."})
    }
    pub fn export(&self)->Result<String,String>{
        let state=self.reader.lock().map_err(|_|"ACTIVITY_READER_LOCK")?;
        let dir=self.logs().join("exports");self.checked_directory(&dir)?;
        let file=dir.join(format!("activity-{}.jsonl",now_ms()));let mut out=fs::OpenOptions::new().write(true).create_new(true).open(&file).map_err(|e|e.to_string())?;
        for row in &state.rows {serde_json::to_writer(&mut out,row).map_err(|e|e.to_string())?;out.write_all(b"\n").map_err(|e|e.to_string())?;}out.sync_all().map_err(|e|e.to_string())?;
        Ok(file.to_string_lossy().to_string())
    }
    pub fn open_lnav(&self)->Result<(),String>{
        #[cfg(windows)] let binary=self.root.join(".tools/lnav/bin/lnav.exe");
        #[cfg(not(windows))] let binary=self.root.join(".tools/lnav/lnav");
        if !binary.is_file(){return Err("LNAV_NOT_INSTALLED: local viewer binary is missing; the built-in monitor remains available".into());}
        if !binary.canonicalize().map_err(|e|e.to_string())?.starts_with(self.root.canonicalize().map_err(|e|e.to_string())?){return Err("ACTIVITY_PATH_ESCAPE".into());}
        let config_home=self.logs().join("lnav-config");self.checked_directory(&config_home)?;
        let mut command=std::process::Command::new(binary);
        command.current_dir(&self.root).args(["-I","SubProject/Agent-Code/resources/lnav","runtime/logs/audit"])
            .env("XDG_CONFIG_HOME",config_home);
        #[cfg(windows)] {use std::os::windows::process::CommandExt;command.creation_flags(0x0000_0010);}
        command.spawn().map_err(|e|format!("LNAV_LAUNCH_FAILED: {e}"))?;
        Ok(())
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    fn fixture()->(PathBuf,ActivityMonitor){let root=std::env::temp_dir().join(format!("ac-activity-reader-{}-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),NEXT_FIXTURE.fetch_add(1,std::sync::atomic::Ordering::Relaxed)));fs::create_dir_all(root.join("runtime/logs/audit")).unwrap();let m=ActivityMonitor::new(root.clone());(root,m)}
    fn line(seq:u64)->String{format!("{{\"sequence\":{seq},\"event\":\"tool.completed\",\"data\":{{}}}}\n")}
    #[test] fn toggle_round_trip_does_not_create_memory_or_restart(){let(root,m)=fixture();let v=m.set_enabled(true).unwrap();assert_eq!(v["enabled"],true);assert_eq!(m.read(0).unwrap().desired,v);assert!(!root.join("runtime/memory").exists());assert_eq!(m.set_enabled(false).unwrap()["enabled"],false);fs::remove_dir_all(root).unwrap();}
    #[test] fn incremental_append_and_partial_lines(){let(root,m)=fixture();let file=root.join("runtime/logs/audit/audit.current.jsonl");fs::write(&file,line(1)).unwrap();assert_eq!(m.read(0).unwrap().records.len(),1);let two=line(2);let mid=two.len()/2;let mut out=fs::OpenOptions::new().append(true).open(&file).unwrap();out.write_all(&two.as_bytes()[..mid]).unwrap();assert_eq!(m.read(1).unwrap().records.len(),0);out.write_all(&two.as_bytes()[mid..]).unwrap();drop(out);assert_eq!(m.read(1).unwrap().records.len(),1);assert_eq!(m.read(2).unwrap().records.len(),0);fs::remove_dir_all(root).unwrap();}
    #[test] fn follows_rotation_without_duplicate_rows(){let(root,m)=fixture();let dir=root.join("runtime/logs/audit");let file=dir.join("audit.current.jsonl");fs::write(&file,line(1)+&line(2)).unwrap();m.read(0).unwrap();fs::rename(&file,dir.join("audit.1-2.test.jsonl")).unwrap();fs::write(&file,line(3)).unwrap();let b=m.read(2).unwrap();assert_eq!(b.records.len(),1);assert_eq!(b.records[0]["sequence"],3);fs::remove_dir_all(root).unwrap();}
    #[test] fn malformed_lines_are_visible_and_export_is_bounded_to_audit(){let(root,m)=fixture();fs::write(root.join("runtime/logs/audit/audit.current.jsonl"),"bad\n".to_string()+&line(1)).unwrap();let b=m.read(0).unwrap();assert_eq!(b.malformed,1,"rows={:?}, file={:?}",b.records,fs::read(root.join("runtime/logs/audit/audit.current.jsonl")).unwrap());let export=m.export().unwrap();assert!(Path::new(&export).starts_with(root.join("runtime/logs/exports")));assert_eq!(fs::read_to_string(export).unwrap().lines().count(),1);fs::remove_dir_all(root).unwrap();}
    #[test] fn old_large_archives_do_not_starve_current_tail(){let(root,m)=fixture();let dir=root.join("runtime/logs/audit");for i in 1..=4{fs::write(dir.join(format!("audit.{}-{}.x.jsonl",i,i)),line(i)).unwrap();}let current=dir.join("audit.current.jsonl");fs::write(&current,line(5)).unwrap();m.read(0).unwrap();fs::write(dir.join("audit.1-1.x.jsonl")," ".repeat(BUDGET+20)).unwrap();let mut out=fs::OpenOptions::new().append(true).open(&current).unwrap();out.write_all(line(6).as_bytes()).unwrap();drop(out);assert!(m.read(5).unwrap().records.iter().any(|r|r["sequence"]==6));fs::remove_dir_all(root).unwrap();}
    #[cfg(unix)] #[test] fn rejects_symlinked_logs_for_capture_control(){let(root,m)=fixture();let outside=root.with_extension("outside");fs::create_dir_all(&outside).unwrap();fs::remove_dir_all(root.join("runtime/logs")).unwrap();std::os::unix::fs::symlink(&outside,root.join("runtime/logs")).unwrap();assert!(m.set_enabled(true).is_err());assert!(!outside.join("activity-control.json").exists());fs::remove_dir_all(root).unwrap();fs::remove_dir_all(outside).unwrap();}
    #[test] fn rejects_nonjournal_names(){for name in ["../secrets.jsonl","keys.json","audit.hello.jsonl","audit.9-1.x.jsonl"]{assert!(!valid_segment(name));}}
    #[test] fn follows_recreated_journal_with_lower_sequence_and_marks_reset(){
        let(root,m)=fixture();let file=root.join("runtime/logs/audit/audit.current.jsonl");fs::write(&file,line(100)).unwrap();m.read(0).unwrap();
        fs::write(&file,line(1)).unwrap();let b=m.read(100).unwrap();assert!(b.reset);assert_eq!(b.records.len(),1);assert_eq!(b.records[0]["sequence"],1);fs::remove_dir_all(root).unwrap();
    }
    #[test] fn local_process_failures_and_crash_capsule_are_visible_without_raw_secrets(){
        let(root,m)=fixture();let tray=root.join("runtime/tray");fs::create_dir_all(&tray).unwrap();
        fs::write(tray.join("tunnel.stderr.log"),"request failed: ECONNRESET\nAuthorization: Bearer do-not-export-me\n").unwrap();
        fs::write(root.join("runtime/logs/activity-crash.json"),serde_json::to_vec(&json!({"schemaVersion":1,"event":"runtime.fatal","pid":7,"error":{"code":"CRASH_TEST","name":"Error"}})).unwrap()).unwrap();
        let batch=serde_json::to_value(m.read(0).unwrap()).unwrap();assert!(batch["localLogs"].as_array().unwrap().iter().any(|l|l["source"]=="tunnel.stderr"&&l["errorCount"].as_u64().unwrap_or(0)>0));assert_eq!(batch["crash"]["error"]["code"],"CRASH_TEST");assert!(!batch.to_string().contains("do-not-export-me"));fs::remove_dir_all(root).unwrap();
    }

    #[test] fn retained_byte_accounting_matches_the_serialized_reader_window(){
        let(root,m)=fixture();let file=root.join("runtime/logs/audit/audit.current.jsonl");
        let value=json!({"sequence":1,"event":"tool.completed","data":{"message":"test"}});
        // Whitespace on disk must not accumulate phantom retained bytes after eviction.
        fs::write(&file, format!("  {}  \n", value)).unwrap();m.read(0).unwrap();
        {let state=m.reader.lock().unwrap();let actual:usize=state.rows.iter().map(|r|serde_json::to_vec(r).unwrap().len()).sum();assert_eq!(state.retained_bytes,actual);}
        fs::remove_dir_all(root).unwrap();
    }

    #[test] fn initial_tail_truncation_is_not_reported_as_journal_corruption(){
        let(root,m)=fixture();let file=root.join("runtime/logs/audit/audit.current.jsonl");let mut data=String::new();
        for seq in 1..40 {data.push_str(&json!({"sequence":seq,"event":"test","data":{"message":"x".repeat(80000)}}).to_string());data.push('\n');}
        fs::write(&file,data).unwrap();let b=m.read(0).unwrap();assert_eq!(b.malformed,0);assert!(b.skipped>0);assert!(!b.records.is_empty());fs::remove_dir_all(root).unwrap();
    }

    #[test] fn initial_tail_keeps_a_complete_boundary_row(){
        let(root,m)=fixture();let mut data=line(1);let count=BUDGET/1024;
        for seq in 2..=count as u64+1 {data.push_str(&format!("{:<1023}\n",line(seq).trim_end()));}
        fs::write(root.join("runtime/logs/audit/audit.current.jsonl"),data).unwrap();
        let b=m.read(0).unwrap();assert_eq!(b.malformed,0);assert_eq!(b.records.len(),count);assert_eq!(b.records[0]["sequence"],2);fs::remove_dir_all(root).unwrap();
    }
    #[test] fn initial_tail_still_reports_a_complete_malformed_line(){
        let(root,m)=fixture();let mut data=String::new();
        for seq in 1..40 {data.push_str(&json!({"sequence":seq,"event":"test","data":{"message":"x".repeat(80000)}}).to_string());data.push('\n');}
        data.push_str("bad\n");data.push_str(&line(40));fs::write(root.join("runtime/logs/audit/audit.current.jsonl"),data).unwrap();
        let b=m.read(0).unwrap();assert_eq!(b.malformed,1);assert_eq!(b.last_sequence,40);fs::remove_dir_all(root).unwrap();
    }
    #[test] fn initial_tail_fragment_is_discarded_across_budgeted_reads(){
        let(root,m)=fixture();let dir=root.join("runtime/logs/audit");
        fs::write(dir.join("audit.1-1.test.jsonl"),format!("{{\"sequence\":1,\"pad\":\"{}\"}}\n","x".repeat(BUDGET-40))).unwrap();
        let mut data=String::new();for seq in 2..41 {data.push_str(&json!({"sequence":seq,"event":"test","data":{"message":"x".repeat(80000)}}).to_string());data.push('\n');}
        fs::write(dir.join("audit.current.jsonl"),data).unwrap();let first=m.read(0).unwrap();assert!(first.pending_bytes);assert_eq!(first.malformed,0);
        let second=m.read(first.last_sequence).unwrap();assert_eq!(second.malformed,0);assert_eq!(second.last_sequence,40);assert!(!second.records.is_empty());fs::remove_dir_all(root).unwrap();
    }

    #[test] fn parallel_reader_fixtures_use_distinct_directories(){
        let barrier=std::sync::Barrier::new(16);
        let roots=std::thread::scope(|scope|{
            let threads:Vec<_>=(0..16).map(|_|scope.spawn(||{
                barrier.wait();(0..16).map(|_|fixture().0).collect::<Vec<_>>()
            })).collect();
            threads.into_iter().flat_map(|thread|thread.join().unwrap()).collect::<Vec<_>>()
        });
        let unique:std::collections::BTreeSet<_>=roots.iter().collect();
        assert_eq!(unique.len(),roots.len(),"parallel reader fixtures must not share a directory");
        for root in unique {fs::remove_dir_all(root).unwrap();}
    }

}
