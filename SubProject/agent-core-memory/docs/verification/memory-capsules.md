# Capsule deterministik dan freshness: verifikasi T4

Tanggal: **7 Oktober 2026 UTC**. Baseline T3: `207d7c29e876cd61b807b2cdb46465ad9964184e`, branch `feat/memory-evolution`. Fixture synthetic, filesystem lokal Linux, tanpa embedder, model adapter, atau API key. Implementasi selesai; review parent dan persetujuan G4 masih diperlukan sebelum push fase.

## Hasil yang dibuktikan

Controller baru dapat membaca operational state yang wajib dari capsule deterministik, membuka supporting items yang dihilangkan melalui exact episode ref, dan merekonstruksi original evidence. Compaction tidak menghapus event, working state, evidence, atau checkpoint terdahulu. Freshness adalah konsistensi dependency yang dipilih; bukan independent verification bahwa makna pernyataan controller benar.

Fresh review-round-1 `npm run verify`: build exit 0, **252/252 tests**, 13 files. Targeted T4: **46/46**, dua files, zero failed/pending/skipped. Sebelum fix review, full suite 245/245 dan targeted 39/39; hash nama targeted original: `sha256:e9288963ac3e55d2f554f8a7017987d7509f62f2b3426116e4cad79bb12350cb`.

```sh
npm test -- tests/memory-capsule.test.ts tests/memory-capsule-race.test.ts
npm run verify
```

Node 24.19.0, npm 11.9.0, Debian 13.6 Linux x86_64. Dependency dan lockfile tidak berubah. Package dry-run: 274 files, 329843 compressed bytes pada pemeriksaan; tidak ada runtime, fixture, test/helper, JSONL atau report privat. Cache npm default yang hilang saat dry-run diatasi dengan cache writable yang scoped; tidak ada konfigurasi global atau publish.

## Kontrak yang tersedia

- `checkpoint({ episodeId, expectedRevision, operationId, trigger, budget? })` mengembalikan `Budgeted<TaskCapsule>`. Default budget 8192; valid 512–65536 bytes. Generator tunggal `deterministic-v1`.
- Trigger: phase-complete, decision, verified-correction, state-change, milestone, failure-resolved, budget-pressure, handoff, explicit. Nama trigger tidak membuat suatu klaim verified.
- `getTaskContext` menyertakan freshness, needsCheckpoint, optional full capsule dan staleSourceRefs. Optional additive `capsuleRef` pada full context mengizinkan exact checkpoint expansion.
- `expand({source: capsuleRef, view: 'episode'})` menampilkan paged immutable capsule manifest: capsule, episodeRef, selected dependencies, complete lineage refs, dan optional predecessorRef. Episode expansion tetap menjadi jalan untuk seluruh omitted supporting items dan original events.
- Sebelum capsule text diserialisasi, exact expansion memeriksa complete saved source lineage, termasuk nested event/episode/record-audit groups dan canonical dependency map, melalui existing validation owner. Current dependency harus visible dan in scope; exact historical canonical revision juga harus in scope. Forgotten/unavailable dependency menghasilkan coded error tanpa derivative text, cross-scope menghasilkan `MEMORY_SCOPE_MISMATCH`, dan missing/corrupt visibility menghasilkan `MEMORY_SOURCE_UNAVAILABLE`.
- Root legacy tetap menolak checkpoint dengan `MEMORY_EXPERIENCE_NOT_ENABLED`. Invalid input pada root aktif memakai `MEMORY_INPUT_INVALID`. Gate controller-supplied verified dari T3 tetap sama; T4 tidak membuat verifier atau authority baru.

Operation namespace tetap durable root + normalized workspace + task + method + operation ID. Controller/session bukan bagian identity atau business payload. Expected revision adalah CAS precondition; replay yang sah dicek dahulu, termasuk setelah restart atau lost response. Business payload checkpoint mengikat episode, trigger, dan effective byte budget. Replay mengembalikan exact accepted result, bukan janji bahwa result tersebut masih current pada saat replay; panggil getTaskContext untuk freshness sekarang.

## Mandatory preservation dan budget

Critical items, termasuk critical resolved history, disalin verbatim. Active goal, constraint, decision, blocker, obligation, next-action, changed-file, dan important-id wajib meskipun critical false. Current-state yang verified juga mandatory; meaningful strategies/failures ditandai critical pada reducer. Tidak ada paraphrase, pemotongan ID/error/path, fabricated item, atau perubahan verification label. Mandatory item source refs dan verification evidence refs ikut dipertahankan.

Supporting items dipilih deterministik berdasarkan kind dengan lexical comparison, sequence perubahan terakhir descending, lalu ID lexical sebagai tie-break. Item hanya masuk bila seluruh item plus final envelope muat. Omission IDs eksplisit; item lengkap tetap berada dalam exact archived episode. Batas refs64 per input tidak diterapkan ke accumulated stored lineage; test 64+1 mempertahankan seluruh 65 refs sesudah resolution, checkpoint, restart, dan expansion.

