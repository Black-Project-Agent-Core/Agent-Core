# Agent Core: Arah Produk dan Alasan Grounding / Steal & Use

**Cumulative workflow update, 2026-10-06:** Task-scoped Learning review, guarded verified persistence, shared procedure ownership, revision-bound receipts and shared ranked context are implemented. Work outcome is separate from Learning completion. Independent source identity is not semantic truth. Controlled 64-run engineering/research evaluation and resident activation are tracked in [Cumulative-Workflow-Implementation-20261006.md](Cumulative-Workflow-Implementation-20261006.md); earlier EC/MRR acceptance does not prove this larger benefit claim.


**Latest direction, 2026-10-02:** EC-9 cumulative learning, persistent provider scheduling, and Interactive Native Agent Chat through IAC-9 are resident-verified baselines. **Native Agent Capability Parity** is now resident-active under dynamic task-scoped grants and verified across bounded file/process execution, Grafel + Semantic IDE, browser navigation, phone observe/act, deny-by-default policy, per-turn grant reset, and shared canonical Memory/Learning in both directions while reusing the same Agent Core MCP body. The direct `memory_search` attribution repair is now resident-verified after a supported launcher restart: targeted Memory retrieval produces retrieval evidence and a valid Native `knowledgeUse` receipt (`knowledgeUseReceipts=1`). Matched external-controller vs Native engineering parity also passes on the same Agent Core-owned fixture/process capabilities. Agent Core-native `web_open` is live through keyless Jina Reader. Generic `web_search` credentials are now present and secret-safe provider probes have passed for Exa, Parallel, Firecrawl and Jina Search; OpenAlex/Pexels also pass their specialized modes, and Browserbase Search/Fetch is added as the final difficult-web fallback. The remaining NACP lifecycle gate is a supported Core reload so the resident process reads the updated `.env`, followed by one Native Agent P8 turn that uses `web.research` and finalizes with verification evidence. Unsplash is optional and currently rejected by its API with HTTP 401; Pexels keeps asset research operational. The minor NACP changeset remains unapplied.

**Historical implementation checkpoint, 2026-09-30:** MRR-1/MRR-2/MRR-3 are resident verified; MRR-4 cross-session procedural reuse is verified and MRR-4.1 observed a bounded investigation/tool-call advantage on a harder matched fixture. MRR-5 ultimately proved that external-controller instructions/advisories cannot make Learning finalization deterministic, even though natural durable Memory capture can occur. Pre-runtime body/Memory scope is therefore closed and the remaining invariant has moved to the native controller lifecycle. Native Agent Runtime Phase 1 backend foundation is now implemented and resident-activated/readback verified: default-off OpenAI-compatible provider configuration, persistent session/task/finalization state, Memory-first retrieval context, scoped internal reuse of existing MCP tools, and a synthetic mandatory finalization function. Verified terminal tasks require safe evidence references; terminal outcome persists separately from lifecycle status; Learning-finalization failure cannot return a successful-looking user completion. Targeted/integration native-runtime verification is **23/23 PASS across six files**, including a real loopback OpenAI-compatible HTTP protocol run through actual Memory/Learning services and an existing MCP tool before mandatory finalization. Build/path policy is **284/0**; compatibility remains **70→70/non-breaking**; Grafel is current/accepted at **9,957/53,040**; no new public MCP tool was added. Resident `/health` truthfully exposes `agentRuntime.status=not-configured`, so the provider protocol is verified while the remaining acceptance is a real configured model/API/local endpoint run. Full user permission establishes task-scoped auto-trust for approved work, not truth-by-permission or disabled authentication. Details: `Pre-Runtime-Body-Memory-Learning-Closure-20260930.md`, `Native-Agent-Runtime-Phase-1-Plan.md`, CODEBASE 0.1.84–0.1.85.

