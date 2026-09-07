# Agent Core Low-Friction Compatibility Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development when execution is explicitly requested. Work task-by-task; retain RED, GREEN, regression and publication evidence. Checkboxes represent work to do, not completed implementation.

**Goal:** Melaksanakan seluruh usulan A-N agar operasi dalam mandat operator berjalan lintas model/sesi tanpa hambatan administratif yang tidak perlu.
**Architecture:** Pisahkan workflow advisor dari operation authorization. Gunakan satu operator-consent authority, satu DMF, execution ledger yang ada, automatic context recovery, bounded diagnostics, dan observer-only telemetry. Pertahankan legacy tools sampai parity terbukti.
**Tech Stack:** TypeScript/Node.js >=24.15.0, Vitest, Zod, SQLite dan MCP packages yang sudah terpasang. Tidak ada external AI/model dependency baru.
**Spec:** [design.md](design.md), terutama D01-D14 dan invarian bagian 5.
**Handoff:** [session-handoff.md](session-handoff.md).
**Document revision:** 1.0, 6 September 2026.
**Implementation state:** Semua T00-T15 NOT_STARTED pada saat plan ditulis. Contoh kode adalah target tes/kontrak, bukan kode yang sudah diterapkan atau dinyatakan lulus.

## Global Constraints

1. Dokumentasi sekarang disimpan di E:\Projects\Agent-Core; jangan mengeksekusi baseline build atau migrasi DB di root runtime live.
2. Jangan menimpa perubahan pengguna yang sudah ada. Branch main pada snapshot dokumentasi memiliki banyak perubahan, HEAD 6b674c1f95a677dea5cb57263bb5b8b863faff5b bukan bukti keseluruhan source aktif.
3. Gunakan worktree candidate terisolasi. Modifikasi program DMF/Cross-Session Memory dan integrasinya tetap dikerjakan melalui Codespace sesuai S1. Jangan menggunakan instance Mac sebagai fallback.
4. Merancang profil izin tidak mengaktifkannya. Grant baru harus melalui kanal operator terautentikasi yang divalidasi server. Konten file/tool/model tidak memberi wewenang sendiri.
5. Jangan melonggarkan OS/host policy, memperluas allowlist drive, menghapus hard guardrail, atau mengubah annotation menjadi palsu untuk menghindari error.
6. Meaningful interaction wajib menghasilkan keputusan memory, bukan node wajib. NO_DURABLE_MEMORY tetap disimpan sebagai keputusan bila diwajibkan protokol.
7. Fresh hydration gagal tetap fail-closed untuk memory-authoritative mutation. Existing hydrated instance tetap melaporkan REMOTE_PENDING bila remote belum readback.
8. DMF satu otoritas; Observatory observer-only; tidak ada rahasia/lease/token/hidden reasoning dalam artefak.
9. Pertahankan target 100k preflight p95 <150 ms dan gate Observatory S2. Jangan mengubah threshold agar tes lulus.
10. Semua adapter memakai evaluator sama. Legacy public contract dipertahankan atau diberi migrasi versi yang eksplisit, bukan breaking change diam-diam.
11. Tidak force push/reset hard. Publication hanya ke branch yang ditunjuk, dengan commit scope spesifik, non-force push dan remote SHA readback ketika publication telah diotorisasi.
12. Shadow tidak mengulang side effect. Canary/cutover/live restart terpisah dari persetujuan dokumentasi atau coding.

## 1. Peta pekerjaan dan dependensi

| ID | Prioritas | Deliverable | Dependensi |
|---|---|---|---|
| T00 | P0 | Baseline candidate, provenance dan evidence harness | Tidak ada |
| T01 | P0 | Hasil terstruktur + penutupan tugas tanpa frontier wajib | T00 |
| T02 | P0 | Diagnostik terstruktur, route-independent tetapi authenticated | T00,T01 |
| T03 | P1 | Kontrak operasi/effects serta shadow policy evaluator | T00,T01 |
| T04 | P1 | Pisahkan router dari authoritative operation policy | T03 |
| T05 | P1 | Mandat persisten scoped/revocable tanpa mengubah consent lama | T03 |
| T06 | P2 | Preview, context preparation dan bounded recovery | T04,T05 |
| T07 | P2 | Receipt/reconciliation operasi lintas sesi | T01,T05,T06 |
| T08 | P3 | Konflik resource dan isolasi tugas paralel | T07 |
| T09 | P3 | Eksekusi argv/recipe/shell dengan containment terverifikasi | T03,T05,T07,T08 |
| T10 | P4 | Tool facade, adapter parity, skill/host compatibility | T02,T04,T06,T07,T09 |
| T11 | P3 | Action-scoped memory constraints + lifecycle reconciliation | T05,T07,T08; S1 berlaku |
| T12 | P4 | Bounded session bootstrap dan context expansion | T05,T07,T11 |
| T13 | P4 | Friction telemetry dan observer projection | T01,T04,T07,T11 |
| T14 | P4 | Corpus, multiclient, protocol/platform/performance certification | T01-T13 |
| T15 | Release | Shadow/canary/cutover/soak evidence | T14 + persetujuan canary/cutover |

T01, T02 dan T03 dapat dikembangkan berurutan tanpa menunggu seluruh sistem memory selesai. T11 tidak boleh memulai ulang Phase 1 schema v3 dari lampiran; source aktual dan schema live harus diperiksa lebih dulu. Workstream tidak boleh berjalan paralel jika menyentuh file yang sama tanpa ownership dan integration checkpoint.

## 2. Kontrak bersama: hasil pada T01, evaluator pada T03

Lokasi baru: src/operations/types.ts. T01 membuat OperationState, RetryDisposition, OperationReceipt, RecoveryAdvice dan OperationResult untuk envelope awal; T03 menambahkan OperationRequest, VerifiedOperation, Effect, PolicyOutcome dan PolicyDecision. Semua nama berikut adalah API usulan yang dibuat oleh task tercantum, bukan API eksisting. Envelope T01 belum menjanjikan receipt persisten; persistence baru ditambahkan T07.

