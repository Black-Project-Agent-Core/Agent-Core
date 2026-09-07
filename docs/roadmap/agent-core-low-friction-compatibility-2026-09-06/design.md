# Agent Core Low-Friction Compatibility Design

Tanggal: 6 September 2026 (Asia/Jakarta)
Versi dokumen: 1.0
Status: DESIGN_DOCUMENTED; belum diimplementasikan atau diaktifkan.

## 1. Tujuan dan batas persetujuan

Ubah Agent Core dari prosedur izin yang harus dihafal model menjadi alat yang mengurus konteks dan pemulihan administratif untuk model. Operasi yang sudah berada dalam mandat operator harus berjalan tanpa konfirmasi berulang. Variasi model, bahasa, panjang prompt, dan pergantian sesi tidak boleh mengubah wewenang untuk operasi yang sama.

Dokumen ini membakukan usulan A-N dalam percakapan setelah investigasi ROUTE_TOOL_NOT_ALLOWED. Persetujuan menyusun plan bukan pemberian izin shell tanpa batas, aktivasi mandat baru, persetujuan mengubah kebijakan live, atau izin cutover. Implementasi dilakukan per task setelah instruksi pelaksanaan; cutover memerlukan persetujuan terpisah.

Rencana kerja: [implementation-plan.md](implementation-plan.md).
Titik masuk sesi baru: [session-handoff.md](session-handoff.md).

## 2. Evidence register dan status historis

[E1] Panggilan Agent Core pada sesi dokumentasi ini melaporkan v0.7.0, Node v24.18.0, OAuth2, memory schema 4, memory/execution healthy. Ini snapshot, bukan sertifikasi jangka panjang.

[E2] Inspeksi Git pada 2026-09-06T04:12:34+07:00: root E:\Projects\Agent-Core, branch main, HEAD 6b674c1f95a677dea5cb57263bb5b8b863faff5b. Working tree memiliki banyak perubahan tracked dan untracked yang mendahului penulisan paket ini. HEAD tidak merepresentasikan seluruh source aktual. Tidak dilakukan fetch atau verifikasi remote pada tugas dokumentasi ini.

[E3] src/capabilities/router.ts dan src/capabilities/route-types.ts: allowedTools dibentuk dari klasifikasi teks tugas. READ_ONLY_SIGNAL berisi get; kelompok ATOMIC_READ_TOOLS tidak memiliki execute_command. Kontrak RoutePlan mencampur rekomendasi workflow dengan daftar tool yang diizinkan.

[E4] src/runtime/route-context-store.ts, dibaca pada pemeriksaan sebelumnya dalam percakapan ini: validate memeriksa nama tool; konteks disimpan dalam Map dengan TTL default 30 menit. Pemeriksaan terbaru sebelum coding wajib dilakukan karena working tree aktif berubah.

[E5] src/operator-directives/types.ts dan service.ts dibaca pada sesi dokumentasi: mekanisme yang ada memiliki grant/revise/revoke dan snapshot hash. Kontrak saat ini memakai scope principal_global serta expandsAgentCoreToolPermissions:false. Jangan diam-diam mengubah arti consent lama menjadi izin operasi baru.

[E6] tests/continuity-types.test.ts dibaca pada sesi dokumentasi: normalizeContinuityCheckpointInput menolak tugas terminal dengan kurang dari dua kandidat kecuali projectTerminal=true. Perubahan yang diusulkan harus memperbarui tes tersebut, bukan hanya mengabaikan error di client.

[E7] src/mcp/tools.ts, memory-lifecycle-guard.ts, workflow-advisor.ts dan handler.ts dibaca sebelumnya dalam percakapan: sudah ada operational guard, mode advisory/enforce, indikasi mutationCommitted, proposedNext, dan jalur protokol lama/modern. Perlu diperluas, bukan dibuat otoritas paralel.

[E8] package.json dibaca pada sesi dokumentasi: Node >=24.15.0; TypeScript, Vitest, Zod; MCP server/node/client 2.0.0 pada manifest yang dibaca. Build adalah tsc -p tsconfig.json; npm test menjalankan vitest run. Jangan melakukan upgrade dependency hanya untuk melaksanakan plan ini.

[S1] Lampiran Agent-Core-Cross-Session-Memory-Nervous-System-Handoff(2).md: spesifikasi memory terpisah, khususnya bagian 1, 3, 7-10, 17-24, 32-34, 54-58. Catatan schema v2 menuju v3, SHA, branch, dan status Phase 1 di lampiran adalah checkpoint historis. Jangan menurunkan schema live 4 menjadi 3 atau menyatakan semua fase masih belum dikerjakan berdasarkan lampiran itu.

