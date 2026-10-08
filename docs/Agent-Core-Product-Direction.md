# Agent Core: Arah Produk dan Alasan Grounding / Steal & Use

**Cumulative workflow update, 2026-10-06:** Task-scoped Learning review, guarded verified persistence, shared procedure ownership, revision-bound receipts and shared ranked context are implemented. Work outcome is separate from Learning completion. Independent source identity is not semantic truth. Controlled 64-run engineering/research evaluation and resident activation are tracked in [Cumulative-Workflow-Implementation-20261006.md](Cumulative-Workflow-Implementation-20261006.md); earlier EC/MRR acceptance does not prove this larger benefit claim.


**Acuan source saat ini, 2026-10-08 UTC:** pengguna mengonfirmasi source terbaru sudah dipush ke [Black-Project-Agent-Core/Agent-Core](https://github.com/Black-Project-Agent-Core/Agent-Core). Refresh ini membaca `main` pada `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3` (judul commit bertanggal 2026-10-09), dengan versi package `0.14.0`. Repository tersebut sekarang merupakan source line aktif; label lama legacy/reference-only sudah digantikan. Pemeriksaan ini statis, tanpa build, tes, aktivasi, provider call atau pemeriksaan resident baru.

**Posisi produk:** external MCP controller dan Native AI Agent memakai badan serta owner pengetahuan yang sama. Native runtime, persistent provider scheduling, interactive chat, durable turn continuation, dynamic task-scoped capabilities, web research, cumulative workflow, proposal Skill dan capability-use disclosure sudah ada di source. Catatan EC-9/IAC-9/NACP/P8 mempertahankan acceptance resident pada scope dan tanggalnya; status P8 pending dari 2026-10-02 sudah ditutup oleh catatan 2026-10-03 di bagian 9. Tidak ada asumsi bahwa semua endpoint/provider atau mesin lain sedang siap.

**Batas Memory v2:** `src/memory/host-runtime.ts` memilih service legacy secara default. Marker aktivasi yang valid beserta digest backup yang cocok memilih engine `SubProject/agent-core-memory` di `runtime/memory-v2` tanpa menyalakan writer legacy. Source tersedia bukan bukti aktivasi. Audit Memory v2 terakhir dalam `CODEBASE.md` mencatat pemakaian external controller; acceptance Native serta automatic episode capture tidak diklaim oleh refresh ini.

**Historical implementation checkpoint, 2026-09-30:** MRR-1/MRR-2/MRR-3 are resident verified; MRR-4 cross-session procedural reuse is verified and MRR-4.1 observed a bounded investigation/tool-call advantage on a harder matched fixture. MRR-5 ultimately proved that external-controller instructions/advisories cannot make Learning finalization deterministic, even though natural durable Memory capture can occur. Pre-runtime body/Memory scope is therefore closed and the remaining invariant has moved to the native controller lifecycle. Native Agent Runtime Phase 1 backend foundation is now implemented and resident-activated/readback verified: default-off OpenAI-compatible provider configuration, persistent session/task/finalization state, Memory-first retrieval context, scoped internal reuse of existing MCP tools, and a synthetic mandatory finalization function. Verified terminal tasks require safe evidence references; terminal outcome persists separately from lifecycle status; Learning-finalization failure cannot return a successful-looking user completion. Targeted/integration native-runtime verification is **23/23 PASS across six files**, including a real loopback OpenAI-compatible HTTP protocol run through actual Memory/Learning services and an existing MCP tool before mandatory finalization. Build/path policy is **284/0**; compatibility remains **70→70/non-breaking**; Grafel is current/accepted at **9,957/53,040**; no new public MCP tool was added. Resident `/health` truthfully exposes `agentRuntime.status=not-configured`, so the provider protocol is verified while the remaining acceptance is a real configured model/API/local endpoint run. Full user permission establishes task-scoped auto-trust for approved work, not truth-by-permission or disabled authentication. Details: `Pre-Runtime-Body-Memory-Learning-Closure-20260930.md`, `Native-Agent-Runtime-Phase-1-Plan.md`, CODEBASE 0.1.84–0.1.85.

> **Historical status at 2026-09-30:** ARAH PRODUK DAN URUTAN BODY-FIRST DIKONFIRMASI PENGGUNA. Pre-runtime body/Memory scope sudah ditutup pada tested scope; MRR-5 menetapkan external-controller finalization sebagai boundary, bukan alasan menambah patch Memory lagi. Pengguna kemudian memberi izin eksplisit untuk melanjutkan fase runtime native. Native Agent Runtime Phase 1 backend foundation sekarang source-implemented, targeted/build verified, dan resident-activated/readback verified; real-provider/API-or-local-endpoint acceptance masih pending.
> **Ditetapkan:** 2026-09-30 WIB.
> **Dasar:** percakapan `Target-Feture.md`, terutama baris 423-521, 614-646 dan konfirmasi baris 654, ditambah konfirmasi eksplisit pengguna dalam percakapan lanjutan pada 2026-09-30.
> **Pemisahan:** dokumen ini menjelaskan tujuan dan alasan desain. `CODEBASE.md` tetap peta implementasi aktual; `AGENTS.md` tetap kontrak operasi. Tidak ada target yang dianggap sudah diimplementasikan hanya karena tertulis di sini.

## 1. Tujuan yang dikonfirmasi

**Urutan yang dikonfirmasi pada 2026-09-30:** tubuh/sistem dan Memory/reuse dahulu, kemudian native AI/model runtime melalui API atau localhost. Boundary pre-runtime ditutup pada tested scope dan fase Native dilanjutkan. Source sekarang sudah melampaui foundation Phase 1: ada interactive chat, provider scheduling, durable turns dan shared capability body. Controller MCP eksternal tetap aktif; lifecycle Native memiliki owner finalisasi sendiri. Urutan historis ini bukan alasan menunda atau membangun ulang runtime yang sudah ada.

Grounding terhadap urutan ini tercatat dalam [Agent-Core-PreRuntime-Maturity-Grounding-20260930.md](Agent-Core-PreRuntime-Maturity-Grounding-20260930.md). Pada audit tersebut, ketiadaan runtime native bukan defect fase tubuh. Saat ini perbaikan scope, freshness, evidence dan prosedur tetap harus memakai owner yang sudah ada, termasuk runtime Native yang kini diimplementasikan.

Agent Core ditujukan menjadi **cumulative-learning agent**: badan agent yang dapat memakai model melalui API atau endpoint lokal, dengan pengalaman dan pengetahuan lokal yang bertahan lintas sesi dan dapat digunakan kembali untuk memperbaiki keputusan serta tindakan.

Empat karakter utamanya adalah **Persistent Agent + Self-Learning + Procedural Memory + Evidence-Grounded Problem Solving**. Penekanan pengguna bukan sekadar autonomous execution atau memory panjang, tetapi **USE-KNOWLEDGE-FROM-LEARNING**. Local-first knowledge tidak mensyaratkan semua inference lokal; adapter Native yang ada memakai protokol OpenAI-compatible untuk endpoint yang dikonfigurasi. Pilihan remote/lokal tidak berarti semua vendor, model atau protokol otomatis kompatibel atau telah diuji.

Siklus produk yang dituju: tujuan pengguna -> recall pengetahuan relevan -> pahami fakta dan konteks -> susun hipotesis/rencana -> bertindak -> amati hasil -> diagnosis dan ubah strategi bila perlu -> verifikasi dalam scope yang diizinkan -> distilasi pelajaran/prosedur -> simpan dan baca kembali -> gunakan pada tugas/sesi berikutnya.

Pengetahuan yang dicari mencakup fakta, konteks penggunaan, kegagalan, sebab yang sudah dibuktikan atau hipotesis yang diberi label, koreksi yang berhasil, prosedur, keterbatasan, dan sumber bukti. Ini bukan kewajiban membuat database atau taksonomi baru; owner Memory/Skills/Patterns yang sudah ada tetap menjadi titik awal.

Kemampuan menghubungkan masalah berarti menggabungkan evidence sekarang, pengalaman yang relevan, hubungan antarkomponen dan prosedur lama untuk membentuk hipotesis yang dapat diperiksa. Persistence berarti mencoba pendekatan yang berubah karena bukti baru, bukan mengulang aksi gagal tanpa informasi tambahan atau menjanjikan semua masalah pasti selesai.

Pembelajaran yang dimaksud dapat terjadi melalui pengetahuan, prosedur dan perilaku controller. Fine-tuning, perubahan bobot model, self-modifying code, atau autonomous background training bukan prasyarat dan tidak diizinkan otomatis oleh arah ini. Tidak menyimpan secret, private chain-of-thought, atau raw scratchpad sebagai pengetahuan.

## 2. Mengapa banyak repository di-grounding dan diadopsi

Pengguna menegaskan bahwa grounding dan steal & use yang berulang memang ditujukan untuk membangun dua hal yang saling terkait: **mekanisme sistem** dan **mekanisme Memory lokal**. Tujuannya bukan mengoleksi tool, menambah jumlah MCP, atau membuat sebanyak mungkin plan berstatus COMPLETE.

Adopsi mekanisme sistem menyediakan tindakan, observasi, diagnosis, integritas, pemulihan dan bukti hasil. Adopsi mekanisme Memory menyediakan continuity, recall, provenance, hubungan pengetahuan, koreksi dan pemakaian ulang prosedur. Nilai produk muncul ketika kedua jalur tersambung pada pekerjaan nyata.

Steal & use di sini berarti inspeksi source -> pilih mekanisme -> adaptasi/integrasi yang sesuai dengan lisensi dan atribusi -> penggunaan nyata -> verifikasi sesuai izin. Daftar dan klaim repository dalam transcript adalah lead penelitian, bukan audit source terbaru atau mandat memasang semuanya.

## 3. Source yang sudah dibaca, dan batas pembuktiannya

Refresh dokumentasi ini membandingkan klaim aktif dengan source terarah. Tidak menjalankan Grafel, produk, provider atau benchmark. Angka dan status resident dari laporan lama tetap evidence historis, bukan hasil pemeriksaan baru.

| Bagian | Owner source saat ini | Batas kesimpulan |
|---|---|---|
| Komposisi sistem | `src/index.ts` menghubungkan selected Memory, Learning, Skills, external-controller learning, Native runtime/controller/chat, code, semantic, phone dan web ke HTTP/MCP. | Wiring source bukan bukti semua service/provider terkonfigurasi pada suatu mesin. |
| Penyimpanan dan review belajar | `src/learning/service.ts`, `external-controller.ts`, `sink-manager.ts`, `memory-sink.ts` dan owner proposal/receipt. | Review semantik tetap tanggung jawab controller; persistence dan source identity bukan kebenaran atau manfaat otomatis. |
| Memory | `src/memory/host-runtime.ts`, legacy `src/memory`, `SubProject/agent-core-memory`, `src/mcp/memory-experience-tools.ts`. | V2 memerlukan aktivasi host yang valid; facade dapat tersedia tanpa membuktikan automatic Native episode capture atau outcome benefit. |
| Native runtime dan chat | `src/agent-runtime.ts`, `agent-controller.ts`, `agent-chat-service.ts`, `agent-chat-store.ts`, `agent-provider*.ts`, launcher/UI. | Sudah diimplementasikan, bukan lagi placeholder. Source, acceptance resident terdahulu, dan kesiapan runtime saat ini tetap tiga bukti berbeda. |
| Skills dan awareness | `src/skills/service.ts`, `src/learning/skill-proposal-*`, `src/capability-awareness.ts`. | Proposal, keputusan, build/activation dan penggunaan harus dibedakan. Artifact tidak mendapat execution authority hanya karena ada di katalog. |
| Eksekusi bersama | `src/mcp/server.ts`, `src/agent-capability-catalog.ts`, `src/agent-capability-resolver.ts`, `src/auth/tool-grant.ts`. | Inventory, grant, selected, used dan beneficial adalah keadaan berbeda; exposure bergantung pada service, konteks dan grant. |
| Wave dan acceptance terdahulu | `CODEBASE.md` dan laporan EC/IAC/NACP/cumulative workflow/Memory v2. | Kelulusan scope tertentu tidak membuktikan cumulative advantage umum. Jangan membuka ulang scope closed tanpa bukti baru. |

Kesimpulan: produk sudah memiliki dua controller serta jalur shared knowledge/execution yang terimplementasi. Efektivitas **hasil belajar -> keputusan berikutnya -> tindakan -> hasil lebih baik** tetap harus dibuktikan pada task, controller, revisi dan kondisi yang jelas. Refresh ini tidak memberi angka persentase kesiapan atau klaim peningkatan kecerdasan.

## 4. Grounding berikutnya harus dimulai dari gap tujuan

**Prinsip kerja berikutnya:** mulai dari gap konkret terhadap source dan bukti terbaru. Grounding pre-runtime sudah dilakukan; EC/IAC/NACP juga memiliki closure masing-masing. Jangan mengulang audit atau gelombang donor hanya karena proposal lama masih ada. Pemeriksaan source terarah tetap diperlukan sebelum perubahan.

Untuk gap baru yang memang perlu diaudit, deliverable yang berguna adalah satu matriks: tahap loop, perilaku yang diharapkan, owner/caller source, bukti yang tersedia, status (terimplementasi-terhubung-terbukti / terimplementasi-belum-terhubung / terhubung-belum-terbukti / belum ada / belum diperiksa), serta perubahan terkecil atau bukti berikutnya yang diperlukan. Ketidakpastian tidak boleh diubah menjadi gap palsu.

Audit menelusuri dua arah: dari task ke Memory/skill/procedure yang dipilih, lalu dari pengetahuan yang tersimpan kembali ke keputusan dan hasil task. Identifikasi juga kebutuhan pemilihan konteks, budget/truncation, freshness, conflict, recovery setelah pergantian sesi, dan provenance. Daftar ini adalah pertanyaan audit, bukan klaim bahwa seluruhnya belum ada.

Jika fungsi sudah ada dan belum terhubung, prioritasnya integrasi. Jika sudah terhubung tetapi belum terbukti, prioritasnya rencana acceptance. Jika mekanisme benar-benar kurang, baru grounding donor yang sesuai gap tersebut. Jika semuanya terbukti untuk scope itu, tutup dan jangan mengulang pekerjaan.

`Consumer` berarti reference masih mempunyai kemungkinan nilai yang belum diaktifkan, bukan sampah, bukan backlog wajib, dan bukan larangan permanen. Bila consumer yang dibutuhkan merupakan bagian dari target produk ini, usulkan owner/input/output dan integrasinya secara konkret; jangan menunda selamanya dengan alasan consumer belum ada. Sebaliknya, jangan membangun subsystem tak terpakai hanya agar suatu donor terlihat sudah diadopsi.

Proposal donor berikutnya sebaiknya menghubungkan **gap tujuan -> source mekanisme -> owner native -> consumer/pemakaian nyata -> bukti hasil -> biaya/risiko/lisensi -> acceptance**. Re-ground donor ketika gap relevan dipilih, revision berubah, source bertentangan dengan evidence, atau consumer baru disetujui; bukan sekadar karena daftar reference tersedia.

## 5. Melanjutkan dari baseline yang sudah ada

Urutan body-first 2026-09-30 merupakan riwayat keputusan yang sudah menghasilkan runtime Native, bukan plan Phase 1 yang masih menunggu dimulai. Prioritas berikut harus mengikuti pekerjaan yang benar-benar **OPEN**, keputusan pengguna dan bukti terbaru, tanpa menganggap semua pending pada laporan lama masih aktif.

1. **Pertahankan scope yang sudah closed.** Gunakan hasil pre-runtime, EC-9, IAC-9 dan NACP/P8 pada batas penerimaannya; jangan memperluas hasil fixture menjadi klaim umum.
2. **Pilih task atau gap yang nyata.** Tentukan owner, consumer, revision, bukti outcome dan batas biaya/risiko sebelum implementasi atau evaluasi tambahan.
3. **Reuse jalur yang ada.** External dan Native controller tetap memakai shared body/Memory/Learning/Skills. Ground donor hanya untuk mekanisme yang belum tercakup; jangan membuat stack kedua atau menghidupkan Hermes lama.
4. **Pisahkan pembuktian.** Source/build proof, resident activation, provider behavior, actual knowledge use dan measured benefit harus dicatat sendiri-sendiri. Game Mode dan Memory v2 mempunyai batas acceptance masing-masing.
5. **Jaga keselamatan data dan status.** Aktivasi Memory v2 memerlukan marker/backup yang valid. Source sync ke GitHub tidak mengaktifkan runtime, mengganti Memory produksi, atau mengizinkan release/publikasi berikutnya.

Native task lifecycle/finalization dan external-controller Learning adalah owner yang sudah ada. Perbaikan selanjutnya harus memakai keduanya sesuai konteks, bukan kembali mengasumsikan runtime Native belum tersedia.

## 6. Bukti keberhasilan yang perlu dirancang

Jumlah tool, note, repository, graph entity, checkpoint atau tes lulus adalah informasi operasional, **bukan bukti** bahwa agent belajar lebih efektif. Hasil search membuktikan retrieval/handoff; penyimpanan record membuktikan persistence; pemakaian dan manfaatnya memerlukan bukti tersendiri.

Dimensi acceptance berikut tetap berguna. Sebagian mempunyai laporan pengujian terdahulu; tabel ini bukan klaim bahwa semuanya belum pernah diuji maupun sudah lulus secara umum:

| Skenario | Bukti yang dicari |
|---|---|
| Sesi pertama | Error/fakta yang relevan, pendekatan yang berubah, hasil terverifikasi, lesson/procedure dengan konteks dan sumber yang dapat diperiksa. |
| Sesi baru, tanpa riwayat chat lama | Recall record/procedure yang tepat, alasan applicability ringkas, tindakan yang mengikuti atau memperbaiki prosedur, dan outcome yang dapat diukur. |
| Kasus mirip tetapi kondisi berbeda | Memeriksa precondition, tidak menerapkan solusi lama secara buta, mengadaptasi strategi berdasarkan fakta baru. |
| Catatan lama bertentangan dengan source sekarang | Menandai ketidakcocokan, tidak menimpa fakta baru dengan memory lama, memperbarui pengetahuan hanya dengan evidence dan izin yang tepat. |
| Pergantian model/route yang kompatibel dengan adapter saat ini | Catatan/provenance tetap utuh; continuity dan kualitas tindakan diuji, bukan diasumsikan sama pada semua model. |

Metrik yang diusulkan: keberhasilan task, pengulangan kesalahan yang sudah dikenal, tool-call atau waktu menuju koreksi, relevansi/applicability recall, salah-pakai memory usang, keberhasilan prosedur dan overhead. Untuk klaim improvement yang lebih kuat, rancang pembanding dengan model/task/environment sebanding dan memory reuse on/off atau variasi terkontrol, tanpa menghapus Memory produksi. Pisahkan urutan/variance model dan hasil observasional dari klaim kausal. Gunakan kriteria dan hasil yang benar-benar tercatat untuk tiap evaluasi, termasuk laporan cumulative workflow; tetapkan scope/kriteria baru bila pertanyaannya berbeda. Jangan mengubah rencana run atau angka kelulusan menjadi klaim benefit yang belum diukur.

Evidence pemakaian cukup berupa record/digest yang dipilih, ringkasan alasan yang aman, tool arguments relevan, hasil dan verification artifact. Tidak membutuhkan akses ke atau penyimpanan private chain-of-thought. Satu demonstrasi positif tidak membuktikan kemampuan umum atau peningkatan pada semua tugas.

## 7. Authority, continuity dan batas pekerjaan

`Target-Feture.md` dipertahankan sebagai arsip percakapan sumber. Dokumen ini adalah rumah penjelasan arah produk yang dikonfirmasi pengguna, bukan salinan katalog donor atau pengganti kontrak. Klaim spesifik repository di transcript belum diverifikasi ulang dalam tugas ini; evaluasi donor baru harus source-first dan sesuai izin.

`CODEBASE.md` memetakan keadaan yang benar-benar diimplementasikan. Status selesai per-wave tetap berlaku pada scope-nya dan tidak boleh diperluas menjadi klaim seluruh target tercapai. Ringkasan arah ditautkan dari README, AGENTS dan root MEMORY; canonical Memory native menyimpan konteks arah pada record yang sudah ada agar sesi berikutnya tidak kembali menganggap Agent Core hanya kumpulan MCP tool.

Hermes dalam target ini merupakan pembanding pengalaman/learning, bukan kewajiban menghidupkan kembali legacy Partner bridge. Penghapusan bridge lama dan batas external RDC tetap berlaku. External controller serta Native runtime yang sudah diimplementasikan mempunyai lifecycle masing-masing di atas shared body. Pencatatan arah ini tidak mengubah atau mengganti keduanya.

Memory, Learning, Skills, Grafel, Semantic IDE dan machine-control tetap sibling. Arah produk tidak mengizinkan penambahan routing/approval gate, DAG, cross-lock, second Memory authority, hidden model call atau scheduler duplikat. Persistent provider scheduler yang sudah ada tetap owner runtime; dynamic task-scoped grants dan credential authorization tetap ditegakkan. Privasi, otorisasi, protected-path, biaya dan batas operasi tidak hilang karena targetnya autonomous. Agent seharusnya gigih menggunakan evidence, tetapi tidak mengabaikan penghentian pengguna atau berpura-pura hasil yang belum terbukti.

Tugas historis 2026-09-30 hanya memperbarui arah dokumentasi dan konteks canonical Memory dengan pembacaan source terarah. Tidak mengimplementasikan agent loop, tidak memasang donor, tidak membaca protected references/secret files, tidak menjalankan evaluasi yang diusulkan, tidak mengubah model, dependency, release, atau runtime.

## 8. Rujukan dan batas bukti historis

Dasar intent: `Target-Feture.md` baris 7-17 (badan dan otak), 423-521 (learning, local memory dan reuse), 614-646 (knowledge synthesis dan empat karakter), 654 (konfirmasi); ditambah pernyataan langsung pengguna pada 2026-09-30 bahwa inilah tujuan sebenarnya dan alasan grounding/steal & use.

Bukti pembacaan terarah pada tugas 2026-09-30: `src/index.ts`, `src/learning/service.ts`, `src/learning/sink-manager.ts`, `src/learning/memory-sink.ts`, `src/memory/retrieval-ledger.ts` serta status artifact-only di `src/skills/service.ts`; konteks historis UI pada `Agent-Core-AI-Chat-Placeholder-Task-20260926.md`. Pemeriksaan ini cukup untuk membedakan fondasi dari target, bukan audit menyeluruh lintas semua caller, native AI worktree, donor dan sesi.

Catatan historis cadangan dokumen dan identitas file yang dipantau: `../runtime/tmp/product-direction-alignment-20260930/`. Readback dokumen menguji penulisan dan keterhubungan rujukan, bukan peningkatan kecerdasan atau kelulusan acceptance produk.

## 9. Native Agent Capability Parity closure — 2026-10-03

Native Agent Capability Parity is now resident-verified for the planned scope. The final outstanding P8 generic Web Research acceptance is closed: a fresh resident Native Agent conversation requested task-scoped `web.research`, executed two `web_search` calls and two `web_open` calls, submitted explicit inspectable tool evidence through `agent_core_finalize`, reached terminalOutcome=`verified`, and completed Learning finalization before returning the assistant response.

The final P8 task used official Node.js web evidence and completed on the same Agent Core-owned runtime/body without ChatGPT platform web tools. Dynamic grants, shared Memory/Learning, provider scheduling, verification and fail-closed finalization remained authoritative.

Current product baseline therefore includes EC-9, persistent provider scheduling, IAC-9, DTC-1, NACP-0..NACP-10 and P8 live Web Research as resident-verified capabilities. Future work should build on these authorities instead of reopening them without contradictory current-source/runtime evidence.

At that closure, the NACP changeset was recorded as unapplied. This historical queue observation is not a current release-plan result. Neither the closure nor this documentation refresh authorizes release apply, version mutation, Git-history mutation, publication or deployment.