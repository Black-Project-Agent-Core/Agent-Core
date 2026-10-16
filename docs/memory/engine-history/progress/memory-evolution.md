> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../../CONSOLIDATION.md).

# Progress evolusi Agent Core Memory

Updated: **2026-10-07 23:19 UTC**.

**Pelaksanaan T0–T9 dan final integration review selesai.** Build + 503/503 tests; fresh package consumer dan 14 cross-phase package cases lulus. Batas: Linux synthetic/protocol replay/isolated restore teruji; Windows native dan live autonomous controllers belum dijalankan. Branch belum di-merge atau dirilis.

Pengguna menyetujui pelaksanaan keseluruhan [rencana evolusi](../plans/2026-10-07-agent-core-memory-evolution.md) pada **2026-10-07 13:05:47 UTC**, termasuk pemasangan tool/dependency yang diperlukan dan pengujian di cloud Linux. Status REVIEW ONLY pada dokumen desain adalah provenance tahap review, bukan status pelaksanaan saat ini.

Checkout pelaksanaan: branch `feat/memory-evolution`, baseline commit `09eb7e1eabb8c77963074b1e879c2d3b5006634c`. Tidak ada mutasi monolith Agent Core, release, atau deploy dalam T0.

| Tahap | Status | Bukti / pekerjaan berikutnya |
|---|---|---|
| T0 — Baseline Linux reproducible | Selesai, G0 lolos | Lockfile direview, 14 tests asli + 5 characterization tests; build/test/verify exit 0 |
| T1 — Progressive disclosure | Selesai, G1 lolos | DTO compact-first v1, exact selected paging; build + 59/59 tests lolos |
| T2 — Preservation/schema/transaksi | Selesai, G2 lolos | Build + 120/120 tests; targeted 61/61, process faults dan synthetic copy-upgrade |
| T3 — Episode dan staging | Selesai, G3 lolos | Build + 206/206 tests; targeted 86/86, task continuation dan real process recovery |
| T4 — Capsule dan freshness | Selesai, G4 lolos | Build + 252/252 tests; targeted 46/46, exact preservation, source/compute races dan historical capsule access |
| T5 — Consolidation dan promotion | Selesai, G5 lolos | Build + 349/349 tests; targeted 97/97; independent review dan 23 round-3 cases lolos |
| T6 — Temporal/epistemic query | Selesai, G6 lolos | Build + 420/420 tests; targeted 71/71; strict v2 timezone correction reviewed |
| T7 — Retention/safety/receipt | Selesai, G7 lolos | Build + 438/438 tests; targeted 18/18; retention, rotation, nested disclosure dan receipts reviewed |
| T8 — Lifecycle evaluation | Selesai, G8 lolos | 455/455 full tests; 13/13 isolated evals; fixed performance gates dan evidence review lolos |
| T9 — Continuation/transfer/portability | Selesai, G9 lolos | Build 489/489; targeted 34/34; protocol replay, isolated transfer/2 dan clean consumer PASS; live/Windows NOT RUN |

## T0, 7 Oktober 2026

- Node 24.19.0, npm 11.9.0, Debian 13.6 Linux x86_64.
- Dependency resolution memakai registry npm resmi dan tidak mengubah ranges. Cache awal tidak tersedia; retry dengan cache writable berhasil. `npm ci --ignore-scripts` berhasil tanpa mengaktifkan install scripts.
- Original source build dan 14/14 tests asli lolos. Lima characterization tests tambahan mencatat full-record serialization, current-time `asOf` filtering, dan restart writer/reader sebagai dua proses terpisah pada temporary root.
- Dua kesalahan fixture pada run characterization awal telah dikoreksi tanpa perubahan produk. Tidak ada intentional failing test tersisa.
- Final `npm run build`: exit 0.
- Final `npm test`: exit 0, 4 files, 19/19 tests, tidak ada skipped/pending.
- Final `npm run verify`: exit 0, build dan 19/19 tests.
- Package dry-run boundary check lolos; raw logs/runtime/store synthetic tidak dimasukkan ke repository.
- `dist/` dihasilkan build dan runtime tracker activity files dihasilkan suite; keduanya Git-ignored. Package tidak memasukkan runtime tracker, dan tidak ada cleanup file pengguna.
- Tidak ada production code atau API change dalam T0. Gap legacy tetap terbuka dan terukur, bukan dianggap sudah selesai.

Perintah reproduksi, exact dependency versions, test names, artifact hashes, dan batas hasil tersedia pada [baseline Linux](../verification/memory-baseline.md).

## T1, 7 Oktober 2026

