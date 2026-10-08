# Episode dan staging: bukti verifikasi T3

Tanggal: **7 Oktober 2026 UTC**. Baseline T2: `27d8e4037dc0dde41557d81fd6ed11e34f7de91e`, branch `feat/memory-evolution`. Semua fixture synthetic, filesystem lokal Linux, tanpa embedder atau API key. Implementasi selesai; review parent dan persetujuan G3 masih diperlukan sebelum push fase.

## Hasil yang dibuktikan

Controller B dapat menemukan task milik controller A setelah restart, membuka exact episode revision secara paged, melihat goal/blocker/next action yang belum selesai, dan melanjutkan dengan CAS. Transcript controller lama tidak diperlukan. Episode tetap provisional; default canonical recall tidak mencari staging.

Fresh `npm run verify`: build exit 0, **206/206 tests**, 11 files. Targeted T3: **86/86**, terdiri dari 60 episode tests dan 26 concurrency/recovery tests; tidak ada failed, skipped, atau pending pada kedua final complete runs. Dataset nama targeted tests, diurutkan dan di-hash sebagai JSON UTF-8: `sha256:79393fb3483489bf6da743fef09307df74075b4481fc391eacd929fb40bb029b`.

```sh
npm run verify
npm test -- tests/memory-episodes.test.ts tests/memory-episode-concurrency.test.ts
```

Node 24.19.0, npm 11.9.0, Debian 13.6 Linux x86_64. Dependency/lockfile tidak berubah. Package dry-run: 269 files, 313148 compressed bytes pada pemeriksaan, tanpa runtime, fixture, test helper, JSONL, atau report privat. Tidak ada publish.

## Kontrak yang tersedia

- `captureEvidence`: operation ID + workspace-relative file atau explicit controller text, optional observed time; mengembalikan exact artifact ref, availability, optional bytes/reason, dan duplicate flag.
- `startEpisode`: start key, goal, source refs; UUID episode dibuat engine dan replay mengembalikan header pertama yang sama.
- `appendEvent`: episode ID, expected numeric revision, operation ID, kind/summary/time/refs/state changes; event ID, sequence, recorded time, dan origin diikat engine/host.
- `setEpisodeStatus`: status/reason/refs dengan CAS; completed menolak blocker atau obligation aktif.
- `getTaskContext`: episode ref dan optional full header. Tidak ada capsule; freshness masih `unknown`, needsCheckpoint true, warning `capsule-not-enabled`, dan status partial.
- `expand`: exact episode/event view atau artifact evidence view, dengan cursor dan final-envelope byte budget yang sama dengan T1. Canonical retained-record expansion dari T2 tetap tersedia.

Capabilities pada root aktif menyatakan `experience-v2` dan views map/abstract/record/episode/evidence. Root legacy tetap `legacy-read`; semua episode writes dan task-context discovery tetap gated. Checkpoint/capsule, promotion/consolidation, retention, temporal query, dan transfer/2 belum diaktifkan.

Controller scope berasal host; input model tidak menerima workspace/task/controller/session atau role override. Role pada T3 adalah controller, termasuk explicit text yang diklaim controller sebagai hasil tool. Label atau source role tidak membuat izin tindakan.

## Persistence, lineage, dan replay

`MemoryEpisodes` memakai store lock, `transact`, coordinator journal, dan archive T2. Tidak ada database, parallel journal, scheduler, atau model adapter.

- `state/episodes/<UUID>/manifest.json` menunjuk checksum-bound exact snapshot
- `state/episodes/<UUID>/events/<sequence>-<UUID>.json` menyimpan accepted events immutable
- Archive menyimpan immutable event manifests dan episode snapshots dengan working state plus seluruh event refs
- `state/operations/<tuple-digest>.json` menyimpan immutable business payload/result binding
- `state/episode-tasks/<tuple-digest>.json` adalah mutable host-owned current-episode pointer, CASed bersama start/event/manifest/receipt

Task pointer membuktikan absence ketika dua start keys bersaing. Satu task hanya memiliki satu episode open/paused. Setelah completed/abandoned, start baru yang eksplisit boleh dibuat; immutable snapshot baru membawa predecessorRef, dan unresolved state lama tetap dapat dibuka. Abandonment tidak menyelesaikan obligation atau membuat success claim.

Namespace operation adalah durable root ID + normalized workspace + task + method + operation/start key. Controller/session hanya origin metadata, bukan namespace atau business payload. Expected revision adalah CAS precondition, bukan bagian business payload: replay yang sah diperiksa sebelum CAS, termasuk setelah lost response dan dari controller baru. Payload berbeda dengan key yang sama menolak `MEMORY_OPERATION_CONFLICT`.