```ts
export type OperationId = string;
export type OperationState = 'not_started' | 'running' | 'succeeded' | 'failed' | 'unknown';
export type PolicyOutcome = 'allow' | 'deny' | 'approval_required' | 'scope_required' | 'environment_required';
export type RetryDisposition = 'never' | 'after_context_recovery' | 'reconcile_first';
export type Effect = 'read' | 'write' | 'execute' | 'network' | 'publish' | 'delete';
export interface OperationRequest {
  operationId: OperationId;
  kind: string;
  projectId: string;
  workId?: string;
  parameters: Record<string, unknown>;
  expectedResourceHash?: string;
}
export interface VerifiedOperation {
  request: OperationRequest;
  principalId: string; // populated from authentication, never trusted from client JSON
  canonicalResources: readonly string[];
  effects: readonly Effect[];
  inputHash: string;
  policyRevision: string;
  adapterRevision: string;
}
export interface PolicyDecision {
  outcome: PolicyOutcome;
  reasonCodes: readonly string[];
  policyRevision: string;
  constraints: Readonly<Record<string, unknown>>;
}
export interface OperationReceipt {
  operationId: string;
  inputHash: string;
  state: OperationState;
  executionOccurred: boolean | 'unknown';
  memoryState: 'not_required' | 'pending' | 'committed';
  remoteDurability: 'not_required' | 'pending' | 'synced' | 'unavailable';
  evidenceRefs: readonly string[];
}
export interface RecoveryAdvice {
  retryDisposition: RetryDisposition;
  action: 'none' | 'prepare_context' | 'query_receipt' | 'reconcile' | 'request_scoped_approval';
}
export interface OperationResult {
  ok: boolean;
  code: string;
  layer: 'schema' | 'scope' | 'policy' | 'context' | 'transport' | 'execution' | 'memory' | 'publication';
  traceId: string;
  receipt: OperationReceipt;
  recovery: RecoveryAdvice;
  data?: unknown;
}
```

Validator memakai Zod: unknown kind ditolak; operationId/projectId tidak kosong; field berbatas; parameter kind-specific; tidak menerima principal dari parameter sebagai otoritas. inputHash dihitung dari canonical parameters, resource, adapter revision dan work scope; perubahan policy tetap diperiksa terpisah. Paths dan URL dikanonisasi oleh resolver, bukan sekadar lower-case string. Redaction terjadi sebelum output/audit.

Test harness baru di tests/helpers/compatibility-harness.ts dibuat bertahap oleh T03,T05-T13. Harness wajib memanggil evaluator/service produksi yang sebenarnya; hanya clock, OS/process/network, kanal persetujuan test dan transport remote yang boleh diinjeksi. Tidak boleh mengimplementasikan keputusan expected policy dua kali dalam fixture sehingga tes selalu lulus tanpa menguji source.

## 3. Evidence dan checkpoint discipline

Setiap task menghasilkan laporan di reports/low-friction-compatibility/<task-id>/ pada candidate, bukan direktori fixture yang ikut ditemukan Vitest. Laporan merekam task ID, candidate HEAD, scoped diff hash, command, exit code, test counts, waktu, platform, input corpus hash dan limitation.

Urutan wajib:

```text
RED: tes baru gagal karena perilaku yang hendak diubah
GREEN: perubahan minimum -> tes fokus lulus
REGRESSION: suite terkait + build + scoped diff check
REVIEW: scope, consent, isolation dan backward compatibility
CHECKPOINT: simpan evidence, perbarui checkbox dan handoff
PUBLICATION: bila diotorisasi, commit -> non-force push -> fetch -> SHA equality
```

Perintah umum pada candidate yang sudah memiliki dependency sesuai lock:

```text
npm test -- tests/continuity-types.test.ts tests/operation-result.test.ts
npm run build
npm run quality:gate
git diff --check -- src tests plugin/codespace
```

Contoh tes fokus di atas adalah untuk T01; setiap task di bawah menyediakan nama tes konkretnya sendiri. Diff diperiksa pada candidate terisolasi, dengan pemisahan perubahan baseline dan patch task. Jangan menjalankan npm test penuh atau benchmark pada live root. Pre-existing failure hanya boleh diberi label demikian jika dapat direproduksi pada baseline exact input sebelum patch task.

Publication setelah ada otorisasi memakai branch feature/low-friction-compatibility-20260906, bukan main. Review git diff --cached dan gunakan git add dengan file eksplisit yang tercantum dalam task. Jangan git add -A pada working tree pengguna. Signing failure dilaporkan; jangan menyalin workaround unsigned dari laporan historis secara otomatis.

## T00. Baseline candidate dan evidence harness

**Files:** Create tests/fixtures/compatibility/operation-corpus.json dan reports/low-friction-compatibility/T00/baseline.json pada candidate. Read package.json, package-lock.json, src/mcp/tools.ts, src/runtime/route-context-store.ts, src/operator-directives/{types,service,store}.ts, src/continuity/types.ts dan desain ini.
**Consumes:** Source aktual, Git status, existing plan S1/S2.
**Produces:** Candidate dengan provenance terverifikasi; corpus awal; laporan baseline. Tidak ada policy baru aktif.

- [ ] Periksa connector, root, HEAD, branch, dirty paths, worktree, runtime ports, versi manifest/lock dan schema aktual. Jangan membaca secret values.
- [ ] Siapkan worktree bernama .worktrees/low-friction-compatibility-20260906 dari base yang diketahui. Bila source live mempunyai patch yang dibutuhkan, transfer hanya patch yang ditinjau dan direkam checksum-nya; jangan salin seluruh dirty overlay. Bila dependency source belum tersedia pada candidate, catat BASELINE_SOURCE_MISSING dan perbaiki provenance sebelum source work.
- [ ] Untuk perubahan DMF gunakan /workspaces/Agent-Core melalui Codespace sesuai S1. Windows-specific acceptance menggunakan candidate Windows terpisah. Jangan menganggap folder Windows dan Codespace berada pada commit identik.
- [ ] Jalankan baseline berikut; simpan output dan exit code tanpa mengklaim output sudah ada:

```text
git rev-parse HEAD
git status --short --branch
git worktree list --porcelain
npm test -- tests/router-intent-quality.test.ts tests/route-context-store.test.ts tests/continuity-types.test.ts tests/continuity-checkpoint.test.ts tests/operator-directive-service.test.ts tests/mcp-routing.test.ts tests/mcp-dual-era.test.ts tests/mcp-memory-hard-lifecycle.test.ts
npm run build
npm run quality:gate
```