> **Historical status at 2026-09-30:** ARAH PRODUK DAN URUTAN BODY-FIRST DIKONFIRMASI PENGGUNA. Pre-runtime body/Memory scope sudah ditutup pada tested scope; MRR-5 menetapkan external-controller finalization sebagai boundary, bukan alasan menambah patch Memory lagi. Pengguna kemudian memberi izin eksplisit untuk melanjutkan fase runtime native. Native Agent Runtime Phase 1 backend foundation sekarang source-implemented, targeted/build verified, dan resident-activated/readback verified; real-provider/API-or-local-endpoint acceptance masih pending.
> **Ditetapkan:** 2026-09-30 WIB.
> **Dasar:** percakapan `Target-Feture.md`, terutama baris 423-521, 614-646 dan konfirmasi baris 654, ditambah konfirmasi eksplisit pengguna dalam percakapan lanjutan pada 2026-09-30.
> **Pemisahan:** dokumen ini menjelaskan tujuan dan alasan desain. `CODEBASE.md` tetap peta implementasi aktual; `AGENTS.md` tetap kontrak operasi. Tidak ada target yang dianggap sudah diimplementasikan hanya karena tertulis di sini.

## 1. Tujuan yang dikonfirmasi

**Urutan eksplisit terbaru, 2026-09-30:** matangkan Agent Core sebagai tubuh/tangan/mata/kaki, kemampuan sistem, dan mekanisme Memory serta reuse terlebih dahulu; setelah boundary itu dibuktikan, lanjutkan native AI/model runtime melalui API atau localhost. Boundary body/Memory kini sudah ditutup untuk tested scope dan pengguna sudah mengizinkan fase berikutnya, sehingga Native Agent Runtime Phase 1 sekarang aktif sebagai implementation workstream. Controller MCP eksternal tetap berguna untuk mengoperasikan body, tetapi tidak lagi menjadi owner deterministic task-finalization.

Grounding terhadap urutan ini tercatat dalam [Agent-Core-PreRuntime-Maturity-Grounding-20260930.md](Agent-Core-PreRuntime-Maturity-Grounding-20260930.md). Ketiadaan runtime native bukan defect fase tubuh dan tidak menjadi alasan menunda perbaikan scope, freshness, evidence atau prosedur yang dapat dilakukan pada owner existing.

Agent Core ditujukan menjadi **cumulative-learning agent**: badan agent yang dapat memakai model melalui API atau endpoint lokal, dengan pengalaman dan pengetahuan lokal yang bertahan lintas sesi dan dapat digunakan kembali untuk memperbaiki keputusan serta tindakan.

Empat karakter utamanya adalah **Persistent Agent + Self-Learning + Procedural Memory + Evidence-Grounded Problem Solving**. Penekanan pengguna bukan sekadar autonomous execution atau memory panjang, tetapi **USE-KNOWLEDGE-FROM-LEARNING**. Local-first knowledge tidak mensyaratkan semua inference lokal; model remote dan lokal tetap pilihan target, bukan daftar provider yang diklaim sudah didukung native.

Siklus produk yang dituju: tujuan pengguna -> recall pengetahuan relevan -> pahami fakta dan konteks -> susun hipotesis/rencana -> bertindak -> amati hasil -> diagnosis dan ubah strategi bila perlu -> verifikasi dalam scope yang diizinkan -> distilasi pelajaran/prosedur -> simpan dan baca kembali -> gunakan pada tugas/sesi berikutnya.

Pengetahuan yang dicari mencakup fakta, konteks penggunaan, kegagalan, sebab yang sudah dibuktikan atau hipotesis yang diberi label, koreksi yang berhasil, prosedur, keterbatasan, dan sumber bukti. Ini bukan kewajiban membuat database atau taksonomi baru; owner Memory/Skills/Patterns yang sudah ada tetap menjadi titik awal.

Kemampuan menghubungkan masalah berarti menggabungkan evidence sekarang, pengalaman yang relevan, hubungan antarkomponen dan prosedur lama untuk membentuk hipotesis yang dapat diperiksa. Persistence berarti mencoba pendekatan yang berubah karena bukti baru, bukan mengulang aksi gagal tanpa informasi tambahan atau menjanjikan semua masalah pasti selesai.