- Facade additive `MemoryService.controller(scope)` menyediakan capabilities, recall compact-first, dan selected record expansion. API legacy tetap tersedia dan characterization full-record serialization tetap lolos.
- Scope host dikunci per root/workspace/task. Hanya foundation canonical pinned lintas workspace; pin arbitrary tidak mendapat pengecualian. Handoff controller/session pada task sama dapat melanjutkan cursor.
- Budget 512–65536 bytes dihitung pada seluruh JSON UTF-8 final, termasuk metrics, warnings, dan cursor. Overflow eksplisit; ID/title mandatory tidak dipotong diam-diam. Estimasi token dilabeli sebagai estimasi code-point/4.
- Cursor terikat query/view/filter, scope, revision aktual, posisi, dan reference clock ranking. Full-suite menemukan instability recency clock; regression RED membuktikannya sebelum fix dan GREEN.
- Record dibaca tanpa access mutation; ledger terpisah mencatat view/digest/bytes payload yang benar-benar dikirim. Digest tidak mengubah unknown/unverified menjadi fakta atau authority.
- Final build/test/verify exit 0: 59/59 tests, enam files; targeted disclosure/scope 40/40. Dependency dan lockfile tidak berubah.
- Payload sample memakai lima synthetic records dan sepuluh trials: median legacy 168290 bytes; facade discovery 4814 bytes; discovery + satu selected body 23859 bytes dalam empat calls. Median end-to-end 36.91 ms versus legacy 36.24 ms; tidak menghilangkan biaya expansion dari report.
- V1 latest-only tetap dinyatakan; archive coverage partial/unavailable, episode/v2 writes menolak `MEMORY_EXPERIENCE_NOT_ENABLED`, dan facade asOf menolak `MEMORY_TEMPORAL_UNSUPPORTED`. Tidak ada klaim capsule, historical truth query, Windows, atau live controller.

### T1 review round 1

Dua temuan review dibuktikan RED sebelum diperbaiki: suffix halaman expansion terakhir bukan full-record exposure, dan feedback state yang hilang tidak boleh membuka kembali record forgotten. Exposure full sekarang mensyaratkan offset nol + response lengkap. Strict visibility read menolak missing/corrupt/unreadable state, termasuk restart; fresh complete foundation-only root membuat empty visibility di bawah lock dengan canonical recheck. Existing-note root tidak direset otomatis. Legacy store yang belum pernah menulis visibility tidak bisa dibedakan dari kehilangan state dan perlu deliberate host restoration/repair sebelum facade dapat dipakai; legacy API mempertahankan fallback sebelumnya. Cursor checksum adalah integrity hint yang dapat dihitung ulang, bukan authenticated/tamper-proof token. Final targeted 40/40 dan full 59/59, build/verify exit 0; tujuh expected RED failures pada run review sebelum fix.

Kontrak, perintah reproduksi, hasil RED/GREEN, batas v1, dan payload measurement tersedia pada [progressive disclosure](../verification/memory-disclosure.md).

## Langkah berikutnya

Review **T5/G5**, lalu lanjut T6 setelah persetujuan fase. Preview/review/CAS promotion tersedia; temporal dan retention transitions tetap menunggu tahap pemiliknya.

## Catatan verifikasi gate

T0 direview lulus pada commit `01e0b5281954d285a9fbc185fa25be31eb61aa05` dan sudah dipush ke branch pelaksanaan. T1 direview ulang pada commit `adf77de2c86729a31c17cd5b3714cf5efec493fc`; kedua temuan diperbaiki, tidak ada blocker baru. Gate G1 disetujui setelah review pada 7 Oktober 2026 14:06 UTC. Setiap fase berikutnya dipush setelah tes dan review selesai sesuai permintaan pengguna.

## T4, 7 Oktober 2026

- Deterministic checkpoint menjaga mandatory operational state verbatim; supporting omission eksplisit dan seluruh original episode/evidence tetap expandable. Mandatory overflow tidak mempublikasikan capsule atau receipt; >65536 state tetap bisa ditemukan melalui 512-byte handle.
- Snapshot–compute–CAS memakai reducer/store/archive/transact T3/T2. Identical checkpoint replay lintas controller/session/restart; different pointers CASed pada full live bytes. Tidak ada event/revision palsu akibat checkpoint.
- Semantic metadata change, event baru, source visibility, activation dan live-origin drift terdeteksi; access statistics tidak men-stale capsule. Historical lineage tetap lengkap, termasuk 65 refs, old+fresh memory correction dan recaptured-file correction.
- New file capture menyimpan optional non-sensitive root digest dan existing bounded file identity; old captures tetap readable dan unknown tanpa backfill. Live origin identity/bytes dan archived byte integrity dibedakan; ambiguous/missing origin tidak disebut current.
- Terminal header tetap authoritative meskipun declared goal dipertahankan. Controller-supplied verified gate tidak berubah. Tidak ada model adapter/API key, consolidation, temporal query atau fitur T5–T9 dini.
- Final full verify build0, 245/245 di 13 files; targeted 39/39 tanpa failed/pending/skipped. Real process faults pada lima checkpoint boundaries, actual held-renderer decision race, dua-process replay, source/corruption/overflow regressions lolos.
- E17 fixture sepuluh trials: full-history plus evidence 37308 bytes/7 calls, capsule plus evidence 3095 bytes/2 calls. Median 110.43 ms versus 37.17 ms. Satu evidence read termasuk di kedua jalur; checkpoint setup 1836 response bytes/1 write call terpisah. Tidak ada general reduction/hidden-context claim.
- Dependency/lockfile tidak berubah; package 274 files tanpa runtime/test/helper/private artifacts. No push/release/deploy. Review parent/G4 masih pending.