- [ ] Corpus berisi minimal kasus diagnostic approved/denied, mutation in/out scope, stale context, duplicate ID, partial side effect, multilingual equivalent input, same-project parallel tasks dan cross-principal attempt. Expected policy berasal dari mandat fixture yang eksplisit, bukan hasil router lama.
- [ ] Pastikan fixture tidak memuat key, token, raw lease atau absolute secret path. Snapshot hanya metadata versi, hash dan label fixture.
**Acceptance:** Provenance lengkap, baseline terukur, live tidak berubah; setiap kegagalan mempunyai bukti. Tidak memulai T01 bila candidate ternyata source yang berbeda tanpa mapping.
**Commit intent:** test: establish compatibility baseline corpus.

## T01. Result envelope dan natural task completion

**Files:** Create src/operations/types.ts (result types saja pada tahap ini) dan src/mcp/operation-result.ts; modify src/mcp/route-guard.ts, src/continuity/types.ts, src/mcp/continuity-tools.ts; extend tests/continuity-types.test.ts, tests/continuity-checkpoint.test.ts; create tests/operation-result.test.ts.
**Consumes:** Existing errors dan normalizeContinuityCheckpointInput.
**Produces:** makeOperationResult(input: OperationResult): MCP response with structuredContent plus equivalent text; task terminal menerima 0-5 nextCandidates.

- [ ] RED: tambahkan tes berikut ke suite continuity yang sudah ada:

```ts
it('closes a task without declaring its project finished', () => {
  expect(normalizeContinuityCheckpointInput({
    routeContextId: 'route-1', status: 'completed', summary: 'Verified connection',
    projectTerminal: false, nextCandidates: [],
  })).toMatchObject({ status: 'completed', projectTerminal: false, nextCandidates: [] });
});
```

- [ ] RED: operation-result test membuktikan route denial menghasilkan state not_started/executionOccurred false, sedangkan mutationCommitted true menghasilkan receipt succeeded/memory pending dan retry never atau reconcile_first, bukan after_context_recovery.
- [ ] Run: npm test -- tests/continuity-types.test.ts tests/operation-result.test.ts. Failure yang benar: CONTINUITY_FRONTIER_REQUIRED dan API result baru belum ada.
- [ ] GREEN: hilangkan syarat minimum frontier pada task terminal; pertahankan maksimum lima, ownership, status validation, evidence persistence, dan projectTerminal. Tambahkan result mapper; preserve legacy error.code/message/isError fields, jangan mengubah side effect yang sudah committed menjadi kegagalan yang mengundang retry.
- [ ] Run: npm test -- tests/continuity-types.test.ts tests/continuity-checkpoint.test.ts tests/operation-result.test.ts tests/mcp-routing.test.ts, lalu npm run build.
**Acceptance:** Nol kandidat diterima; enam ditolak; task/project status terpisah; old clients masih dapat membaca error; semua outcome mempunyai execution truth yang jelas.
**Commit intent:** feat: separate operation outcome from bookkeeping and optional frontier.

## T02. Bounded authenticated diagnostics

**Files:** Create src/diagnostics/types.ts, src/diagnostics/service.ts, src/mcp/diagnostics-tools.ts, tests/diagnostics-service.test.ts, tests/diagnostics-mcp.test.ts; modify src/mcp/server.ts, src/runtime/services.ts untuk registrasi additive di candidate.
**Consumes:** Authenticated key, configured endpoints/roots, server-owned diagnostic permission; tidak memakai pernyataan aman dari client.
**Produces:** diagnostics_run({ checks, projectId? }) dan runDiagnostics(request, dependencies).

Target request checks enum: service_health, tunnel_readiness, runtime_versions, workspace_access, git_status; array unik maksimum lima. Target result: checks[{check,status,observedAt,evidence,reasonCode}], overallStatus, executedAt. Status: passed, failed, unsupported. Parameter URL/script arbitrer tidak diterima.

- [ ] RED: unit test memakai fixture HTTP server dan injected clock; request service_health mengakses hanya endpoint terkonfigurasi, timeout 8000 ms, response maksimum 65536 bytes, redirect ditolak. Connector test dengan identitas valid dan diagnostic permission bisa berjalan tanpa routeContextId.
- [ ] RED: unauthenticated request ditolak sebelum probe; unknown check ditolak; localhost URL dari client tidak diambil; workspace_access tidak menulis probe file; generic shell tidak dipanggil. Spy process runner harus tetap calls=0 untuk health/runtime/workspace checks.
- [ ] Run: npm test -- tests/diagnostics-service.test.ts tests/diagnostics-mcp.test.ts.
- [ ] GREEN: gunakan os/process metadata dan filesystem metadata APIs; HTTP exact config endpoints; git_status melalui executable terverifikasi dengan argv tetap, pager/hooks/external diff tidak diaktifkan dan environment dibatasi. Jangan expand allowlist global. Permission default mengikuti server config candidate, bukan diberikan ke semua pihak.
- [ ] Primary acceptance assertion di integration harness T00:

```ts
expect(result.checks.map(x => x.status)).toEqual(['passed', 'passed']);
expect(shellCalls).toBe(0);
expect(result.overallStatus).toBe('passed');
```

Variabel result berasal dari panggilan diagnostics_run untuk health+tunnel fixture; shellCalls counter dari runner spy yang diinjeksi, bukan nilai hardcoded.
- [ ] Run fokus di atas + tests/mcp-toolset.test.ts + tests/mcp-integration.test.ts, lalu build.
**Acceptance:** Kasus koneksi yang memicu masalah semula berhasil lewat jalur diagnostik; kondisi endpoint mati menghasilkan failed, bukan data fabricated. Token/secret tidak muncul dalam output.
**Commit intent:** feat: add bounded authenticated diagnostic operations.

## T03. Operation contracts dan shadow evaluator

**Files:** Extend src/operations/types.ts dari T01; create src/operations/registry.ts, src/operations/evaluator.ts, src/operations/resolver.ts; create tests/operation-policy.test.ts dan tests/helpers/compatibility-harness.ts; extend corpus T00.
**Consumes:** Contract bagian 2; authenticated principal; validated server policy snapshot; canonical resource resolver.
**Produces:** verifyOperation(request, auth, registry, policy): VerifiedOperation; evaluateOperation(operation, policy): PolicyDecision. Tahap pertama shadow-only, tidak mengubah keputusan live.

- [ ] RED: unknown operation menghasilkan OPERATION_UNKNOWN; principal dari parameter tidak mengganti auth; URL/path keluar scope ditolak; equivalent operation/mandat berbeda wording menghasilkan decision identik.
- [ ] Test inti:

```ts
const a = harness.evaluate({ kind: 'diagnostics.service_health', wording: 'cek koneksi' });
const b = harness.evaluate({ kind: 'diagnostics.service_health', wording: 'Get service health' });
expect(a).toEqual(b);
expect(harness.evaluate({ kind: 'filesystem.write', resource: 'outside-project' }).outcome).toBe('deny');
```

Harness.evaluate meresolusi actual VerifiedOperation melalui registry/evaluator produksi; wording hanya input advisor dan tidak masuk evaluator. Policy fixture memberi diagnostic allow dan write hanya ke fixture project.
- [ ] Run: npm test -- tests/operation-policy.test.ts.
- [ ] GREEN: definisikan operasi canonical dan effects; evaluator deterministik, default unknown tidak allow; longest/most-specific operator constraints diterapkan tanpa melemahkan explicit deny; reasonCodes berversi. Registry extension tidak otomatis mendapat consent.
- [ ] Run: tests/operation-policy.test.ts + tests/router-intent-quality.test.ts + tests/operator-directive-service.test.ts; build.
**Acceptance:** Bahasa tidak menjadi authority; preview belum mengeksekusi apa pun; shadow mencatat perbedaan bukan mengganti policy.
**Commit intent:** feat: add deterministic operation contract and shadow policy evaluation.

## T04. Pisahkan workflow dari policy

**Files:** Modify src/capabilities/router.ts, route-types.ts, src/runtime/route-context-store.ts, src/mcp/route-guard.ts, src/mcp/workflow-advisor.ts; create tests/router-policy-separation.test.ts; extend tests/mcp-route-enforcement.test.ts.
**Consumes:** evaluateOperation T03 dan mandat yang berlaku pada candidate.
**Produces:** Advisory route plan serta policy binding terpisah. Existing allowedTools dipertahankan untuk legacy projection, bukan authority yang dapat diperluas melalui teks.

- [ ] RED: same operation + same grant + same resource memberikan keputusan sama untuk 20 paraphrase Indonesia/Inggris; teks 'without changing files' tidak membuat operasi write sah bila current task read-only.
- [ ] RED: mengganti deskripsi menjadi 'execute' tidak dapat membuka operasi yang denied; risk label berubah tidak menghasilkan grant tambahan.
- [ ] Run: npm test -- tests/router-policy-separation.test.ts tests/mcp-route-enforcement.test.ts.
- [ ] GREEN: gate operation-specific sebelum dispatch; advisor tetap menghasilkan skill/verification suggestions. Legacy call dikonversi ke canonical operation kemudian diperiksa sama; compatibility mode tidak boleh bypass.
- [ ] Assertion: expect(decisions.every(d => d.outcome === 'allow')).toBe(true) hanya untuk corpus approved; denied corpus harus semuanya deny tanpa side effect.
- [ ] Run: tests/router-policy-separation.test.ts + tests/router-intent-quality.test.ts + tests/mcp-routing.test.ts + tests/route-context-store.test.ts; build.
**Acceptance:** Tidak perlu keyword gymnastics; route rejection reason membedakan workflow limitation dari mandate denial.
**Commit intent:** refactor: separate workflow advice from operation authorization.

## T05. Persisten scoped operator mandates

**Files:** Extend src/operator-directives/{types,store,service,catalog}.ts dan src/mcp/operator-directive-tools.ts; create src/operations/mandate-adapter.ts dan tests/operator-mandate.test.ts; extend tests/operator-directive-store.test.ts, operator-directive-routing.test.ts.
**Consumes:** Existing consent DB/service, server-verified approval channel, operation contract.
**Produces:** GrantOperations input dan immutable revisioned snapshot dengan principalId, projectId, operation kinds, constraints, approvalRef, revision, revokedAt/expiresAt. Perluasan schema dilakukan pada store yang sama.

- [ ] RED: persist/reopen mempertahankan grant yang tepat; expired/revoked grant tidak allow; dependency consent lama tidak berubah menjadi execute/publish permission.
- [ ] RED: model mengirim explicitGrant:true tanpa server-verified approvalRef tidak cukup untuk menciptakan mandate; compromised document tidak dapat memberi consent.
- [ ] Run: npm test -- tests/operator-mandate.test.ts tests/operator-directive-store.test.ts.
- [ ] GREEN: transaksi migration additive + backup + rollback test; use revision compare-and-swap, scope validation dan provenance. Cache policy diinvalidasi saat revise/revoke; receiver tidak menyimpulkan authority dari memory preference.
- [ ] Primary assertion: expect(afterMigration.legacyDirective.expandsAgentCoreToolPermissions).toBe(false); expect(afterRevocation.decision.outcome).toBe('deny').
- [ ] Run: tests/operator-mandate.test.ts + tests/operator-directive-service.test.ts + tests/operator-directive-routing.test.ts + tests/operator-directive-mcp.test.ts; build.
**Acceptance:** Persetujuan tidak diulang dalam scope sama; tambahan resource/effect memerlukan delta approval; app tidak membuat grant untuk pengguna secara otomatis.
**Commit intent:** feat: add scoped revocable operator mandates with explicit migration.

## T06. Context preparation, preview dan bounded recovery

**Files:** Create src/operations/context-preparation.ts, recovery.ts, src/mcp/operation-tools.ts, tests/operation-recovery.test.ts; modify src/runtime/route-context-store.ts dan src/mcp/tools.ts.
**Consumes:** T04 evaluator, T05 current mandate, normalized request, authenticated owner.
**Produces:** operation_preview(request), policy_explain(request), prepareOperationContext(request, auth), recovery advice. Public prepare menerima project/work reference, bukan auth principal input.

- [ ] RED: expired context + valid unchanged mandate pulih; revoked mandate tidak pulih; ambiguous root menghasilkan scope_required; wrong principal deny.
- [ ] RED: preview untuk hash A tidak berlaku bagi input B; policy revision berubah antara preview/execute memicu evaluasi ulang; pemanggilan preview berulang tidak memanggil execution runner. Pencegahan duplicate dispatch persisten menjadi tanggung jawab T07.
- [ ] Run: npm test -- tests/operation-recovery.test.ts.
- [ ] GREEN: server resolve exact project/work, retrieve current mandate, create fresh lease; maksimal satu context repair. execution dispatcher tetap revalidate sebelum side effect. Unknown outcome diarahkan query/reconcile, tidak auto retry.
- [ ] Test inti: expect(allowedStaleRoute.recoveryCount).toBe(1); expect(revoked.runnerCalls).toBe(0); expect(ambiguous.code).toBe('SCOPE_REQUIRED').
- [ ] Run: tests/operation-recovery.test.ts + tests/workspace.test.ts + tests/route-context-store.test.ts + tests/mcp-route-enforcement.test.ts; build.
**Acceptance:** Administrative renewal bukan authority expansion; legacy explicit route tetap bekerja sesuai kebijakan.
**Commit intent:** feat: recover operation contexts within existing mandates.

