# Agent Core Self-Improvement: hasil implementasi 7 Oktober 2026

**Status: IMPLEMENTED — RESIDENT-ACTIVATED — EXPLICIT NATIVE SKILL ACTIVE + NATIVE-USE VERIFIED + PROPOSAL REGISTRY RECONCILED/REMINDER RETIRED; INTERRUPT/RECONNECT DAN JUNCTION MASIH OPEN.**

Otorisasi: implementasi P0–P6 dari [plan](Agent-Core-Self-Improvement-Plan.md), pengujian terarah dan kelanjutan aktivasi setelah pengguna meminta lanjut/restart. Source qualification di bawah mendahului pemasangan; hasil resident terbaru ada pada bagian penutup. O1–O3, benchmark besar, instalasi runtime donor dan release tidak dijalankan.

## Hasil implementasi

| Area | Implementasi aktual |
| --- | --- |
| P0: ownership dan kontrak | Learning tetap pemilik registry prosedur/proposal; SkillService tetap pemilik artifact. Field/action lama Skills dipertahankan. Descriptor konektor resident lama belum dianggap refreshed. |
| P1: proposal semantik | Prosedur membuat proposal di `runtime/skills/proposals/<workspace>/<skill>.md`, bukan langsung import. Nama seperti `code-review.md`; UUID/hash/nama Windows terlarang ditolak. Workspace berasal dari registration identity, bukan kecocokan nama folder. |
| P2: reminder dalam sesi | Native menambahkan reminder ke jawaban dan mencatat inclusion sesudah conversation persistence. External mendapat capsule wajib diteruskan. Capsule bukan bukti jawaban sudah dikirim. Reminder utuh, tidak dipotong lalu dianggap exposed. |
| P3: keputusan pengguna | Approve/revise/reject/defer terikat revisi, scope dan pesan user yang benar-benar dicatat host. Build dipisah dari build-and-activate; memakai validasi/revision/promotion/rollback SkillService existing. |
| P4: self-awareness | Proyeksi bounded atas katalog, proposal, Memory dan Learning dengan evidence/observedAt/omissions. Koneksi, identity dan rules yang tidak diperiksa tetap unknown; tidak mengklaim seluruh environment telah diaudit. |
| P5: WHY | Proposal, task, bukti, keputusan, revision dan later-use ditelusuri. Bukti dukungan diperiksa ulang; notifikasi revisi lama tidak membuktikan inclusion revisi baru. Expected benefit dipisahkan dari manfaat terukur. |
| P6: outcome review | Bukti penggunaan negatif yang valid langsung meminta review proposal melalui Learning, tanpa scheduler. Active Skill tetap dipertahankan; tidak auto-promote atau auto-delete. Penolakan/defer tetap berlaku bila bukti tidak berubah. |

Native artifact final tetap `runtime/skills/catalog/<name>/SKILL.md`. Proposal `.md` bukan tool backend atau izin baru. Skill lama tidak dihapus/dimigrasikan secara diam-diam.

Pada awal kelanjutan ditemukan implementasi parsial dan log RED/GREEN yang sudah ada. Pekerjaan melanjutkan source tersebut, bukan membuat subsystem kedua. Working tree pengguna yang luas dan belum committed dipertahankan; tidak dilakukan checkout/reset dari legacy.

## Verifikasi yang benar-benar dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| Source: enam suite fitur dan delapan suite regresi terkait | **112 PASS, 0 FAIL, 1 SKIP; 14 file** |
| Enam suite fitur dijalankan terhadap JS kandidat terkompilasi | **53 PASS, 0 FAIL, 1 SKIP; 6 file** |
| Module-load evidence kandidat | **197 modul compiled teramati; hash diperiksa kembali** |
| Root TypeScript compile ke staging | **Exit 0** |
| Path policy | **317 authored files; 0 exceptions** |
| Parity schema Skills sebelum/sesudah | **Action dan field legacy dipertahankan** |
| Manifest kandidat dengan seluruh owner dikonfigurasi | **73 tools, 113.021 bytes / sekitar 28.256 token; budget 122.000 bytes** |

Enam action tambahan berada pada facade `skills` existing: `proposals`, `propose`, `decide_proposal`, `self_awareness`, `explain_improvement`, `review_outcomes`. Tidak ada MCP tool baru khusus self-improvement. Jumlah 73 adalah skenario kandidat seluruh owner, bukan klaim manifest konektor sesi ini.

