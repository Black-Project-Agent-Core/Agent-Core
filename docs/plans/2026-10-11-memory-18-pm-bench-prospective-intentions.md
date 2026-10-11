# PM-Bench Prospective Intentions Implementation Plan

> Implementation follow-through: source candidate `0.15.0-beta.3`; see the [actual functional ledger](../verification/memory12-21-source-functional-2026-10-11.md) for results, review fixes and limitations. Original proposed checklists below are retained as the authored plan, not evidence of execution. Windows activation is not performed by this source work.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mempertahankan niat tertunda eksplisit dan menampilkan kelayakannya pada panggilan/resume controller tanpa menjalankan tindakan otomatis.

**Architecture:** Gunakan WorkingItem `obligation`, event episode, revision dan operationId existing. Codec teks berversi menyimpan kondisi eksplisit di item yang sama; evaluator pure hanya membaca snapshot scope aktif dan observasi yang sudah tersedia. Controller tetap memutuskan tindakan dengan grants yang berlaku.

**Tech Stack:** Node >=24.15.0, TypeScript NodeNext, Zod, Vitest 4.1.11; tidak ada dependency baru.

**Spec:** `docs/plans/2026-10-11-memory-reference-adoption-spec.md`; baca bersama Plan05 `2026-10-09-memory-05-outcome-evaluation.md`.

**Status:** **PROPOSED — planning only**. Implementasi, functional test, resident integration dan benefit belum dijalankan/dibuktikan.

## Global Constraints

Seluruh Global constraints shared spec berlaku; bagian berikut memperketat lingkup rencana ini. Learning tetap fail-soft; tidak ada grant dari Memory, raw chain-of-thought atau aktivasi/reembedding implisit.

- Baseline source `957077fab260dd58d0cc7cfc0881172d05f84667`; source bukan bukti installed/running build.
- Memory kanonis lokal tidak tersedia; jangan membuat store produksi pengganti atau menyentuh Windows.
- Tidak ada scheduler, daemon, polling tersembunyi, timer, autonomous tool action, model, provider, instalasi atau store kedua.
- Memory bersifat advisory; eligibility bukan izin, pemanggilan tool, pengiriman pesan, atau bukti task selesai.
- Perubahan sekarang hanya dokumen ini. Seluruh command/checklist di bawah untuk implementasi mendatang setelah persetujuan rencana.
- Lindungi pekerjaan lain, `.env`, secrets dan protected paths. Jangan backup/stash, membuat salinan aktif alternatif, atau mensyaratkan seluruh tree bersih.

## Review Focus

1. Cue belum terlihat atau waktunya tidak valid harus unknown, bukan eligible (Task 1).
2. Cancel/reschedule dari revision baru harus mengalahkan snapshot lama (Task 2).
3. Replay event/call tidak boleh menggandakan obligation atau menyelesaikannya diam-diam (Task 2).
4. Cue dari workspace/task lain atau instruksi berbahaya tidak boleh memperluas grants (Task 3).
5. Budget terlalu kecil harus gagal terlihat, bukan menghilangkan obligation kritis (Task 3).

---

## Bukti sumber dan keputusan adopsi