## T07. Operation receipt dan rekonsiliasi

**Files:** Extend src/execution/{types,service,store}.ts setelah memeriksa schema aktual; create src/execution/operation-receipts.ts, src/operations/reconciliation.ts, tests/operation-receipt.test.ts; modify src/mcp/memory-lifecycle-guard.ts untuk hasil parsial yang jujur.
**Consumes:** operationId/inputHash/owner/resource, execution evidence, existing lifecycle states.
**Produces:** getOperationReceipt(operationId, owner), reserveOperation, recordOutcome, reconcileOperation. Store receipt terikat execution ledger; tidak membuat DB memory pesaing.

- [ ] RED: dua concurrent identical submissions hanya satu reservation/dispatch; ID reused berbeda hash memberi OPERATION_ID_CONFLICT; receipt tidak dapat dibaca principal lain.
- [ ] RED: side effect committed lalu memory marker gagal -> succeeded + pending; crash before receipt -> unknown; restart tidak menjalankan ulang unknown secara buta.
- [ ] Run: npm test -- tests/operation-receipt.test.ts.
- [ ] GREEN: unique owner/project/operation identity, atomic reservation, durable transition log, output/evidence bounds. Reservation yang yatim tidak disimpulkan belum dijalankan; reconcile memakai postcondition atau operator review. Metadata receipt yang dibutuhkan lintas instance mengikuti remote memory/continuity protocol S1 tanpa plaintext secret.
- [ ] Test inti: expect(duplicate.dispatchCount).toBe(1); expect(partial.receipt.state).toBe('succeeded'); expect(partial.receipt.memoryState).toBe('pending'); expect(crash.receipt.state).toBe('unknown').
- [ ] Run: tests/operation-receipt.test.ts + tests/execution-mcp.test.ts + tests/execution-memory-bridge.test.ts + tests/mcp-memory-hard-lifecycle.test.ts; build.
**Acceptance:** Tidak mengklaim exactly-once universal; explicit unknown state dan recovery tersedia; output hilang tidak memicu publikasi ganda.
**Commit intent:** feat: persist operation receipts and reconcile uncertain outcomes.

## T08. Resource concurrency dan session isolation

**Files:** Create src/operations/resource-lease.ts, tests/operation-concurrency.test.ts; modify src/runtime/filesystem.ts, src/continuity/store.ts dan src/mcp/project-scope.ts pada candidate.
**Consumes:** T07 receipts, workId, canonical path, expectedResourceHash.
**Produces:** acquireResourceLease/releaseResourceLease, writeIfVersionMatches. Lock lease mengikat owner/work/resource/generation, bukan hanya PID.

- [ ] RED: dua writer berbasis hash sama menghasilkan satu successful commit dan satu RESOURCE_CONFLICT; independent resource tidak saling menunggu; cross-principal read/write denied.
- [ ] RED: pending task A tidak memblokir diagnostic task B; task B tidak dapat mengambil lease A hanya karena memakai key yang sama tanpa work ownership yang berlaku.
- [ ] Run: npm test -- tests/operation-concurrency.test.ts.
- [ ] GREEN: bounded lease, generation/fencing validation, transactional compare-and-swap dan atomic replacement sesuai platform. Lakukan revalidation canonical resource/symlink dan content hash tepat sebelum commit; jangan menganggap lexical path prefix cukup.
- [ ] Test inti: expect(results.filter(r => r.code === 'RESOURCE_CONFLICT')).toHaveLength(1); expect(independent.blockedCount).toBe(0).
- [ ] Run: tests/operation-concurrency.test.ts + tests/workspace.test.ts + tests/filesystem-tools.test.ts + tests/continuity-resume.acceptance.test.ts; build.
**Acceptance:** Tidak lost update, tidak global task lock, lease salah/expired tidak memperbolehkan stale writer.
**Commit intent:** feat: isolate work sessions and fence concurrent resource writes.

## T09. Recipe/argv/shell adapters dengan containment

**Files:** Create src/operations/command-adapter.ts, environment-policy.ts dan tests/operation-environment.test.ts; modify src/execution/runner.ts, src/runtime/services.ts, src/mcp/tools.ts.
**Consumes:** VerifiedOperation, current mandate, resource lease, OS capability report.
**Produces:** executeVerifiedOperation(operation, environment): OperationReceipt; supportsRecipe, supportsArgv, supportsIsolatedShell capability flags. Jenis environment nyata dan versi dicatat pada receipt.

- [ ] RED: recipe health tidak masuk shell; argv mempertahankan argumen ber-spasi tanpa string concatenation; executable dalam workspace yang meniru nama tool tidak dipilih; inherited environment tidak membocorkan credential.
- [ ] RED: sandbox unavailable menghasilkan environment_required/ENVIRONMENT_UNSUPPORTED dan dispatch=0; network disabled benar-benar mencegah outbound; command di dalam containment gagal menulis sentinel di luar root.
- [ ] Run: npm test -- tests/operation-environment.test.ts.
- [ ] GREEN: adapter recipe menggunakan operasi tetap; argv memakai executable tervalidasi dan shell:false; shell umum memerlukan mandate execute serta environment capability yang dibuktikan. Paket dependency memakai existing consent dengan target/install scope jelas; tidak memperlakukan npm test/build/install sebagai read-only. OS isolation probe dan sentinel acceptance harus nyata pada platform yang disertifikasi.
- [ ] Test inti: expect(unsupported.runnerCalls).toBe(0); expect(escape.outsideSentinelChanged).toBe(false); expect(cleanEnv.secretNamesForwarded).toEqual([]).
- [ ] Run: tests/operation-environment.test.ts + tests/process-tools.test.ts + tests/process-governance.test.ts + tests/execution-mcp.test.ts; build. Jalankan platform acceptance hanya pada candidate yang sudah disetujui, tidak pada sandbox palsu yang hanya mengecek cwd.
**Acceptance:** Tidak ada silent fallback ke host shell; batas benar-benar diuji; setiap unsupported platform tetap memiliki diagnostik yang jujur.
**Commit intent:** feat: execute approved operations through verified environment adapters.

