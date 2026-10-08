# MRR-3 — Knowledge Use Receipt & Retrieval-to-Outcome Evidence Plan

> **Status:** IMPLEMENTED — TARGETED/COMPILED VERIFIED — RESIDENT VERIFIED. **Controller-surface note:** local source/dist/resident manifest advertise `receipt`; the current external connector descriptor remains stale and is tracked separately by `MRR-3.1-Controller-Surface-Sync-Plan.md`.
> **Tanggal:** 2026-09-30 WIB.
> **Prasyarat historis — 2026-09-30:** MRR-1/MRR-2 resident verified; Native runtime belum menjadi acceptance target MRR-3. Penundaan fase itu telah dilampaui oleh [Native Runtime](Native-Agent-Runtime-Phase-1-Plan.md) dan [Native Chat](Agent-Core-Interactive-Agent-Chat-Plan-20261002.md); status konektor pada laporan ini tetap observasi sesi asal, bukan pemeriksaan konektor saat ini.
> **Tujuan:** membuktikan penggunaan Memory pada pekerjaan nyata tanpa menyamakan retrieval dengan manfaat, tanpa menyimpan chain-of-thought, dan tanpa membuat Memory authority kedua.

## 1. Masalah yang ditutup

Agent Core saat ini sudah dapat membuktikan Memory dicari, diranking, diproyeksikan, dan dikirim ke controller. `MemoryRetrievalLedger` juga menyimpan attempt/exposure, tetapi exposure hanya memiliki `recordFingerprint=id+updatedAt`; exact body digest yang dilihat controller belum menjadi identitas use-evidence.

`memory_feedback` sudah mempunyai guard exact ID/body melalui `memoryFeedbackContentDigest`, tetapi feedback adalah salience/review signal, bukan bukti bahwa Memory dipakai pada suatu action atau menghasilkan outcome tertentu.

`ActivityTracker` sudah mencatat tool invocation/outcome, dan Learning sudah mempunyai `effectEvidence`. Yang belum ada adalah sambungan bounded dan eksplisit:

```
retrieval exposure -> applicability -> actual use/rejection -> action evidence -> observed outcome
```

MRR-3 tidak akan mengklaim causal improvement. Ia hanya membangun **observed-use evidence** yang dapat diaudit dan kemudian dipakai MRR-4 untuk pilot lintas sesi.

## 2. Keputusan arsitektur

1. Reuse owner existing: MemoryRetrievalLedger, ActivityTracker, Learning facade, MemoryService, dan MetaClaw body digest.
2. Tidak membuat database, agent, scheduler, model call, ranking engine, atau Memory store baru.
3. Tidak menambah MCP tool baru. Preferred surface: perluas tool `learning` dengan action additive `receipt`, sehingga tool count tetap stabil.
4. Receipt adalah evidence-only: tidak memberi permission, tidak otomatis mengubah Memory, salience, ranking, Skills, atau Grafel Patterns.
5. Exact source tetap authority; Grafel hanya structural second opinion.
## 3. Kontrak MRR3-P1 — exact retrieval-use identity

Perluas delivered `memory_search` result secara additive dengan evidence metadata yang aman:

- `retrievalAttemptId` — attempt yang benar-benar menghasilkan exposure.
- `contentDigest` — exact `memoryFeedbackContentDigest(id, content)` dari body yang dikirim.
- Existing `recordFingerprint` tetap dipakai sebagai metadata revision identity, bukan pengganti body digest.

Ledger exposure juga menyimpan `contentDigest`. Dropped/deduped result boleh tercatat di ledger, tetapi tidak boleh memperoleh receipt sebagai “used”.

Scope awal MRR-3 hanya `memory_search`. `memory_page` tidak otomatis dianggap retrieval-use surface sampai jalurnya mempunyai attempt/body evidence yang setara.

## 4. Kontrak MRR3-P2 — Knowledge Use Receipt