Kontrak, bounded rulings, RED/GREEN, costs dan limitations: [capsule dan freshness](../verification/memory-capsules.md).

### T4 review round 1

Satu P1 pada exact historical capsule expansion dibuktikan: derivative masih terbaca sesudah canonical dependency forgotten atau berpindah workspace, walaupun current context sudah membatasi akses. Sebelum serialization, jalur capsule sekarang memakai existing complete-lineage traversal dan source validation untuk current visibility serta historical/current scope. Tidak ada requirement bahwa historical semantic revision atau live-origin bytes tetap current; authorized stale history tetap terbaca verbatim.

Tujuh regression cases mencakup forgotten/moved dependency, missing/corrupt visibility, nested event source group, changed authorized metadata/live-file origin, dan source yang kembali ke original workspace. RED sebelumnya mempunyai tiga expected failures; missing/corrupt visibility dan authorized-history controls sudah dilindungi helper lama. Fresh targeted 46/46 dan full build/verify 252/252 di 13 files, tanpa failed/pending/skipped. Immutable capsule tetap tersimpan; tidak ada broad T3 history rewrite. Existing episode/event disclosure boundary dicatat terpisah untuk T7. Re-review parent dan keputusan G4 masih pending; tidak ada push oleh implementer.


## T2, 7 Oktober 2026

- Union canonical v1/v2 dengan strict experience schema; v1 semantic digest dan legacy mode dipertahankan. Aktivasi root baru memakai argumen keempat atau opsi standalone; manifest melindungi restart meski opsi tidak dikirim ulang.
- Semua canonical writes memakai transaction owner yang sama. Snapshot sebelum/sesudah perubahan semantik, termasuk metadata-only, tetap reachable setelah lebih dari delapan revisi. Audit-only non-retrieved events mempunyai immutable lineage terpisah; access-only reads tidak menambah unbounded snapshots.
- `transact` memakai declared logical state keys, immutable checks, snapshot-byte CAS, synchronous planner, satu common lock, dan validated recovery. Startup tidak merecover journal writer aktif. Corrupt/unsupported journals dipertahankan sebagai blocker; journal v1 tidak di-upgrade otomatis.
- Delete/batch-delete v2 dan transfer/1 downgrade ditolak eksplisit. Read facade dapat membuka exact retained memory revision sambil memeriksa current visibility serta historical/current scope; archive search dan experience write methods tetap gated.
- Pure legacy transformer tidak melakukan I/O. Copy-upgrade hanya harness synthetic yang menggunakan primitive production; root sumber tetap utuh, target incomplete tidak aktif, counts/checksums/refs diverifikasi sebelum completed marker. History yang sudah dipangkas tidak direkonstruksi.
- Fresh build/verify exit 0, 120/120 tests; tiga files targeted 61/61 tanpa skipped/pending. Fault injection memakai real child processes pada preparing/prepared/apply/committed/response, plus post-commit cleanup failure, same-process/two-process contention, dan startup lock exclusion.
- Package dry-run 264 files, tanpa runtime/test fixtures. Tidak ada dependency/lock change, user data, credential, monolith edit, release, deployment, atau push oleh implementer. Windows belum diuji.
- G2 lolos review dan re-review pada commit `c030d35aaaef6f826f7335e2b63630e64eb6e830` (7 Oktober 2026 14:52 UTC); kedua temuan P2 selesai, tanpa blocker baru. Detail kontrak, RED/GREEN, bukti, bounded rulings, dan compatibility costs: [preservation](../verification/memory-preservation.md).


### T2 review round 1

Dua temuan pada `d2fd638` direproduksi RED: link rusak milik record lain memblokir legacy single-create/mutate, dan fingerprint manifest diambil setelah keputusan aktivasi sehingga bisa menerima state yang sudah berubah. Delapan expected failures + dua safeguard controls dicatat sebelum fix. Legacy single writes sekarang memvalidasi link record yang disentuh/baru saja; batch dan v2 tetap memvalidasi seluruh graph. Parsed activation dan fingerprint kini berasal dari bytes yang sama, termasuk original absence. Empat kondisi drift (incomplete, missing, generation berubah, dan manifest baru muncul) menolak write tanpa perubahan canonical/archive. Fresh full verify 120/120 dan targeted 61/61, build exit 0; re-review tetap pending. Scope fix hanya store owner, regression tests, dan dokumentasi.


## T3, 7 Oktober 2026