[S2] Lampiran Memory Observatory.txt: plan Observatory + Shadow Mode, 19 task, observer-only, port privat, replay faktual, shadow/canary/cutover berjenjang. Klaim publikasi commit ec08a53d82374dc433f784c1f0ec658e27d5d232 berasal dari lampiran, belum diverifikasi ulang dalam tugas ini. File Observatory tersebut tidak terlihat pada listing docs/roadmap lokal yang diperiksa; ambil branch yang benar sebelum mengubahnya.

[S3] Plan lokal terkait yang sudah ada: ../agent-core-cross-session-memory-nervous-system-design.md; ../agent-core-cross-session-memory-nervous-system-implementation-plan.md; ../agent-core-memory-nervous-system-phase-1-implementation-plan.md sampai phase-7; ../agent-core-portable-self-healing-runtime-design.md dan implementation-plan.md. Paket baru ini tidak menimpa file-file tersebut.

Tidak ada klaim versi protokol terbaru dari web yang dijadikan prasyarat. Pelaksana harus memeriksa spesifikasi resmi dan paket yang benar-benar terpasang saat menguji kompatibilitas, serta membedakan dukungan SDK dari dukungan host nyata.

## 3. Pilihan arsitektur

Pilihan membuka semua tool ditolak: menghilangkan penolakan administratif tidak membenarkan perluasan wewenang. Memperbanyak regex hanya mitigasi sementara. Pilihan utama adalah mandat operator persisten, operasi terstruktur, satu evaluator otorisasi, pemulihan konteks, dan evidence ledger yang sudah ada.

Alur target:

Model/host -> adapter -> normalisasi operasi -> mandat + batas tugas -> evaluator -> pemulihan administratif -> eksekusi -> bukti hasil -> DMF/continuity -> observer.

WorkflowAdvisor memberi saran. Authorization evaluator memberi keputusan berdasarkan identitas dan operasi. DMF tetap satu otoritas memory. OperatorDirectiveService tetap otoritas consent. Execution ledger tetap otoritas keadaan eksekusi. Observatory hanya proyeksi.

## 4. Keputusan desain D01-D14

### D01. Workflow bukan otorisasi (usulan A)

Deskripsi natural language memengaruhi rekomendasi, bukan menjadi bukti izin. Keputusan operasi konkret berasal dari identitas terautentikasi, mandat aktif, batas tugas, resource canonical, parameter tervalidasi, dan lingkungan eksekusi. Prompt yang berkata aman atau sudah disetujui tidak menghasilkan grant. Penolakan eksplisit operator dan batas tugas mengalahkan mandat yang lebih luas.

### D02. Mandat persisten dengan migrasi eksplisit (usulan B)

Perluas store/service operator directives yang ada. Tambahkan grant operasi berversi dengan project scope, operation IDs, target constraints, batas jaringan/sumber daya, provenance persetujuan, revision, expiry bila ada, dan pencabutan. Consent dependency lama mempertahankan arti semula; migrasi tidak otomatis membuat grant shell/publish. Persetujuan tersimpan berasal dari kanal operator terautentikasi yang dapat dibuktikan server, bukan hanya boolean dari model. Unknown/degraded grant store tidak dianggap kosong atau mengizinkan semuanya.

### D03. Registri operasi bersama (usulan C)

Setiap operasi mempunyai schema input, resource resolver, effect descriptor, execution adapter, dan postcondition. Pisahkan authorization, meaningful-memory classification, dan proof of success. Reuse effect descriptor tidak berarti ketiga keputusan identik. Preview dan execution memakai evaluator yang sama, tetapi execution mengecek ulang policy revision, target, dan hash input untuk mencegah hasil preview dipakai bagi operasi berbeda.

### D04. Diagnostik first-class (usulan D)

Tambahkan diagnostics_run untuk service_health, tunnel_readiness, runtime_versions, workspace_access, git_status. Gunakan konfigurasi server untuk endpoint dan root; tidak menerima URL atau script arbitrer. Probe HTTP memiliki timeout, response bound, larangan redirect, exact endpoint policy, dan redaction. Pemeriksaan mandiri tidak menunggu skill, tugas lama, atau node memory baru. Akses tetap membutuhkan identitas terautentikasi dan kebijakan diagnostik server yang eksplisit.

### D05. Terminal tetap tersedia dengan batas yang nyata (usulan E)