Pembelajaran yang dimaksud dapat terjadi melalui pengetahuan, prosedur dan perilaku controller. Fine-tuning, perubahan bobot model, self-modifying code, atau autonomous background training bukan prasyarat dan tidak diizinkan otomatis oleh arah ini. Tidak menyimpan secret, private chain-of-thought, atau raw scratchpad sebagai pengetahuan.

## 2. Mengapa banyak repository di-grounding dan diadopsi

Pengguna menegaskan bahwa grounding dan steal & use yang berulang memang ditujukan untuk membangun dua hal yang saling terkait: **mekanisme sistem** dan **mekanisme Memory lokal**. Tujuannya bukan mengoleksi tool, menambah jumlah MCP, atau membuat sebanyak mungkin plan berstatus COMPLETE.

Adopsi mekanisme sistem menyediakan tindakan, observasi, diagnosis, integritas, pemulihan dan bukti hasil. Adopsi mekanisme Memory menyediakan continuity, recall, provenance, hubungan pengetahuan, koreksi dan pemakaian ulang prosedur. Nilai produk muncul ketika kedua jalur tersambung pada pekerjaan nyata.

Steal & use di sini berarti inspeksi source -> pilih mekanisme -> adaptasi/integrasi yang sesuai dengan lisensi dan atribusi -> penggunaan nyata -> verifikasi sesuai izin. Daftar dan klaim repository dalam transcript adalah lead penelitian, bukan audit source terbaru atau mandat memasang semuanya.

## 3. Posisi yang sudah dibaca, dan yang belum dibuktikan

Pencocokan pada tugas dokumentasi ini bersifat terarah, bukan full gap audit atau benchmark. Grafel `code_orient(status)` mengembalikan index current/graph available; exact source tetap lebih berwenang daripada graph. Evidence source dibaca tanpa menjalankan produk baru atau pengujian perilaku tambahan.

| Bagian | Bukti yang dibaca | Batas kesimpulan |
|---|---|---|
| Komposisi sistem | `src/index.ts` menginisialisasi Memory, Learning, Skills, Code Intelligence, Semantic IDE dan HTTP/MCP. | Menunjukkan owner yang ada; bukan bukti native model-agent loop lengkap. |
| Penyimpanan hasil belajar | `src/learning/service.ts`, `sink-manager.ts`, `memory-sink.ts` menerima kandidat review dan menghubungkan sink Memory/Grafel. | Review semantik masih dari controller. Keberadaan sink bukan bukti seluruh pengalaman otomatis dipelajari dan dipakai ulang. |
| Recall dan penilaian hasil | `src/memory/retrieval-ledger.ts` baris 298-330 membedakan handoff, feedback dan batas atribusi. | Source secara eksplisit menyatakan returned-to-controller bukan bukti model use; feedback observasional bukan bukti sebab-akibat. |
| Procedural artifacts | `src/skills/service.ts` status menandai `mode=artifact-only` dan `executionAuthority=false`. | Artifact tersedia tidak sama dengan skill otomatis diekstrak, dipilih, dilaksanakan dan terbukti membantu. |
| UI native agent | `docs/Agent-Core-AI-Chat-Placeholder-Task-20260926.md` mencatat placeholder tanpa chat/model loop. | Dokumen historis ini bukan audit semua pekerjaan native AI terbaru; workstream terpisah perlu dicek sebelum menyimpulkan gap atau membuat owner baru. |
| Wave adopsi selesai | `CODEBASE.md` dan laporan per-wave memuat qualification masing-masing; CORAL/GEA/MetaClaw sudah ditutup pada scope-nya. | Kelulusan modul/CLI/health tidak otomatis membuktikan cumulative learning end-to-end. Tidak membuka ulang wave yang sudah closed. |

Kesimpulan yang sah sekarang: fondasi dan owner penting sudah ada, sedangkan efektivitas keseluruhan alur **hasil belajar -> keputusan berikutnya -> tindakan -> hasil lebih baik** perlu dipetakan dan dibuktikan secara khusus. Tugas ini tidak memberi angka persentase kesiapan, tidak menyatakan semua sambungan hilang, dan tidak menganggapnya sudah selesai.