- Task-owned UUID episodes, immutable event reducer, explicit status/CAS dan durable operation replay tersedia lintas-controller/session/restart. Default canonical recall tidak memasukkan staging.
- Allowed file/text bytes tersimpan immutable; strict host scope/current visibility/historical provenance dan evidence policy/identity checks tidak menjadi semantic verification. Controller-supplied verified ditolak; supported membutuhkan available refs dan tetap explicit assertion.
- Task pointer CAS mencegah dua unfinished episodes dari start keys berbeda. Completed/abandoned bisa diikuti explicit new start dengan predecessorRef; unresolved lama tetap retained. Completed header authoritative, goal purpose tetap tersimpan; active blocker/obligation harus resolve eksplisit.
- Minimal context mempertahankan episodeRef pada 512 bytes bahkan dengan maximum host identities. Complete lineage/state/events dibuka melalui budgeted paging; tidak ada capsule. Missing/corrupt archived body dari authorized valid artifact manifest memberi unavailable/empty/partial, tanpa reconstruction palsu.
- Reuse store/transaction/archive T2 dengan narrow host-only bounded read-only source validation sebelum journal prep, read-only visibility dependency dan shared maximum-ID canonical manifest key. Source, policy, activation, visibility, scope, expiry dan symlink races diuji.
- Fresh full verify build0, 180/180 across 11 files; targeted 60/60 (36 episode, 24 concurrency/recovery), tidak ada failed/pending/skipped. Real child kill di preparing/prepared/apply/committed/lost-response dan dua-process CAS/replay tetap green. Old journal/1 preserved blocker tidak berubah.
- Package dry-run 269 files, tanpa runtime/fixture/private artifacts. Tidak ada dependency/lock change, user data, external-service write, push/release/deploy atau Windows claim. G3 lolos review ulang pada 7 Oktober 2026 16:00 UTC.
- Detail kontrak, bounded rulings, RED/GREEN, process proof dan compatibility costs: [episode/staging verification](../verification/memory-episodes.md).


### T3 review round 1

Dua P1 pada `5c110a9` dibuktikan RED: unchecked observedAt metadata bisa menyimpan synthetic secret-shaped marker, dan invalid UTF-8 byte substitution dapat lolos decoded-string checksum sebagai exact available evidence. Capture sekarang memeriksa raw origin/observed metadata dan safe timezone, menghilangkan unsafe metadata dari unavailable manifest; new T3 event/working-item/status/start inputs menggunakan raw-string scanner sebelum JSON escaping. Shared archive reads dan file fingerprints memeriksa raw Buffer SHA/byte length sebelum fatal UTF-8 decode, tanpa mengubah valid fingerprints/semantic digests atau BOM/CRLF/NUL. Damaged artifacts tidak mendukung klaim supported dan post-preflight raw drift memblokir publication. Fresh full verify build0,206/206; targeted86/86 (60episode,26concurrency),0failed/pending/skipped. Package269files tetap bersih, tanpa dependency/lock changes. Fix `618ad02ca2f3398b5a53b45fb7897795e13904c0` direview ulang: kedua P1 selesai, spec/quality lulus. T3 siap dipush sebagai fase lengkap.

Catatan nonblocking untuk T7/final review: malformed UTF-8 pada helper internal `readMemoryAuditRefs` dapat menghasilkan TypeError native alih-alih error code archive. Belum ada caller produksi; jalur controller T3 tetap memakai coded error. Ini bukan klaim seluruh pengujian platform atau safety sudah lengkap.


### T4 gate G4, 7 Oktober 2026 17:27 UTC

Re-review independen atas fix `4ab3a5efdb1a343194ff5d1b950ad89e00244844` lulus: complete nested lineage, current visibility, serta current/historical workspace scope diperiksa sebelum exact capsule serialization. Authorized stale history tetap terbaca. Tujuh regression cases lulus pada rerun reviewer; fresh targeted 46/46 dan full build + 252/252 tests (13 files) telah diverifikasi. T4 selesai; T0–T4 merupakan 5 dari 10 fase. T5 berikutnya adalah consolidation/promotion dengan preview dan atomic CAS. Boundary exact episode/event history yang berasal dari T3 tetap dijadwalkan untuk T7; ini bukan klaim seluruh safety/portability sudah selesai.


## T5, 7 Oktober 2026

- Strict proposal parsing menghasilkan persisted preview/digest dan engine-built source/read set. Canonical belum berubah sampai apply; malformed/unknown/unsafe/unsupported refs tidak mempunyai append-all fallback.
- Additive host policy menyediakan exact-digest review di luar writer lock. Nontrivial semantic create/amend/merge memerlukan review; source resolution dan assertion mapping bukan semantic proof. Exact duplicate/provenance-only convergence memerlukan explicit host policy serta identitas applicability/epistemic/validity.
- Canonical before/after, immutable lineage audit, durable receipt, preview status, dan episode promotion event/current state dipublikasikan dalam transaksi T2 yang sama. Episode lifecycle dan unresolved obligations dipertahankan; tidak ada staging clear atau otomatis mengklaim completed/success.
- Replay lintas controller/restart, alias operation binding, candidate-set absence CAS, review races, nested canonical lineage dan current preview/audit visibility diuji. Index failure sesudah commit mengembalikan degraded; retry tidak mempromosikan ulang.
- Dua fresh bare full build/verify runs exit 0: masing-masing 298/298 pada 15 files, Vitest 36.38s dan 31.63s. Promotion 46 tests (38 behavior + 8 real-process recovery), termasuk enam SIGKILL boundaries, exact amendment rollback, dan two-process apply race. Initial missing-feature RED dan regression RED dipertahankan dalam evidence.
- Dua aggregate runs sebelumnya mengalami timeout 5 detik pada test T4 accumulated 65 refs dan T1 61-record paging ketika parallel I/O dengan default sembilan workers. Isolated T4 lulus 2.35 detik; proof maxWorkers=2 lulus final 298 tests dalam 34.04 detik. Minimal Vitest config kini membatasi scheduling menjadi dua workers, dengan persetujuan parent. Obsolete T3 future-promotion gate assertion diperbarui untuk fase T5; legacy root tetap gated. Tidak ada timeout test yang dinaikkan atau skip untuk mendapat hasil green.
- Package dry-run 279 files, compressed 357032 bytes, tanpa runtime/test/helper/private artifacts; dependency dan lockfile tidak berubah. Tidak ada user data, credential, Windows, release, deployment, atau push oleh implementer.
- T6 supersede tetap explicit unsupported; create/transition baru ke archive tier ditolak sampai T7, tanpa menormalisasi metadata archive lama yang tidak berubah. Known T7 malformed UTF-8 helper dan exact episode/event-history access deferrals tetap terpisah. **G5 review pending**, bukan gate approval.