Tiga adapter: recipe terstruktur; executable + argv tanpa shell; shell umum pada mandat/lingkungan yang tepat. Cwd bukan sandbox. npm test/build/install menjalankan kode dan tidak dinyatakan read-only secara blanket. Executable harus di-resolve dari lokasi tepercaya, bukan PATH yang dapat dibajak workspace. Isolasi file/jaringan/process/environment diverifikasi; bila tidak tersedia, kembalikan ENVIRONMENT_UNSUPPORTED dan jelaskan syaratnya, tidak downgrade diam-diam ke shell host bebas.

### D06. Konteks administratif otomatis (usulan F)

Buat/perbarui konteks hanya dalam mandat aktif dan scope yang telah dipastikan. Pisahkan workId/operationId persisten dari route lease sementara. Konteks baru memuat policy revision terkini. Konteks ambigu tidak diselesaikan dengan memilih root pertama; return SCOPE_REQUIRED dengan kandidat terbatas. Client lama tetap dapat memakai routeContextId eksplisit. Route gagal tidak diakali dengan merangkai ulang prompt.

### D07. Error yang dapat ditindaklanjuti (usulan G)

Kontrak hasil membawa code, layer, operationState, executionOccurred, retryDisposition, traceId, policyRevision, evidenceRefs dan recovery yang telah dievaluasi. Bedakan administratif, schema, izin, resource, transport, execution, memory dan publication. Pemulihan otomatis dibatasi maksimal satu rekonsiliasi konteks dan satu submit ulang hanya ketika dipastikan belum dieksekusi. Tidak ada retry otomatis untuk hasil unknown atau mutasi yang sudah committed.

### D08. Hasil eksekusi terpisah dari pencatatan (usulan H)

Perluas ledger yang ada untuk operationId + canonical input hash + target + policy revision + hasil/postcondition. Permintaan ulang ID dan hash sama mengembalikan hasil tersimpan setelah authorization ulang. ID sama dengan hash berbeda menghasilkan OPERATION_ID_CONFLICT. Side effect selesai tetapi postflight gagal dilaporkan succeeded/memory_pending, bukan failed-not-started. Crash antara side effect dan receipt menghasilkan unknown, perlu reconciliation; tidak mengklaim exactly-once universal.

### D09. Continuity dan konkurensi lintas sesi (usulan I)

Resume berdasarkan workId/taskId dan bukti persisten setelah autentikasi baru. Handle bukan credential. Isolasi principal/project/work mencegah tugas independen saling memblokir. Penulisan memakai expected content hash/version dan lock resource terbatas; stale writer ditolak sebagai RESOURCE_CONFLICT. Proses berjalan tidak dibatalkan hanya karena route TTL lewat; pengamatan/penghentian tetap mengikuti ownership.

### D10. Memory yang relevan terhadap tindakan (usulan J)

Pertahankan enam keputusan NO_DURABLE_MEMORY, REVISE_EXISTING, LINK_EXISTING, WRITE_BRANCH, WRITE_NEW_ROOT, OPEN_CONFLICT. Bedakan reporting constraints dari execution constraints. Guardrail mempunyai provenance dan predicate penerapan; recall lexical bukan predicate izin. Jangan menghapus atau menurunkan hard guardrail secara otomatis karena dianggap merepotkan. Constraint lama yang belum dipetakan dipertahankan dan dievaluasi konservatif untuk tindakan yang terdampak, bukan memblokir seluruh sistem.

Pending postflight harus direkonsiliasi server untuk work/resource terkait sebelum meaningful mutation berikutnya sesuai protokol memory yang berlaku. Melonggarkan cakupan pending dari global menjadi task/resource merupakan perubahan perilaku yang wajib memiliki tes; jangan menonaktifkan hard lifecycle diam-diam. Fresh Codespace yang gagal hydrate tetap fail-closed untuk memory-authoritative mutation; existing hydrated instance mengikuti kebijakan outage yang sudah disepakati. Informasi degraded tidak boleh disebut no memory.

### D11. Tugas boleh selesai tanpa memaksa ide lanjutan (usulan K)

Normalisasi menerima nextCandidates nol sampai lima; projectTerminal terpisah. Kandidat opsional tidak auto-approved atau dijadwalkan. Skill panduan tetap advisory; safety precondition yang benar-benar wajib diimplementasikan sebagai pemeriksaan operasi teruji, bukan hanya paragraf yang harus diingat model. Jangan hapus prosedur wajib lain tanpa menginventarisasi alasannya.

