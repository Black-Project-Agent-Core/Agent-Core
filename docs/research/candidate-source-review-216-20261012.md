# Register Analisis Source 216 Kandidat

**Status:** analisis statis terarah; bukan 216 instalasi dan bukan klaim seluruh repository dijalankan. Dokumen ini register keputusan, bukan plan batch tambahan.

Semua ID asli 1–216 dipertahankan. Detail commit, path source, cakupan pembacaan, pembanding Agent Core, dan batas lisensi ada di JSON pendamping. `extend` berarti ada mekanisme layak dipertimbangkan; bukan semua otomatis dipilih untuk integrasi. `reuse` harus berdasarkan kecukupan mekanisme, bukan keberadaan nama fitur saja.

**Pembagian awal (historis, bukan status terkini):** Batch 1 mengadopsi mekanisme #73, #133, dan #178 untuk satu jalur pembacaan web native. Batch 2 belum disusun; kandidat lain tidak otomatis dianggap sebagai pekerjaan implementasi yang tertunda.

## Batch 5–6 — implementation/integration COMPLETE, 14 Oktober 2026 Asia/Tomsk

Batch 5 source kini memasang Jaccard berbatas untuk pasangan tanpa salah satu vector pada selector canonical; cosine dua vector, skor native, eligibility dan identitas tetap. Batas invocation: 256 content, 8192 Unicode codepoints/content, 512 token unik/content, 8192 pasangan lexical. Metadata selection memperlihatkan basis dan cakupan; rankingRevision hanya berubah untuk fusion. Satu pemeriksaan terarah lulus (1 passed, 6 skipped), bukan bukti manfaat retrieval atau cabang lexical pada runtime aktif.

Batch 6 source kini membawa PdfEvidence optional dari snapshot bytes yang sama melalui parser, projection, filesystem dan web. Maksimum 32768 byte JSON compact, 8 halaman, 32 item/halaman dan 160 codepoints/cuplik. Koordinat tetap approximate-text-item dalam PDF-user-space; OCR/tabel semantik unsupported/not attempted. web_open.pdfPages menambah selector native PDF; read_file mempertahankan pagination existing. Output model-facing membawa JSON evidence utuh melalui pembatas keluaran, dengan marker Symbol internal yang tidak diserialisasi. Local native PDF kini membaca regular-file bounded 128 MiB; dependency tetap membaca dokumen sebelum selection, sehingga batas evidence bukan batas CPU/time parser.

Build produksi gabungan resmi dan pemeriksaan terarah lulus: path policy 371 authored files/0 exceptions; lexical 1 passed/6 skipped; dua pemeriksaan batas dan pengiriman PDF lulus. Setelah penggunaan nyata menemukan diagnosis output-truncated palsu akibat normalisasi whitespace, helpers.ts diperbaiki agar hanya melaporkan pemotongan byte aktual dan service meneruskan boolean tersebut. Build koreksi resmi PID10624 selesai exit 0 dalam 16,10 detik dengan 371 authored files/0 exceptions. Resident koreksi sudah diaktifkan dan keluaran web/lokal nyata sudah diverifikasi; rincian receipt berada di bawah.

Schema resmi `SubProject/Agent-Core-Batch-05-06-MCP-Schema-20261014.json` berasal dari registration/Zod melalui `release:compat --manifest-only`, stale=false. Cohort client yang sama tetap 78 tools, 130150 byte, naik 335 dari baseline Consumer 129815 byte; tersisa 922 byte terhadap 131072. SHA256 `3c553f0cecfdcf53c126992c1bcdbda3548b2acb632bb079f5d433321072b7cb`. Cohort reviewed 75 tools dihitung terpisah: 124014/131072 byte.