## 4. Grounding berikutnya harus dimulai dari gap tujuan

**Rekomendasi:** lakukan satu grounding terarah terhadap Agent Core sendiri, khusus sambungan sistem-Memory-controller, sebelum gelombang donor besar berikutnya. Pemeriksaan ulang source tetap perlu sebelum perubahan; audit penuh terhadap semua reference yang sama tidak otomatis perlu diulang.

Deliverable audit yang diusulkan adalah satu matriks: tahap loop, perilaku yang diharapkan, owner/caller source, bukti yang tersedia, status (terimplementasi-terhubung-terbukti / terimplementasi-belum-terhubung / terhubung-belum-terbukti / belum ada / belum diperiksa), serta perubahan terkecil atau bukti berikutnya yang diperlukan. Ketidakpastian tidak boleh diubah menjadi gap palsu.

Audit menelusuri dua arah: dari task ke Memory/skill/procedure yang dipilih, lalu dari pengetahuan yang tersimpan kembali ke keputusan dan hasil task. Identifikasi juga kebutuhan pemilihan konteks, budget/truncation, freshness, conflict, recovery setelah pergantian sesi, dan provenance. Daftar ini adalah pertanyaan audit, bukan klaim bahwa seluruhnya belum ada.

Jika fungsi sudah ada dan belum terhubung, prioritasnya integrasi. Jika sudah terhubung tetapi belum terbukti, prioritasnya rencana acceptance. Jika mekanisme benar-benar kurang, baru grounding donor yang sesuai gap tersebut. Jika semuanya terbukti untuk scope itu, tutup dan jangan mengulang pekerjaan.

`Consumer` berarti reference masih mempunyai kemungkinan nilai yang belum diaktifkan, bukan sampah, bukan backlog wajib, dan bukan larangan permanen. Bila consumer yang dibutuhkan merupakan bagian dari target produk ini, usulkan owner/input/output dan integrasinya secara konkret; jangan menunda selamanya dengan alasan consumer belum ada. Sebaliknya, jangan membangun subsystem tak terpakai hanya agar suatu donor terlihat sudah diadopsi.

Proposal donor berikutnya sebaiknya menghubungkan **gap tujuan -> source mekanisme -> owner native -> consumer/pemakaian nyata -> bukti hasil -> biaya/risiko/lisensi -> acceptance**. Re-ground donor ketika gap relevan dipilih, revision berubah, source bertentangan dengan evidence, atau consumer baru disetujui; bukan sekadar karena daftar reference tersedia.

## 5. Urutan lanjutan yang diusulkan

Grounding pada langkah 1 kini telah dilaksanakan pada cakupan laporan pre-runtime; langkah perbaikan dan acceptance berikutnya tetap **USULAN**. Urutan ini disesuaikan dengan konfirmasi terbaru pengguna: tubuh/Memory dahulu, native AI runtime kemudian. Ini bukan izin implementasi atau tes baru.

1. **Grounding keterhubungan target — selesai pada scope audit 2026-09-30.** Laporan pre-runtime memetakan owner/bukti/gap. Temuan awal diprioritaskan pada scoped learning capture, freshness source, bukti pemakaian dan prosedur. Tidak ada donor atau workstream runtime baru yang dibangun.
2. **Pilih satu vertical slice pembelajaran.** Satu masalah nyata yang terbatas: temukan solusi dengan evidence, distilasi pelajaran, simpan, lalu gunakan pada sesi terpisah dan kasus variasi. Pilih scope dan acceptance sebelum implementasi atau tes.
3. **Tutup gap slice terkecil.** Reuse primitive yang ada. Ground donor hanya untuk gap yang belum tercakup, kemudian ajukan implementasi dengan jalur pemanggilan dan efek yang teramati. Penambahan sistem boleh diusulkan bila benar-benar diperlukan target, bukan dilarang semata-mata karena arsitektur hari ini belum memilikinya.
4. **Jalankan acceptance setelah disetujui.** Uji continuity, reuse yang benar, penolakan pelajaran kedaluwarsa, dan kualitas hasil. Simpan kegagalan, missing evidence dan biaya; jangan hanya menampilkan kasus sukses.
5. **Fase runtime native — aktif setelah closure body/Memory.** Scope kematangan pre-runtime sudah ditutup untuk tested boundary dan pengguna sudah memutuskan lanjut. Desain/pembangunan model/provider/session runtime sekarang harus memakai badan serta pengetahuan yang sama, inspect/reuse pekerjaan existing, dan tidak menghidupkan Hermes lama atau membuat Memory kedua. Current implementation authority ada di `Native-Agent-Runtime-Phase-1-Plan.md` dan CODEBASE 0.1.85.