Kontrak, complete synthetic before/after, review boundary, replay dan evidence: [promotion verification](../verification/memory-promotion.md).


### T5 review round 1

Dua P2 direproduksi sebelum fix: exact hypothesis yang dibungkus event dapat menjadi fact, dan proposed supported/unverified menerima fabricated verifier method/revision/time. Guard kini memakai transitive lineage milik setiap action dengan exact historical revision, bukan seluruh comparison read set. Nested hypothesis tetap boleh dipertahankan; unrelated hypothesis candidate tidak memblokir fact dari evidence independen. Proposed verifier metadata ditolak pada jalur tanpa verifier, sementara parser metadata lama tetap kompatibel. Kedua gate juga diperiksa saat apply pending preview dari writer lama.

RED membuktikan 10 wrapper/metadata failures dan dua older-pending-plan failures. Fresh targeted 64/64 (56 behavior + 8 recovery) serta full build/verify 316/316 pada 15 files, exit 0, tanpa failed/pending/skipped. Package tetap 279 files, tanpa private/runtime/test artifacts; dependency tidak berubah. Scope hanya promotion owner, regression tests, dan docs. Canonical/staging tetap utuh pada reject paths. G5 re-review pending; T6/T7 dan kedua known deferrals tidak diperluas.


### T5 review round 2

Satu P2 over-rejection dibuktikan: promotion audit menyimpan unrelated comparison hypotheses dalam full dependency graph, sehingga guard epistemic menganggapnya actual evidence. Full graph untuk disclosure, visibility dan CAS tetap utuh. Selector epistemic terpisah kini memakai immutable action/output metadata, exact output-ref checks dan membership dalam full graph. Actual hypothesis laundering tetap ditolak; independent fact tidak terpengaruh comparison-only atau implicit episode-baseline hypotheses.

Audit T5 lama dengan shape lengkap tetap didukung tanpa rewrite; shape ambigu gagal tertutup untuk epistemic reuse, tetapi authorized archive tetap expandable. Sepuluh regression cases mencakup wrapper positives, genuine-hypothesis negatives, pending apply, hidden comparison dependencies dan old-shape compatibility. Targeted 74/74 dan fresh full build/verify 326/326 (15 files) lolos, exit 0, tanpa failed/pending/skipped. Package 279 files tanpa private/runtime/test artifacts, dependency tidak berubah. G5 scoped re-review pending; tidak ada scope expansion ke T6/T7 atau push.


### T5 review round 3

P2 terakhir direproduksi pada synthetic host-written malformed audit: non-converged create tanpa record dan canonicalRefs kosong menghilangkan genuine hypothesis output dari epistemic traversal. Selector kini mewajibkan complete action/output shape dan unique action ID. Valid convergence hanya automatic create menuju earlier new output owner; dangling/self/forward/chained/cyclic convergence ditolak. Retain/conflict tetap valid tanpa output. Full disclosure/visibility/CAS graph, exact hypothesis gate, dan verifier gate tidak berubah.

Tambahan 23 tests: RED 17 expected failures dengan enam valid controls, termasuk pending apply. Fresh full build/verify 349/349 pada 15 files, exit 0 (39.92s); final post-build targeted 97/97, exit 0 (15.09s). Standalone malformed-audit reproduction kini gagal tertutup, intact hypothesis tetap ditolak. Package 279 files bersih setelah retry dengan task-local npm cache; dependency dan lockfile tidak berubah. G5 independent re-review pending; tidak ada push atau perluasan T6/T7.


### T5 gate G5, 7 Oktober 2026 19:08 UTC