### D12. Kompatibilitas yang dapat dibuktikan (usulan L)

Pertahankan nama tool legacy dan tambahkan kontrak versi baru secara additive. Satu evaluator berlaku untuk direct tools, recipe, shell, GitHub, Langflow, execution DAG dan subagent entry points. Semua jalur tersebut perlu coverage; wrapper baru bukan pintu belakang. Schema ringkas, hasil JSON terstruktur dengan text fallback, bounds/pagination eksplisit. Model compatibility tidak sama dengan host availability atau platform capability. Anotasi read-only/destructive tetap jujur. Fitur yang tidak didukung menghasilkan status unsupported, bukan klaim dukungan universal.

### D13. Paket konteks awal terbatas (usulan M)

Bootstrap menyajikan proyek, mandat, health, keputusan terkini dan prior failure relevan tanpa mengulang seluruh snapshot. Target rancangan awal 8000 karakter, dengan truncation dan daftar kategori yang tidak termuat; detail melalui mekanisme remember_more yang sudah ada. Batas keselamatan operasional tetap diterapkan server meski tidak seluruhnya tercetak di prompt. Nilai budget ini usulan baru, bukan mengganti budget 6000 karakter/4 item/maxHops2 untuk remember_more dari S1.

### D14. Ukur friction, bukan hanya jumlah blokir (usulan N)

Tambahkan observability untuk false denial pada corpus berlabel, konfirmasi redundan, keberhasilan context recovery, duplicate prevention dan client mismatch. Ground truth false denial berasal dari expected policy corpus/operator review, bukan model yang menganggap penolakan salah. Registry replay/shadow hanya mengevaluasi; tidak mengeksekusi mutasi dua kali. Observer crash tidak memengaruhi DMF, execution atau sync.

## 5. Invarian yang tidak berubah

- Satu DMF; tidak menambah vector DB, cloud embeddings/reranker/judge atau external AI dependency.
- Tidak menyimpan chain-of-thought; hanya fakta teramati, keputusan diterima, error, provenance dan evidence.
- Principal/project isolation; secret tidak masuk response, memory, audit, fixture, atau paket publikasi.
- Tidak memaksa setiap interaksi membuat node; meaningful interaction membuat keputusan memory.
- Root baru hanya FRESH_DURABLE_CONTEXT dengan rootReason; non-root baru membutuhkan semantic edge terbukti.
- Tidak menghapus sejarah failure, revision, edge atau konflik.
- Private Memory Remote tetap terpisah dan terenkripsi; local SQLite bukan bukti remote durability.
- REMOTE_PENDING tidak disamarkan sebagai REMOTE_SYNCED; readback wajib untuk durabilitas lintas Codespace.
- Implementasi program memory S1 tetap melalui Codespace, bukan fallback Agent Core pada Mac. Windows live root saat ini hanya sumber inspeksi dan lokasi penyimpanan dokumen.
- Pekerjaan native/Windows diuji pada candidate Windows yang terisolasi; jangan build/restart dari root live untuk baseline.
- 100k memory preflight p95 <150 ms tidak dilonggarkan. Gate Observatory dari S2 tetap berlaku: overhead <=10%, event-visible p95 <250 ms, graph converge p95 <500 ms, undetected gaps 0.
- Tidak force push, reset hard, menghapus database, menyalin overlay dirty seluruh repo, atau mengubah global permissions demi melewati tes.
- Cutover tidak otomatis. Shadow -> advisory canary -> enforced canary -> CUTOVER_READY -> persetujuan operator -> live cutover -> soak.

## 6. Definisi selesai

DESIGN_DOCUMENTED berbeda dari PLAN_VERIFIED_LOCAL, PLAN_PUBLISHED, SHADOW_IMPLEMENTED dan STABLE. Plan dapat ditulis lengkap sementara seluruh task implementasi masih NOT_STARTED. Klaim compatible/stable selalu menyebut kombinasi client, versi, platform, scope dan evidence yang diuji. Penyimpanan file di Windows tidak berarti sudah ada commit/push atau tersedia pada Codespace lain.

## 7. Pemetaan usulan ke task

A -> T03,T04,T10; B -> T05; C -> T03,T04,T09; D -> T02; E -> T09; F -> T06; G -> T01,T06; H -> T07; I -> T07,T08; J -> T11; K -> T01,T10; L -> T10,T14; M -> T12; N -> T13,T14. T00 menyediakan baseline/preservation; T15 mengatur canary dan cutover. Seluruh task dijabarkan dalam implementation-plan.md.