## T10. Unified entry points, legacy compatibility dan skill boundaries

**Files:** Modify src/mcp/{tools,execution-tools,github-tools,langflow-tools,subagentcore-tools,capability-tools,server,handler}.ts; create src/operations/tool-mapping.ts, tests/operation-entrypoint-parity.test.ts; extend tests/mcp-toolset.test.ts, mcp-dual-era.test.ts. Untuk Codespace, integration seam berada di plugin/codespace/src/{mcp-server,commands,processes,memory-lease,shared-memory-tools}.ts setelah source baseline diverifikasi.
**Consumes:** T02 diagnostics, T04 evaluator, T06 context preparation, T07 receipts, T09 adapter.
**Produces:** Mapping deterministik setiap public tool+operation ke canonical operation. Legacy dan facade baru memanggil evaluator/dispatcher yang sama.

- [ ] RED: parametrize tiap entry point dengan approved, denied dan missing-scope fixtures. Dispatch spy hanya terpanggil untuk approved; routeContextId yang stale tidak membuka jalur alternatif; generic GitHub/HTTP atau subagent tidak melewati mandat.
- [ ] RED: legacy result text dan structuredContent baru menyatakan data sama; safe/default input tidak diam-diam diubah menjadi operasi lain. Skill recommendation yang gagal dimuat tidak memblokir diagnostik; safety prerequisite yang benar-benar wajib tetap diberi predicate server.
- [ ] Run: npm test -- tests/operation-entrypoint-parity.test.ts tests/mcp-dual-era.test.ts tests/mcp-toolset.test.ts.
- [ ] GREEN: audit seluruh enumerasi tool; adapter memetakan operasi, resource, effect dan receipt. Hindari dua dispatcher yang kebijakannya berbeda. Pertahankan explicit-route client path dan error code legacy bila dibutuhkan; field additive diberi contractVersion.
- [ ] Tambahkan metadata runtimeToolManifestHash dan clientObservedManifestHash bila client mendukung pelaporan. Server tidak mengklaim mengetahui tool host yang tidak diekspos. Protocol capability detection sesuai paket lock; unsupported negotiation dilaporkan eksplisit.
- [ ] Test inti: expect(allEntryPoints.map(p => p.deniedDispatchCount)).toEqual(allEntryPoints.map(() => 0)); expect(parsedText).toEqual(structuredContent).
- [ ] Run: tests/operation-entrypoint-parity.test.ts + tests/mcp-sdk-v2-contract.test.ts + tests/mcp-integration.test.ts + tests/github-mcp.test.ts + tests/subagentcore-mcp.test.ts; npm run build. Untuk plugin Codespace jalankan npm run build:codespace pada candidate, lalu suite plugin yang diverifikasi dari package-nya.
**Acceptance:** Tidak ada tool facade sebagai bypass; anotasi tidak menipu host; daftar kompatibilitas memisahkan runtime, host, model dan platform. Branding Codespace tetap terpisah, tidak diganti menjadi Agent Core Codespace.
**Commit intent:** feat: unify operation policy across legacy and modern entry points.

## T11. Action-scoped memory constraints dan pending recovery

**Files:** Modify src/memory/{types,preflight,meaningful-work,service}.ts, src/mcp/memory-lifecycle-guard.ts, src/runtime/route-context-store.ts, src/continuity/store.ts; create src/memory/guardrail-applicability.ts dan tests/memory-operation-policy.test.ts; extend tests/mcp-memory-hard-lifecycle.test.ts, tests/memory-unified-lifecycle.test.ts.
**Consumes:** Existing authoritative DMF, accepted hard constraints/provenance, canonical operation/work/resource, hydration state.
**Produces:** evaluateGuardrailApplicability(guardrail, operation) dengan result applies, does_not_apply, unresolved; reconcilePendingForWork(workId, operation) yang memakai ledger yang ada. Implementasi task ini melalui Codespace sesuai S1.

- [ ] RED: reporting constraint 'jangan klaim semua tes lulus' tidak menolak read/diagnostics; destructive constraint untuk folder tertentu menolak deletion folder tersebut tetapi tidak menolak membaca source lain.
- [ ] RED: lexical recall saja tidak memberi executable predicate; legacy hard constraint unresolved tidak otomatis dihapus; explicit applicable deny tetap menahan operasi. Tidak ada kenaikan wewenang dari memory item.
- [ ] RED: pending postflight work A direkonsiliasi sebelum meaningful mutation terkait; independent diagnostic work B tetap tersedia; fresh unhydrated instance tidak membuat root baru saat remote unavailable; hydrated outage tetap remote pending.
- [ ] Run: npm test -- tests/memory-operation-policy.test.ts tests/mcp-memory-hard-lifecycle.test.ts.
- [ ] GREEN: typed rule applicability dengan subject/resource/effect/provenance dan revision; migrasikan record hanya bila mapping dapat dibuktikan, simpan history dan unresolved state. Pemetaan hard constraint bukan dilakukan dashboard/model secara sepihak. Server reconcile technical evidence, tetapi semantic decision tetap mengikuti controller DMF dan source authority.
- [ ] Test inti: expect(reportingOnly.readAllowed).toBe(true); expect(applicableDelete.denied).toBe(true); expect(freshRemoteFailure.newRoots).toBe(0); expect(hydratedOutage.remoteDurability).toBe('pending').
- [ ] Run: tests/memory-operation-policy.test.ts + tests/memory-routing.test.ts + tests/memory-preflight.test.ts + tests/memory-unified-lifecycle.test.ts + tests/memory-quality.test.ts + tests/memory-recovery.test.ts; build dan quality:gate.
**Acceptance:** Satu DMF, tanpa duplicate memory authority; false global blockers berkurang tanpa menghilangkan hard constraints; keenam postflight decisions tetap ada; causal/revision/conflict history utuh.
**Commit intent:** feat: apply memory constraints to relevant operations and reconcile task postflight.

## T12. Session bootstrap dan bounded recall