Perluas `learning` schema dengan `action="receipt"` dan field bounded:

- `useId` — idempotency key receipt.
- `retrievalAttemptId`.
- `memoryId`.
- `contentDigest`.
- `workspace` bila attempt scoped.
- `applicability`: `applied | adapted | rejected`.
- `result`: `success | failure | unavailable`.
- `reasonCode` bounded machine-readable; bukan reasoning trace.
- `evidenceRefs` max 16 dengan prefix evidence existing.
- `verificationRef` wajib untuk result success/failure; boleh kosong untuk unavailable.
- optional `summary` pendek, factual, tanpa private reasoning.

Validation wajib:

1. attempt ada pada bounded retrieval ledger;
2. memoryId adalah exposure dari attempt tersebut;
3. exposure benar-benar `returned-to-controller` dan disposition `selected|trimmed`;
4. receipt workspace cocok dengan attempt;
5. receipt contentDigest cocok dengan body yang terekspos;
6. current Memory body masih cocok untuk `applied|adapted`; stale body ditolak;
7. `rejected` boleh mencatat reason `stale-content` bila exposure digest valid tetapi current body sudah berubah;
8. duplicate useId + payload identik = idempotent/no-op; payload berbeda = conflict.

Tidak ada receipt retroaktif yang dibuat dari feedback/tracker lama.
## 5. Persistence dan observability

Preferred implementation: perluas owner `MemoryRetrievalLedger` dengan bounded receipt evidence log menggunakan primitive `BoundedJsonlEventLog` dan process lock yang sudah ada. Ini evidence state, bukan canonical Memory.

Setiap accepted receipt juga dicerminkan ke `ActivityTracker.recordOutcome`:

- featureId: `memory.use`;
- outcome: applicability;
- properties hanya nilai bounded/non-secret seperti result dan verified flag;
- context: useId, retrievalAttemptId, memoryId, contentDigest, workspace, reasonCode, evidence refs bounded.

Tracker mirror tidak menjadi authority idempotency. Ledger receipt adalah authority untuk receipt identity; canonical Memory tetap authority isi pengetahuan.

## 6. Kontrak MRR3-P3 — diagnostics

`memory_retrieval_diagnostics` diperluas additive, tetap read-only, menjadi mampu membedakan:

- returned-to-controller;
- receipt-assessed;
- applied;
- adapted;
- rejected;
- associated success;
- associated failure;
- outcome unavailable;
- unassessed.

Explicit `memory_feedback` tetap dilaporkan terpisah sebagai salience/review feedback. Jangan mencampur helpful/stale/wrong dengan observed-use result.

Limitations wajib tetap menyatakan:

- observed use bukan causal improvement;
- action success tidak membuktikan Memory adalah satu-satunya penyebab;
- missing receipt berarti unknown, bukan not-used;
- rejected Memory dapat menjadi perilaku yang benar;
- perbandingan improvement memerlukan MRR-4/control yang sebanding.

## 7. File/owner yang diperkirakan tersentuh

Primary:
- `src/memory/retrieval-ledger.ts`
- `src/memory/service.ts`
- `src/memory/search-projection.ts`
- `src/memory/feedback-target.ts` (reuse digest; jangan duplikasi algoritme)
- `src/tracker/activity-tracker.ts`
- `src/learning/service.ts`
- `src/mcp/learning-schemas.ts`
- `src/mcp/learning-tools.ts`

Tests/verification baru harus terisolasi dari production Memory dan tracker.
## 8. Acceptance yang harus lulus sebelum resident activation

### A. Identity / delivery
1. search result yang delivered membawa attemptId + exact contentDigest;
2. ledger exposure menyimpan digest yang sama;
3. dropped/deduped exposure tidak eligible untuk receipt.