53 kasus kandidat adalah pengulangan subset kasus source, bukan 53 kasus unik tambahan. SKIP adalah fixture junction yang tidak dapat dibuat filesystem host; tidak dihitung PASS. Guard junction/symlink ada di source, tetapi penerimaan pada junction nyata host ini belum terbukti.

Dua run awal gagal pada fixture Native/chat dengan durasi melewati batas waktu default saat suite dijalankan bersamaan. Reporter JSON hanya menyimpan STACK_TRACE_ERROR sehingga penyebabnya tidak dinyatakan pasti. Run final serial memakai batas 45 detik per test melalui CLI; tidak ada assertion yang dihapus atau batas manifest yang dilonggarkan. Ini bukan pengukuran performa.

## Koreksi yang dibuktikan dengan RED → GREEN

- Perintah biasa seperti `buat ringkasan` tidak lagi menjadi error keputusan Skill; tidak memerlukan owner Skills opsional.
- WHY tidak mempertahankan dukungan verified dari bytes verifier/answer yang sudah berubah; riwayat tetap terlihat sebagai recorded/unknown.
- Reminder/keputusan revisi lama tidak dipakai untuk mengklaim inclusion atau approval revisi terbaru.
- Penamaan menolak UUID dan hash opaque, selain angka, traversal dan reserved names.
- Workspace terdaftar dengan nama berisi spasi memakai folder semantik; collision antar-identitas ditolak.
- Review penggunaan negatif benar-benar dipanggil setelah receipt valid, bukan hanya fungsi yang harus ditemukan manual.
- Capsule panjang memasukkan notice utuh saja; notice yang tidak muat tetap pending.
- Pemborosan indentasi deskripsi MCP dihilangkan tanpa menghapus kata, parameter, instruksi atau batas keamanan.

Helper manifest kandidat awal menolak startup karena snapshot `AGENTS.md` belum disertakan. Snapshot kontrak yang sama kemudian disalin ke staging dan pemeriksaan berhasil; kewajiban kontrak tidak dibypass. TypeScript 7 tidak menyediakan path API compiler legacy yang sempat dicoba; baseline schema ternyata plain ECMAScript sehingga dibandingkan byte-preserving tanpa dependency tambahan.

## Status penerimaan setelah resident readback
1. **Resident installation/restart CLOSED:** 531 file terpasang dan fresh hash semuanya cocok setelah memasukkan patch controller/sourcemap. Core PID 14228 memuat build baru; tidak dilakukan restart tambahan pada finalisasi.
2. **A04 reminder readback berhasil untuk task yang diamati:** jawaban Native tersimpan bersama reminder; external relay disampaikan pada percakapan aktif. Notice Native adalah included-in-response / delivery unconfirmed, bukan ack pengguna. Ini bukan proof kepatuhan setiap sesi/provider.
3. **Persetujuan dan A09 masih OPEN:** tidak ada keputusan pengguna atas proposal baru. Build, activation, rollback dan later-use nyata dari skill tersebut belum dijalankan. Pesan uji controller bukan bukti persetujuan.
4. **A05 interrupted streaming/reconnect masih OPEN:** proposal tetap tersedia setelah restart, tetapi interrupted delivery end-to-end belum diuji.
5. **A13 junction host masih SKIP/OPEN:** traversal, reserved names, poisoning/collision telah diuji sebelumnya; junction nyata tidak dianggap PASS.
6. **P0/A14 dipisahkan:** fresh scoped MCP membuktikan action baru dan targeted Learning review. Descriptor Skills cached pada chat ini masih legacy; refresh descriptor/trusted external user-message ingestion belum diselesaikan. Review task lain tidak ditutup secara massal.

P4 sengaja melaporkan unknown untuk identitas/koneksi/rules yang belum dibaca; tidak ada inventaris global atau audit koneksi menyeluruh. P6 tidak menyediakan aksi menghapus skill; retirement tetap keputusan/pekerjaan eksplisit di luar pemanggilan review.

Grafel reindex request-scoped dijalankan setelah perubahan source. Status akhir graph dicatat terpisah pada evidence; graph yang masih indexing tidak dipakai sebagai bukti final yang current. Exact source tetap authority.

## Penggunaan setelah pemasangan dan readback resident

Facade `skills(action=proposals, workspace=...)` membaca proposal. `self_awareness` dan `explain_improvement` menyediakan proyeksi read-only.
Native chat dapat menerima `/skill build code-review <sha256-revisi>` untuk build saja, atau `/skill approve and activate code-review <sha256-revisi>` untuk build dan aktivasi. Bentuk `buat dan aktifkan code-review` dapat mengikat revisi yang sudah disampaikan dalam sesi yang sama. Persetujuan lama tidak berlaku sesudah isi berubah.