ZIP `SubProject/Agent-Core-ChatGPT-Plugin-Batch-05-06-v1.0.3.zip` berukuran 543 byte, SHA256 `003dadefc28351ecf9b8af24e15c240e3df9572b2f23d4ac95ac931ab286d7ac`. Dua member wrapper mempertahankan app `asdk_app_6acd4cde8b008191bf289261ed843a17`, key/name `dev-6acd4cde8b008191bf289261ed843a17` dan metadata existing. Plugin 1.0.3 sudah diunggah sebagai release `pluginrel_6ace893c75588191bc7d7b1d17ec6261`; runtime product tetap 0.15.0-beta.3. Koreksi diagnostik tidak mengubah kontrak tool, schema atau ZIP, sehingga tidak memerlukan upload ulang.

Restart yang dijalankan pengguna tercatat pada receipt `a779c6cf88604708a503d7b18efdf819`, exit 0 pada `2026-10-13T19:41:53.0630171Z`. Launcher PID18824 dan node PID10960 memuat build awal; seluruh 18 pasangan hash source/build cocok sebelum koreksi. Client sudah menampilkan pdfPages, autoCheckpoint, retrievalPlan dan imageReview. Pemanggilan fusion full menghasilkan 3 record dengan diversityVersion `semantic-lexical-mmr/v1`, basis none/semantic, lexicalPairsEvaluated 0 dan skipped 0, coverage complete. Cabang fallback lexical belum teramati pada pemanggilan tersebut; manfaat retrieval belum diukur.

PDF Mozilla TraceMonkey nyata dibaca terpisah melalui web_open dengan `pdfPages:{start:2,count:1}` dan read_file lokal dengan `offset:1,length:1`. Keduanya melaporkan SHA256 `3662ff519e485810520552bf301d8c3b2b917fd2f83303f4965d7abed367e113`, 1016315 byte, 14 halaman total, 32 item/219 omitted, coverage partial, geometri approximate-text-item dan semanticVerification not-performed. Reader lokal juga mengirim 10 image blocks. Temuan output-truncated palsu pada web menjadi dasar koreksi yang sudah dibangun dan diaktifkan; pemakaian ulang pada resident koreksi dicatat berikut.

Koreksi diaktifkan melalui satu restart dengan script existing setelah izin pengguna untuk auto-approve demi perkembangan Agent Core. Receipt `runtime/restart/2a92ce7b93384ed1bcf12ff05c96c780.json` mencatat completed/exit 0 pada 20:05:34 UTC. Core PID6968, parent launcher PID13436, mulai 20:05:36.1814640 UTC; executable runtime/node/node.exe dan dist/index.js diverifikasi, tunnel PID4168. Seluruh 19 pasangan source/emitted cocok setelah restart, changed[]. Pemanggilan web_open pada 20:09:33 UTC dan read_file pada 20:10:00 UTC mengirim PdfEvidence halaman 2 sampai controller; output-truncated palsu sudah hilang. Coverage partial kini hanya beralasan item-limit: 251 item terpilih, 32 dikirim, 219 omitted; reader lokal tetap mengirim 10 image blocks.

Cleanup selesai melalui pemindahan recoverable dengan Move-Item, proses PID2468 exit 0 pada `2026-10-13T20:15:46.5822634Z`. Seluruh node-compile-cache dipindahkan ke `runtime/backups/batch05-06-integration-20261014/cleanup-recovered-20261014`: 95 file, 309004 byte, 2 direktori, seluruh 95 SHA256 cocok. Preflight mencatat 0 reparse, 0 referensi proses aktif, 0 referensi Scheduled Task dan hasil handle No matching. Keadaan akhir terverifikasi: `E:/Projects/Agent-Core/temp` tidak ada; `E:/Projects/Agent-Core/runtime/tmp` kosong, 0 child. Receipt `activation-evidence/cleanup-preflight.json` dan `activation-evidence/cleanup-receipt.json` telah dibaca ulang; activation-receipt.json diperbarui in-place untuk resident koreksi, caller dan cleanup.