Independent scoped re-review atas `eb237071f1c15e7684c98ccebc2228cda27fe42b` lulus. Seluruh temuan G5 telah ditutup: exact nested epistemic lineage, larangan fabricated verifier metadata, pemisahan comparison/disclosure dependencies dari evidence, serta incomplete audit action/output yang gagal tertutup. Reviewer menjalankan original reproduction dan 23 regression cases (enam valid controls) dengan hasil sesuai. Fresh build + 349/349 tests dan targeted 97/97 terverifikasi. G5 selesai; T0–T5 adalah enam dari sepuluh fase. Berikutnya T6 temporal/epistemic query; batas Windows/live integration, T7 dan transfer/2 tetap belum diklaim selesai.


## T6, 7 Oktober 2026 — implementasi, G6 pending

- Facade v2 mengaktifkan `asOf` sebagai valid-time menurut current evidence, bukan knownAt. Historical candidates dipilih sebelum expired/superseded-now filtering; current visibility/scope tetap berlaku. Known results mendahului unknown/partial, dengan interval half-open dan metadata applicability eksplisit.
- Current canonical revision menentukan historical discovery. Exact old revisions tetap retained dan dapat diperluas; old same-ID contents tidak dibangkitkan sebagai competing truths. Archive discovery tetap gated T7 dan typed transfer/2 tetap T9.
- Typed event temporalAssertion memisahkan effectiveAt, observedAt dan recordedAt. Supersede menghasilkan planned pair mutations dan immutable before/after audit, lewat host review, source validation, semantic CAS dan transaction owner yang sudah ada. Weak/equal-time evidence menjadi conflict tanpa memilih truth.
- Historical evidence reuse terpisah dari ordinary current targets, termasuk mixed plans. Forgotten/cross-scope ancestry tetap ditolak. V2 link segments tidak digabungkan; normalisasi v1 tetap kompatibel. Backward clocks mempertahankan sequence dan skew diagnostics.
- Targeted temporal corpus 45/45; T0 asOf negatives kini memiliki positive controls. Final full verification dan package boundary dicatat pada [temporal verification](../verification/memory-temporal.md). Tidak ada dependency/lockfile change, push, release, deployment atau akses komputer pengguna. G6 menunggu independent review.


### T6 review round 1 — explicit zones at every v2 link entrance

Independent review reproduced one P2: identical zone-less link input produced different historical answers in UTC and New York. Strict zoned-instant validation now runs before legacy Date.parse conversion for all v2 link time fields in public writes and canonical parsing/serialization. Empty/null values cannot disappear during materialization, duplicate-link merging and activated-root batch creation are covered, and v1 compatibility is preserved. Added 26 tests, including two real timezone subprocesses and positive explicit-offset controls; targeted71/71. Final full verification/package evidence is in the temporal verification document. G6 re-review pending; no push or T7 expansion.


### T6 gate G6, 7 Oktober 2026 20:18 UTC

Independent scoped re-review atas `99f43222cd767cbce5873294504786f37eff72ff` lulus. G6-01 ditutup pada seluruh empat temporal fields relasi v2, termasuk canonical parse, mutations dan duplicate merge; v1 tetap kompatibel. Reviewer memverifikasi 26 correction cases dan original proof: ambiguous time ditolak sama di UTC/New York, explicit offset menghasilkan jawaban identik. Full build/420 tests dan targeted 71/71 terverifikasi. T0–T6 selesai, tujuh dari sepuluh fase. T7 retention/safety/receipt berikutnya.

## T7 retention, safety and receipts — 2026-10-07 UTC

Implemented typed retention/CAS/replay with immutable before/after audits, explicit archive/all recall and default exposure reduction. Restore does not clear expiry/supersession/forgetting. Accepted source/revision evidence and bounded telemetry are preserved; forgotten visibility cannot rotate out or be recreated from missing state. Exact episode/event nested-history checks and malformed UTF-8 archive diagnostics close the two prior deferrals. Capture/promotion/disclosure and retrieval/use/outcome/causation are exercised at their actual boundaries. T5 archive promotion is enabled only with these semantics.

See [T7 verification](../verification/memory-retention-safety.md) for scope, evidence, storage growth and limitations. Final targeted 18/18 and fresh build + 438/438 tests (20 files, repeated terminal exit 0); package 284 files with no forbidden runtime/private artifacts, dependencies unchanged and diff check clean. **G7 independent review pending**; T8/T9, Windows and live-controller integration are not claimed.


### T7 gate G7, 7 Oktober 2026 20:59 UTC

Independent spec/quality review `47bc23da5ed4b6e576c2937bdee4a041c95d163a` lulus tanpa blocker. Kedua deferred gaps ditutup: exact nested episode/event history mengikuti current visibility/scope, dan malformed UTF-8 audit menghasilkan coded error. Full build/438 tests berulang dan 18 targeted terverifikasi. Essential receipt replay dan forgotten state tetap terjaga pada rotation; feedback event replay legacy yang terbatas dan external legacy evidence bytes yang tidak otomatis disalin terdokumentasi sebagai batas. T0–T7 selesai, delapan dari sepuluh fase; T8 lifecycle evaluation berikutnya.


## T8, 7 Oktober 2026