## Lokasi evidence dan preservasi

- Laporan ringkas mesin: `runtime/tmp/self-improvement-20261007/qualification-summary.json`.
- Source matrix: `source-final.json`; compiled matrix: `candidate-core-final.json` pada folder evidence tersebut.
- Contract kandidat: `candidate-contract.json`; jejak module-load/hash: `candidate-imports.jsonl`.
- Log RED/GREEN dan hasil awal yang gagal tetap dipertahankan, tidak dipilih untuk memperbesar angka kelulusan.
- Kandidat compiled: `runtime/build/self-improvement-20261007/dist`; snapshot kontrak/package di parent-nya.
- Backup awal: `runtime/backups/self-improvement-20261007`; backup kelanjutan: `runtime/backups/self-improvement-resume-20261007`.
- Release intent: `.changeset/20261007-self-improvement-skill-proposals.md` (minor). Versi package tetap `0.14.0`; tidak release:apply/commit/tag/push/publish/deploy.

## Ownership yang dipertahankan

- `src/learning/skill-proposal-types.ts`, `skill-proposals.ts`, `skill-proposal-files.ts`: schema/state, identitas, CAS dan Markdown projection.
- `src/learning/skill-proposal-notification.ts`, `skill-proposal-decisions.ts`: notice dan keputusan revisi/scope.
- `src/learning/self-awareness.ts`, `improvement-explanation.ts`, `skill-outcome-review.ts`: proyeksi evidence dan review hasil penggunaan.
- `src/learning/service.ts`, `state.ts`, `types.ts`, `external-controller.ts`: satu owner Learning dan wiring dua controller; pending review lain dipertahankan.
- `src/skills/service.ts`: native artifact build/import/staging/promotion/rollback; tidak menambah execution authority.
- `src/mcp/skills-schemas.ts`, `skills-tools.ts`, `skill-proposal-actions.ts`, `external-controller-tool-support.ts`, `learning-tools.ts`, `controller-learning-tools.ts`, `server.ts`: facade/schema/capsule dan normalisasi whitespace manifest.
- `src/agent-controller.ts`, `agent-runtime.ts`, `agent-chat-service.ts`: final response Native dan pesan user host. `src/agent-capability-catalog.ts` mempertahankan action proposal/status/WHY yang read-only pada grant inspeksi.
- `src/memory/service.ts`: identitas workspace dari registrasi yang sudah diverifikasi.
- `AGENTS.md`: kontrak proposal/reminder, tidak mengganti policy dengan prompt donor.

Tidak ada dependency/toolchain baru, clone donor, perubahan protected reference, atau pemasangan model kedua. Tidak ada benchmark 64-run/full suite/visual checks baru. Perubahan mengikuti mekanisme referensi pada commit GitHub yang sudah dipin dalam plan; bukan menyalin backend Muse atau mengklaim blueprint donor sebagai source resmi.

## Resident activation dan kelanjutan pasca-restart — 7 Oktober 2026

Jejak pemasangan yang ditemukan mendahului finalisasi docs: pada 03:56 UTC, 531 file dipasang dengan backup dan 6 aset UI dipertahankan; Core 9488 menjadi 10128. Native acceptance pertama gagal AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED dan tidak menghasilkan jawaban. Source kemudian diperbaiki: modelVisibleToolResult pada src/agent-controller.ts menampilkan identitas bukti dari successful local/Skills results, bukan hanya web results. Model tetap memilih ref secara eksplisit; verification/consent tidak dibypass.

Koreksi mempunyai RED/GREEN source 61 PASS / 0 FAIL / 1 host SKIP pada tujuh suite; satu regression terpilih terhadap compiled candidate PASS dengan tujuh kasus lain tidak dipilih. Build correction exit 0. Hanya agent-controller.js dan .map dipasang pada 04:27 UTC; Core baru PID 14228, launcher 7772 dan tunnel 5556 dipertahankan. Riwayat bukti ini tidak dipresentasikan sebagai test rerun pada finalisasi sekarang.

Fresh final readback memeriksa kembali manifest gabungan: **531/531 hash cocok**, /health ok v0.14.0, Memory/Learning/Skills/Grafel/Semantic IDE available. Core PID 14228 masih berjalan sesudah cutover; tidak ada restart atau perubahan production source baru pada kelanjutan ini.