Reducer mempertahankan goal, critical flags dan source lineage. Upsert tidak dapat diam-diam resolve, menurunkan critical, mengganti kind, atau menghilangkan old refs. Mengubah critical text/decision memerlukan correction event; original decision tetap ada. Resolution memerlukan reason dan real scoped source refs. Batas 64 source refs berlaku per input; accumulated stored lineage tidak dipotong ketika resolution menambah ref ke item yang sudah mempunyai 64.

Sesuai ruling desain, goal aktif berarti declared purpose yang dipertahankan dalam episode. Completed header adalah status lifecycle authoritative; completed tidak diam-diam menulis ulang goal item dan tidak berarti task masih berjalan. T3 tidak menyediakan protokol carry-forward obligation ke task lain; selesaikan blocker/obligation secara eksplisit sebelum completed.

## Source validation dan evidence

Input refs harus benar-benar resolve, memiliki exact revision dan scope yang sesuai. Canonical memory refs memerlukan current visibility serta current/historical workspace yang sesuai. Captured source dependencies, canonical semantic revisions, activation dan exact visibility bytes dicek kembali saat commit. Source expiry juga diperiksa pada current commit visibility.

Store snapshot dan transaction menyediakan validated activation yang berasal dari pembacaan T2 yang sama. Tidak ada second-read root identity untuk membuat namespace. Read-only `feedback.json` dalam declared read set tidak boleh ditulis planner; benign feedback drift dapat menimbulkan retryable revision conflict. Canonical historical manifest names yang memuat maksimum 128-character IDs mempunyai shared validated key builder dan read-only extension; write allowlist sebelumnya tetap utuh.

File capture hanya memakai projectRoot untuk canonical agent-core atau satu actual canonical root yang sudah didaftarkan host. Actual Linux path casing dipertahankan di samping logical alias normalizer. Dua actual paths yang menormalisasi ke key sama, atau nama workspace dengan dua roots, tetap ambigu dan unavailable. Logical names yang belum terdaftar menghasilkan `workspace-identity-unverified`; tidak ditebak menjadi directory.

Capture memakai existing path policy, evidence marker, bounded snapshot reader, no-alias ancestor/file checks, UTF-8 dan file-identity checks. Maksimum satu dokumen 2 MiB; explicit input di atas 32 MiB ditolak. Oversize tidak disimpan sebagian. Metadata-only policy menghasilkan reference-only; excluded/missing/symlink/unsupported/secret/private-reasoning/injection-shaped input menghasilkan safe unavailable manifest tanpa raw bytes atau unsafe metadata.

Allowed UTF-8 bytes disimpan immutable menurut byte digest, termasuk BOM, CRLF, Unicode dan combining characters; file edit/removal setelah capture tidak mengubah original archived evidence. Malformed controller UTF-16 dan NUL text ditolak, bukan diganti bytes lalu disebut exact. Final host-only read-only `validateSources` hook mengecek frozen file identity/digest, current host root selection, dan policy di bawah commit lock sebelum journal preparation. Tidak melakukan nested store call atau write.

Controller-supplied verified working-state labels ditolak sampai actual host verifier integration tersedia. Supported adalah explicit evidence-bound assertion; evidence harus resolvable/available. Parser, receipt, success event, dan byte digest tidak membuktikan semantic support, independent verification, atau authority.

Untuk authorized valid artifact manifest dengan body hilang/corrupt, expansion menghasilkan partial, empty text, availability unavailable, dan explicit `evidence-body-unavailable` warning. Invalid/missing/cross-scope manifest tetap coded error. Supported source validation tidak menerima damaged bytes. Replay capture receipt menyatakan historical accepted result, bukan janji current availability.

## Budget dan view serialization

Budget berlaku pada seluruh final JSON UTF-8, termasuk metrics, warnings, source refs, cursor dan field names. Token count tetap estimasi Unicode-codepoints/4.

Episode text adalah stable JSON `{header, predecessorRef?, workingState, eventRefs, events}`. Event text adalah exact event JSON. Complete lineage ada dalam paged text; envelope sourceRefs berisi satu exact episode/event ref sebagai entrypoint ke checksum-bound source group. Tidak menyalin seluruh growing event-ref list pada setiap page atau memotongnya diam-diam. Evidence text adalah original archived source text.

