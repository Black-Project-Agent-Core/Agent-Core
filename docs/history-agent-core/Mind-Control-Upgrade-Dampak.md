# Upgrade Skill mind-control — usulan dan dampak

> Koreksi locator 2026-10-27: path sumber di dokumen ini menunjuk rumah saat ini, `runtime/skills/capability-packs`. Tanggal, status, keputusan dan digest di bawah tetap bukti peristiwa/revisi asal; perubahan locator ini tidak mengubah record proposal SkillService, mengaktifkan revisi, atau menyatakan isi terbaru sama dengan baseline historis.

Tanggal: 2026-10-26
Revisi: 3
Status: COMPLETED — A+B+C+D; revisi 9 historis, revisi 10 aktif dan target proposal asli selesai (2026-10-27)
Jenis: Skill revision (pendamping proposal facade `mind-control-upgrade`, ID `skill-proposal:a9a893d32b83c0aa4fc8130cb378ae42`, proyeksi `docs/proposals/skills/agent-core/mind-control-upgrade.md`)
Asal dan bukti: `runtime/skills/capability-packs/mind-control/SKILL.md` (baseline adapter-revision 7, digest pada awal usulan `sha256:d3ad77bd8a5811b36af1b5c65e2bc088bd1adf7b67cf6efd5516595a463f974b`, 21.993 byte, 337 baris); `src/skills/discovery.ts` (parser `## Triggers` / `## Non-triggers`); `src/skills/service.ts` (read budget 512–32.768 byte, default 8.192); `tests/capability-pack-indexing.test.ts`; `tests/external-skill-guidance.test.ts`; `docs/research/Always-On-Text-Budget-Phase0-20261026.md` (aturan estimasi token `ceil(byte/4)`).

Dokumen ini bahan keputusan, bukan instruksi aktif. Tidak ada file skill yang diubah pada revisi ini.

## Masalah dan tujuan

**Rekonsiliasi 2026-10-27:** klaim selesai revisi 3 di bawah mencatat A/B/C/D, tetapi revisi 9 belum memenuhi target satu fragmen pada proposal facade asli. User meminta penuntasan. Revisi 10 mempertahankan seluruh prosedur sambil memadatkan body menjadi 7.689 byte; read resident satu respons 8.106 byte pada budget 8.192. Revisi 9 tetap rollback history. Registry proposal kini `implemented/catalog-active` melalui owner rekonsiliasi provenance existing, bukan bukti keputusan Native yang direkayasa. [Proposal dan acceptance final](mind-control-upgrade.md), [bukti](mind-control-upgrade-evidence.json). Riwayat dan angka lama di bawah dipertahankan sebagai bukti revisi sebelumnya.

`mind-control` dibaca penuh oleh Native dan controller eksternal pada setiap task coding. Body 21.993 byte berarti tiga fragment `skills(action=read)` (8.192 byte) dan kira-kira 5.500 token per task, sebelum referensi apa pun dimuat. Sebagian besar body adalah teks appraisal paper ilmiah dari upstream K-Dense yang tidak dipakai pada task coding, dan beberapa kalimat upstream bertentangan dengan gate aktivasi yang ditetapkan pengguna.

Ukuran per bagian (byte, diukur 2026-10-26):

| Bagian | Byte | Dipakai pada task coding |
| --- | --- | --- |
| frontmatter | 855 | ya (metadata katalog) |
| Triggers / Non-triggers / Boundaries | 503 | ya (parser discovery) |
| Agent Core adaptation | 1.804 | ya |
| Core questions (kerangka pengguna) | 1.457 | ya |
| Argument reconstruction | 2.902 | ya, bila klaim diperdebatkan |
| Ownership and attribution | 699 | ya (kepemilikan) |
| Reference Materials (daftar 12 referensi) | 3.346 | sebagian; bisa dipadatkan |
| Overview + When to Use This Skill | 714 | tidak; isinya "untuk klaim ilmiah" dan bertentangan dengan Triggers |
| Appraisal Workflow (PICO, GRADE, RoB) | 1.833 | tidak |
| Core Capabilities | 1.278 | tidak |
| Application Guidelines (RoB 2, ROBINS-I, QUADAS-3) | 3.356 | tidak |
| Remember | 942 | tidak |
| Visual Aids (scientific-schematics, OpenRouter) | 1.347 | tidak; skrip yang dirujuk tidak ada di Agent Core |
| Citing Scientific Agent Skills (arXiv) | 957 | tidak; menyuruh fetch arXiv pada setiap rilis kode |