- Corpus synthetic `memory-lifecycle-v1` disegel sebelum pengukuran: mandatory facts/constraints/obligation/next action, original BOM/CRLF/Unicode bytes dan SHA-256, adversarial sources, serta matrix E01–E32. Expected answers tidak dihasilkan dari output engine. Missing mandatory fact dan fabricated ref masing-masing menghasilkan intentional RED exit 1; normal suite juga menolak korupsi capsule hasil engine.
- Final isolated evaluation: 10/10, exit 0, 232.80s. Final `npm run verify` dengan JSON reporter: build 0, 452/452 pada 22 files, 248.47s; nol failed/pending/todo. T7 baseline 438/438 dibedakan dari run final. Semua sembilan supplementary section12 boundaries terikat actual passing assertions.
- 300-event task: full history plus original evidence 331763 bytes/8 calls, capsule plus same evidence 8099 bytes/2 calls; median 6799.66 ms / 546.01 ms. Semua setup/checkpoint/warmup/expansion/diagnostic calls dan response bytes dihitung terpisah, tanpa menghapus biaya selected fetch.
- Initial 1000-record lexical guard FAIL: median 3.88× / p95 3.56× terhadap baseline (repeat 3.71× / 3.28×), melampaui fixed 1.20× / 1.30×. Bukti dipertahankan. Diagnosis mengukur 1000000 structuredClone calls di temporal selector. Bounded repair yang diizinkan memfilter relevant link owners dan membaca temporal enum v2 langsung; independent source review PASS, empat deterministic regression tests RED→GREEN dan semua T6 lolos. Tidak ada threshold/corpus retuning.
- Final unchanged 31-trial lexical gate PASS pada 10/100/1000 records; pada 1000 median ratio 0.4592 dan p95 ratio 0.4862. Full-suite repeat juga PASS. Dense temporal graphs tetap bukan klaim linear complexity.
- Matrix final: 24 PASS, 6 PARTIAL, 2 NOT RUN. E04/E23/E25/E28/E31/E32 menyisakan T9/transfer/live/Windows; E29/E30 belum dijalankan. Offline replay tidak dianggap autonomous/live controller. Outcome benchmark UNAVAILABLE; exposure, reported use dan verified associated outcome dibedakan di E26. Model calls 0, biaya/tokens null.
- Clean isolated dependency install dari approved npm cache + build final exit 0. Package dry-run 284 files, 385073 compressed bytes, 2026578 unpacked bytes; forbidden paths kosong. Package/lockfile tidak berubah; no user data, credentials, push, release, deployment, Windows work atau broad T9 implementation.
- Evidence: [lifecycle results](../verification/memory-evolution-results.md), [machine-readable report](../verification/memory-evolution-results.json), dan [preserved failing baseline](../verification/memory-evolution-baseline.json). G8 menunggu independent evaluation review. T9 hanya dilanjutkan setelah keputusan G8.


### T8 / G8 review corrections, 7 Oktober 2026

Review menemukan tiga P2 pada evidence/harness, tanpa production-engine defect: goal oracle belum memeriksa semua provenance/verification fields; snapshot response array berubah setelah expansion; link baseline merujuk corroborating run alih-alih initial run yang angka-angkanya disebut. Tiga regression tests mereproduksi failure sebelum perbaikan.

Goal sekarang diperiksa penuh (critical, state, sourceRefs kosong, verification unverified/evidence kosong), dengan runtime UUID valid yang dibind sekali dari initial episode. Semua checkpoint/history/capsule harus mempertahankannya; forged refs/verification, extra fields, wrong/unbound UUID, omission dan duplicate ditolak. Meter menyalin array dan row; setiap summary dan report memeriksa kesesuaian bytes/calls dengan response rows. Exact initial JSON dipertahankan byte-for-byte terpisah dari corroborating JSON; kedua data historis tetap membawa original accounting limitation secara eksplisit, bukan diam-diam diperbaiki.

Fresh isolated evaluation 13/13 (234.75s) dan full build + 455/455 pada 22 files (254.42s) exit 0; nol failed/pending/todo. Semua 380 phase snapshots konsisten, 9 mandatory objects termasuk goal diperiksa pada setiap history/capsule trial. Fixed 1000-record guard tetap PASS: median ratio 0.4585 / p95 ratio 0.4869; full repeat juga PASS. Corpus/seals/thresholds dan production source tidak berubah. Matrix tetap 24 PASS, 6 PARTIAL, 2 NOT RUN; sembilan supplemental boundaries PASS. Package 284 files/385073 compressed bytes, forbidden paths kosong. G8 menunggu independent re-review; no push/release/deploy.


### T8 gate G8, 7 Oktober 2026 21:58 UTC

Independent evaluation review dan scoped re-review `cd6f214b155fcf9839cddc68d0e65ce3116c91c6` lulus; F1–F3 ditutup. Reviewer memverifikasi exact goal oracle, 380 reconciled snapshots per corrected run, byte-identical historical datasets, source hashes, isolated13/13 dan full build455/455. Empat bounded helper checks dijalankan independen. Latency median/p95 ratio1000record 0.4585/0.4869 memenuhi batas1.20/1.30 yang tidak diubah; initial failure tetap disimpan. Matrix24PASS/6PARTIAL/2NOTRUN memisahkan T9/live/Windows limits. T0–T8 selesai, sembilan dari sepuluh fase; T9 continuation/transfer/portability berikutnya.

