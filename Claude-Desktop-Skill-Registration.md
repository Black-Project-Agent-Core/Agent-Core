# Pendaftaran dan exposure skill di Claude Desktop

Hasil pembacaan statis harness Claude Desktop **2.37337.1**, untuk referensi Agent Core. Tidak ada pemasangan skill, perubahan aplikasi, atau eksekusi sesi Claude dalam penelitian ini.

Alur yang terlihat: **simpan/import → catat manifest → aktifkan → teruskan plugin ke sesi → reload daftar kemampuan sesi**.

1. **Pendaftaran manual.** Bridge desktop menyediakan `saveLocalSkill()` untuk teks dan `saveLocalSkillArchive()` untuk arsip. Backend menyimpan `skills/<nama-folder>/SKILL.md`, lalu memanggil `fileLocalSkill()` untuk mencatatnya di `manifest.json`. Impor arsip memvalidasi adanya `SKILL.md`, menolak beberapa pohon skill yang ambigu, dan memakai staging sebelum mengganti direktori. Ini nama API internal yang ditelusuri, bukan petunjuk menjalankan IPC secara manual. [R1, R2]
2. **Registry skill.** Entry lokal mencatat `skillId`, `name`, `description`, `creatorType: "user"`, `syncManaged: false`, `updatedAt`, dan `enabled`; `displayName` dapat ditambahkan bila nama tampil berbeda dari folder. `fileLocalSkill()` mempertahankan status aktif skill yang sudah ada, atau memakai nilai default aktif untuk skill baru. [R3]
3. **Status aktif.** `setLocalSkillEnabled()` memperbarui manifest dan meminta reload. Status tersimpan tersebut adalah bukti pengelolaan oleh harness; pemilihan skill pada suatu task tidak dibuktikan hanya oleh flag ini. [R5, R9]
4. **Diteruskan ke sesi.** `getPluginPath()` memeriksa struktur plugin dan keadaan skills yang dilayani menurut akun/organisasi. Jika direktori boleh dilayani, pengelola sesi Code menambahkan `{type: "local", path: skillsPluginPath}` ke konfigurasi plugin sesi. Pada kondisi tertentu, misalnya kebijakan managed yang menonaktifkan sideload, konfigurasi tersebut ditahan. Ini batas exposure yang terbukti dari harness; keputusan agen menggunakan skill berada di luar pemeriksaan ini. [R6–R8]
5. **Reload tanpa restart launcher.** Perubahan lokal memanggil `reloadSkillsInRunningSessions()`. Pengelola sesi kemudian memakai `query.reloadSkills()` pada sesi yang sesuai. Di pengelola local-agent-mode, balasan `skills` juga dipakai memperbarui daftar `slashCommands`. [R9–R11]

Lokasi logis yang dibangun kode (placeholder, bukan hasil membaca data akun):

```text
<Electron userData>/local-agent-mode-sessions/skills-plugin/<orgId>/<accountId>/
  manifest.json
  .claude-plugin/plugin.json
  skills/<nama-folder>/SKILL.md
```

`userData` adalah direktori data aplikasi yang dipilih Electron untuk instalasi tersebut. Resolver menggunakan organisasi dan akun aktif, sehingga folder ini bukan path global tunggal untuk semua akun. `plugin.json` dibuat aplikasi untuk plugin kumpulan skills bernama `anthropic-skills`. [R4, R6]

Menyalin folder langsung belum membuktikan pendaftaran/aktivasi. Jika manifest hilang, jalur pemulihan menemukan folder lokal tetapi mencatatnya kembali dengan **enabled: false**. Ada pula pembersihan direktori yatim dan struktur yang dikelola aplikasi. [R14]

Untuk plugin, harness juga mempunyai jalur **reload langsung**: `sendReloadPlugins()` memanggil `query.reloadPlugins()`, lalu balasan memperbarui command dan status MCP. `applyReloadPluginsIfIdle()` menunda permintaan saat sesi sibuk atau reload lain berjalan, memakai penanda dirty agar perubahan tidak hilang. Dukungan reload tunduk pada feature gate, kebijakan managed, dan sesi yang masih hidup. [R12, R13, R15]