Budget memakai seluruh JSON UTF-8 yang benar-benar dikirim, termasuk status, metrics, warnings, provenance, IDs, dan field names. Token count tetap estimasi kasar Unicode-codepoints/4. Bila mandatory items plus envelope melebihi budget, checkpoint mengembalikan insufficient-budget dengan requiredBytes minimum, tanpa capsule/pointer/receipt baru. Capsule lama tetap tersimpan. Capsule tidak dikurangi agar tampak berhasil.

Task discovery tetap mengembalikan bounded handle-only saat mandatory envelope tidak muat, termasuk kebutuhan di atas 65536 bytes. Header, capsule, capsuleRef dan growing stale-ref list tidak disalin ke handle. Maximum-length host identities tidak bocor ke handle; minimum 512 bytes diuji. Capsule yang sudah ada juga dihilangkan seluruhnya bila final context envelope terlalu besar. Freshness dan needsCheckpoint tetap tersedia; controller membuka episode secara paged. Missing/corrupt derived capsule menghasilkan unknown/needsCheckpoint dengan capsule-unavailable; episode yang utuh tetap dapat dibuka dan checkpoint baru dapat dibuat tanpa menghapus sejarah.

Lifecycle header tetap authoritative. Goal aktif adalah declared purpose yang dipertahankan bahkan pada completed episode; itu tidak berarti task masih berjalan. Checkpoint tidak membuka kembali episode atau menyelesaikan blocker/obligation.

## Freshness, lineage, dan live origin

Complete immutable lineage berbeda dari selected current dependencies. Untuk tiap active present assertion, setiap canonical memory yang dirujuk harus memiliki ref yang cocok dengan snapshot current semantic revision. Old refs boleh tetap berdampingan. Active successful-strategy/failed-path dan resolved items dapat menyebut exact historical refs tanpa menyatakan historical meaning berlaku sekarang. Dependency map merekam snapshot current revisions secara konservatif untuk deteksi perubahan berikutnya, tanpa menulis ulang old refs atau memvalidasi makna historical claim.

Metadata-only canonical correction mengubah semantic revision dan men-stale capsule. Access count/last accessed/derived history tidak mengubah semantic revision, sehingga access-only read tidak men-stale capsule. Stale current assertion tidak dirender ulang menjadi current dari sumber lama; checkpoint menolak MEMORY_REVISION_CONFLICT sampai controller melakukan explicit correction dengan fresh ref. Old+new correction mempertahankan kedua revision refs.

Archived byte integrity terpisah dari live-origin freshness:

- New available workspace-file capture menambahkan optional originIdentity: hash dari authorized actual root path dan existing root device/inode, plus bounded existing file identity. Tidak ada raw private absolute path. Existing digest/bytes tetap baseline source content. Identity root/file yang sudah diperiksa T3 dipakai kembali; tidak ada registry, layanan atau verifier baru.
- Unchanged authorized origin identity dan exact bytes menghasilkan current dependency. Changed bytes atau replaced/relocated identity menghasilkan stale dengan reason warning. Missing/ambiguous root, unavailable path/policy, atau old manifest tanpa originIdentity menghasilkan unknown/needsCheckpoint. Old captures tidak dibackfill memakai keadaan saat ini.
- Pada explicit recapture correction, seluruh old artifacts tetap lineage. Per item/per authorized workspace-relative origin, engine memilih captures yang identity dan bytes-nya cocok dengan live source. Tidak memilih newest timestamp. Bila tidak ada matching current capture dan hanya stale captures, checkpoint menolak; bila hanya unknown candidates, hasil partial dan warning menjelaskan ketidakpastian.
- Canonical memory dengan live provenance memakai existing assessMemoryStaleness dan safe byte-snapshot/repository identity checks. Live-origin change dapat men-stale capsule walaupun semantic memory revision sendiri belum berubah.
- Controller-text artifact tidak memiliki live workspace origin; available archived bytes membuktikan exact capture dependency saja. Ia tetap assertion controller, bukan independent proof hasil tool.

Freshness read tidak menyembunyikan unknown/stale. Known invisible current dependency menyembunyikan capsule; cross-scope source tetap coded scope error. Missing/corrupt archived evidence tidak membiarkan supported capsule disebut current; context menjadi unknown/needsCheckpoint tanpa capsule. Exact artifact expansion tetap memakai shared raw-Buffer hash, byte length dan fatal UTF-8 boundary T3: corrupt bytes menghasilkan empty unavailable, tidak dikarang ulang dari summary/hash.

