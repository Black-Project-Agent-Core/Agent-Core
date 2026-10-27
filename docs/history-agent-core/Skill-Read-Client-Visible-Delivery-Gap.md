# Skill Read: Client-Visible Instruction Delivery
**Tanggal:** 2026-10-24
**Revisi:** 1
**Status:** COMPLETED — 2026-10-25 (diagnosis selesai, perbaikan server tidak diperlukan; diarsipkan 2026-10-25)
**Jenis:** Improvement / MCP delivery reliability
**Source:** user-provided independent 14m47s capability acceptance report; direct read of current Agent Core source; no new tests/build/restart performed by this proposal.
**Path asal:** `docs/proposals/Skill-Read-Client-Visible-Delivery-Gap.md`
**Path arsip:** `docs/history-agent-core/Skill-Read-Client-Visible-Delivery-Gap.md`

## Keputusan pengguna dan scope (catatan penyelesaian)
Pengguna memerintahkan pengerjaan berurutan pada 2026-10-25 ("kerjakan sesuai urutan, tidak perlu di revisi") dan kemudian menyatakan proposal ini tertunda hanya karena asisten keliru menganggapnya membutuhkan sesi ChatGPT, lalu memerintahkan penyelesaiannya. Ini perintah implementasi eksplisit, bukan pesan APPROVE berformat per revisi; dicatat apa adanya. Scope yang dikerjakan: diagnosis terarah pada batas pengiriman `skills(read)` dan perbaikan kecil hanya bila batas yang gagal terbukti. Tidak ada REVISE/HOLD terbuka untuk dokumen ini.

## Hasil penyelesaian (2026-10-25)
| Langkah proposal | Hasil |
|---|---|
| 1. Metadata diagnostik terbatas pada batas pengiriman | Selesai: pada `read` yang berhasil, record aktivitas `SKILLS` kini memuat `basis:'host-prepared'`, skill, source, digest, offset, nextOffset, `contentBytes`, `resultBytes`, `resultSha256` dari teks hasil yang disiapkan; tidak pernah teks instruksi (`src/mcp/skills-tools.ts`, `runtime/tracker/activity.jsonl`). |
| 2. Bandingkan dengan hasil yang terlihat klien dari sesi bound baru | Selesai untuk klien Claude: tiga `read` penuh diterima utuh lengkap dengan digest dan `nextOffset` (`agent-core-capability-index` 6.896 byte, `mind-control` 21.993 byte, `test-driven-development` 18.582 byte). Tidak dapat dilakukan untuk konektor ChatGPT (tidak ada sesi ChatGPT). |
| 3-4. Isolasi lapisan; perbaiki hanya owner yang terbukti | Tiga batas diuji untuk satu `read` yang sama: keluaran service, hasil yang disiapkan, dan respons HTTP `tools/call` mentah terautentikasi cocok (200, satu bagian teks, 7.262 byte, sha256 identik `895334cf…bade2a`, `nextOffset:null`). Tidak ada cacat server atau serialisasi yang terbukti, jadi tidak ada patch pada SkillService/serialisasi. |
| 5. Beri label penghitung host sebagai prepared/host-observed | Selesai sebagai label pada record diagnostik dan dokumentasi; bentuk `skillReads` yang dipersistenkan tidak diubah karena `capability-awareness.ts` dipakai bersama jalur Native. |
| 6. Pertahankan penolakan `SKILL_INSTRUCTIONS_NOT_FULLY_READ` dan tidak ada receipt penggunaan palsu | Dipertahankan; tidak diubah. |

Entri rinci: `docs/CODEBASE.md`, "skills(read) delivery diagnostics and boundary check". Release intent: `.changeset/20261025-skill-read-delivery-diagnostics.md` (patch). Tes: `tests/skill-discovery-tools.test.ts` (tes baru merah dulu, lalu hijau); 34 tes terkait dan `npm run build` lulus.

## Validasi
Core dijalankan ulang secara resmi (pid 23224) dan probe mentah dijalankan pada proses itu; record diagnostik cocok dengan respons mentah. Skill yang dibaca (`mind-control`, `test-driven-development`, `agent-core-capability-index`) diterima utuh oleh klien Claude.

## Keterbatasan yang diterima
- Hasil kosong `{}` yang dilaporkan lewat konektor ChatGPT **tidak direproduksi dan tidak dijelaskan**. Penyebab di sisi konektor atau klien ChatGPT tetap tidak diketahui; tidak ada yang dapat diperbaiki dari sisi server tanpa bukti lapisan yang gagal.
- Tidak ada protokol pengakuan klien yang ditambahkan. Penghitung host tetap menyatakan persiapan, bukan penerimaan; klien yang menerima `{}` tetap dapat dihitung telah membaca oleh host. Opsi (belum diputuskan): meminta bukti penerimaan (misalnya sha256 fragmen) pada receipt; memerlukan keputusan terpisah karena menambah kontrak.
- Bukti memakai satu permintaan terkendali untuk batas mentah; bukan pengujian beban atau semua ukuran fragmen.

## Masalah dan tujuan
SkillService catalog/index PASS (42 valid artifacts; 39 indexed capabilities), but an external controller repeatedly receives `{}` for `skills(action=read)` while `inspect` and `search` return expected data.
The acceptance episode attributed host skill-read byte coverage as 6451/6451 (index), but the client received no instruction envelope or `nextOffset`. This is a discrepancy between server-prepared content and controller-visible delivery, **not** evidence that the agent consumed the instructions.
Goal: deliver a typed, revision-bound, bounded fragment actually visible to the selected external client and eliminate false acceptance based solely on host-side counters; preserve grant/read-before-use contract.