Pada fase sekarang controller MCP eksternal tetap menjadi operator body yang berguna, tetapi Native Agent Runtime telah menjadi workstream aktif untuk ownership task lifecycle/finalization. Acceptance berikutnya harus memisahkan source/build proof, resident activation, dan real-provider behavior; jangan menganggap konfigurasi provider atau keberadaan agent loop sendiri sebagai bukti cumulative-learning improvement.

## 6. Bukti keberhasilan yang perlu dirancang

Jumlah tool, note, repository, graph entity, checkpoint atau tes lulus adalah informasi operasional, **bukan bukti** bahwa agent belajar lebih efektif. Hasil search membuktikan retrieval/handoff; penyimpanan record membuktikan persistence; pemakaian dan manfaatnya memerlukan bukti tersendiri.

Contoh acceptance yang diusulkan, belum dieksekusi:

| Skenario | Bukti yang dicari |
|---|---|
| Sesi pertama | Error/fakta yang relevan, pendekatan yang berubah, hasil terverifikasi, lesson/procedure dengan konteks dan sumber yang dapat diperiksa. |
| Sesi baru, tanpa riwayat chat lama | Recall record/procedure yang tepat, alasan applicability ringkas, tindakan yang mengikuti atau memperbaiki prosedur, dan outcome yang dapat diukur. |
| Kasus mirip tetapi kondisi berbeda | Memeriksa precondition, tidak menerapkan solusi lama secara buta, mengadaptasi strategi berdasarkan fakta baru. |
| Catatan lama bertentangan dengan source sekarang | Menandai ketidakcocokan, tidak menimpa fakta baru dengan memory lama, memperbarui pengetahuan hanya dengan evidence dan izin yang tepat. |
| Pergantian model yang didukung pada desain kelak | Catatan/provenance tetap utuh; continuity dan kualitas tindakan diuji, bukan diasumsikan sama pada semua model. |

Metrik yang diusulkan: keberhasilan task, pengulangan kesalahan yang sudah dikenal, tool-call atau waktu menuju koreksi, relevansi/applicability recall, salah-pakai memory usang, keberhasilan prosedur dan overhead. Untuk klaim improvement yang lebih kuat, rancang pembanding dengan model/task/environment sebanding dan memory reuse on/off atau variasi terkontrol, tanpa menghapus Memory produksi. Pisahkan urutan/variance model dan hasil observasional dari klaim kausal. Ambang dan jumlah percobaan masih perlu disepakati; tidak ada angka yang ditetapkan seolah-olah sudah diukur.

Evidence pemakaian cukup berupa record/digest yang dipilih, ringkasan alasan yang aman, tool arguments relevan, hasil dan verification artifact. Tidak membutuhkan akses ke atau penyimpanan private chain-of-thought. Satu demonstrasi positif tidak membuktikan kemampuan umum atau peningkatan pada semua tugas.

## 7. Authority, continuity dan batas pekerjaan

`Target-Feture.md` dipertahankan sebagai arsip percakapan sumber. Dokumen ini adalah rumah penjelasan arah produk yang dikonfirmasi pengguna, bukan salinan katalog donor atau pengganti kontrak. Klaim spesifik repository di transcript belum diverifikasi ulang dalam tugas ini; evaluasi donor baru harus source-first dan sesuai izin.