Pada readback historis sebelum explicit user-authoring, fresh authenticated MCP memakai grant terbatas dan credential sementara yang direvoke: enam action proposal tersedia, proposals/self_awareness/explain_improvement berhasil, katalog saat itu masih satu skill existing. Pada titik historis tersebut proposal agent-core-runtime-activation-audit masih notified, artifact not-built, decisions 0, awaiting-verification. State ini kemudian superseded oleh active-artifact reconciliation yang dicatat di bagian penutup; tidak ada persetujuan model-palsu.

Satu task Native read-only baru berhasil melalui provider Gonka / MiniMaxAI/MiniMax-M2.7: conversation f3780c6d-403e-4f0e-b800-5f862b51ff13, turn bafa3f77-4f64-4d21-894a-b9c853ffd686, task 903f44ba-eb9e-48f9-b274-c334c4b38fd0. get_config dan read_file benar-benar berhasil. Jawaban tersimpan, turn finalized, Learning complete/no-new-knowledge, dan notice revisi yang sama recorded included-in-response / delivery unconfirmed.

Ref yang dipilih model: tool:dtc:903f44ba-eb9e-48f9-b274-c334c4b38fd0:chatcmpl-tool-af371d82c0352a1d. Independent job verification tetap unavailable; controller memeriksa file, jawaban dan persistence secara terpisah. Native retest tidak memanggil Skills.proposals, sehingga success facade tidak diatribusikan pada task Native ini. Test ini bukan held-out skill-use atau benchmark manfaat. Conversation uji diarsipkan secara reversible; evidence tetap tersimpan, running Native turns 0.

Evidence utama: runtime/tmp/self-improvement-activation-20261007/postrestart-closure.json, postrestart-current-readback.json, postrestart-facade-readback.json, native-retest-proof.json, native-retest-result.json dan native-retest-detail.json. Backup docs finalisasi: runtime/backups/self-improvement-postrestart-closure-20261007. Existing minor changeset mencakup evidence handoff; tidak membuat intent duplikat atau menerapkan release. Versi tetap 0.14.0.

## Tindak lanjut yang tepat

Tidak perlu memasang candidate atau restart lagi untuk fitur inti yang sudah dibaca balik. Proposal `agent-core-runtime-activation-audit` kini sudah active dan registry-nya direkonsiliasi menjadi `implemented / catalog-active`; tidak ada lagi langkah keputusan/build/activate yang tertunda untuk proposal ini. Interrupted-delivery, junction host, cached external descriptor, dan trusted external user-message ingestion sebagai gap umum tetap dicatat OPEN. Jangan menyatakan seluruh plan STABLE/COMPLETE atau peningkatan terukur berdasarkan keberhasilan jalur ini.

## Explicit native Skill activation and later-use verification — 7 Oktober 2026

Setelah user secara eksplisit menyetujui pengerjaan proposal, artifact `agent-core-runtime-activation-audit` dibuat melalui jalur explicit user-authoring SkillService. Jalur `decide_proposal` tidak digunakan karena connector external tidak membawa trusted persisted user-message evidence; tidak ada `user-message:*` sintetis.

Artifact tervalidasi dan diimpor dengan digest `sha256:dc8a49f3ff2b811671de9f40339cab7e81d1ef5a7cc64b75df1092bd3debbb8d`. Catalog readback berisi dua skill dan knowledge synthesis menampilkan artifact baru sebagai active. Metadata artifact mengikat asal proposal/revision tanpa memakai reserved approval metadata.

Native acceptance read-only kemudian benar-benar menggunakan skill tersebut:
- task `59a5e5d1-c7d2-4215-b47a-3480943bc24e`, conversation `3f772cee-a024-40e0-a75f-7a794fa27eac`;
- task finalized, terminalOutcome=verified, independent verification tetap unavailable;
- `artifactUse` mencatat skill tersebut dengan applicability `applied`;
- 12 tool calls, 0 tool failures, Learning finalization complete/awaiting-verification;
- response assistant tersimpan; test conversation kemudian diarsipkan reversible;
- final health v0.14.0 ok, Agent Runtime skillCount=2, running turns=0.

Evidence closure awal: `runtime/tmp/explicit-skill-authoring-20261007/closure.json`. Reconciliation berikutnya memeriksa metadata origin proposal ID/revisi pada active artifact dan mengubah registry menjadi `implemented / catalog-active` dengan fulfillment `active-artifact-reconciliation`; pending reminder untuk proposal tersebut menjadi 0. Ini tidak mengarang `user-message:*` atau mengubah qualification/benefit evidence. Qualification proposal dan measured benefit tetap tidak dinaikkan tanpa evidence yang sesuai.