Ejaan slash command seperti `/reload skill` atau `/reload plugin` belum terkonfirmasi dari bundle harness yang ditelusuri. Yang terbukti adalah metode `reloadSkills()` / `reloadPlugins()` dan operasi/log internal `reload_skills` / `reload_plugins`; nama internal itu tidak otomatis menjadi sintaks slash command.

**Referensi untuk Agent Core (kesimpulan desain, belum implementasi):** registrar perlu menyimpan file dan metadata, kemudian meminta sesi memperbarui katalog kemampuannya. UI sebaiknya dapat membedakan tersimpan, aktif, tersedia di sesi, dan sudah digunakan. Reload dapat diminta manual atau dipicu perubahan; untuk plugin yang sibuk, penundaan sampai idle adalah pola yang ditemukan pada harness ini.

Bukti berikut berasal dari file hasil build di `app.asar`, bukan source map/original source. Analisis ini tidak menguji hasil pada sesi hidup, pemilihan skill oleh agen, atau seluruh variasi produk. Provenance dan keterbatasan ekstraksi awal tersedia di [bukti penelitian sebelumnya](C:/Users/iwand/Documents/Codex/2026-10-18/ak/outputs/Claude-Desktop-Harness-Bukti.md).

## Potongan bukti kode

Offset karakter dan byte dimulai dari nol. Potongan diambil persis dari salinan hasil ekstraksi, tanpa menjalankan kode target.

### R1

[mainView.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/mainView.js:1); offset karakter 69951, byte 69951; SHA-256 `c0a83ff7401d4f6e178bb42f4a7d063cb37b3b09cdcefd7f2f1088777cfd6167`.

```js
saveLocalSkill(t,n,r,i,a){return e.ipcRenderer.invoke(k+"LocalAgentModeSessions_$_saveLocalSkill",t,n,r,i,a)},saveLocalSkillArchive(t){return e.ipcRenderer.invoke(k+"LocalAgentModeSessions_$_saveLocalSkillArchive",t)},renameLocalSkill(t,n){return e.ipcRenderer.invoke(k+"LocalAgentModeSessions_$_renameLocalSkill",t,n)},setLocalSkillEnabled(t,n){return e.ipcRenderer.invoke(k+"LocalAgentModeSessions_$_setLocalSkillEnabled",t,n)},deleteLocalSkill(t){return e.ipcRenderer.invoke(k+"LocalAgentModeSessions_$_deleteLocalSkill",t)},revealLocalSkill(t){return e.ipcRenderer.invoke(k+"LocalAgentModeSessions_$_revealLocalSkill",t)},resp
```

### R2

[index.chunk-GxaHi8nV.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-GxaHi8nV.js:1); offset karakter 32860, byte 32860; SHA-256 `00d90c6302cc9876c106cbbbb8c8de841b0b8ac5427d981d4b1a78e0b7dcc729`.

```js
async saveLocalSkill(t,n,r,i,o){let s=await this.getPluginDir();return s?this.manifestMutex.runExclusive((async()=>{let c=await this.localSaveCheck(s,t,n,i,o);if("refusal"in c)return c.refusal;let l=e.AB(s,c.folder);return c.existing||await this.removeSkills(s,[{name:c.folder}]),await e.Q6(l),await e.s8((0,a.join)(l,"SKILL.md"),r),await this.fileLocalSkill(s,c,t,n),this.reloadSkillsInRunningSessions(),{ok:!0,skillId:c.folder}})).catch(Le($)):{ok:!1,error:"No plugin directory available"}}builtInNameTwinRefusal(t,n){let r=e.OB(t),i=n.find((t=>e.OB(t.name)===r));return i?`"${t}" is too similar to the built-in skill name "${i.name}"`:null}async s
```

### R3

[index.chunk-GxaHi8nV.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-GxaHi8nV.js:1); offset karakter 18826, byte 18826; SHA-256 `00d90c6302cc9876c106cbbbb8c8de841b0b8ac5427d981d4b1a78e0b7dcc729`.