`CODEBASE.md` memetakan keadaan yang benar-benar diimplementasikan. Status selesai per-wave tetap berlaku pada scope-nya dan tidak boleh diperluas menjadi klaim seluruh target tercapai. Ringkasan arah ditautkan dari README, AGENTS dan root MEMORY; canonical Memory native menyimpan konteks arah pada record yang sudah ada agar sesi berikutnya tidak kembali menganggap Agent Core hanya kumpulan MCP tool.

Hermes dalam target ini merupakan pembanding pengalaman/learning, bukan kewajiban menghidupkan kembali legacy Partner bridge. Penghapusan bridge lama dan batas external RDC tetap berlaku. Model/controller eksternal saat ini serta future/native agent runtime harus dibedakan; workstream native yang sedang dikerjakan tidak diganti atau dimutasi oleh pencatatan arah ini.

Memory, Learning, Skills, Grafel, Semantic IDE dan machine-control tetap sibling. Tidak ada routing/approval gate, DAG, cross-lock, second Memory authority, hidden model call atau scheduler baru. Privasi, otorisasi, protected-path, biaya dan batas operasi tidak hilang karena targetnya autonomous. Agent seharusnya gigih menggunakan evidence, tetapi tidak mengabaikan penghentian pengguna atau berpura-pura hasil yang belum terbukti.

Tugas 2026-09-30 ini hanya memperbarui arah dokumentasi dan konteks canonical Memory dengan pembacaan source terarah. Tidak mengimplementasikan agent loop, tidak memasang donor, tidak membaca protected references/secret files, tidak menjalankan evaluasi yang diusulkan, tidak mengubah model, dependency, release, atau runtime.

## 8. Rujukan dan batas bukti

Dasar intent: `Target-Feture.md` baris 7-17 (badan dan otak), 423-521 (learning, local memory dan reuse), 614-646 (knowledge synthesis dan empat karakter), 654 (konfirmasi); ditambah pernyataan langsung pengguna pada 2026-09-30 bahwa inilah tujuan sebenarnya dan alasan grounding/steal & use.

Bukti pembacaan terarah: `src/index.ts`, `src/learning/service.ts`, `src/learning/sink-manager.ts`, `src/learning/memory-sink.ts`, `src/memory/retrieval-ledger.ts` serta status artifact-only di `src/skills/service.ts`; konteks historis UI pada `Agent-Core-AI-Chat-Placeholder-Task-20260926.md`. Pemeriksaan ini cukup untuk membedakan fondasi dari target, bukan audit menyeluruh lintas semua caller, native AI worktree, donor dan sesi.

Cadangan dokumen sebelum pembaruan serta identitas file yang dipantau: `../runtime/tmp/product-direction-alignment-20260930/`. Readback dokumen menguji penulisan dan keterhubungan rujukan, bukan peningkatan kecerdasan atau kelulusan acceptance produk.

## 9. Native Agent Capability Parity closure — 2026-10-03

Native Agent Capability Parity is now resident-verified for the planned scope. The final outstanding P8 generic Web Research acceptance is closed: a fresh resident Native Agent conversation requested task-scoped `web.research`, executed two `web_search` calls and two `web_open` calls, submitted explicit inspectable tool evidence through `agent_core_finalize`, reached terminalOutcome=`verified`, and completed Learning finalization before returning the assistant response.

The final P8 task used official Node.js web evidence and completed on the same Agent Core-owned runtime/body without ChatGPT platform web tools. Dynamic grants, shared Memory/Learning, provider scheduling, verification and fail-closed finalization remained authoritative.

Current product baseline therefore includes EC-9, persistent provider scheduling, IAC-9, DTC-1, NACP-0..NACP-10 and P8 live Web Research as resident-verified capabilities. Future work should build on these authorities instead of reopening them without contradictory current-source/runtime evidence.

The NACP changeset remains unapplied. This closure does not authorize release apply, version mutation, Git-history mutation, publication or deployment.