Maximum host identities tidak disalin ke handle-only task context. Minimum 512-byte context tetap membawa episodeRef, freshness dan needsCheckpoint. Full header tidak dijanjikan muat pada 512 bytes. Paged expansion dapat meminta budget lebih besar jika envelope/cursor minimum tidak muat; insufficient-budget tetap bounded dan menyatakan required bytes. Large-episode test merekonstruksi seluruh 25 events dan refs melalui bounded pages.

## RED, process faults, dan batas hasil

Initial RED: 18 missing-feature failures. Subsequent REDs membuktikan source scope/file/policy races, abandoned predecessor yang hilang, second-read activation generation drift, unsafe metadata dan malformed encoding, unavailable-body response distinction, maximum-ID archived refs, expiry antara preparation/commit, serta accumulated 64+1 lineage.

Test-only seams mengubah real synthetic files pada boundary yang relevan. Real child processes dibunuh saat preparing, prepared, mid-apply, committed, dan lost response; checks memeriksa seluruh committed/rolled-back side, immutable original episode ref, stable replay, event/manifest/receipt counts, serta journal cleanup. Dua proses terpisah menguji CAS dan controller-neutral replay. Live applying writer mengecualikan task reads sampai recovery. Old pending journal/1 masih dipertahankan dan memblokir dengan unsupported-version diagnostic.

Tidak ada jaminan atomic filesystem transaction dengan writer luar yang mengabaikan lock. Final source check adalah point-in-time validation; tidak melindungi semua perubahan setelah check, semua power-loss/storage, network filesystem, old-binary co-writers, atau Windows. Strict schemas dan heuristic safety scanner bukan sandbox/authentication atau semantic verifier. Full reconstruction/read validation menambah I/O dan immutable snapshots/receipts menambah storage; tidak ada latency/scaling benchmark atau purge pada T3.

T4–T9 belum selesai. G3 functional continuation proof tersedia dalam synthetic tests; review fase tetap diperlukan.


## T3 review round 1, 7 Oktober 2026

Dua P1 pada commit `5c110a90a099e9d1d52a471ab69055c5103c60a9` direproduksi dengan marker dan bytes synthetic sebelum fix. Tidak ada real credential atau data pengguna pada proofs. Re-review parent masih diperlukan.

1. Capture menyeleksi origin metadata tetapi tidak menyeleksi seluruh observedAt metadata. Unknown text dan day/month/year timezone dapat membawa secret-shaped marker yang tersimpan immutable. Capture sekarang menyeleksi original raw string values sebelum JSON escaping, menolak malformed text metadata, dan memvalidasi supplied capture timezone dengan Intl. Unsafe observed/origin metadata menghasilkan safe unavailable manifest tanpa echo metadata atau body. Unsafe durable operation IDs ditolak sebelum publication. Shared TimeValue reader tetap kompatibel; tidak ada klasifikasi/migrasi record lama.
2. Archive reader semula decode UTF-8 sebelum hashing. Mengganti literal valid U+FFFD bytes EF BF BD dengan invalid FF menghasilkan decoded string yang sama sehingga checksum/size terkesan cocok. Shared archive owner kini hash actual raw Buffer, memeriksa actual artifact byte length, lalu fatal UTF-8 decode. Object, retained canonical, generic/typed manifest dan audit-ref readers menggunakan boundary yang sama. Raw file fingerprints juga mencegah substitution sesudah preflight lolos transaction CAS. Valid UTF-8 fingerprints dan semantic digests tetap identik; BOM, CRLF dan NUL tidak dinormalisasi atau dipotong. Invalid body tetap empty partial unavailable; invalid manifest tetap coded error, dan supported source tidak menerima corrupt bytes.

Parent menyetujui scanner-boundary repair yang sama pada new T3 start/event/working-item/status fields. Schema-validated original values dipindai sebelum serialization, termasuk operation/start keys, summaries, observations dan verification metadata. Quoted credential strings tidak tersembunyi oleh JSON escaping; safe quoted text tetap utuh. Ini bukan redesign legacy safety/T7 dan scanner tetap heuristic, tidak exhaustive.

RED mencakup enam unsafe capture cases plus safe controls, malformed observed text, quoted raw-string bypass, tujuh raw-byte reader/CAS/availability cases, serta tujuh T3 event/key cases plus safe control. Fresh full verify build0,206/206; targeted86/86 tanpa failed/pending/skipped. Final package dry-run269files,313148compressedbytes, tanpa runtime/test/helper/private artifacts. Tidak ada dependency/lock change atau push.