```js
function Pe(e,t,n,r){return{skillId:e,name:e,...t!==e&&{displayName:t.normalize("NFC")},description:n,creatorType:"user",syncManaged:!1,updatedAt:(new Date).toISOString(),enabled:r}}function Fe(e){if(e.length>1020)return null;let t=e.normalize("NFC");return t.length<=Ae?t:null}function Ie(
```

### R4

[index.chunk-CHpJbW9_.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CHpJbW9_.js:13); offset karakter 2255706, byte 2255706; SHA-256 `b03c880c4253d98e11833e710a940233217105814c3d12920e43f1cf3ef32783`.

```js
function Y1t(){return n.default.join(a.app.getPath("userData"),xS,"skills-plugin")}function X1t(e,t){return n.default.join(Y1t(),e,t)}var Z1t=/^local_([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0
```

### R5

[index.chunk-GxaHi8nV.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-GxaHi8nV.js:1); offset karakter 31800, byte 31800; SHA-256 `00d90c6302cc9876c106cbbbb8c8de841b0b8ac5427d981d4b1a78e0b7dcc729`.

```js
async setLocalSkillEnabled(e,t){let n=await this.getPluginDir();return n?this.manifestMutex.runExclusive((async()=>{let r=await this.readManifest(n);if(!r)return{ok:!1,error:W(e)};let i=r.skills.find((t=>t.name===e));return!i||i.creatorType!=="user"?{ok:!1,error:W(e)}:(i.enabled=t,i.updatedAt=(new Date).toISOString(),await this.writeManifest(n,{lastUpdated:Date.now(),skills:r.skills}),this.reloadSkillsInRunningSessions(),{ok:!0})})).catch(Le("Couldn\u2019t update this skill. Try again.")):{ok:!1,error:"No plugin directory"}}async deleteLocalSkill(e){let t=await th
```

### R6

[index.chunk-GxaHi8nV.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-GxaHi8nV.js:1); offset karakter 25165, byte 25165; SHA-256 `00d90c6302cc9876c106cbbbb8c8de841b0b8ac5427d981d4b1a78e0b7dcc729`.