## T9, 7 Oktober 2026 — implementation, G9 pending

- Added the public allowlisted transport-neutral dispatcher and fresh-controller continuation example. Scope, root, roles and authorization remain host-bound; no MCP server or live model was invoked. Tests verify exact constraints, obligations, next action, old successful strategy/evidence, an incorrect mandatory fixture that fails, and stale-capsule fallback.
- Added checksummed chunked transfer/2 complete isolated restore and explicitly incomplete knowledge-only export. Logical root ID and historical source bytes are preserved; every included workspace requires authorization. Active-root merge is refused. Incomplete imports stay unreadable, exact replay validates destination/bundle identity and bytes, and source cursors do not cross the destination boundary.
- Synthetic coverage includes 502 canonical records, more than eight retained revisions, archive retention/operation receipts, all included workspace scopes, typed validity/uncertainty/links, interrupted copy/replay, invalid checksum/path/missing source, Unicode/casing/CRLF/rename and lock contention. Small adapter budgets are validated before facade invocation to avoid undelivered exposure or unseen checkpoint publication.
- Verification and package-consumer evidence are recorded in [T9 verification](../verification/memory-controller-transfer.md). The first full Linux build + 470 tests passed; the final 16-test targeted run passed after the exposure fix, and the final full build + 471/471 tests on 25 files passed in 244.73s, terminal exit 0, with zero failed/pending/todo. T8 fixed 1000-record median/p95 ratios remained PASS at 0.4589/0.5020. Public package import, protocol resume, isolated restore, duplicate replay and strict declaration consumption passed in a fresh offline temporary consumer.
- G9 remains pending independent integration review. Live controller A→B and the separate Windows matrix are NOT RUN. No monolith edits, historical extraction rewrite, push, release or deployment; existing T8 evidence is retained with a separate addendum.

### T9 / G9 review round 1

Independent review found two P1 gaps: workspace metadata in rotated retained telemetry was not authorized, and checksum-valid archived episode state could differ from its event reduction. Eleven regression failures with two valid controls reproduced the boundaries. The fix reuses domain-owned telemetry validation and shares the existing episode reader's count/sequence/reducer invariant with complete transfer. Retained and recent workspace metadata, unknown scope, historical snapshots and interrupted-destination preservation are covered. Correction build + 489/489 on 26 files and targeted 34/34 passed, terminal exit 0, with zero failed/pending/todo. Both original reviewer probes now reject. The fixed 1000-record median/p95 ratios remain PASS at 0.4523/0.4512. Final 299-file package import/resume/restore/replay, rotated-workspace denial and declarations passed with empty forbidden/private-path scans. G9 independent re-review is pending; the earlier passing 471-test run remains evidence for its original cases.


### T9 gate G9, 7 Oktober 2026 22:53 UTC

Independent scoped re-review af0539869916ad132ba764bb6bfb3ee12a6563e5 lulus, kedua P1 selesai: domain-owned telemetry workspace authorization dan seluruh retained episode snapshot consistency sebelum staging/activation. Reviewer memverifikasi 489 full/34 targeted, original probe rejection, 15 source hashes dan 299 packaged/installed files, consumer/declarations PASS. T0–T9 seluruhnya melewati phase gates. Final whole-branch integration review masih berjalan; live autonomous controllers dan Windows tetap NOT RUN, tidak dianggap klaim production-wide readiness.

## Final whole-branch integration correction

The final integration review on `cb433fc` found FI-1: transfer's strict saved-plan schema omitted the engine-written `eligibleIds` field. The promotion owner now has one complete strict persistence schema shared by its runtime readers and transfer. Public pending/applied retain, create and temporal roundtrips cover the composed workflow.

Those tests also exposed FI-2 after the schema repair: projected temporal outputs were mistaken for retained objects. A domain-owned reference inspection view now validates plan/snapshot and projected-output hashes before excluding only unpublished plan outputs; actual inputs and applied outputs remain required. Persisted bytes are preserved. Build + 503/503 tests on 27 files and broader targeted 192/192 passed, terminal exit 0, with no failed/pending/todo. Fourteen cross-phase cases also passed against the installed package; pending/applied public consumers and declarations passed with 301 clean package files. Fixed T8 median/p95 ratios at 1000 records remain PASS at 0.4339/0.4495. Final integrated acceptance remains pending scoped independent review. See [integration evidence](../verification/memory-integration.md).


### Final integrated acceptance, 7 Oktober 2026 23:19 UTC

Independent scoped re-review e97534d PASS: FI-1/FI-2 selesai. Reviewer menjalankan ulang14 cross-phase fixtures dan original public proof; full503/targeted192/installed14, source hashes, installed source/build equality dan tarball digest terverifikasi. Seluruh fase dan final review selesai dalam scope yang teruji. Tidak ada blocker terbuka pada review ini; Windows/live autonomous controllers tetap NOT RUN, bukan dianggap lulus. [Final evidence](../verification/memory-integration.md).