- [PM-Bench README pada SHA sumber](https://github.com/genglinliu/PMBench/blob/e1093c470c8981daf522d4ef047a7c3a71e077d7/README.md) mendeskripsikan niat tertunda dan perubahan kondisi dalam simulasi tujuh hari.
- [Simulator/scoring](https://github.com/genglinliu/PMBench/blob/e1093c470c8981daf522d4ef047a7c3a71e077d7/sim/pm_bench.py) menjadi referensi pertanyaan desain, bukan runtime yang diimpor.
- Checkout sumber tidak memiliki LICENSE/COPYING tracked yang terverifikasi. **Jangan salin dataset, simulator, kode, prompt atau trajectory.** Buat kasus sintetis orisinal.
- Agent Core aktual: `SubProject/agent-core-memory/src/memory/experience-types.ts` sudah memiliki obligation active/resolved; `episodes.ts` menyediakan append idempotent/revision guard dan menolak completed dengan obligation aktif; `capsule.ts` mempertahankan obligation wajib dalam budget.
- `controller-session.ts::getTaskContext` dan `controller-protocol.ts` merupakan permukaan existing. Tidak perlu TODO ledger atau engine waktu kedua.
- Manfaat yang diharapkan: niat tetap inspectable saat tugas berlanjut. Risiko: false cue, deadline tanpa timezone, cancellation terlambat. Batas: tidak dapat mengingatkan ketika controller tidak dipanggil; tidak mengklaim real-time scheduling atau general reasoning gain.

## Peta file dan kontrak

Buat `SubProject/agent-core-memory/src/memory/prospective-intentions.ts` untuk codec/evaluator pure dan `tests/memory-prospective-intentions.test.ts`. Integrasikan hanya ke `controller-session.ts`, `experience-types.ts` (output TaskContext saja, bukan persisted WorkingItem schema), `disclosure.ts`, `controller-protocol.ts`, `episodes.ts` bila adapter event memerlukan validasi tambahan, serta `src/mcp/memory-experience-tools.ts` untuk schema facade yang memang dipakai. Store/reducer tetap owner existing.

Envelope disimpan dalam `WorkingItem.text`, prefix tepat `agent-core-intention/v1\n` diikuti JSON strict: `{summary:string,cue:{kind:'at-or-after',instant:string}|{kind:'observed-event',key:string},expiresAt?:string}`. Instant wajib RFC3339 dengan offset; key ASCII panjang 1–120; summary 1–2000 karakter; payload maksimum 4096 byte. Tidak ada ekspresi, regex, code atau natural-language condition parser. Item biasa tanpa prefix tetap obligation biasa; envelope invalid dilaporkan unknown.

## Task 1: Codec dan eligibility deterministik

**Files:** Create helper/test di atas.

**Interfaces usulan:** `encodeIntention(value: ProspectiveIntention): string`; `decodeIntention(text:string): {status:'valid';value:ProspectiveIntention}|{status:'ordinary'|'invalid'}`; `evaluateIntentions(items:readonly WorkingItem[], observation:{now:string;eventKeys:readonly string[]}, limit:number): IntentionEvaluation`.
`IntentionEvaluation={items:Array<{itemId:string;status:'waiting'|'eligible'|'expired'|'resolved'|'unknown'}>;truncated:boolean;advisory:true}`. Maksimum 64 item dievaluasi dan 64 event keys, urut itemId stabil; limit 1–64, overflow input ditolak. Semua input waktu diberikan eksplisit, tanpa Date.now di evaluator.

- [ ] Tulis `time_and_event_cues_are_explicit`: sebelum instant waiting, tepat instant eligible, lewat expiresAt expired; cue tak terlihat waiting; now invalid unknown; obligation biasa tidak ditafsir otomatis.
- [ ] Tulis `malformed_envelope_is_not_executable`: unknown fields, key panjang dan ekspresi ditolak; item resolved tidak eligible; expired menang atas cue yang cocok.
- [ ] RED: `npm test -- tests/memory-prospective-intentions.test.ts`; kegagalan harus karena helper belum tersedia.
- [ ] Implementasikan codec/evaluator pure; ulangi command sampai GREEN. Assertion tambahan: input tidak berubah dan urutan hasil stabil.

## Task 2: Lifecycle pada episode yang sama

**Files:** Extend helper; create `tests/memory-prospective-lifecycle.test.ts`; gunakan owner `episodes.ts` existing, jangan buat persistence baru.

**Interfaces usulan:** `intentionUpsert(itemId:string,value:ProspectiveIntention,sourceRefs:SourceRef[]): WorkingStateChange`; menghasilkan obligation aktif/unverified. Konsumsi `appendEvent({episodeId,expectedRevision,operationId,event})`; pembatalan memakai `stateChanges:[{op:'resolve',itemId,reason,sourceRefs}]`. Reschedule memakai upsert itemId yang sama dengan expectedRevision baru, bukan item kedua.

- [ ] Tulis `cancel_and_reschedule_survive_reopen`: buat intention sintetis, reopen owner, reschedule lalu cancel; evaluasi snapshot terbaru resolved. Snapshot revision lama tidak boleh dipakai untuk action decision baru.
- [ ] Tulis `same_operation_is_idempotent`: replay payload sama duplicate true dan eventCount tetap; operationId sama/payload beda ditolak; revision usang ditolak; completed dengan obligation aktif tetap ditolak.
- [ ] RED: `npm test -- tests/memory-prospective-lifecycle.test.ts`; implementasikan adapter event minimum, lalu GREEN.
- [ ] Tegaskan receipt eligibility tidak menyelesaikan item. Penyelesaian tetap event resolve eksplisit dengan evidenceRefs; cancellation dibedakan melalui reason/event history tanpa enum store baru.

## Task 3: Controller surface, functional evidence dan handoff

**Files:** Modify controller/facade files pada peta; create `tests/memory-prospective-controller.test.ts`; update `docs/CODEBASE.md`, `CHANGELOG.md` dan satu `.changeset/*.md` hanya saat implementasi.

**Interfaces usulan:** Extend input `getTaskContext` secara opt-in dengan `intentions?:{now:string;eventKeys:string[];limit?:number}`; output TaskContext mendapat optional `intentionEvaluation` berisi hasil Task1 + episodeRevision. Samakan schema input/output `disclosure.ts` dan facade/protocol; tanpa field tersebut byte/perilaku jalur lama dipertahankan. Observasi controller hanya cue advisory, bukan trust assertion. Resume controller cukup memanggil surface ini sekali, tanpa hook latar belakang.

- [ ] Tulis `foreign_scope_and_permission_are_unchanged`: scope lain ditolak oleh owner; poisoned key/text tidak menyebabkan tool call; spy tool/provider/scheduler mencatat nol; repeated context call tidak mengubah store.
- [ ] Tulis `budget_and_cancel_are_visible`: obligation kritis tak muat menghasilkan error budget existing; envelope invalid warning; cancellation terbaru tidak muncul eligible; output membawa revision snapshot.
- [ ] RED/GREEN: `npm test -- tests/memory-prospective-controller.test.ts tests/memory-prospective-intentions.test.ts tests/memory-prospective-lifecycle.test.ts tests/memory-v2-host-integration.test.ts`.
- [ ] Setelah implementasi: `npm --prefix SubProject/agent-core-memory run build && npm run build`; jalankan kembali focused tests dari root karena konfigurasi root mengecualikan test dalam SubProject.
- [ ] Rekam functional capture → reopen → context/resume → reschedule → cancel → replay dengan controller native/external scripted. Gunakan Plan05 isolated owners, tanpa model; bukan reproduksi PM-Bench.
- [ ] Buat ZIP laporan lengkap di `reports/memory-reference-adoption/plan18/<run-id>/`, di luar Temp/runtime/tmp. Sertakan source/build identity, test logs/exit, changed-file inventory, event/cue sintetis, status PASS/FAIL/BLOCKED/NOT RUN dan manifest path/size/SHA-256; fresh extraction dan cocokkan hash. Tidak sertakan private Memory/secrets.

## Compatibility, rollback dan integrasi kanonis

Persisted WorkingItem schema tidak berubah; reader lama melihat teks advisory, tanpa mengerti envelope. Field facade opsional tetap memerlukan compatibility tests pada strict clients. Versi dokumen: no product-version change. Implementasi capability baru: usulkan minor intent; jangan menetapkan versi rilis/aktivasi sebelum release workflow.

Rollback hanya codec dan opt-in facade perubahan ini; simpan event/envelope sebagai sejarah yang tetap terbaca dan jangan menghapus obligation untuk memuluskan rollback. Jika old strict client tidak menerima output tambahan, matikan opt-in projection, bukan mengedit private store.

Integrasi mendatang harus mencatat repo `Black-Project-Agent-Core/Agent-Core`, branch yang benar-benar diterbitkan dan SHA publik aktual dari handoff. Fetch branch itu, verifikasi object/SHA dan scoped diff terhadap checkout kanonis; jangan memakai SHA baseline sebagai SHA implementasi. Tidak ada SHA publik berarti BLOCKED untuk integrasi. Inspeksi perubahan lokal hanya pada path beririsan; pertahankan unrelated work, selesaikan konflik beririsan secara selektif; hentikan hanya bila tidak dapat menjaga pekerjaan lokal, tanpa backup/stash/reset atau clean-tree gate. Build/tests lalu verifikasi identitas runtime terpisah bila aktivasi kelak diizinkan; Windows saat ini NOT RUN.

## Self-review dan batas selesai

- [ ] Semua lima Review Focus punya assertion/task; tidak ada timer, store kedua, implicit permission atau condition code.
- [ ] Exact source/license dan interface/schema kompatibel ditinjau; reviewer membedakan eligible, used, verified outcome.
- [ ] Acceptance hanya functional invariants dan ZIP replay; manfaat dunia nyata, scheduling dan deployment tetap belum terbukti.