Total yang tidak dipakai pada task coding: kira-kira 10.400 byte (sekitar 2.600 token) ditambah sekitar 2.700 byte yang bisa dipadatkan dari daftar referensi.

## Paket usulan

### Paket A — ramping body (hemat token, aturan tidak berubah)
Perubahan: pindahkan Overview, When to Use, Appraisal Workflow, Core Capabilities, Application Guidelines, Remember, Visual Aids dan Citing ke berkas baru `references/scientific_appraisal.md` (teks upstream tetap byte-identik di dalamnya, atribusi K-Dense tetap). Padatkan Reference Materials menjadi daftar satu baris per referensi dengan kapan dibaca. Body tersisa kira-kira 8–10 KB.
Dampak: dari 3 fragment read menjadi 1–2 per task coding; perkiraan hemat 2.600–3.300 token dan 1–2 tool call per task untuk tiap controller. Pada Native dengan atria (kira-kira 40 detik per panggilan model), 1–2 tool call lebih sedikit berarti 40–80 detik lebih cepat per task dan lebih jauh dari batas `maxToolIterations` 24.
Risiko: rendah. Parser hanya butuh tepat satu `## Triggers` dan satu `## Non-triggers`; tes indexing memeriksa string trigger yang tetap dipertahankan. Appraisal ilmiah tetap tersedia lewat referensi saat task memang ilmiah.
Reversibel: ya, `skills(action=rollback_revision)` ke digest revisi 7 yang tersimpan di history.

### Paket B — konsistensi isi (hapus kontradiksi)
Perubahan: satu definisi trigger saja (frontmatter description + heading Triggers/Non-triggers); hapus kalimat upstream yang membatasi skill ke "scientific claims"; hapus perintah `generate_schematic.py` (tidak ada di repo, mengirim prompt ke OpenRouter) dan instruksi sitasi arXiv dari body; pindahkan catatan sitasi ke `UPSTREAM.json`/LICENSE.
Dampak: instruksi yang dibaca model tidak lagi saling bertentangan, sehingga keputusan "skip atau pakai" lebih deterministik. Tidak ada perubahan perilaku runtime Agent Core.
Risiko: sangat rendah; hanya teks. Catatan: kewajiban sitasi upstream (MIT) adalah permintaan, bukan syarat lisensi, jadi memindahkannya tidak melanggar lisensi.

### Paket C — tambahan untuk penalaran coding (nilai tambah)
Perubahan: tambah dua bagian pendek (kira-kira 1.200 byte):
1. Tingkat proporsionalitas: T0 cek cepat (lima pertanyaan harian di kepala, tanpa tulisan), T1 catatan tertulis klaim–bukti–rival–flip condition (bug, diagnosis, pilihan desain), T2 rekonstruksi argumen penuh (klaim diperdebatkan atau tindakan tidak reversibel). Dipilih dari taruhan dan reversibilitas, selaras dengan `evidence_links_and_decisions.md` bagian 6.
2. Format catatan penalaran enam baris: Klaim / Teramati / Disimpulkan / Rival / Uji (dijalankan atau diusulkan) / Flip condition + keyakinan ordinal. Dipakai di strategy/hypothesis Native dan `learning(action=decision)` eksternal, sehingga bukti penalaran dapat diperiksa, bukan hanya diklaim.
Dampak: memberi bentuk output yang bisa diaudit; mengurangi "appraisal berlebihan" pada task kecil karena T0 eksplisit boleh.
Risiko: sedang-rendah. Penambahan teks mengurangi sebagian penghematan Paket A; format baru belum terbukti dipatuhi provider Native. Perlu diuji pada Paket D.