Historical capsule access adalah access check, bukan current-truth gate. Authorized exact older semantic revisions tetap readable setelah metadata correction atau source kembali ke workspace semula. Changed live file bytes tidak memblokir history apabila exact archived bytes masih intact dan authorized. Immutable capsule yang aksesnya ditolak tetap dipertahankan; preservation sendiri tidak memberi permission untuk disclosure.

## Snapshot–compute–CAS dan recovery

MemoryEpisodes mengambil scoped snapshot dengan store lock T2, kemudian deterministic renderer berjalan di luar lock. Publication memakai existing transact, archive dan coordinator journal. Capsule immutable disimpan pada state/capsules dan exact archive manifest; operation receipt dan live capsule pointer masuk bundle yang sama. Checkpoint tidak menambah episode event/revision. Full live manifest bytes, termasuk prior capsule pointer, adalah dependency CAS, sehingga dua different-operation checkpoints tidak silently overwrite pointer. Identical operation races mereplay satu result.

Declared read set mencakup episode/event/archive bytes, semantic memory dependencies, visibility dan activation. Host-only read-only validateSources mengulang frozen source identity/bytes/policy check tepat sebelum journal preparation. Event/decision, source metadata, visibility, activation atau live origin berubah selama snapshot/compute: reject tanpa capsule publication. Held-renderer test benar-benar mengizinkan keputusan controller B masuk saat renderer A ditahan, lalu menolak capsule A.

Real child process kills pada preparing, prepared, apply, committed dan lost-response boundaries membuktikan old pointer/capsule preserved atau complete new bundle, recovery di bawah lock, stable replay, serta journal cleanup. Dua independent processes menghasilkan exact checkpoint receipt yang sama. Tidak ada parallel journal/framework atau production-only test hook.

## Pengukuran output eksternal E17

Fixture synthetic berisi empat mandatory items, 12 supporting historical observations, dan original BOM/CRLF/Unicode evidence. Sepuluh trials memeriksa semua exact mandatory fields dan original evidence di kedua jalur. Budget per expansion 8192 bytes. Semua response envelopes dan selected evidence expansion dihitung.

| Jalur | Total emitted bytes | API calls | Median latency |
|---|---:|---:|---:|
| Handle + full paged history + exact selected evidence | 37308 | 7 | 110.43 ms |
| Full capsule context + same exact selected evidence | 3095 | 2 | 37.17 ms |

Evidence membutuhkan satu tambahan read call di kedua jalur; tidak dihilangkan dari angka capsule. Checkpoint setup satu write call menghasilkan 1836 response bytes dan dilaporkan terpisah, bukan biaya read yang disembunyikan. Angka ini satu fixture lokal; bukan klaim umum 70%, hidden-context compaction, tokenizer guarantee, throughput/scaling atau latency pada store pengguna.

## RED dan batas hasil

Initial RED 22 missing-feature failures setelah fixture unhandled-rejection draft dibetulkan. RED berikutnya membuktikan canonical live-provenance freshness, maximum-budget discovery dan corrupt derived capsule, old+fresh artifact lineage correction, serta partial unknown-origin checkpoint. Setiap RED yang memerlukan production repair diikuti GREEN. Final full suite tidak memiliki failing, pending atau skipped tests. Satu compile draft salah urutan argumen existing assessMemoryStaleness diperbaiki sebelum final build; dependency resolution tidak berubah.

Review round 1 menemukan satu P1 pada new exact capsule expansion: current context menutup derivative dari hidden/out-of-scope dependency, tetapi old capsuleRef masih membukanya. RED membuktikan tiga failure paths (forgotten, moved workspace, nested hidden canonical source). Tujuh regression cases juga menjaga missing/corrupt visibility serta authorized stale/history controls. Scoped fix memakai existing lineage dan visibility/current-historical scope owners sebelum serialization; fresh targeted 46/46 dan full verify 252/252/build0. Tidak ada broad T3 rewrite. Existing exact episode/event history disclosure boundary dicatat untuk review T7; Re-review independen 7 Oktober 2026 17:27 UTC lulus, termasuk rerun 7/7 regression cases; G4 selesai.

Source validation bersifat point-in-time terhadap external writer yang mengabaikan lock. Tidak ada klaim global filesystem atomicity, semua power-loss/storage, network filesystem, Windows, atau old-binary co-writers. File identity checks sengaja konservatif: identical bytes pada replaced file dapat stale. Scope bukan multi-tenant authentication. Integrity hash, assertion, success/verified-correction trigger dan checkpoint receipt tidak membuat independent semantic verification atau izin tindakan.

Read tetap memvalidasi immutable episode/reducer/source groups sehingga internal I/O dan storage bertambah; ini bukan benchmark scaling. Archive tidak dipurge atau dirotasi. T5–T9, model adapter, consolidation/promotion, temporal query, retention workflow dan transfer/2 belum diaktifkan. G4 functional evidence dan review independen telah lulus.