### B. Receipt validation
4. matching attempt/body/workspace receipt diterima;
5. duplicate identik idempotent;
6. duplicate conflict ditolak;
7. wrong attempt/memory/workspace/digest ditolak;
8. body berubah sebelum applied/adapted receipt -> ditolak stale;
9. stale body boleh dicatat sebagai rejected/stale-content tanpa dianggap “used successfully”.

### C. Outcome/evidence
10. success/failure tanpa verificationRef ditolak;
11. unsafe/credential/private-reasoning shaped material ditolak atau direduksi oleh policy existing;
12. receipt tidak mengubah Memory content, links, feedback salience, retrieval rank, Skills, atau Grafel.

### D. Diagnostics/restart
13. diagnostics menghitung use states secara terpisah dari feedback;
14. receipt bertahan setelah service/process reinitialize sesuai bounded evidence-store semantics;
15. corrupted receipt ledger degrade fail-soft dan tidak memblok machine control/Memory reads.

### E. Compatibility
16. existing learning actions/status/review/checkpoint/curate/journey tetap kompatibel;
17. `memory_search` perubahan response hanya additive;
18. tool count tidak berubah;
19. build + path policy PASS;
20. structural review dilakukan karena public schema/response shape berubah;
21. release compatibility tidak menunjukkan breaking tool/route/schema delta.

## 9. Verification scope saat implementasi disetujui

Jalankan hanya targeted tests MRR-3 + touched Learning/Memory regression, compiled-isolated checks, build/path policy, compatibility, Grafel reindex/structural review, lalu resident synthetic acceptance setelah restart bila build baru memang perlu dimuat.

Tidak menjalankan broad regression suite tanpa kebutuhan/izin baru. Fixture harus berada di runtime/tmp atau test-owned isolated roots dan dibersihkan.

Material shipped capability memerlukan satu pending minor changeset; `release:apply`, commit, tag, push, publish, deploy tetap tidak dilakukan.

## 10. Handoff ke MRR-4

MRR-4 genuine cross-session pilot baru dimulai setelah MRR-3 resident verified. Pilot harus memakai controller/session kedua yang nyata, bukan simulasi “history hilang”. Receipt MRR-3 menjadi evidence bahwa Memory sesi pertama benar-benar dipakai/ditolak/adaptasi pada sesi kedua.

Kriteria maturity tetap task-specific: hindari known failure, cek applicability/freshness, hasil task benar, dan evidence lengkap. Satu demo positif tidak cukup untuk menyatakan Agent Core matang secara umum.

## 11. Approval gate — closed

Pengguna menyetujui plan dan implementasi sudah mengikuti urutan P1 -> P2 -> P3 -> targeted qualification -> structural review -> docs/Memory sync -> resident acceptance. Native AI runtime tetap di luar scope. Bagian ini dipertahankan sebagai jejak gate historis; authority status terkini ada pada header dan hasil implementasi/resident verification di bawah.

## 12. Hasil implementasi yang sudah qualified

MRR3-P1 sudah diimplementasikan secara additive. `memory_search` delivered result kini membawa `retrievalEvidence={attemptId,contentDigest,recordFingerprint}`; exposure ledger menyimpan `contentDigest` exact body yang sama. Historical ledger rows tanpa digest tetap readable, tetapi tidak eligible untuk receipt sampai exposure baru mempunyai body identity.

MRR3-P2 diimplementasikan melalui existing `learning` tool dengan `action="receipt"`; tidak ada MCP tool baru. Receipt memvalidasi attempt, exposure, workspace, exact content digest, eligibility selected/trimmed+returned-to-controller, verification evidence, stale-body behavior dan idempotency. Receipt evidence disimpan di bounded `retrieval-use-receipts.jsonl` di bawah owner retrieval ledger, bukan canonical Memory.

Applied/adapted receipt ditolak bila current body berubah. Explicit `rejected + stale-content + unavailable` boleh direkam untuk membuktikan controller menolak knowledge yang sudah stale. Duplicate useId dengan payload sama idempotent; payload berbeda conflict. Receipt diterima tidak mengubah Memory content, links, feedback salience, ranking, Skills, Grafel Patterns, permission atau execution.