### Paket D — evaluasi (bukti sebelum promosi)
Perubahan: tambah `evals/` dengan tiga kasus coding (diagnosis bug dengan dua penjelasan saingan; pilihan desain dengan tradeoff; review "it works" yang belum lengkap) beserta grader; jalankan with-skill vs old-skill lewat subagent; catat pass rate, token dan waktu.
Dampak: memberi angka yang saat ini tidak ada ("manfaat reasoning belum diukur" di `docs/Capability-Index.md`). Menjadi syarat sebelum promosi revisi 8.
Risiko: biaya token beberapa run subagent; hasil mengukur perilaku Claude, bukan provider Native (atria/gonka). Benefit Native tetap belum terukur.

## Mekanisme dan owner existing yang dipakai
SkillService: `stage_revision` dari sumber bundled, `promote_revision`, `rollback_revision`, `list_revisions`. Discovery parser `src/skills/discovery.ts`. Guidance deskriptor `src/skills/external-guidance.ts` (tidak perlu diubah; digest dibaca dari katalog aktif). Dokumentasi yang wajib ikut diperbarui: `docs/CODEBASE.md`, `docs/Capability-Index.md`, `docs/External-Engineering-Skills.md` (menyebut "12 referensi"; menjadi 13 bila Paket A menambah `scientific_appraisal.md`).

## Scope, batas Native, risiko dan otorisasi
- Hanya berkas di `runtime/skills/capability-packs/mind-control/` dan dokumen di atas. Delapan referensi upstream tidak diubah.
- Promosi revisi mengubah digest aktif; deskriptor yang di-cache harus dibaca ulang. Apakah resident perlu `restart_agent_core` untuk memperbarui deskriptor belum diverifikasi; diperiksa pada handshake baru setelah promosi, restart hanya bila deskriptor masih memuat digest lama.
- Tidak ada grant tool, dependensi, jaringan, atau perubahan runtime. Tidak ada rilis/commit/push.
- Versi upstream K-Dense yang lebih baru tidak diperiksa (tanpa jaringan pada task ini); `upstream-version` tetap 1.5.

## Manfaat yang diharapkan dan keterbatasan
Hemat kira-kira 2.600–3.300 token dan 1–2 tool call per task coding per controller (estimasi `ceil(byte/4)`, bukan tokenizer provider). Instruksi konsisten dengan gate pengguna. Bukti manfaat kualitas penalaran baru ada setelah Paket D; sampai saat itu tidak ada klaim perbaikan kualitas.

## Acceptance, evaluasi dan rollback
1. Body `SKILL.md` ≤ 10 KB (target ≤ 8.192 byte) dan terkirim utuh pada digest baru dari offset 0 sampai `nextOffset=null`.
2. `tests/capability-pack-indexing.test.ts` dan `tests/external-skill-guidance.test.ts` lulus tanpa perubahan.
3. Discovery tetap `applicability=declared` dengan string trigger/non-trigger yang sama.
4. Teks upstream yang dipindah byte-identik di referensi baru; LICENSE tidak berubah.
5. Paket D: benchmark tiga kasus tercatat sebelum promosi.
Rollback: `skills(action=rollback_revision)` ke `sha256:d3ad77bd8a5811b36af1b5c65e2bc088bd1adf7b67cf6efd5516595a463f974b`.

## Rekomendasi urutan
A + B bersama (satu revisi, risiko rendah, hemat terbesar), lalu C, lalu D sebelum promosi. Bila ingin paling aman: A + B + D tanpa C dahulu, C menyusul setelah angka D ada.