```js
async getPluginPath(t){let{served:n,orgId:r,names:i}=t??this.resolveServedSkills(await e.aR());if(tt(n),n==="none")return null;let o=n==="app_shipped",c=await this.getPluginDir({appShippedOnly:o,orgId:r});if(!c)return null;try{await this.manifestMutex.runExclusive((()=>this.ensurePluginStructure(c)))}catch(t){return e.j6.error(`[SkillsPlugin] Withholding the skills plugin ${JSON.stringify(c)} from this session: it could not be made to hold only what the app writes there, and Claude Code would load whatever else is in it:`,t),null}if(i!==void 0&&await this.holdsUnservedAppShippedSkills(c,i))return e.j6.warn(`[SkillsPlugin] Withholding the skills plugin ${JSON.stringify(c)} from this session: it still holds app-shipped skills the organization's served core-skills list no longer names, and the sync round that removes them has not finished; serving no skills`),this.triggerSync(),null;await this.checkBundledSkillsAtSessionStart(c,o,i);let l=(0,a.join)(c,e.TB);try{if((await(0,s.readdir)(l)).length===0)return null}catch{return null}return e.a4().usesLocalSkillStorage()&&!await this.writeManifestIfMissing(c,o,i)?null:c}async write
```

### R7

[index.chunk-CnuqahbP.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CnuqahbP.js:1); offset karakter 1544089, byte 1544089; SHA-256 `47b18b505f682f77876fa216ffc9ffa2307607025dc15eaeccdae31a33769aa1`.

```js
y&&(L.push({type:"local",path:y}),t.j6.info(`[CCD] Using skills plugin at: ${y}`)),C&&L.push({type:"local",path:C,skipMcpDiscovery:!0});for(
```

### R8

[index.chunk-CnuqahbP.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CnuqahbP.js:1); offset karakter 1545893, byte 1545893; SHA-256 `47b18b505f682f77876fa216ffc9ffa2307607025dc15eaeccdae31a33769aa1`.

```js
L.length>0&&!ee?(e.plugins=n.$l(L),t.j6.info(`[CCD] Passing ${L.length} plugin(s) to SDK (skills: ${+!!y}, remote: ${x.length}, local: ${w.length-z.length})`)):V&&t.j6.info(`[CCD] session ${r} spawns without desktop plugins (managed-settings dis
```

### R9

[index.chunk-GxaHi8nV.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-GxaHi8nV.js:1); offset karakter 30033, byte 30033; SHA-256 `00d90c6302cc9876c106cbbbb8c8de841b0b8ac5427d981d4b1a78e0b7dcc729`.

```js
reloadSkillsInRunningSessions(){this._rescanRequestedAt=Date.now(),e.Vq()?.reloadSkillsForRunningSessions(),e.Fq()?.reloadSkillsForRunningSessions()}rescanRequestedSince(e){return this._rescanRequestedAt>=e}asy
```

### R10

[index.chunk-CnuqahbP.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CnuqahbP.js:1); offset karakter 1915710, byte 1915710; SHA-256 `47b18b505f682f77876fa216ffc9ffa2307607025dc15eaeccdae31a33769aa1`.

```js
reloadSkillsForRunningSessions(){for(let e of this.sessions.values())e.query&&this.reloadSkillsOf(e,e.query)}reloadSkillsOf(e,n,r){!t.a4().usesLocalSkillStorage()||e.backend.remoteTarget||t.Tw(e)||r!==void 0&&!ne.t.rescanRequestedSince(r)||jb(e,n,n.reloadSkills()).catch((n=>t.j6.info(`[CCD] reload_skills failed for ${e.sessionId} (expected when its process has gone): ${t.P1(n)}`)))}bumpSshMirrorRewriteGeneration(e){this.sshMirrorRewriteGeneration
```

### R11

[index.chunk-YBFVQBQ_.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-YBFVQBQ_.js:1); offset karakter 588654, byte 588654; SHA-256 `6118d4627fe8527500cd88cd84703f6099d2d02a9f1987015e5b25f4d7b93633`.

```js
reloadSkillsForRunningSessions(){for(let e of this.sessions.values()){let{query:n,sessionId:r}=e;n&&n.reloadSkills().then((t=>{if(this.sessions.get(r)?.query!==n)return;let i=new Set(e.slashCommands??[]);for(let e of t.skills)i.add(e.name);e.slashCommands=[...i],this.saveSession(e)})).catch((e=>{t.j6.info(`[LocalAgentModeSessionManager] reload_skills for session ${r} failed (expected when the CLI process is torn down):`,e)}))}}widgetIpcRefusedForLauncherSession(e,n){return t.UO(n)?(t.j6.warn(`[LocalAgentModeSessionManager] $
```

### R12

[index.chunk-CnuqahbP.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CnuqahbP.js:1); offset karakter 797288, byte 797288; SHA-256 `47b18b505f682f77876fa216ffc9ffa2307607025dc15eaeccdae31a33769aa1`.

```js
async applyReloadPluginsIfIdle(e){let n=e.query;if(!n||e.isRunning||e.pluginsReloadInFlight){n&&(e.pluginsReloadDirty=!0);return}if(typeof n.reloadPlugins!="function"){e.pluginsReloadDirty=!1;return}e.pluginsReloadDirty=!1,e.pluginsReloadInFlight=!0;let r=!1,i=!1;try{let a=await this.reloadPluginsAllowed();if(e.query!==n||!a)return;if(e.isRunning){e.pluginsReloadDirty=!0;return}let o=await this.sendReloadPlugins(e,n);if(e.query!==n)return;if(o===VM){r=!0,e.pluginsReloadDirty=!0,t.j6.warn(`[CCD] reload_plugins timed out for ${e.sessionId} after ${BM}ms`);return}if(o)try{i=await this.applyReloadPluginsReply(e,n,o)}catch(n){t.j6.warn(`[CCD] relo
```

### R13

[index.chunk-CnuqahbP.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CnuqahbP.js:1); offset karakter 798170, byte 798170; SHA-256 `47b18b505f682f77876fa216ffc9ffa2307607025dc15eaeccdae31a33769aa1`.

```js
async sendReloadPlugins(e,n){e.registryReadBeganAt=Date.now(),e.registryReadEndedAt=void 0;let r;try{let t=await Promise.race([this.deps.trackHostRequest(e,n,n.reloadPlugins()),new Promise((e=>{r=setTimeout((()=>e(VM)),BM)}))]);return t===VM?t:t??{}}catch(r){e.query===n&&!e.reloadPluginsWarned&&(e.reloadPluginsWarned=!0,t.j6.warn(`[CCD] reload_plugins failed for ${e.sessionId}: ${t.M0(r instanceof
```

### R14

[index.chunk-GxaHi8nV.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-GxaHi8nV.js:1); offset karakter 43627, byte 43627; SHA-256 `00d90c6302cc9876c106cbbbb8c8de841b0b8ac5427d981d4b1a78e0b7dcc729`.

```js
async entriesWithNoManifest(n,r){if(!e.a4().usesLocalSkillStorage())return[];let i=new Set(r.map((e=>this.diskKey(e.name)))),o=[],c=await(0,s.readdir)((0,a.join)(n,e.TB),{withFileTypes:!0});for(let{name:r}of c.filter((e=>e.isDirectory()))){if(r.startsWith(".")||e.iB(r)!==void 0||e.MB(r)!==r||!e.jB(n,r)||i.has(this.diskKey(r)))continue;let a=await this.readOwnSkillMd(n,e.AB(n,r)).then((e=>e&&d(e)),(()=>""));if(a===null)continue;i.add(this.diskKey(r));let{frontmatter:s}=e.eH(a),c=e.$V(s,"name"),l=c===void 0?null:Fe(c),u=l!==null&&Ie(l,e.LB(l))&&e.PB(l)===r?l:r;o.push(Pe(r,u,g(e.$V(s,"description")??"",t.t),!1))}return o.length>0&&e.j6.warn(`[SkillsPlugin] No skills manifest to start from; listed ${o.length} folder${o.length===1?"":"s"} under skills/ again as skills kept on this computer, each switched off`),o}isBuiltInInstallEntry(e,t){return e.name===t&&e.creatorType==="anthropic"&&e.skillId===t&&e.updatedAt===null}async builtInSkillFilePresent(t,n,r){try{let r=await(0,s.stat)((0,a.join)(e.AB(t,n),"SKILL.md"));return r.isFile()&&r.size>0}catch(e){let{code:t}=e;return t==="ENOENT"||t==="ENOTDIR"?!1:r}}async assertPlainSkillDirectory(e){if(!(await(0,s.lstat)(e)).is
```

### R15

[index.chunk-CnuqahbP.js](C:/Users/iwand/Documents/Codex/2026-10-18/ak/work/claude-harness/extracted/.vite/build/index.chunk-CnuqahbP.js:1); offset karakter 798682, byte 798682; SHA-256 `47b18b505f682f77876fa216ffc9ffa2307607025dc15eaeccdae31a33769aa1`.

```js
async applyReloadPluginsReply(e,n,r){let i=Array.isArray(r.plugins)?r.plugins:[],a=Array.isArray(r.commands)?r.commands:[],o=typeof r.error_count=="number"?r.error_count:0;t.j6[o>0?"warn":"info"](`[CCD] reload_plugins applied for ${e.sessionId}: ${i.length} plugin(s), ${a.length} command(s), ${o} plugin error(s)`),Array.isArray(r.commands)&&this.deps.adoptLiveCommands(e,r.commands),this.deps.refreshSdkMcpStatuses(e);let s=await this.readEnabledRegistryPlugins(e,{shareGeneration:e.pluginsReloadRetried?void 0:e.pluginsReloadGeneration});return!s||e.query!==n||(this.deps.widenPluginPathsAfterReload(e,s.plugins),awai
```