**Files:** Create src/mcp/session-bootstrap.ts, tests/session-bootstrap.test.ts; modify src/mcp/memory-injection.ts, src/memory/preflight.ts, src/continuity/snapshot.ts. Tidak membuat retrieval engine baru.
**Consumes:** Current project/mandate revision, health, relevant current memory, existing remember_more API yang diverifikasi dari source.
**Produces:** session bootstrap projection: contractVersion, workId, projectId, health, mandateSummary, currentDecisions, relevantFailures, contextBudget, omittedCategories, truncated dan bounded expansion references.

- [ ] RED: output <=8000 karakter pada fixture besar; kategori omitted dilaporkan; same fact tidak tercetak berulang dalam beberapa blok; expired historical state tidak mengalahkan evidence state terkini yang sudah diterima.
- [ ] RED: bootstrap tidak memuat secret/raw lease/principal internal ID yang tidak diperlukan; omitted guardrail tetap diberlakukan oleh server. Ketika memory degraded, response menyatakan degraded, bukan empty.
- [ ] Run: npm test -- tests/session-bootstrap.test.ts.
- [ ] GREEN: deterministic ordering/deduplication pada projection saja; jangan menghapus node/history. remember_more mempertahankan batas S1 default maxHops2, maxItems4 dan additional characterBudget6000 kecuali spesifikasi authoritative terbaru membuktikan perubahan yang disetujui.
- [ ] Test inti: expect(JSON.stringify(projection).length).toBeLessThanOrEqual(8000); expect(projection.truncated).toBe(true); expect(serverApplicableGuardrails).toEqual(beforeProjectionApplicableGuardrails).
- [ ] Run: tests/session-bootstrap.test.ts + tests/mcp-memory.test.ts + tests/memory-preflight.test.ts + tests/continuity-snapshot.test.ts; build.
**Acceptance:** Sesi baru mempunyai konteks minimum yang berguna dan tahu cara mengambil detail; tidak mengarang memory atau mengurangi server-side policy.
**Commit intent:** feat: provide bounded versioned session context projection.

## T13. Friction telemetry dan observer-only projection

**Files:** Create src/observability/friction-metrics.ts, tests/friction-metrics.test.ts; modify src/observability/tool-instrumentation.ts, src/runtime/health-metrics.ts dan src/mcp/workflow-advisor.ts. Adapter UI Observatory dilaksanakan pada branch/source S2 setelah plan aktual tersedia; tidak mengarang status implementasinya.
**Consumes:** PolicyDecision, OperationResult, server-side event sequence dan labelled corpus verdict.
**Produces:** counters authorized_operation_false_denial, redundant_approval_request, context_recovery_success, duplicate_execution_prevented, client_contract_mismatch, plus bounded reasonCode breakdown dan evidence trace refs.

- [ ] RED: policy deny tidak otomatis dihitung false denial; hanya comparison terhadap expected/operator-reviewed label dapat menghasilkan false-denial metric. Enforced denial, host approval, schema error dan transport error tidak dicampur.
- [ ] RED: observer exception/backpressure tidak menggagalkan operasi; repeated event sequence tidak menggandakan counter; telemetry tidak membawa raw parameters/credentials.
- [ ] Run: npm test -- tests/friction-metrics.test.ts.
- [ ] GREEN: per-event counters, bounded labels (hindari operationId/path sebagai high-cardinality metric labels), durable event reference, queue bound dan dropped counter eksplisit. WorkflowAdvisor memberi proposedNext hanya yang authorized; tidak menciptakan operasi otomatis baru.
- [ ] Test inti: expect(unreviewedDenial.falseDenialCount).toBe(0); expect(observerCrash.operationState).toBe('succeeded'); expect(duplicateEvent.countDelta).toBe(1).
- [ ] Run: tests/friction-metrics.test.ts + tests/health-metrics.test.ts + tests/audit-journal.test.ts; build.
**Acceptance:** Observatory tetap observer, audit fakta tidak animasi tebak-tebakan. Gangguan UI tidak memblokir core; dropped data terlihat, tidak disembunyikan.
**Commit intent:** feat: measure authorization friction without coupling observers to execution.

## T14. End-to-end contract dan performance certification

**Files:** Create tests/compatibility-acceptance.test.ts, tests/compatibility-recovery.acceptance.test.ts, scripts/certify-compatibility.mjs; extend tests/fixtures/compatibility/operation-corpus.json, tests/mcp-multiclient-review.test.ts; create reports/low-friction-compatibility/T14/matrix.json sebagai output certification.
**Consumes:** T01-T13 pada exact candidate SHA/diff hash, policy fixture revision, authentic client/platform instances bila tersedia.
**Produces:** Certification matrix dengan states PASS, FAIL, NOT_TESTED, UNSUPPORTED. Tidak mengubah NOT_TESTED menjadi PASS.

- [ ] RED: corpus approved/denied, 20 equivalent descriptions untuk tiap approved operation family, stale-context renewal, revocation, schema errors, leaked/guessed handles, idempotency conflict, post-commit failure, same-resource conflict, fresh hydration failures, observer crash dan legacy parity.
- [ ] RED: candidate process restart memulihkan known receipt; unknown receipt hanya reconciliation. Dua SDK clients bukan pengganti dua chat host nyata.
- [ ] Run: npm test -- tests/compatibility-acceptance.test.ts tests/compatibility-recovery.acceptance.test.ts tests/mcp-multiclient-review.test.ts.
- [ ] GREEN: perbaiki root cause pada module terkait dengan RED tambahan; jangan membuat test runner special-case yang selalu mengembalikan PASS. Script certification menggabungkan exit codes, counts, hashes, platform dan limitations; negative/unsupported tests tetap dibedakan.
- [ ] Jalankan final candidate gates:

```text
npm run build
npm test -- tests/compatibility-acceptance.test.ts tests/compatibility-recovery.acceptance.test.ts tests/mcp-dual-era.test.ts tests/mcp-route-enforcement.test.ts tests/memory-quality.test.ts
npm run quality:gate
npm run benchmark:memory
node scripts/certify-compatibility.mjs
git diff --check
```

Periksa benchmark-memory.mjs menerima konfigurasi jumlah memory yang sesuai sebelum menjalankan; certification report wajib membuktikan 100000 active items, bukan menyebut target lulus dari ukuran data yang lebih kecil. Benchmark dilakukan pada candidate environment terukur.
- [ ] Matrix rows minimal: legacy SDK, modern SDK, actual ChatGPT session, actual two-chat test, Codespace bridge, Windows candidate, Linux candidate. Model/provider lain boleh NOT_TESTED; tidak memerlukan paid provider calls tanpa izin biaya.
**Acceptance targets:** False denial approved corpus 0; unauthorized acceptance 0; repeated same-hash duplicate dispatch 0 setelah reservation berhasil; cross-principal/project contamination 0; hidden gaps 0; preflight p95 <150 ms pada 100k memory. Untuk remote external side effects, unknown dicatat, bukan klaim exactly-once.
**Commit intent:** test: certify low-friction operation compatibility and recovery.