Canonical Memory existing `4b6d0835-b21e-431f-a724-bc9160c9f6ea` pada root runtime/memory diperbarui dan dibaca ulang pada `2026-10-13T20:22:38.852Z`; riwayat dipertahankan. feedbackTargetDigest `sha256:4404ed57196654c2ffc155042195adb18df0f466c444256d2975a2be2a9fc224`, freshness current/local-byte-snapshot, 3 source anchors, changed[] dan unavailable[]; capture `2026-10-13T20:22:37.798Z`. Learning checkpoint 358, key `batch05-06-20261014-activation-closure`, dibuat `2026-10-13T20:18:52.618Z`; review scoped task selesai dengan no-new-knowledge, complete:true dan 0 candidate pada `2026-10-13T20:19:15.348Z`, lalu status dibaca ulang. evidenceRefs persisted[] tetap kosong; bukti rinci berada di laporan/receipt. Review pending milik pekerjaan lain tidak disentuh. Dokumen ini tetap proyeksi status, bukan owner Memory kedua.

Task existing `ext-8eb792d926a94da18c647b3e07e706b8` dipertahankan. Batch 5–6 telah menyelesaikan implementasi/integrasi sesuai kontrak; fallback lexical aktual belum teramati dan manfaat retrieval/akurasi ekstraksi tidak diukur. Kelanjutan siap menuju Batch 7 lalu Batch 8 dari register 216 kandidat, maksimal dua plan sekaligus. Keduanya belum dimulai; status kesiapan ini tidak mengklaim rencana Batch 7/8 telah disusun atau source/plan telah direview. Consumer/Batch 3–4 tidak dibuka kembali; tidak ada Consumer tambahan atau Invocate. Artefak final berada di SubProject; bukti di runtime/backups/batch05-06-integration-20261014, di luar kedua scope temp. Detail dan receipt: [laporan integrasi Batch 5–6](../Batch-05-06-Windows-Integration-20261014.md). Riwayat di bawah bukan status pelaksanaan sekarang.
## Riwayat: Status terkini Batch 5–6 — koreksi bukti, 14 Oktober 2026 WIB

**Implementasi belum terpasang; penyebab penghentian belum terverifikasi karena bukti primer tidak tersedia.**

Pasangan request–response asli dugaan penolakan edit source dan inspeksi proses tidak tersedia pada konteks/riwayat yang dapat diakses. Catatan asisten lama bukan bukti primer dan tidak menjadi larangan seluruh task. Otorisasi Batch 5 lalu Batch 6, keputusan kandidat dan semua 216 ID tetap; koreksi ini tidak menjalankan ulang operasi atau mengganti jalur untuk melewati penolakan nyata. Lihat docs/Batch-05-06-Windows-Integration-20261014.md dan canonical Memory 4b6d0835-b21e-431f-a724-bc9160c9f6ea. Tidak ada payload rekaan atau klaim implementasi selesai.

### Riwayat status sebelumnya — dipertahankan; penyebab belum terverifikasi

## Status pelaksanaan Batch 5–6 — 14 Oktober 2026 WIB