## Evidence and uncertainty
- User report: `skills(read)` client `{}`; host episode `skillReads`: index complete, scientific-critical-thinking 3710/15276, performance 3714/9378, REA 3740/7716 partial; `artifactUses=0`.
- Current `src/skills/service.ts::read()` computes exact text, digest, offset, nextOffset and total; content is bounded by maxBytes.
- `src/mcp/skills-tools.ts` wraps the object into `{content:[{type:'text',text:JSON.stringify(result)}]}`.
- `src/mcp/external-controller-tool-support.ts::externalControllerToolResult()` calls `recordToolOutcome` with the just-created fragment **before** returning the ToolResult to the MCP client.
- `src/learning/external-controller.ts::recordToolOutcome()` invokes `observeSkillRead` and saves `episode.skillReads` during that pre-return stage.
- `tests/skill-discovery-tools.test.ts` and `tests/skill-discovery-observation.test.ts` already assert in-process MCP content is correctly formed and returned, but are not evidence of external ChatGPT connector delivery.
- `src/mcp/result-budget.ts` has a general 256-KiB default for its wrapper, but current `skills` registration is separate from that RDC wrapper; budget exhaustion is not established as the cause.
- The current external controller also returned `{}` for a small 2048-byte fragment from the active index. Do not repeat equivalent probes without changing the hypothesis/boundary.
- Unknown: exact raw `tools/call` response at authenticated network transport vs MCP-to-ChatGPT connector object mapping. Do not conclude a specific faulty layer from internal source alone.

## Proposed mechanism and existing owners
1. Reuse current SkillService + MCP + external Learning owners. Add bounded non-sensitive **diagnostic metadata** at 3 distinct boundaries for one controlled test: output built by `service.read`, ToolResult produced by MCP callback, and raw authenticated transport response. Capture byte length, digest, offset, nextOffset and isError, not full private instruction text.
2. Compare against client-visible invocation result from a fresh bound controller session. The 4th observation is a client-side check that exact content and nextOffset were actually received; do not infer visibility from a server-side counter.
3. If original result is present in raw MCP transport and absent in connector output, isolate/fix the connector translation; do **not** pretend a local SkillService algorithm patch solves it.
4. If the raw MCP response is malformed or empty, patch only the demonstrated server/serialization owner, preserve MCP content-block format, original digest, revision, grants and output limits.
5. Label host counters as *prepared/host-observed* until delivery is acknowledged by a client that actually received content. Only client-confirmed contiguous fragments should qualify as client-read evidence; consider an existing host receipt path before adding a new acknowledgment protocol.
6. Keep Native pairing/Skill reads semantics intact; preserve strict `SKILL_INSTRUCTIONS_NOT_FULLY_READ` refusal for missing/incomplete/digest-changed fragments and no false actual-use receipt.

## Scope and risks
- Task-local diagnosis and smallest owner-specific correction; no new generic transport, store, Memory owner, daemon or unbounded Skill injection.
- No bypass of tool permission, auth, protected dirs, sensitivity filters or connector redaction policy. If host intentionally suppresses content, report that limit and use supported permitted route.
- Maintain `skills(read)` JSON contract and UTF-8 fragment offsets; do not weaken the tool's digest guards or logging safety.
- Separate correctness of delivery from token efficiency, workload performance and independent task-goal improvement; none is proven by a fragment read.

## Acceptance and rollback
- Fresh external session with valid contract+Memory bootstrap. Selected `skills(read)` returns nonempty JSON with exact `name`, `digest`, `content`, `offset`, `nextOffset`, `totalContentBytes` and `delivery` visible to controller; validate byte contiguity to null.
- Host transcript and controller-visible response agree on digest and byte bounds; deliberate empty/unavailable connector result cannot yield a client-read PASS or applied-use receipt.
- Negative tests: initial missing offset; duplicate/out-of-order offset; revision changed; mismatched task/workspace; canceled read; denied tool grant; oversized fragment; no unrelated Skill bulk-loading.
- Existing in-memory MCP tests and targeted external connector test show observed PASS before declaring task DONE; build and resident recheck only within explicit task scope.
- Roll back only the owner-specific patch if delivery regression, false PASS, widened disclosure or Native behavior change occurs. Preserve captured evidence and previous Skill digests.

## Revision history
- Rev 1 (2026-10-24): report-constrained source triage; observed server-before-client attribution; endpoint isolation proposed; no source implementation.
- 2026-10-25: dikerjakan atas perintah pengguna; isi proposal tidak direvisi. Bagian penyelesaian ditambahkan di atas dan dokumen dipindahkan ke arsip.

## Keputusan pengguna sebelum penyelesaian
Draf awal: menunggu APPROVE / REVISE / HOLD / REJECT untuk diagnosis terarah dan perbaikan kecil terpisah bila batas yang gagal terbukti. Markdown itu bukan catatan persetujuan atau hasil tes.

## Sumber bukti penyelesaian
`docs/CODEBASE.md` (entri skills(read) delivery diagnostics); `tests/skill-discovery-tools.test.ts`; `.changeset/20261025-skill-read-delivery-diagnostics.md`; `runtime/tracker/activity.jsonl` (record 2026-10-25T07:28:35Z); Learning checkpoint `skill-read-delivery-diagnostics-20261025` (review `no-new-knowledge`, 2026-10-25T07:29Z).