MRR3-P3 menambah diagnostics additive `useEvidence` yang memisahkan receipt-assessed/applied/adapted/rejected dan associated success/failure/unavailable dari ordinary Memory feedback. Limitations tetap menyatakan handoff != model use dan observed use != causal improvement.

### Qualification evidence

- dedicated MRR-3 acceptance: **15/15 PASS**, 0 failure, 0 skip — `runtime/tmp/mrr3-green-attempt1.json`;
- touched Learning/Memory regression: **69/69 PASS**, 0 failure, 0 skip — `runtime/tmp/mrr3-touched-regression.json`;
- compiled isolated checks: **9/9 PASS** — `runtime/tmp/mrr3-compiled-check.json`;
- `npm run build`: exit 0; path policy **280/0** — `runtime/tmp/mrr3-build.log`;
- `release:compat`: **70 -> 70 tools**, no added/removed tools, learning schema additive, `breakingEvidence=false`, manifest within budget — `runtime/tmp/mrr3-release-compat.log`;
- Grafel explicit reindex: current/accepted, **9,742 entities / 51,915 relationships**;
- structural review verifies `registerLearningTools -> LearningService.receipt -> MemoryService.recordUseReceipt -> MemoryRetrievalLedger.recordUseReceipt` plus existing digest/tracker owners.

Initial RED evidence is preserved: the first run exposed an invalid test foundation fixture and was not accepted as capability RED. After correcting that fixture, `runtime/tmp/mrr3-red-capability.json` failed 15/15 because retrievalEvidence/receipt capability did not yet exist. The implementation then turned that exact acceptance file GREEN.

No dependency/toolchain install was required. One new minor release intent is `.changeset/20260930-mrr3-knowledge-use-receipt.md`; no release apply/version bump/commit/tag/push/publish/deploy occurred.

### Resident activation and acceptance

Setelah restart pengguna, resident Core PID **13952** mulai pada **2026-09-29T21:51:54.7971494Z**, setelah compiled `dist/memory/retrieval-ledger.js` **2026-09-29T21:30:40Z**. `/health=ok`, v0.14.0, Memory available/issueCount0, Learning available.

Authenticated resident MCP acceptance lulus **15/15**. Key sementara dibatasi tepat ke `memory_remember`, `memory_search`, `learning`, `memory_update`, `memory_retrieval_diagnostics`, `memory_delete`. Resident discovery mengiklankan `learning action=receipt`; `memory_search` mengembalikan exact `retrievalEvidence`; applied receipt diterima dan duplicate identik idempotent; setelah body berubah, stale applied receipt ditolak `CONTENT_CHANGED`; explicit `rejected/stale-content/unavailable` diterima; diagnostics menunjukkan `useEvidence` applied=1, rejected=1, associatedSuccess=1, outcomeUnavailable=1.

Key dibuat **2026-09-29T21:57:12.882Z**, expiry **22:07:12.843Z**, direvoke **21:57:16.754Z**. Native verification menolak secret sesudah revoke dan koneksi MCP baru menggunakan secret yang sama juga ditolak. Secret tidak dicetak atau dipersist ke script/report/Memory.

Cleanup final: canonical synthetic Memory dihapus, 2 receipt rows dan 1 retrieval attempt dihapus, revision fixture sintetis dihapus di bawah Memory process lock, residue scan token pada `runtime/memory` = 0, final Memory `issueCount=0`, retrieval receiptCount=0. Evidence: `runtime/tmp/mrr3-implementation-20260930/resident-acceptance.json` dan `resident-closure.json`.

MRR-4 genuine cross-session pilot tetap untouched pada task ini dan sekarang menjadi next OPEN work item. Ia wajib memakai controller/session kedua yang nyata; satu resident synthetic acceptance MRR-3 tidak membuktikan cumulative-learning improvement lintas sesi.