## T15. Shadow, canary dan controlled cutover

**Files:** Create docs/low-friction-compatibility-runbook.md dan reports/low-friction-compatibility/T15/release-gate.json pada candidate; perbarui hanya candidate startup config yang benar-benar diperlukan setelah review. Tidak mengubah launcher live selama gate belum terbuka.
**Consumes:** Exact T14 evidence, approved scope/ports, rollback package, owner-approved canary dan kemudian separate live-cutover consent.
**Produces:** State progression SHADOW_IMPLEMENTED -> SHADOW_STABLE -> ADVISORY_CANARY_STABLE -> ENFORCED_CANARY_STABLE -> CUTOVER_READY -> LIVE_CUTOVER -> SOAK_VERIFIED.

- [ ] RED rehearsal: kegagalan observer, policy store, process restart, token revocation, stale receipt dan remote outage menghasilkan state/fallback yang didefinisikan; shadow must not double execute writes.
- [ ] Shadow default memakai port 8865 (Agent Core) dan 39765 (Codespace candidate) bila kosong, Observatory 3697 tetap privat sesuai S2. Bila port terpakai, hentikan startup dan laporkan konflik; jangan membunuh proses yang tidak dimiliki atau memilih port publik diam-diam.
- [ ] Jalankan advisory replay terhadap labelled events tanpa side effects. Setelah izin canary, operasikan workload nyata yang dibatasi dan rekam operation receipts. Pisahkan test traffic dan pekerjaan pengguna.
- [ ] Rollback mengembalikan adapter/config candidate-versus-live yang telah dicatat; tidak menghapus DB, mundurkan grant, menyalin snapshot auth lama, atau replay operasi committed. Revocation terbaru wajib tetap dihormati.
- [ ] Report CUTOVER_READY hanya jika T14 dan rehearsal lulus. Live switch tetap membutuhkan persetujuan operator eksplisit; coding/plan completion tidak memberi izin tersebut.
- [ ] Setelah approved switch, lakukan health/diagnostic/read-only check, operation canary yang disetujui, dan observasi dengan window serta workload yang dicatat sebelum mulai. Soak evidence harus mencantumkan jam mulai/akhir, jumlah request, failures dan limitations; tidak mengklaim observasi berlangsung di background dari chat yang sudah selesai.
**Acceptance:** Scope cutover terbukti, rollback preserves authority/evidence, dan stability claim hanya untuk matrix yang diuji.
**Commit intent:** docs: publish compatibility operating and controlled cutover runbook.

## 4. Traceability seluruh usulan sebelumnya

| Usulan chat | Desain | Task implementasi | Bukti penerimaan |
|---|---|---|---|
| A Workflow terpisah dari izin | D01 | T03,T04,T10 | Paraphrase parity dan entrypoint policy parity |
| B Izin persisten | D02 | T05 | Reopen/revoke/delta approval dan migration tests |
| C Operation/effect registry | D03 | T03,T04,T09 | Parameter/resource canonicalization dan effect tests |
| D Diagnostic langsung | D04 | T02 | HTTP health+tunnel fixture, no generic shell |
| E Terminal yang tepat | D05 | T09 | Argv quoting, real containment, unsupported fallback |
| F Konteks otomatis | D06 | T06 | Stale lease repair tanpa authority expansion |
| G Recoverable errors | D07 | T01,T06 | Structured layer/retry/result contract |
| H Eksekusi vs bookkeeping | D08 | T07 | Partial commit receipt, query/reconcile, no blind retry |
| I Lintas sesi/konkurensi | D09 | T07,T08 | Resume authorization, fencing, independent tasks |
| J Memory membantu | D10 | T11 | Applicable hard constraints, hydration, pending recovery |
| K Natural closure/skill | D11 | T01,T10 | Zero-frontier closure, actual safety predicate |
| L Client/model/platform | D12 | T10,T14 | Honest supported/not-tested matrix |
| M Context ringkas | D13 | T12 | Bounds, omission notice, server rules unchanged |
| N Friction/Observatory | D14 | T13,T14 | Labelled false denial dan observer isolation |

## 5. Hubungan dengan plan lama

Paket ini adalah companion plan, bukan pengganti S1/S2. Old memory phases tidak dinomori ulang atau dihapus. T11 baru boleh memodifikasi perilaku memory sesudah status fase source terkini diverifikasi. Klaim Phase 1 belum mulai dan target schema v3 pada lampiran tidak digunakan sebagai baseline live schema4.

Plan Observatory lama tetap memegang UI, SSE replay, graph convergence, remote visualization dan 19 task-nya. T13 hanya menambahkan event/metric contract; integrasi UI menempel ke source S2 yang aktual. Jangan memaksa UI yang belum tersedia menjadi dependency P0-P2.

Portable Self-Healing Runtime menangani relocation/launcher. Plan baru tidak memerintahkan relocation, menghapus durable state, atau membuat launcher kedua. UI plugin Codespace tetap identitas terpisah.

## 6. Status, risiko yang harus diverifikasi, dan resume

Saat paket ditulis: dokumentasi baru; zero new production code; zero new tests run; no build; no active policy changes; no commit/push of this package. Existing dirty changes tidak diakui sebagai hasil task ini.

Hal-hal yang memang memerlukan bukti lapangan, bukan asumsi: base candidate yang memuat patch aktif; lingkungan OS isolation yang benar-benar tersedia; exact registered transport/toolset pada host; availability remote S2 branch; two-chat concurrency; remote durability; benchmark dataset size. Setiap hal mempunyai task pemilik T00,T09,T10,T14 atau T15, bukan pekerjaan yang dibiarkan tanpa penanggung jawab.

Langkah berikutnya setelah user meminta implementasi: baca session-handoff.md, verifikasi lokasi/hash/branch, masuk T00, lalu T01 RED. Tidak perlu mengulang brainstorming A-N. Jangan mengawali dari migrasi schema memory historis, menonaktifkan routing guard, atau restart live runtime.