## Review Native Agent Core sebagai mitra (2026-10-26)
Percakapan `8750bc37-ddb1-47de-b897-198cc2ccf38a`, turn `8cece46e-b544-4b9b-84ee-3f5f6613fc77`, status finalized, provider atria (12 percobaan rate limit 429 sebelum berhasil). Native membaca `SKILL.md` dan `references/question_map.md`, tanpa mengubah file. Laporan Native (self-report; diperiksa silang dengan tabel ukuran di atas):
- Dipakai pada task coding: Agent Core adaptation, Core questions (lima pertanyaan, self-audit, frame check), Argument reconstruction (rival table, flip condition, could/must/never). Sesuai dengan daftar "ya" di tabel.
- Tidak relevan: Appraisal Workflow, When to Use, GRADE/RoB 2/ROBINS-I/QUADAS-3, Visual Aids, Core Capabilities, Reference Materials, Citing. Sesuai Paket A.
- Konflik: Overview upstream vs Agent Core adaptation; duplikasi Triggers/Non-triggers/adaptation ("dua pintu"); Remember masih berbahasa sains. Sesuai Paket B.
- Kurang: contoh debugging end-to-end di body, format output penalaran, aturan proporsionalitas tersebar di tiga tempat. Dua yang pertama ada di Paket C; yang ketiga ditambahkan ke Paket C sebagai konsolidasi.
- Tiga rekomendasi Native: (1) pindahkan bagian upstream ke references, body turun kira-kira 40%; (2) timpa Overview dan satukan gating menjadi satu blok; (3) tambahkan mini-format output dan satu contoh debugging 10–15 baris.

Perubahan usulan akibat review: Paket C bertambah satu contoh debugging ringkas di body (kira-kira 600 byte; contoh panjang tetap di `references/argument_reconstruction.md`) dan konsolidasi aturan proporsionalitas ke satu blok. Perkiraan body akhir Paket A+B+C: 9–10 KB (2 fragment), bukan ≤ 8 KB; Paket A+B saja: kira-kira 8 KB (1 fragment).

Temuan sampingan dari Native, di luar scope proposal ini: pemanggilan `agent_core_finalize` dengan `evidenceRefs` berupa array ditolak dua kali oleh validasi schema ("expected array, received string"), sehingga Native memfinalisasi tanpa `evidenceRefs`. Belum direproduksi oleh controller eksternal; perlu pemeriksaan terpisah pada kontrak tool finalize Native.

## Riwayat revisi
- Revisi 3 (2026-10-26): keputusan pengguna untuk promote C/D dilaksanakan sebagai adapter 9; seluruh hasil iterasi, evaluasi, aktivasi dan batas bukti dicatat; scope proposal selesai.
- Revisi 1 (2026-10-26): usulan awal oleh controller eksternal Claude Code; review Native Agent Core sebagai mitra diminta pada percakapan `8750bc37-ddb1-47de-b897-198cc2ccf38a`.
- Revisi 2 (2026-10-26): hasil review Native dimasukkan; Paket C ditambah contoh debugging ringkas dan konsolidasi proporsionalitas; perkiraan ukuran body dikoreksi.

## Implementasi paket A+B (2026-10-26)
- Sumber `runtime/skills/capability-packs/mind-control` kini adapter-revision 8 (backup revisi 7 di `runtime/build/mind-control-r7-backup-20261026/`). `SKILL.md` 7.785 byte (dari 21.993); delapan bagian upstream dipindah byte-identik ke `references/scientific_appraisal.md` (11.360 byte, dengan atribusi K-Dense dan catatan bahwa gate aktivasi ada di `SKILL.md`); satu definisi trigger; bagian Adaptation, Reference Materials dan Ownership dipadatkan; `UPSTREAM.json` adapterRevision 8. Delapan referensi upstream dan LICENSE tidak berubah (`cmp`).
- Verifikasi: dry-run SkillService membaca kandidat dalam satu fragment 8.192 byte (`nextOffset=null`); discovery `applicability=declared` dengan string trigger/non-trigger yang sama; `tests/capability-pack-indexing.test.ts` dan `tests/external-skill-guidance.test.ts` 7/7 lulus (dua run pertama gagal karena timeout 10–15 detik pada cleanup fixture, lulus dengan `--testTimeout=90000 --hookTimeout=90000`; flake cleanup ini sudah tercatat sebelumnya dan tidak terkait isi skill).
- Staged lewat `skills(action=stage_revision)`: kandidat `sha256:9b97e694092fad4aeff92d3405c3ec18788e4f05eed155607df7d2eff6a3a4c0`, 16 file, 184.149 byte, status `staged`. Tidak dipromosikan; digest aktif tetap `sha256:d3ad77bd…` (revisi 7).
- Keterbatasan: `skills(action=decide_proposal)` menolak keputusan dari controller eksternal karena memerlukan `userEvidenceRef` yang direkam host; keputusan pengguna dicatat di sini dan pada evidenceRefs stage, bukan pada state proposal facade. Manfaat kualitas penalaran tetap belum diukur (Paket D belum diputuskan).