Pengguna telah mengotorisasi Batch 5 (#47 selected; #92 supporting-only) lalu Batch 6 (#120/#140); bukan lagi menunggu persetujuan scope. Status sekarang BLOCKED BEFORE PRODUCT SOURCE MUTATION: pembacaan source/donor dan backup terarah berhasil, tetapi edit pertama pada selector canonical ditolak pemeriksaan keamanan platform; hash source tidak berubah. Batch 6 hanya diinspeksi read-only. Tidak ada source/build/aktivasi/ZIP/cleanup Batch 5–6 yang selesai. #30/#34/#83 tetap deferred dari batch ini. Task ext-8eb792d926a94da18c647b3e07e706b8; laporan docs/Batch-05-06-Windows-Integration-20261014.md. Keputusan source dan semua 216 ID tetap; label PAUSED pada checkpoint Consumer dan alokasi historis di bawah disupersede otorisasi ini, bukan bukti implementasi. Consumer dan Batch 3–4 tetap selesai untuk scope sebelumnya; perluasan Consumer dan Invocate tidak dimulai.

## Checkpoint prioritas Consumer historis — 13 Oktober 2026

Batch 3–4 COMPLETE untuk kontrak yang diterima. Consumer hanya pengikatan invocation -> task asal (kelanjutan #90) dan checkpoint opt-in existing. Pada 14 Oktober 2026 WIB, plugin yang sama versi 1.0.2 dan empat field autoCheckpoint sudah terlihat; Core 8424/launcher 13268 berjalan setelah build final. Pemakaian nyata mencatat satu skip budget-exceeded dan satu captured checkpoint dc7b2438-d3f9-42b3-b818-37ac3b89060e (1 path/10279 byte), dengan show dan hash preimage/blob cocok. Capture tersebut tercatat unbound/observer-unavailable tanpa taskId palsu; kasus rotation/closed-task tidak dipaksakan. Cleanup recoverable selesai: temp tidak ada, runtime/tmp kosong, 93/93 hash cache dipertahankan di backup. Laporan dan finalisasi Memory/Learning task ini: docs/Consumer-Invocation-Checkpoint-Integration-20261013.md. Batch 5 #47 dan Batch 6 #120/#140 tetap PAUSED dengan ID/rencana dipertahankan. Invocate bukan invocation: Invocate paling terakhir setelah semua rencana lain selesai, dan tidak dimulai otomatis setelah Consumer. Keputusan donor historis dalam tabel bukan klaim runtime tambahan.

## Jumlah keputusan

- defer: 54
- extend: 15
- no-source: 21
- reject: 38
- reuse: 88

## Ledger per kandidat

| ID | Kandidat | Keputusan source | Kedalaman inspeksi | Alokasi |
|---:|---|---|---|---|
| 1 | ACE — Agentic Context Engineering | reuse | code | Belum dialokasikan |
| 2 | MemRL | reuse | code | Belum dialokasikan |
| 3 | GEPA | reuse | code | Belum dialokasikan |
| 4 | DSPy / MIPROv2 | defer | code | Belum dialokasikan |
| 5 | Reflexion | reuse | code | Belum dialokasikan |
| 6 | ExpeL | reuse | code | Belum dialokasikan |
| 7 | Voyager | extend | code | Belum dialokasikan |
| 8 | TextGrad | defer | code | Belum dialokasikan |
| 9 | SICA — Self-Improving Coding Agent | defer | code | Belum dialokasikan |
| 10 | Darwin Gödel Machine / DGM | defer | code | Belum dialokasikan |
| 11 | Memento | reuse | code | Belum dialokasikan |
| 12 | ACON — Agent Context Optimization | defer | code | Belum dialokasikan |
| 13 | SkillRL | reuse | code | Belum dialokasikan |
| 14 | Agent Lightning | defer | code | Belum dialokasikan |
| 15 | Self-Refine | reuse | code | Belum dialokasikan |
| 16 | ReasoningBank | reuse | code | Belum dialokasikan |
| 17 | AutoSkill / SkillEvo | extend | code | Belum dialokasikan |
| 18 | Acontext | reuse | code | Belum dialokasikan |
| 19 | MetaClaw | reuse | code | Belum dialokasikan |
| 20 | Hermes Agent | reuse | code | Belum dialokasikan |
| 21 | OpenSkill | defer | code | Belum dialokasikan |
| 22 | Agent Workflow Memory / AWM | reuse | code | Belum dialokasikan |
| 23 | Agent Skill Induction | reuse | code | Belum dialokasikan |
| 24 | Skill-Pro / ProcMEM | defer | code | Belum dialokasikan |
| 25 | SimpleMem / EvolveMem | extend | code | Dipilih Batch 3 (13 Okt 2026): native bounded controller-led subquestion recall; source built, resident/client tracked separately; donor runtime/LLM tidak diadopsi |
| 26 | memU | reuse | code | Belum dialokasikan |
| 27 | Hindsight | reuse | code | Belum dialokasikan |
| 28 | ReMe | reuse | code | Belum dialokasikan |
| 29 | Zep / Graphiti | reuse | code | Belum dialokasikan |
| 30 | Mem0 | reuse | code | Belum dialokasikan |
| 31 | A-MEM | reuse | code | Belum dialokasikan |
| 32 | Letta / MemGPT → Letta Code | reuse | code | Belum dialokasikan |
| 33 | Cognee | reuse | code | Belum dialokasikan |
| 34 | OpenViking | reuse | code | Belum dialokasikan |
| 35 | EverMemOS → EverOS | reuse | code | Belum dialokasikan |
| 36 | MemOS — local Reflect2Evolve | reuse | code | Belum dialokasikan |
| 37 | Memvid | reject | code | Belum dialokasikan |
| 38 | LangMem | reuse | code | Belum dialokasikan |
| 39 | OpenAI/Bain — Self-Evolving Agents | defer | code | Belum dialokasikan |
| 40 | OpenAI — Memory and Compaction | defer | code | Belum dialokasikan |
| 41 | OpenAI — Session Memory | defer | code | Belum dialokasikan |
| 42 | OpenAI — Reinforcement Fine-Tuning | defer | code | Belum dialokasikan |
| 43 | Anthropic — Client-side Memory Tool | reuse | code | Belum dialokasikan |
| 44 | Anthropic — skill-creator | defer | code | Belum dialokasikan |
| 45 | Anthropic — Long-Running Agent Harness | reuse | code | Belum dialokasikan |
| 46 | Anthropic — Claude Code Auto Memory | reuse | docs | Belum dialokasikan |
| 47 | xAI — Grok Build Memory | extend | code | Batch 5 implementation/integration COMPLETE; fusion full nyata dan metadata diversity teramati; fallback lexical aktual belum teramati/manfaat belum diukur; #92 supporting-only |
| 48 | xAI — Progressive Tool Disclosure | reuse | code | Belum dialokasikan |
| 49 | xAI — Multi-turn Conversation | defer | code-web-snapshot | Belum dialokasikan |
| 50 | DeepSeek-R1 / R1-Zero | defer | model-metadata | Belum dialokasikan |
| 51 | DeepSeekMath-V2 | defer | code | Belum dialokasikan |
| 52 | DeepSeek Engram | reject | code | Belum dialokasikan |
| 53 | DeepSeek Harness — MCP Memory | reject | code | Belum dialokasikan |
| 54 | EXAONE Deep | defer | model-metadata | Belum dialokasikan |
| 55 | Motif-2-12.7B-Reasoning — curriculum | defer | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 56 | Motif — budget dan repetition stop | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 57 | GLM-4.5 / GLM-4.5-Air | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 58 | GLM-Z1-Rumination-32B-0414 | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 59 | slime — ekosistem GLM | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 60 | SEAL — Self-Adapting Language Models | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 61 | SEAgent | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 62 | CoReaAgents | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 63 | Sai by Simular | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 64 | Agent S / Agent-S | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 65 | Simulang / simulang-js | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 66 | SAI — Stack of AI | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 67 | Sai — Rust coding workbench | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 68 | Atria Dawn Preview | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 69 | atria — terminal session manager | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 70 | AC — Wrtn Labs | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 71 | Agentica / MicroAgentica — Wrtn Labs | defer | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 72 | Evidence — Wrtn Labs | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 73 | web-content-extractor — Wrtn Labs | extend | focused-static-source-call-path; no donor execution | Batch 1 |
| 74 | Storm MCP Server — Sionic AI | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 75 | Document Parse — Upstage | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 76 | Studio + Agents API — Upstage | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 77 | CLOVA Studio / Skill Trainer — NAVER Cloud | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 78 | AI:GO — Lablup | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 79 | Brity Automation Agent — Samsung SDS | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 80 | Knowledge Studio — Saltlux | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 81 | Agent Studio — Saltlux | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 82 | AutoRAG 2.0 / AutoRAG Agent — Markr.AI | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 83 | Agent Memory Distillation / AMD — KAIST + DeepAuto.ai | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 84 | Personalize-then-Store / PerMemBench — KAIST | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 85 | Memory Transfer Learning / MTL — KAIST + NYU + DeepAuto.ai | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 86 | Membrane — KAIST AI + KakaoBank | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 87 | WorldMM — KAIST + NTU Singapore + DeepAuto.ai | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 88 | Sionic Maestro Skills — Sionic AI | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 89 | MCP-SIM — KAIST Mechanical Engineering | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 90 | EXAONE-Cookbook + K-EXAONE 2.0 — LG AI Research | defer | focused-static-source-call-path; no donor execution | Consumer native invocation attribution resident 14 Okt 2026; plugin 1.0.2, real checkpoint/skip observed, cleanup completed; donor decision remains historical |
| 91 | Solar Agent Cookbook + Document AI MCP — Upstage | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 92 | Dataverse — Upstage | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 93 | OmniServe + HyperCLOVA X SEED — NAVER | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 94 | Kanana + FunctionChat-Bench — Kakao | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 95 | A.X K2 — SK Telecom | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 96 | Saï / Sai / 사이 — Lumigloo Inc. | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 97 | PREPING — KAIST/DeepAuto | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 98 | HINT-SD — KAIST/DeepAuto | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 99 | Paper2Code / PaperCoder — KAIST/DeepAuto | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 100 | Super Library Agent / SLA — KAIST/DeepAuto | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 101 | AutoML-Agent — DeepAuto.ai + KAIST | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 102 | Agentic Predictor — DeepAuto | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 103 | ResearchAgent — kolaborasi KAIST | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 104 | Agent Distillation — kolaborasi KAIST | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 105 | MetaSPO — KAIST/DeepAuto | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 106 | MPO — KAIST/DeepAuto | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 107 | UniversalRAG — KAIST/DeepAuto | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 108 | Adaptive-RAG — kolaborasi KAIST | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 109 | DAQu — kolaborasi KAIST | reuse | code | Belum dialokasikan |
| 110 | CoLoR — kolaborasi KAIST/DeepAuto | defer | code | Belum dialokasikan |
| 111 | Sketch-of-Thought / SoT — kolaborasi internasional KAIST | reuse | code | Belum dialokasikan |
| 112 | SafeRoute — kolaborasi KAIST | reject | code | Belum dialokasikan |
| 113 | T-MAP — kolaborasi KAIST | reuse | code | Belum dialokasikan |
| 114 | KALMV — kolaborasi KAIST | reuse | code | Belum dialokasikan |
| 115 | KARD — kolaborasi KAIST | defer | code | Belum dialokasikan |
| 116 | Judge Code Efficiency — KAIST/DeepAuto | reject | code | Belum dialokasikan |
| 117 | NELLA — KISTI BLUESKY | defer | partial-code | Belum dialokasikan |
| 118 | DOREA-X / DOREA-XP — KISTI BLUESKY | reuse | partial-code | Belum dialokasikan |
| 119 | DURU — KISTI BLUESKY | no-source | docs-only | Belum dialokasikan |
| 120 | ParserTry — KISTI BLUESKY | extend | partial-code | Batch 6 implementation/integration COMPLETE; pola kontrak kemampuan native tanpa salin source donor; PDF web/lokal dan koreksi diagnostik aktif/terverifikasi; cleanup selesai |
| 121 | rhwp Agent Skills — KISTI BLUESKY | reuse | code | Belum dialokasikan |
| 122 | Scarlet — KISTI BLUESKY | no-source | docs-only | Belum dialokasikan |
| 123 | Aspen-MCP — SNU EPEL | defer | code | Belum dialokasikan |
| 124 | Persode — peneliti institusi Korea | reject | code | Belum dialokasikan |
| 125 | PCBWorld — LG AI Research | defer | code | Belum dialokasikan |
| 126 | LLM-Agent-SAE — Samsung | reject | code | Belum dialokasikan |
| 127 | OpenChrome — maintainer berbasis Seoul | extend | code | Belum dialokasikan |
| 128 | oh-my-agent — FIRST FLUKE | reuse | code | Belum dialokasikan |
| 129 | MIMIC — FIRST FLUKE | reuse | code | Belum dialokasikan |
| 130 | Oh My OpenAgent / OmO — sebelumnya oh-my-opencode | reject | code | Belum dialokasikan |
| 131 | senpi — fork runtime oleh maintainer Seoul | extend | code | Belum dialokasikan |
| 132 | cc-plus — maintainer code-yeongyu | reuse | code | Belum dialokasikan |
| 133 | web-fetch — maintainer code-yeongyu | extend | code | Batch 1 |
| 134 | OMX / OMC — oh-my-codex + oh-my-claudecode | reuse | code | Belum dialokasikan |
| 135 | Ouroboros — maintainer Q00 | extend | code | Belum dialokasikan |
| 136 | AutoBE — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 137 | Connectors — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 138 | Sindie — Wrtn Labs | extend | code | Dipilih Batch 4 (13 Okt 2026): native declarative visual criteria / evidence view binding in image_inspect; source built, resident/client tracked separately; donor scoring/model tidak diadopsi |
| 139 | vector-store — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 140 | OpenDataLoader PDF — Hancom | defer | code | Batch 6 implementation/integration COMPLETE melalui pola metadata native; PDF web/lokal dan koreksi diagnostik aktif/terverifikasi; cleanup selesai; keputusan source historis dipertahankan |
| 141 | PULSE / AutoCode — ETRI | reject | code | Belum dialokasikan |
| 142 | vesslctl + agent skill — VESSL | no-source | docs-only | Belum dialokasikan |
| 143 | Align SDK — Coxwave | reject | code | Belum dialokasikan |
| 144 | NomaDamas tools — MinSync / Jikji / slides-grab / k-skill | extend | code | Belum dialokasikan |
| 145 | MeshKit — maintainer Q00 | reuse | code | Belum dialokasikan |
| 146 | Zeude — ZEP Co., Ltd. | reject | code | Belum dialokasikan |
| 147 | AutoView CLI — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 148 | TencentDB Agent Memory — Tencent Cloud | reuse | code | Belum dialokasikan |
| 149 | RoMem — Tencent | defer | code | Belum dialokasikan |
| 150 | Mandol — ISCAS + Microsoft Research | reuse | code | Belum dialokasikan |
| 151 | openJiuwen — runtime + JiuwenMemory + JiuwenSwarm | reuse | code | Belum dialokasikan |
| 152 | MemoryOS — BAI-LAB | reuse | code | Belum dialokasikan |
| 153 | MemoryBank / SiliconFriend | reject | code | Belum dialokasikan |
| 154 | SelfMem — University of Macau + KAUST | no-source | paper-only | Belum dialokasikan |
| 155 | Trace2Skill — Alibaba Qwen Applications | reuse | code | Belum dialokasikan |
| 156 | SkillClaw — Alibaba AMAP / DreamX | reuse | code | Belum dialokasikan |
| 157 | SkillForge — Alibaba Cloud | no-source | paper-only | Belum dialokasikan |
| 158 | SkillNet / SkillNet-Gym / SkillNet-Fabric | defer | code | Belum dialokasikan |
| 159 | LearnAct — PKU + HKU + ByteDance | defer | code | Belum dialokasikan |
| 160 | AFlow — DeepWisdom dan kolaborator | reuse | code | Belum dialokasikan |
| 161 | AgentSquare — Tsinghua FIB Lab | reject | code | Belum dialokasikan |
| 162 | AgentEvolver — Alibaba Tongyi Lab | defer | code | Belum dialokasikan |
| 163 | AgentScope Tuner / Trinity-RFT — Alibaba | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 164 | Skill Self-Play / Skill-SP — Alibaba Qwen | extend | focused-static-source-call-path; no execution | Belum dialokasikan |
| 165 | TaskMem — ByteDance Seed | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 166 | M3-Agent — ByteDance Seed | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 167 | MiniMax Forge + self-evolution M2.7 | no-source | vendor-docs-only; no public engine verified | Belum dialokasikan |
| 168 | OpenSandbox — asal Alibaba | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 169 | AIO Sandbox — Agent Infra / diperkenalkan ByteDance OSS | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 170 | PaddleOCR / PaddleOCR MCP — Baidu | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 171 | Midscene — ByteDance Web Infra | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 172 | TARS — Agent TARS + UI-TARS Desktop/SDK | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 173 | AgentScope 2.0 — Alibaba Tongyi Lab | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 174 | Eino / Eino ADK — ByteDance CloudWeGo | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 175 | tRPC-Agent-Go — Tencent | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 176 | Qwen-Agent — Alibaba Qwen | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 177 | ModelScope-Agent → MS-Agent — Alibaba | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 178 | Qwen Code — Alibaba Qwen | extend | focused-static-source-call-path; no execution | Batch 1 |
| 179 | Trae Agent — ByteDance | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 180 | Kimi Code CLI — Moonshot AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 181 | MiniMax Code + MiniMax MCP | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 182 | OpenAgentCore — MiniMax | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 183 | DeerFlow 2.0 — ByteDance | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 184 | Coze Studio — ByteDance | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 185 | WeKnora — Tencent | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 186 | Tencent Cloud ADP | no-source | vendor-docs-only; no public engine verified | Belum dialokasikan |
| 187 | JoyAgent-JDGenie — JD.com | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 188 | MetaGPT / OpenManus — DeepWisdom | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 189 | AWorld — Ant Group / inclusionAI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 190 | Open-AutoGLM — Z.ai / Zhipu | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 191 | OSWorld / OSWorld-Verified / OSWorld 2.0 | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 192 | Kagura Memory Cloud — Kagura AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 193 | TreeQuest / Adaptive Branching MCTS — Sakana AI | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 194 | ShinkaEvolve — Sakana AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 195 | SkillPort — gotalab | extend | focused-static-source-call-path; no execution | Belum dialokasikan |
| 196 | cc-sdd — gotalab | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 197 | Caty — self-growth-loop / context-kit / family-memory / harness | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 198 | Eidetic — maintainer issyuNaN | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 199 | BeliefMem — kolaborasi termasuk RIKEN AIP | no-source | paper-only; official release not verified | Belum dialokasikan |
| 200 | The AI Scientist v1 / v2 — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 201 | ALE-Agent / ALE-Bench — Sakana AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 202 | Digital Red Queen / DRQ — MIT + Sakana AI | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 203 | EVE-Agent — Fujitsu / University of Tokyo / RIKEN | no-source | paper-only; official release not verified | Belum dialokasikan |
| 204 | Doc-to-LoRA / Text-to-LoRA — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 205 | Neural Attention Memory Models / evo-memory — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 206 | Fast-weight Product Key Memory — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 207 | Transformer² / self-adaptive-llms — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 208 | Fugu / TRINITY / Conductor — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 209 | Optuna — Preferred Networks | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 210 | J-tau — SB Intuitions | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 211 | FlexEval — SB Intuitions | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 212 | WebChoreArena — University of Tokyo | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 213 | HPC-Agentic-SDK — RIKEN R-CCS | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 214 | Kozuchi Multi AI Agent Framework / self-evolving agents — Fujitsu | no-source | vendor-docs-only; no public engine verified | Belum dialokasikan |
| 215 | Felo API / LiveDoc / Felo Skills | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 216 | ELYZA Agent Tasks / harness self-improvement | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |

## Batas kesimpulan

- Source tidak tersedia publik, hanya dokumentasi/paper, dan kegagalan akses dibedakan pada detail setiap entri. Kegagalan clone tidak membuktikan tidak ada codebase.
- Beberapa entri merujuk repo yang sama; beberapa entri memiliki banyak repo. Jumlah clone tidak sama dengan jumlah kandidat.
- Source donor dibaca tanpa menjalankan dependency, training, model, atau daemon donor.
- Tidak ada klaim kecepatan, ketepatan, atau kualitas terukur dari pembacaan source saja.
- Perbedaan yang mengarah pada penggantian implementasi harus mempertahankan izin, riwayat, kontrak, dan satu owner. Jalur lama yang digantikan tidak menjadi fallback tersembunyi.
- Plan integrasi P0–P5 terdahulu tetap ditutup; register ini menilai improvement berikutnya.

Detail: [JSON source review](candidate-source-review-216-20261012.json).
