# Agent Core Memory — Source-Linked Workflow & Dependency Map

**Tanggal audit:** 16 Oktober 2026 (Asia/Jakarta). **Mode:** inspeksi source dan readback live; dokumentasi saja, tanpa pengujian produk/benchmark/restart/mutasi Memory.
**Project root:** E:\Projects\Agent-Core. **Scope:** hanya Memory, interface Memory, dan Learning yang langsung berinteraksi dengan Memory. Bagian eksekusi mesin, telepon, UI, browser, Grafel internal, dan provider lain tidak dipetakan.
**Authority:** source TypeScript aktif > activation marker dan live readback > CODEBASE.md lama > riwayat percakapan. Grafik kode eksternal hanya secondary evidence.

## 1. Hasil forensik terpenting

1. **Engine yang dipilih sekarang adalah Experience V2.** Marker [runtime/memory-v2-activation.json](../runtime/memory-v2-activation.json) memuat schemaVersion=2, mode=experience-v2, root=runtime/memory, status=complete, origin=relocated. Root historis runtime/memory-v2 bukan root live.
2. [src/memory/host-runtime.ts](../src/memory/host-runtime.ts#L93) memvalidasi marker, rootId dan backup sebelum memanggil [SubProject MemoryService.initialize](../SubProject/agent-core-memory/src/memory/service.ts#L409). Ini bukan sekadar rename: runtime utama melakukan import engine hasil kompilasi SubProject.
3. [src/index.ts](../src/index.ts#L74) melakukan bootstrap memory. [src/mcp/server.ts](../src/mcp/server.ts#L348) memasang dua antarmuka: API biasa yang kompatibel dan dua tool Memory V2 yang membutuhkan scope task.
4. [src/mcp/memory-tools.ts](../src/mcp/memory-tools.ts#L94) masih menyediakan memory_list/search/remember/update/batch/dll, tetapi menerima instance MemoryService dari hasil host initialization. Kode kelas legacy dalam src/memory/service.ts **bukan** pemilik engine live jika marker V2 valid.
5. [src/mcp/memory-experience-tools.ts](../src/mcp/memory-experience-tools.ts#L25) mengubah input memory_v2_read/write menjadi controller session yang terikat task/workspace/controller/host; pemanggil tidak boleh memasukkan scope palsu melalui payload.
6. [SubProject/memory/types.ts](../SubProject/agent-core-memory/src/memory/types.ts#L3) menetapkan schema V1 untuk ordinary remember/update compatibility dan record V2 untuk pengalaman terstruktur. Jangan menganggap semua notes otomatis record pengalaman V2.
7. Retrieval tidak sama dengan pemakaian yang terbukti. Source membedakan candidate/selected/delivered, usage receipt, feedback, verification, dan dampak pada goal. Memory bersifat **advisory historical data**, tidak memiliki execution authority.

### Live readback (bukan hasil test penuh)

- memory_status: canonicalStore=available, canonicalComplete=true, noteCount=211, issueCount=0, index/embedding/intelligence=available.
- Embedding provider: cloudflare-workers-ai, model @cf/google/embeddinggemma-300m, 768 dimensi.
- Retrieval ledger: 478 attempts, 9 receipts pada saat pemeriksaan; statistik ini **tidak membuktikan** keberhasilan penalaran atau pengaruh kausal.
- Source SubProject Memory: 49 file .ts aktif; host src/memory: 32 file .ts. Artefak dist dan file .tmp **bukan** source authority.

## 2. Diagram arsitektur runtime — AKTUAL, bukan arsitektur usulan

~~~mermaid
flowchart TD
  USER["User + AI Controller"] --> MCP["Host MCP server.ts"]
  NATIVE["Native Agent Controller"] --> MCP
  MCP --> SCOPE["memory-scope.ts / host task identity"]
  MCP --> LEGACY["memory-tools.ts: compatibility API"]
  SCOPE --> V2API["memory-experience-tools.ts: task-bound API"]
  BOOT["src/index.ts bootstrap"] --> SELECT["host-runtime.ts activation validation"]
  MARK["runtime/memory-v2-activation.json"] --> SELECT
  SELECT --> CORE["SubProject MemoryService / experience-v2"]
  LEGACY --> CORE
  V2API --> SESSION["ControllerMemorySession + Dispatcher"]
  SESSION --> CORE
  CORE --> STORE["FileMemoryStore + TransactionCoordinator"]
  CORE --> INDEX["MemoryIndex + Retrieval + Embedder"]
  SESSION --> EPISODE["MemoryEpisodes + Capsule + Promotion"]
  EPISODE --> STORE
  STORE --> CANON["runtime/memory canonical / archive / state"]
  INDEX --> DERIVED["runtime/memory/index/index.json (derived)"]
  CANON --> INDEX
  LEARNING["Existing LearningService / MemoryLearningSink"] --> CORE
  LEARNING -. "bound policy + verified correction" .-> SESSION
  classDef authority fill:#e9efff,stroke:#4965ae,color:#17264c
  classDef canonical fill:#edf8ef,stroke:#3c8760,color:#173928
  class CORE,SESSION,SELECT authority
  class CANON,STORE canonical
~~~

**Baca diagram:** panah menyatakan pemanggilan/data yang dibuktikan dari wiring source; garis putus-putus adalah binding policy untuk koreksi. Garis bukan izin eksekusi atau bukti bahwa semua lintasan terjadi pada setiap turn.

## 3. Workflow A — startup dan pemilihan engine

1. [src/index.ts:74–86](../src/index.ts#L74) membentuk embedder opsional dari konfigurasi dan memanggil initializeAgentCoreMemory(projectRoot, memoryDir, embedder).
2. [host-runtime.ts:18–41](../src/memory/host-runtime.ts#L18) memakai path resolution terikat root, menolak symlink path, dan [activation lock](../src/memory/host-runtime.ts#L42).
3. [host-runtime.ts:54–95](../src/memory/host-runtime.ts#L54) membaca marker: schema, mode, status, root identity, legacy backup digest, dan konflik root historis; kondisi ambigu **fail-closed**, bukan silent fallback.
4. [host-runtime.ts:98–117](../src/memory/host-runtime.ts#L98): marker absent + tidak ada artefak V2 = legacy fallback. Marker lengkap = dynamic import engine [dist/index.js](../SubProject/agent-core-memory/src/index.ts#L1), initialize Experience V2; **legacy writer tidak diaktifkan bersamaan**.
5. [learning/memory-sink.ts:27–44](../src/learning/memory-sink.ts#L27) membuat consolidation policy host dan bind engine, bukan memberi otorisasi ke payload controller.
6. [SubProject/service.ts:409–441](../SubProject/agent-core-memory/src/memory/service.ts#L409) initialize FileMemoryStore, validity/canonical health, feedback reconciliation dan ensure derived index.
7. [src/index.ts:127–173](../src/index.ts#L127) menghubungkan workspace alias, Learning, external-controller learning, dan Native controller bila tersedia.
8. [src/mcp/server.ts:348–383](../src/mcp/server.ts#L348) menyelesaikan pendaftaran tool MCP dan resolver scope host-bound.

**Batas penting:** [host-activation.ts](../src/memory/host-activation.ts#L35) adalah **operasi offline eksplisit** (fresh/relocate + dryRun). Itu bukan migration otomatis setiap startup. Marker active sudah menunjuk canonical runtime/memory.

## 4. Workflow B — membaca Memory melalui compatibility API

~~~mermaid
flowchart TD
  Q["memory_search(query, workspace, profile, budget)"] --> WRAP["MCP schema + host task context (jika ada)"]
  WRAP --> RELOAD["MemoryService.reload + complete canonical snapshot"]
  RELOAD --> SCOPE["workspace / pinned foundation / visibility"]
  SCOPE --> FILTER["expiration / supersession / synthesis-eligibility"]
  FILTER --> RANK["index semantic (opsional) + lexical/BM25/fusion"]
  RANK --> REL["relevance + dedup + temporal link expansion"]
  REL --> PROJ["source freshness / bounded delivery projection"]
  PROJ --> LEDGER["retrieval attempt + exposure/delivery receipts"]
  LEDGER --> ANSWER["tool result: ranked advisory records"]
  CANON["canonical Markdown"] --> RELOAD
  INDEX["derived index + query embedding"] --> RANK
~~~

1. Tool entry [memory-tools.ts:152–197](../src/mcp/memory-tools.ts#L152) menyusun taskId dari Native atau host-bound invocation bila tersedia. Host context dibutuhkan untuk disclosure sintesis tertentu; ordinary search tetap dapat berlangsung tanpa authority sintesis.
2. [service.ts:1296–1360](../SubProject/agent-core-memory/src/memory/service.ts#L1296) me-reload canonical, memastikan indeks, menyaring workspace/forgotten/superseded dan menilai eligibility proyek. Synthesis yang stale/unknown ditahan, tidak boleh menyembunyikan memory biasa.
3. [index.ts](../SubProject/agent-core-memory/src/memory/index.ts) memberi semantic context jika embedder/index tersedia; [retrieval.ts](../SubProject/agent-core-memory/src/memory/retrieval.ts) menggabungkan lexical, BM25, semantic, metadata, provenance, recency, dan hubungan; fusion memiliki aturan diversity.
4. [search-projection.ts](../SubProject/agent-core-memory/src/memory/search-projection.ts) membatasi bentuk yang disampaikan. [retrieval-ledger.ts](../SubProject/agent-core-memory/src/memory/retrieval-ledger.ts) merekam attempt, selected, delivered/dropped, hash query, budget, dan failure tanpa mengeklaim outcome task.
5. [memory_read](../src/mcp/memory-tools.ts#L138) mengembalikan record, staleness, lifecycle, authority, revisions opsional. Ini berbeda dari pencarian dan dapat memperbarui access metadata.
6. [memory_page](../src/mcp/memory-tools.ts#L119) melakukan pagination cursor terikat snapshot; [memory_retrieval_diagnostics](../src/mcp/memory-tools.ts#L200) hanya melihat evidence retrieval.

## 5. Workflow C — Memory V2 task-bound recall dan expand

1. Pemanggil eksternal terlebih dahulu membutuhkan taskId dari host-bound [controller_learning episode](../src/mcp/controller-learning-tools.ts); native memerlukan task/workspace yang ditetapkan host.
2. [server.ts:357–368](../src/mcp/server.ts#L357) membuat resolver scope; [memory-scope.ts](../src/mcp/memory-scope.ts) mengikat owner ke principal/transport, bukan membiarkan client memilih workspace sembarang.
3. [memory-experience-tools.ts:25–42](../src/mcp/memory-experience-tools.ts#L25) memblokir scope field di payload, merevalidasi scope sesaat sebelum operasi, memberi deadline dan cancellation signal.
4. [controller-protocol.ts:8–50](../SubProject/agent-core-memory/src/memory/controller-protocol.ts#L8) memilih salah satu dari 13 method, preflight schema/budget, lalu memanggil ControllerMemorySession. Seluruh respons diberi notice advisory dan metrik bytes/tokens.
5. [controller-session.ts:125–226](../SubProject/agent-core-memory/src/memory/controller-session.ts#L125) menyediakan recall map/abstract, bounded views, retention, validAt/asOf, knownAt, cursor scope/snapshot dan project synthesis eligibility.
6. [temporal.ts](../SubProject/agent-core-memory/src/memory/temporal.ts) memproyeksikan valid-time; [revisions.ts](../SubProject/agent-core-memory/src/memory/revisions.ts) mendukung known-time sejarah. knownAt tidak memakai fakta atau indeks masa kini sebagai bukti pengetahuan lampau.
7. [controller-session.ts:227–319](../SubProject/agent-core-memory/src/memory/controller-session.ts#L227) expand merujuk source+revision dan memilih record, episode atau evidence dengan guard integritas.
8. [controller-session.ts:101–124](../SubProject/agent-core-memory/src/memory/controller-session.ts#L101) mencatat exposure yang benar-benar delivered, berbeda dari ranking candidate.
9. Batas user-facing: capsule yang menyatakan ready = konteks segar; **bukan** penyelesaian task atau izin menjalankan task paused/completed.


## 6. Workflow D — ordinary writes, transaksi, index, dan evolution

~~~mermaid
flowchart TD
  WR["memory_remember / update / batch / delete"] --> VALID["MCP Zod + content safety + metadata/provenance"]
  VALID --> MOD["MemoryService (schema V1-compatible ordinary write)"]
  MOD --> STORE["FileMemoryStore"]
  STORE --> LOCK["memory.lock + CAS fingerprint + transaction journal"]
  LOCK --> CANON["canonical notes/*.md + revisions/archive/state"]
  CANON --> REFRESH["refresh derived index"]
  REFRESH --> EVOLVE{"bounded intelligence evolution eligible?"}
  EVOLVE -->|yes| INTEL["nearest neighbors / conservative metadata+links"]
  EVOLVE -->|no| END["result / readback"]
  INTEL --> STORE
  REFRESH --> END
  LEARN["Learning reviewed/verified candidate"] --> SINK["MemoryLearningSink"]
  SINK --> MOD
  SINK -. "host-bound correction only" .-> PROMO["MemoryPromotion preview + CAS apply"]
  PROMO --> STORE
~~~

1. [memory-tools.ts:219–277](../src/mcp/memory-tools.ts#L219) memvalidasi remember/update/delete/batch. [service.ts:964–1017](../SubProject/agent-core-memory/src/memory/service.ts#L964) mengisi metadata dari controller atau deterministic [intelligence fallback](../SubProject/agent-core-memory/src/memory/intelligence.ts), menangkap [provenance](../SubProject/agent-core-memory/src/memory/provenance.ts), lalu create.
2. [types.ts:3](../SubProject/agent-core-memory/src/memory/types.ts#L3): ordinary remember menghasilkan MemoryRecordV1 (schema version 1), walaupun engine Experience V2 yang menampungnya. Jangan salah menamai ordinary note sebagai verifiable experience record V2.
3. [service.ts:1018–1110](../SubProject/agent-core-memory/src/memory/service.ts#L1018) membatasi update foundation pinned, mempertahankan revision history, dan evolution hanya pada kondisi yang dibatasi.
4. [service.ts:1124–1294](../SubProject/agent-core-memory/src/memory/service.ts#L1124) membuat memory_batch maksimum 100 operasi dengan plan menyeluruh; satu batch = satu canonical commit dan satu index refresh. Penghapusan record V2 melalui ordinary batch ditolak (MEMORY_PRESERVATION_REQUIRED).
5. [store.ts:286–387](../SubProject/agent-core-memory/src/memory/store.ts#L286) mengendalikan snapshot + stateWrites + validated commit; [transaction.ts:67–177](../SubProject/agent-core-memory/src/memory/transaction.ts#L67) menulis journal preparing/prepared/applying/committed, CAS fingerprint, backup/stage, rollback/recovery yang dibatasi.
6. [lock.ts](../SubProject/agent-core-memory/src/memory/lock.ts) melindungi concurrent writers. [safety.ts](../SubProject/agent-core-memory/src/memory/safety.ts) memeriksa konten berbahaya/secret/instruction poisoning; ini proteksi input, bukan izin eksekusi.
7. [index.ts:344–410](../SubProject/agent-core-memory/src/memory/index.ts#L344) memastikan indeks turunan sinkron dengan canonical; [embedding-repair.ts](../SubProject/agent-core-memory/src/memory/embedding-repair.ts) menangani pelaporan/retry embedding dengan batas.
8. [service.ts:1516–1659](../SubProject/agent-core-memory/src/memory/service.ts#L1516) menghubungkan related neighbors/evolution dan proposal duplicate/overlap; evolution bukan lisensi menimpa fakta tetangga tanpa verifikasi.
9. Delete/forget, retention dan promotion memiliki guard tambahan. **Tidak** semua jenis memory bisa dihapus atau digabung dengan operasi biasa.

## 7. Workflow E — episode, evidence, checkpoint, capsule

1. [controller-session.ts:320–346](../SubProject/agent-core-memory/src/memory/controller-session.ts#L320) menghubungkan task_start, event_append, evidence_capture, episode_status dan checkpoint ke [MemoryEpisodes](../SubProject/agent-core-memory/src/memory/episodes.ts).
2. [episodes.ts:531–572](../SubProject/agent-core-memory/src/memory/episodes.ts#L531) memulai episode task-bound: status open, goal event pertama, working state, startKey/idempotency. Episode lama yang masih open/paused tidak boleh ditimpa semaunya.
3. [episodes.ts:573–694](../SubProject/agent-core-memory/src/memory/episodes.ts#L573) mencatat event/status dengan operationId, expectedRevision, validated evidence refs dan transaksi CAS.
4. [episodes.ts:695–808](../SubProject/agent-core-memory/src/memory/episodes.ts#L695) menangkap evidence sebagai artifact receipt dengan source identity/path/freshness; capture != verifikasi berhasilnya goal.
5. [episodes.ts:583–635](../SubProject/agent-core-memory/src/memory/episodes.ts#L583) checkpoint me-replay event+working state, memvalidasi current claim/dependencies dan [capsule.ts](../SubProject/agent-core-memory/src/memory/capsule.ts) mengompresi konteks dalam byte budget.
6. Checkpoint menyimpan snapshot+lineage dalam state/capsules dan archive via [archive.ts](../SubProject/agent-core-memory/src/memory/archive.ts), bukan membuat second canonical note store.
7. [episodes.ts:829–895](../SubProject/agent-core-memory/src/memory/episodes.ts#L829) task_context membentuk continuity snapshot; [prospective-intentions.ts](../SubProject/agent-core-memory/src/memory/prospective-intentions.ts) bisa memproyeksikan niat task saat ini secara advisory tanpa scheduling/eksekusi.
8. [ingestion cursor](../SubProject/agent-core-memory/src/memory/episodes.ts#L816) disimpan setelah ingestion yang berhasil committed; duplicate/stale event tidak otomatis digabung tanpa identitas operasi.

## 8. Workflow F — consolidation/promotion dan Learning

~~~mermaid
flowchart TD
  ACT["Task + observed tools/evidence"] --> LC["Learning checkpoint + review"]
  LC --> DEC{"Candidate verified + eligible?"}
  DEC -->|no| HOLD["proposal / reject / awaiting evidence"]
  DEC -->|yes| ROUTE["LearningSinkManager"]
  ROUTE -->|"durable fact/architecture/reflection"| MEM["MemoryLearningSink -> ordinary remember"]
  ROUTE -->|"repo recipe"| GRAPH["Code Pattern sink (outside Memory authority)"]
  LC --> CUR["Explicit curation correction"]
  CUR --> TARGET["exact target revision + host-bound open/paused episode"]
  TARGET --> CAP["capture revision-pinned file evidence"]
  CAP --> PLAN["MemoryPromotion.prepare"]
  PLAN --> APPROVE["host-bound exact plan / evidence revalidation"]
  APPROVE --> COMMIT["MemoryPromotion.apply / transactional CAS"]
  COMMIT --> CANON["canonical Memory V2 + audit/archive"]
  MEM --> CANON
  CANON --> FUT["Future bounded recall"]
~~~

- [learning/service.ts](../src/learning/service.ts) dan [learning/review.ts](../src/learning/review.ts) adalah sibling Learning owner: meaningful checkpoint/review menghasilkan candidate, bukan izin eksekusi. [learning/sink-manager.ts](../src/learning/sink-manager.ts) mengarahkan tipe knowledge.
- [learning/memory-sink.ts:58–113](../src/learning/memory-sink.ts#L58) mencakup dedup scoped dan klasifikasi sink; [learning/memory-sink.ts:113–202](../src/learning/memory-sink.ts#L113) membatasi correction dengan exact target revision, workspace, episode, evidence file digest, freshness dan host policy.
- [SubProject/promotion.ts:210–454](../SubProject/agent-core-memory/src/memory/promotion.ts#L210) menyediakan prepare/apply, dependency read-set, CAS, audit receipt dan review policy. Consolidation **bukan** auto rewrite dari hasil model bebas.
- [SubProject/project-synthesis.ts](../SubProject/agent-core-memory/src/memory/project-synthesis.ts) menjaga dependent synthesis sesuai sumber saat delivery; stale/unknown lineage ditahan dan tidak dapat mengklaim timeless authority.
- [learning/external-controller.ts](../src/learning/external-controller.ts) mengikat task per owner/controller dan menyediakan receipt/retrieval context; [src/mcp/controller-learning-tools.ts](../src/mcp/controller-learning-tools.ts) adalah tool facade-nya.
- **Pemisahan epistemik:** memory retrieved ≠ memory diterapkan ≠ tool berhasil ≠ goal tercapai ≠ memory terbukti meningkatkan keputusan. Hanya evidence terverifikasi yang dapat mendukung klaim terakhir, bukan jumlah memory atau embedding.

## 9. Workflow G — temporal, retention, history, export

- **validAt / asOf:** fakta dianggap berlaku pada waktu tertentu melalui [temporal.ts](../SubProject/agent-core-memory/src/memory/temporal.ts) dan temporal links di [relations.ts](../SubProject/agent-core-memory/src/memory/relations.ts).
- **knownAt:** apa yang tertulis diketahui host pada waktu tertentu dibangun dari [store.historicalSnapshot](../SubProject/agent-core-memory/src/memory/store.ts#L145) + [revisions.ts](../SubProject/agent-core-memory/src/memory/revisions.ts); tidak memakai indeks terbaru untuk backdating.
- **revisions/archive:** rekaman mutasi/digests untuk history dan penelusuran asal dari [revisions.ts](../SubProject/agent-core-memory/src/memory/revisions.ts), [archive.ts](../SubProject/agent-core-memory/src/memory/archive.ts). Preserve original/counterexample, jangan paksa penyederhanaan historis.
- **retention/retirement:** [retirement.ts](../SubProject/agent-core-memory/src/memory/retirement.ts) dan [episodes.setRetention](../SubProject/agent-core-memory/src/memory/episodes.ts#L497) menangani lifecycle. Review kandidat tidak sama dengan auto-delete.
- **transfer:** [transfer.ts](../SubProject/agent-core-memory/src/memory/transfer.ts) untuk compatibility/import-export legacy dan [transfer-v2.ts](../SubProject/agent-core-memory/src/memory/transfer-v2.ts) untuk transfer V2 yang memiliki manifest/review. Export legacy ≠ full backup V2.
- **visibility/feedback:** [feedback.ts](../SubProject/agent-core-memory/src/memory/feedback.ts), [visibility.ts](../SubProject/agent-core-memory/src/memory/visibility.ts) dan [feedback-target.ts](../SubProject/agent-core-memory/src/memory/feedback-target.ts) memisahkan kualitas/forget/restore dari deleting canonical record.
- **provenance:** [source-snapshot.ts](../SubProject/agent-core-memory/src/memory/source-snapshot.ts) dan [repository-identity.ts](../SubProject/agent-core-memory/src/memory/repository-identity.ts) menilai hubungan dengan source sekarang; fingerprint file bukan bukti semantik yang pasti benar.


## 10. Source map A — 49 modul mesin Experience V2

Setiap path berikut dapat diklik untuk membuka source TypeScript. “Jalur terkait” adalah hubungan fungsional untuk navigasi audit, tidak selalu berarti import atau pemanggilan langsung. Call-site penting dan line anchor ada pada bagian 3–9.

| Source | Tanggung jawab | Jalur terkait |
|---|---|---|
| [service.ts](../SubProject/agent-core-memory/src/memory/service.ts) | Orchestrator Memory, API, index, controller, health | [store](../SubProject/agent-core-memory/src/memory/store.ts), [retrieval](../SubProject/agent-core-memory/src/memory/retrieval.ts), [index](../SubProject/agent-core-memory/src/memory/index.ts) |
| [controller-session.ts](../SubProject/agent-core-memory/src/memory/controller-session.ts) | Scoped recall/expand/disclosure, episode delegation | [controller-protocol](../SubProject/agent-core-memory/src/memory/controller-protocol.ts), [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts) |
| [controller-protocol.ts](../SubProject/agent-core-memory/src/memory/controller-protocol.ts) | Method dispatch, validation, bounded envelope | [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [disclosure.ts](../SubProject/agent-core-memory/src/memory/disclosure.ts) | Controller scope/cursor/budget/hash/errors | [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [experience-types.ts](../SubProject/agent-core-memory/src/memory/experience-types.ts) | Typed episode/record/evidence/capsule schema | [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts) |
| [episodes.ts](../SubProject/agent-core-memory/src/memory/episodes.ts) | Task start/event/status/checkpoint/evidence/ingestion | [store](../SubProject/agent-core-memory/src/memory/store.ts), [capsule](../SubProject/agent-core-memory/src/memory/capsule.ts) |
| [capsule.ts](../SubProject/agent-core-memory/src/memory/capsule.ts) | Working-state compact render dalam budget | [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts) |
| [capsule-integrity.ts](../SubProject/agent-core-memory/src/memory/capsule-integrity.ts) | Capsule integrity / lineage validation | [capsule](../SubProject/agent-core-memory/src/memory/capsule.ts), [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts) |
| [promotion.ts](../SubProject/agent-core-memory/src/memory/promotion.ts) | Preview/review/apply verified experience + CAS | [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts), [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [project-synthesis.ts](../SubProject/agent-core-memory/src/memory/project-synthesis.ts) | Synthesis refs, dependency validation, eligibility | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [prospective-intentions.ts](../SubProject/agent-core-memory/src/memory/prospective-intentions.ts) | Advisory current-episode intentions | [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [store.ts](../SubProject/agent-core-memory/src/memory/store.ts) | Canonical file reader/writer, immutable snapshot, CAS | [transaction](../SubProject/agent-core-memory/src/memory/transaction.ts), [paths](../SubProject/agent-core-memory/src/memory/paths.ts) |
| [transaction.ts](../SubProject/agent-core-memory/src/memory/transaction.ts) | Journal, atomic writes, drift guards, recovery | [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [lock.ts](../SubProject/agent-core-memory/src/memory/lock.ts) | Interprocess lock for canonical writes | [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [paths.ts](../SubProject/agent-core-memory/src/memory/paths.ts) | Resolve canonical memory root and owned paths | [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [note-format.ts](../SubProject/agent-core-memory/src/memory/note-format.ts) | Canonical note serialization/parsing | [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [types.ts](../SubProject/agent-core-memory/src/memory/types.ts) | V1/V2 note record/link/provenance/health contracts | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [archive.ts](../SubProject/agent-core-memory/src/memory/archive.ts) | History/evidence archive objects + manifests | [store](../SubProject/agent-core-memory/src/memory/store.ts), [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts) |
| [revisions.ts](../SubProject/agent-core-memory/src/memory/revisions.ts) | Exact revision/knownAt history | [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [migration.ts](../SubProject/agent-core-memory/src/memory/migration.ts) | Migration/record preservation contract | [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [temporal.ts](../SubProject/agent-core-memory/src/memory/temporal.ts) | validAt link/time validity projection | [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [relations.ts](../SubProject/agent-core-memory/src/memory/relations.ts) | Link normalization/temporal edge selection | [service](../SubProject/agent-core-memory/src/memory/service.ts), [retrieval](../SubProject/agent-core-memory/src/memory/retrieval.ts) |
| [retirement.ts](../SubProject/agent-core-memory/src/memory/retirement.ts) | Retirement candidates / preservation | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [transfer.ts](../SubProject/agent-core-memory/src/memory/transfer.ts) | Legacy transfer/import review | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [transfer-v2.ts](../SubProject/agent-core-memory/src/memory/transfer-v2.ts) | Experience transfer V2 | [transfer](../SubProject/agent-core-memory/src/memory/transfer.ts), [store](../SubProject/agent-core-memory/src/memory/store.ts) |
| [page.ts](../SubProject/agent-core-memory/src/memory/page.ts) | Snapshot pagination | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [index.ts](../SubProject/agent-core-memory/src/memory/index.ts) | Rebuild/inspect/semanticContext/nearest | [embedder](../SubProject/agent-core-memory/src/memory/embedder.ts), [passages](../SubProject/agent-core-memory/src/memory/passages.ts) |
| [embedder.ts](../SubProject/agent-core-memory/src/memory/embedder.ts) | Cloudflare optional embeddings/cosine identity | [index](../SubProject/agent-core-memory/src/memory/index.ts) |
| [embedding-repair.ts](../SubProject/agent-core-memory/src/memory/embedding-repair.ts) | Pending/failed embedding repair state | [index](../SubProject/agent-core-memory/src/memory/index.ts) |
| [query-embedding-cache.ts](../SubProject/agent-core-memory/src/memory/query-embedding-cache.ts) | Bounded cached query embeddings | [index](../SubProject/agent-core-memory/src/memory/index.ts) |
| [passages.ts](../SubProject/agent-core-memory/src/memory/passages.ts) | Passage segmentation/index granularity | [index](../SubProject/agent-core-memory/src/memory/index.ts) |
| [semantic-document.ts](../SubProject/agent-core-memory/src/memory/semantic-document.ts) | Text + metadata semantic projection | [index](../SubProject/agent-core-memory/src/memory/index.ts), [retrieval](../SubProject/agent-core-memory/src/memory/retrieval.ts) |
| [bm25.ts](../SubProject/agent-core-memory/src/memory/bm25.ts) | BM25 lexical scoring | [retrieval](../SubProject/agent-core-memory/src/memory/retrieval.ts) |
| [identifier-tokenizer.ts](../SubProject/agent-core-memory/src/memory/identifier-tokenizer.ts) | Code identifier tokenization | [retrieval](../SubProject/agent-core-memory/src/memory/retrieval.ts) |
| [retrieval.ts](../SubProject/agent-core-memory/src/memory/retrieval.ts) | Lexical/BM25/fusion ranking, diversity/links | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [relevance.ts](../SubProject/agent-core-memory/src/memory/relevance.ts) | Relevance acceptance/uncertainty | [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [search-projection.ts](../SubProject/agent-core-memory/src/memory/search-projection.ts) | Bounded ranked result projection | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [evidence-excerpt.ts](../SubProject/agent-core-memory/src/memory/evidence-excerpt.ts) | Bounded context excerpts | [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [retrieval-ledger.ts](../SubProject/agent-core-memory/src/memory/retrieval-ledger.ts) | Exposure/attempt/receipt diagnostics | [service](../SubProject/agent-core-memory/src/memory/service.ts), [controller-session](../SubProject/agent-core-memory/src/memory/controller-session.ts) |
| [feedback.ts](../SubProject/agent-core-memory/src/memory/feedback.ts) | Feedback/lifecycle and salience persistence | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [feedback-target.ts](../SubProject/agent-core-memory/src/memory/feedback-target.ts) | Revision/digest guard for feedback | [feedback](../SubProject/agent-core-memory/src/memory/feedback.ts) |
| [visibility.ts](../SubProject/agent-core-memory/src/memory/visibility.ts) | Visibility/forgotten flags | [feedback](../SubProject/agent-core-memory/src/memory/feedback.ts) |
| [safety.ts](../SubProject/agent-core-memory/src/memory/safety.ts) | Content risk/secret/injection detection | [episodes](../SubProject/agent-core-memory/src/memory/episodes.ts), [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [source-snapshot.ts](../SubProject/agent-core-memory/src/memory/source-snapshot.ts) | Source digest/allowed source capture | [provenance](../SubProject/agent-core-memory/src/memory/provenance.ts) |
| [provenance.ts](../SubProject/agent-core-memory/src/memory/provenance.ts) | Workspace/repo/source identity + staleness | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [repository-identity.ts](../SubProject/agent-core-memory/src/memory/repository-identity.ts) | Git/worktree identity evidence | [provenance](../SubProject/agent-core-memory/src/memory/provenance.ts) |
| [evolution.ts](../SubProject/agent-core-memory/src/memory/evolution.ts) | Bounded metadata/link evolution | [service](../SubProject/agent-core-memory/src/memory/service.ts) |
| [intelligence.ts](../SubProject/agent-core-memory/src/memory/intelligence.ts) | Nearest-memory intelligence/fallback | [evolution](../SubProject/agent-core-memory/src/memory/evolution.ts), [index](../SubProject/agent-core-memory/src/memory/index.ts) |
| [consolidation.ts](../SubProject/agent-core-memory/src/memory/consolidation.ts) | Review-only overlap/duplicate candidates | [service](../SubProject/agent-core-memory/src/memory/service.ts) |

**Total 49 file .ts** pada folder SubProject/src/memory. Generated dist/test suite tidak dihitung. Public exports ada di [SubProject/src/index.ts](../SubProject/agent-core-memory/src/index.ts); entry standalone di [SubProject/src/standalone.ts](../SubProject/agent-core-memory/src/standalone.ts).


## 11. Source map B — host, MCP, dan seam Learning yang relevan

| Source host | Peran dan koneksi ke Memory |
|---|---|
| [src/index.ts](../src/index.ts#L74) | Composition root: embedder → initializeAgentCoreMemory → Learning/MCP runtime |
| [src/memory/host-runtime.ts](../src/memory/host-runtime.ts) | Marker/root ownership; pemilihan engine fail-closed |
| [src/memory/host-activation.ts](../src/memory/host-activation.ts) | Offline fresh/relocate dengan backup identity |
| [src/mcp/server.ts](../src/mcp/server.ts#L348) | Registrasi tool + resolver external/native |
| [src/mcp/memory-scope.ts](../src/mcp/memory-scope.ts) | Credential owner-scoped session/task selector |
| [src/mcp/memory-tools.ts](../src/mcp/memory-tools.ts) | Ordinary CRUD/search/diagnostics/status/export/import |
| [src/mcp/memory-schemas.ts](../src/mcp/memory-schemas.ts) | Schema input kompatibilitas |
| [src/mcp/memory-experience-tools.ts](../src/mcp/memory-experience-tools.ts) | Dua tool V2 → scoped controller/session |
| [src/mcp/controller-learning-tools.ts](../src/mcp/controller-learning-tools.ts) | External episode task binding |
| [src/mcp/controller-learning-schemas.ts](../src/mcp/controller-learning-schemas.ts) | Schema controller_learning |
| [src/mcp/learning-tools.ts](../src/mcp/learning-tools.ts) | Learning checkpoint/review/decision |
| [src/learning/external-controller.ts](../src/learning/external-controller.ts) | Controller task identity, usage receipts, disclosure binding |
| [src/learning/service.ts](../src/learning/service.ts) | Sibling Learning lifecycle + candidate/evidence outcome |
| [src/learning/review.ts](../src/learning/review.ts) | Learning review/promotion eligibility |
| [src/learning/memory-sink.ts](../src/learning/memory-sink.ts) | Memory sink dan host-bound V2 correction policy |
| [src/learning/sink-manager.ts](../src/learning/sink-manager.ts) | Sink routing: memory fact vs code recipe |
| [src/learning/state.ts](../src/learning/state.ts) | Learning checkpoint metadata, bukan canonical notes |
| [src/learning/triggers.ts](../src/learning/triggers.ts) | Meaningful review triggers |
| [src/learning/planned-memory-context.ts](../src/learning/planned-memory-context.ts) | Planned bounded memory retrieval |
| [src/learning/subquestion-retrieval.ts](../src/learning/subquestion-retrieval.ts) | Bounded multi-question retrieval |
| [src/learning/effect-evidence.ts](../src/learning/effect-evidence.ts) | Effect claim vs observed verification |
| [src/learning/decision-review.ts](../src/learning/decision-review.ts) | Strategy/technical prediction/goal evidence |
| [src/learning/salience-review.ts](../src/learning/salience-review.ts) | Advisory evidence relevance/mandatory inspection |
| [src/learning/code-pattern-sink.ts](../src/learning/code-pattern-sink.ts) | Repo recipe sink terpisah dari Memory |

Learning bukan second MemoryStore. Hanya jalur interaksinya dicantumkan; seluruh fitur Learning unrelated tidak dibahas.

## 12. Source map C — 32 source pada src/memory milik host

Peringatan penting: folder ini memuat **legacy fallback**, API/utility kompatibilitas, dan host ownership. Dalam mode Experience V2 sekarang, [host-runtime.ts](../src/memory/host-runtime.ts#L112) memberikan objek engine SubProject ke pemanggil lama lewat kompatibilitas tipe; jangan menyimpulkan seluruh kelas legacy service.ts aktif hanya karena masih ada file.

| Host source | Status/peran dalam arsitektur Memory |
|---|---|
| [host-runtime.ts](../src/memory/host-runtime.ts) | **Aktif:** validasi activation + pilih instance V2 |
| [host-activation.ts](../src/memory/host-activation.ts) | **Explicit offline operation:** hanya bila dipanggil |
| [service.ts](../src/memory/service.ts) | Legacy MemoryService fallback, bukan engine yang dipilih marker sekarang |
| [store.ts](../src/memory/store.ts) | Legacy store implementation/fallback |
| [transaction.ts](../src/memory/transaction.ts) | Legacy file transaction implementation/fallback |
| [lock.ts](../src/memory/lock.ts) | Legacy lock helper dan activation lock seam |
| [paths.ts](../src/memory/paths.ts) | Legacy path conventions |
| [note-format.ts](../src/memory/note-format.ts) | Legacy canonical note encoding |
| [types.ts](../src/memory/types.ts) | Legacy types/compatibility schema |
| [retrieval.ts](../src/memory/retrieval.ts) | Legacy retrieval behavior (bukan V2 rank owner) |
| [index.ts](../src/memory/index.ts) | Legacy derived-index implementation |
| [embedder.ts](../src/memory/embedder.ts) | Embedder interface/implementation di host |
| [bm25.ts](../src/memory/bm25.ts) | Legacy BM25 |
| [semantic-document.ts](../src/memory/semantic-document.ts) | Legacy semantic document projection |
| [intelligence.ts](../src/memory/intelligence.ts) | Legacy memory intelligence helper |
| [evolution.ts](../src/memory/evolution.ts) | Legacy evolution helper |
| [consolidation.ts](../src/memory/consolidation.ts) | Legacy overlap-review helper |
| [relations.ts](../src/memory/relations.ts) | Legacy link helper |
| [provenance.ts](../src/memory/provenance.ts) | Host workspace normalization used by Learning seam |
| [repository-identity.ts](../src/memory/repository-identity.ts) | Legacy repository identity helper |
| [source-snapshot.ts](../src/memory/source-snapshot.ts) | Legacy source snapshot helper |
| [safety.ts](../src/memory/safety.ts) | Legacy safety helper |
| [feedback.ts](../src/memory/feedback.ts) | Legacy feedback helper |
| [feedback-target.ts](../src/memory/feedback-target.ts) | **Dipakai MCP:** memory content digest helper |
| [visibility.ts](../src/memory/visibility.ts) | Legacy visibility helper |
| [retirement.ts](../src/memory/retirement.ts) | Legacy retirement helper |
| [retrieval-ledger.ts](../src/memory/retrieval-ledger.ts) | Legacy retrieval ledger helper |
| [search-projection.ts](../src/memory/search-projection.ts) | **Dipakai MCP:** formatDeliveredMemorySearchResult |
| [revisions.ts](../src/memory/revisions.ts) | Legacy revision helpers |
| [page.ts](../src/memory/page.ts) | Legacy pagination helper |
| [transfer.ts](../src/memory/transfer.ts) | Legacy transfer helper |
| [embedding-repair.ts](../src/memory/embedding-repair.ts) | Legacy embedding repair helper |

**Jangan hapus atau refactor file di tabel C berdasarkan diagram ini.** Label fallback/compatibility menjelaskan routing saat marker V2 aktif, bukan bukti dead-code aman-dihapus. Pengecekan import/caller untuk tindakan deletion merupakan pekerjaan berbeda yang tidak diotorisasi.

## 13. Directory dan source-of-truth map

| Path runtime relatif project root | Apa yang disimpan | Sifat |
|---|---|---|
| runtime/memory/00-agent-core-memory.md | Pinned bootstrap/foundation | Canonical, protected |
| runtime/memory/notes/*.md | Durable note/experience record | Canonical |
| runtime/memory/index/index.json | Lexical/semantic derived index | Rebuildable, bukan authority |
| runtime/memory/state/experience-manifest.json | Root identity / experience activation | Canonical control-plane state |
| runtime/memory/state/revisions/ | Exact revisions/known-time history | Persistent evidence |
| runtime/memory/state/episodes/ | Task episode snapshots | Persistent experience state |
| runtime/memory/state/episode-tasks/ | Task → episode owner mapping | Persistent experience state |
| runtime/memory/state/operations/ | Idempotency and operation receipts | Persistent experience state |
| runtime/memory/state/capsules/ | Checkpoint/task-context capsules | Derived bounded continuity with lineage |
| runtime/memory/state/transactions/ | Journal CAS recovery | Writer durability state |
| runtime/memory/state/retrieval-ledger.jsonl | Retrieval attempts/exposures | Operational evidence |
| runtime/memory/state/retrieval-use-receipts.jsonl | Declared usage receipts | Usage evidence, not causal proof |
| runtime/memory/state/feedback.json | Feedback/visibility lifecycle | Persistent auxiliary state |
| runtime/memory/state/embedding-repair.json | Embedding repair state | Derived health state |
| runtime/memory/archive/objects/ | Content addressed archive | Evidence/history preservation |
| runtime/memory/archive/manifests/ | Archive lineage/manifest | Evidence/history preservation |
| runtime/memory-v2-activation.json | Validated engine selection | Host activation marker |
| runtime/memory-v2/ | Historical input if present | **Not live canonical root** |

Root path resolving ada pada [SubProject paths.ts](../SubProject/agent-core-memory/src/memory/paths.ts#L21). Keberadaan seluruh file di satu waktu tidak mengharuskan setiap event/receipt selalu ada; tabel menggambarkan area yang dimiliki oleh engine.

## 14. Batas kebenaran, risiko, dan status bukti

- **Dibuktikan langsung:** marker activation valid secara bentuk dan sesuai jalur host source; MemoryService V2 merupakan import runtime; MCP dual interface tersedia di source; live memory_status tersedia.
- **Dibuktikan dengan kode, bukan benchmark:** scope guard, CAS/journal, bounded recall, read/write/episode/promotion flow, validAt/knownAt, dan Learning correction evidence boundary.
- **Belum diuji dalam task ini:** full restart/failure recovery, konflik writer nyata, akurasi retrieval, causal memory benefit, dan seluruh peran Native AI dalam setiap task. Tidak ada tes baru dijalankan karena task ini hanya pemetaan.
- **Potensi kebingungan #1:** V2 ENGINE aktif tidak menjadikan setiap ordinary note V2 EXPERIENCE; record type dan entry path tetap berbeda.
- **Potensi kebingungan #2:** Memory available/issueCount=0 tidak berarti semua memori relevan/benar/terpakai; source freshness dan verified outcome masih harus diperiksa.
- **Potensi kebingungan #3:** source graph request-scoped tetap advisory. Exact source aktif mengalahkan index/diagram bila kemudian ada perubahan.
- **Potensi kebingungan #4:** perubahan konsolidasi melalui Learning host bukan persetujuan otomatis dari controller; external task scope dan exact evidence digating secara terpisah.
- **Potensi kebingungan #5:** menghapus index turunan tidak sama dengan menghapus canonical note, tetapi repair/migrasi tetap memerlukan prosedur resmi dan authorization.
- **Kesesuaian arah:** tidak ada dependency baru, engine kedua, daemon, atau execution gate yang disarankan maupun ditambahkan.

## 15. Cara mengikuti relasi saat debugging

1. Kasus tidak bisa bootstrap → [host-runtime.ts](../src/memory/host-runtime.ts) → [activation marker](../runtime/memory-v2-activation.json) → [store.ts](../SubProject/agent-core-memory/src/memory/store.ts).
2. Kasus search tidak relevan → [memory-tools.ts](../src/mcp/memory-tools.ts#L152) → [service.search](../SubProject/agent-core-memory/src/memory/service.ts#L1296) → [retrieval.ts](../SubProject/agent-core-memory/src/memory/retrieval.ts) → [index.ts](../SubProject/agent-core-memory/src/memory/index.ts).
3. Kasus task context hilang → [memory-experience-tools.ts](../src/mcp/memory-experience-tools.ts) → [scope resolver](../src/mcp/server.ts#L357) → [controller-session.ts](../SubProject/agent-core-memory/src/memory/controller-session.ts#L325) → [episodes.ts](../SubProject/agent-core-memory/src/memory/episodes.ts#L839).
4. Kasus snapshot gagal/rollback → [service.batch](../SubProject/agent-core-memory/src/memory/service.ts#L1124) → [store.ts](../SubProject/agent-core-memory/src/memory/store.ts#L286) → [transaction.ts](../SubProject/agent-core-memory/src/memory/transaction.ts#L100) → [lock.ts](../SubProject/agent-core-memory/src/memory/lock.ts).
5. Kasus pengetahuan tidak dipromosikan → [learning/review.ts](../src/learning/review.ts) → [learning/memory-sink.ts](../src/learning/memory-sink.ts) → [promotion.ts](../SubProject/agent-core-memory/src/memory/promotion.ts).
6. Kasus memory masih muncul padahal stale/forgotten → [source-snapshot.ts](../SubProject/agent-core-memory/src/memory/source-snapshot.ts) → [provenance.ts](../SubProject/agent-core-memory/src/memory/provenance.ts) → [feedback.ts](../SubProject/agent-core-memory/src/memory/feedback.ts) → [service.search](../SubProject/agent-core-memory/src/memory/service.ts#L1296).

**Diagram terpisah:** [Memory overview](diagrams/Agent-Core-Memory-V2-Overview-20261016.mmd), [Retrieval](diagrams/Agent-Core-Memory-V2-Retrieval-20261016.mmd), dan [Capture/Promotion](diagrams/Agent-Core-Memory-V2-Capture-20261016.mmd). Semua diagram adalah proyeksi dari source yang dicantumkan, bukan executable workflows.

---
**Batas pengerjaan:** dokumentasi read-only terhadap runtime dan Memory data; hanya file laporan/diagram yang baru ditulis. Tidak ada perubahan source engine, canonical notes, atau activation marker.