## Keputusan pengguna dan scope
- 2026-10-26, pesan pengguna: "APPROVE paket A dan B proposal mind-control-upgrade (dokumen dampak revisi 2), scope build, belum activate. Kerjakan sekarang." Dilaksanakan sebagai revisi 8 staged (lihat Implementasi).
- 2026-10-26, pesan pengguna: "APPROVE promote_revision mind-control revisi 8 (sha256:9b97e694). Promosikan dan verifikasi deskriptor pada handshake baru." Dilaksanakan: `skills(action=promote_revision)` dengan konfirmasi `PROMOTE_SKILL_REVISION`, status `promoted`, `previousDigest sha256:d3ad77bd…` tersimpan di riwayat, `sourceLineageChanged=false`. Verifikasi: `controller_contract` read+acknowledge baru mengiklankan `mind-control` dengan `expectedActiveDigest sha256:9b97e694…` tanpa restart Agent Core; `skills(action=read)` langsung di server resident pada digest itu mengembalikan seluruh body dalam satu fragment (`totalContentBytes 7785`, `nextOffset null`). Paket A+B: COMPLETED.
- Pada konfirmasi paket A+B, C/D masih belum diputuskan. Keputusan lanjutan pengguna dan penyelesaiannya tercatat di bagian implementasi C/D di bawah.

## Konfirmasi resident lintas controller (2026-10-26)
- Pemeriksaan ulang melalui koneksi Codex: handshake baru mengiklankan digest aktif `sha256:9b97e694092fad4aeff92d3405c3ec18788e4f05eed155607df7d2eff6a3a4c0`; `skills(inspect)` menyatakan adapter-revision 8; `skills(list_revisions)` menunjukkan `staged=[]` dan revisi 7 tersedia di history.
- `skills(read)` pada digest aktif dari offset 0 mengembalikan `totalContentBytes=7785`, `nextOffset=null`, `truncated=false`. Aktivasi sudah terjadi sebelum pemeriksaan ini; tidak ada promosi ulang, build, restart atau tes ulang.
- Status judul diperjelas tanpa mengubah isi paket atau keputusan revisi 2. Dokumen induk tetap aktif karena C/D belum diputuskan. State facade proposal yang masih `notified`/`not-built` terpisah dari katalog revisi yang sudah aktif; state tersebut tidak direkayasa lewat edit Markdown.
- Referensi pemeriksaan: episode `ext-5b2d69d2eccb46538a1f6b90cfd0329e`. Pengurangan ukuran body teramati; manfaat kualitas penalaran dan waktu provider tetap belum diukur.

## Implementasi dan evaluasi paket C/D (2026-10-26)
- Otorisasi pengguna pada chat Codex: "lanjut promote Paket C/D. POSITIVE : Call Native AI Agent Core as Partner". Scope: implementasi, evaluasi, staging dan aktivasi paket C/D yang sebelumnya diusulkan; tidak ada commit/push/rilis produk.
- Kandidat adapter-revision 9 menambah satu blok T0/T1/T2, enam field berlabel dan contoh debugging 10 baris. Lokasi catatan: strategy/hypothesis atau deklarasi Learning existing sesuai schema; jika artifact tidak tersedia, catatan ada di respons. Catatan ini ringkasan bukti/keputusan, bukan private reasoning. T0 tidak melewati gate aktivasi, otorisasi atau verifikasi.
- Body final 10.220 byte (batas 10 KiB=10.240); SHA-256 body `146871adb6080ef28aaaa29c9a40c7eb2740626590a3e73a5a68ecd53b643802`. Dibanding revisi 8 bertambah 2.435 byte; tetap lebih kecil dari revisi 7 21.993 byte. Trigger/non-trigger sama; 13 referensi termasuk scientific_appraisal serta LICENSE byte-identik dengan katalog revisi 8.
- Paket D: tiga kasus coding + grader di `runtime/skills/capability-packs/mind-control/evals/`; `report.md` dan `results.json` mencatat semua run. Baseline dan kandidat A/B/C masing-masing 3/3 substantif (12/12 poin). Kepatuhan record rubrik v2: baseline 0/3, A 0/3, B 1/3, C 3/3. Dua iterasi gagal mempertahankan substansi tetapi belum konsisten menampilkan catatan; kedua versi dan output mentah dipertahankan. Raka menilai ulang secara read-only dan mengonfirmasi skor dari output sebenarnya.
- Rubrik v2 memperjelas T2=T1+rekonstruksi; output lama dinilai ulang seragam, bukan diklaim sebagai run baru. Kasus/criteria terlihat oleh worker; contoh cache mirip kasus uji dan kasus ini dipakai untuk iterasi. Karena baseline sudah ceiling, tidak ada bukti kenaikan kualitas reasoning umum/kausal/held-out, dan T0 serta efek provider Native belum diuji.
- Token provider tidak diekspos. Estimasi `ceil(known UTF-8 bytes/4)` input/output: baseline 2.787/1.016; A 3.358/1.052; B 3.373/1.124; C 3.396/1.247. Estimasi mengecualikan instruksi host, wrapper dan envelope. Waktu dari marker dispatch sampai observasi Main (termasuk scheduling/keterlambatan pengambilan): A 99,9 dtk; B 82,0; C 112,7. Waktu baseline utuh tidak tersedia; marker parsial 97,2 dtk. Tidak ada klaim perbaikan latency.
- Tes terarah final `capability-pack-indexing.test.ts` + `external-skill-guidance.test.ts`: 7/7 lulus, tanpa perubahan tes, timeout/hook 90 detik. Bukti: `runtime/build/mind-control-cd-20261026/final-targeted-tests.json`, `measurements.json`, seluruh `*-response.json` dan snapshot kandidat/rubrik.
- `skills(validate)` dan `stage_revision` menghasilkan kandidat `sha256:15553bddf5b1bad3fee25d0655bb2217ed678dc135d8f897f7b90f39ef33346a`, 16 file, 186.908 byte. SkillService existing mengecualikan direktori `evals/` dari artifact (src/skills/service.ts excluded); evals tetap bukti di sumber dan dirujuk oleh stage evidence, tidak dimasukkan paksa ke katalog.
- Rollback untuk paket C/D: `skills(rollback_revision)` ke revisi 8 `sha256:9b97e694092fad4aeff92d3405c3ec18788e4f05eed155607df7d2eff6a3a4c0`.

## Penyelesaian dan aktivasi (2026-10-26)
- Kandidat sha256:15553bddf5b1bad3fee25d0655bb2217ed678dc135d8f897f7b90f39ef33346a dipromosikan melalui SkillService; revisi 8 tersimpan di history. Handshake baru mengiklankan digest yang sama dan read resident lengkap 10.220 byte selesai dalam dua fragmen, offset 0 lalu nextOffset yang dikembalikan server sampai nextOffset=null; lihat receipt pemeriksaan.
- Bukti Native partner: runtime/build/mind-control-cd-20261026/native-partner-review.md dan conversation 8750bc37-ddb1-47de-b897-198cc2ccf38a. Bukti evaluasi tetap di runtime/skills/capability-packs/mind-control/evals/report.md; semua scope A/B/C/D selesai, manfaat reasoning umum dan latency tidak diklaim.
- Tidak ada build/restart, grant/dependensi baru, commit/push atau rilis produk; katalog/guidance berubah melalui owner revisi existing. Release intent patch tersimpan di .changeset/20261026-mind-control-revision-9.md.
- State facade proposal notified/not-built tetap terpisah karena memerlukan bukti keputusan host; dokumen ini tidak mengarang perubahan state canonical tersebut. Katalog active dan history adalah bukti aktivasi revisi.
- Path asal: docs/proposals/Mind-Control-Upgrade-Dampak.md. Path arsip setelah finalisasi Learning: docs/history-agent-core/Mind-Control-Upgrade-Dampak.md. Tanggal selesai: 2026-10-26. Episode Codex: ext-63eea3a297c7490aba0e521f24ac9c2e.
