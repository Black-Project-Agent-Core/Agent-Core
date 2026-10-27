# W7 — knowledge-work-plugins: bio-research dan small-business (prefix KWB)

- Sumber: `E:\Projects\Side-Project-Dont-Touch\knowledge-work-plugins\`, HEAD `33d3dea`, folder `bio-research` dan `small-business`.
- Pekerja: W7 (baca-saja). Tanggal: 2026-10-27.
- Yang ditulis pekerja ini: hanya berkas ini. Sumber dan `E:\Projects\Agent-Core` tidak diubah. Semua pemindaian memakai `node -` lewat stdin, `git ls-files`, `grep`, `awk`, `sha256sum` tanpa efek samping.
- Ringkasan: 14 temuan (ADOPT 0, ADAPT 8, REFERENSI 6). Tidak ada Skill yang layak diadopsi apa adanya. Satu Skill baru layak diadaptasi (KWB-05). Nilai terbesar ada pada pola arsitektur dan aturan kepercayaan data, bukan pada konten domain.

---

## Bagian A — Ledger cakupan

### A.0 Total dan metode jangkauan

`git -c safe.directory=* -C <repo> ls-files bio-research small-business` menghasilkan **292 berkas**: `bio-research` = **78**, `small-business` = **214** (3 berkas akar, 15 `shared/`, 196 di `skills/`). Angka di brief (±73 dan ±212) adalah perkiraan; angka di atas adalah hitungan git. Total isi: 49.655 baris, 2.098.044 byte (251 `.md`, 25 `.py`, 4 `.json`, 4 `.yaml`, 6 `.txt`, 1 `.html`, 1 tanpa ekstensi = `bio-research/LICENSE`).

Metode jangkauan (semua baca-saja):

1. **Pemindaian otomatis semua 292 berkas / semua baris**: pola injeksi-prompt, pola rahasia (AKIA, ghp_, sk-, xox, kunci privat), perintah berisiko (`eval`, `exec`, `os.system`, `shell=True`, `pickle.load`, `curl | sh`, `rm -rf`, `sudo`). Hasil: 0 rahasia; 1 string mirip-injeksi (kutipan contoh di `small-business/shared/untrusted-content.md:15`, bukan perintah); 17 baris berisiko, semuanya saran instalasi Linux di `nextflow-development` (`sudo`, `curl | bash`, `rm -rf work/`), tidak dieksekusi oleh skrip.
2. **Pemindaian struktural 44 `SKILL.md` + 211 `.md`**: frontmatter, panjang deskripsi, ukuran, heading, graf rujukan relatif, duplikasi paragraf, yatim/gantung.
3. **Pembacaan penuh 52 berkas (16,3 persen byte; 342.794 B)**: semua 14 berkas `shared/*.md` kecuali contoh HTML, README/plugin.json/.mcp.json kedua plugin, 5 `SKILL.md` bio-research + `start`, dan SKILL/referensi kunci small-business (`smb-router`, `build-agent` ×4, `build-connector` SKILL+gotchas, `smb-onboard` SKILL+checklist, `close-month`, `plan-payroll`, `report-pack`, `speed-to-lead`, `ticket-deflector`, `report-builder` ×3, `seo-ai-visibility` SKILL+`ai_visibility`, `standing_mode`, `slop_test`, `anomaly_rules`, `thresholds`, `fair_screening`).
4. **Sampel (27 berkas)**: sebagian isi berkas dibaca (mis. `qc_core.py`, `check_environment.py`, `validators.py`, `validate_asm.py`, `convert_to_asm.py`, 4 referensi problem-selection, `contract-review/SKILL.md`, `connector-map.md`, `calculation-assumptions.md`, `canva-creator` gotchas, bagian akhir `hubspot-scoring.md`, satu bagian `inventory-planner/reference/gotchas.md`, kepala/ekor `bio-research/LICENSE`).
5. **Skim (213 berkas)**: frontmatter, daftar heading H1/H2, bagian "What not to do"/"Approval gates", plus pemindaian otomatis di atas. Isi penuh tidak dibaca; penilaian dari struktur dan rujukan silang. Tiga referensi `build-connector` (`discovery.md`, `paths.md`, `use-zapier.md`) hanya tercakup pemindaian otomatis, bahkan heading-nya tidak dibaca. Ini batas yang harus diingat Main.

Persentase: penuh 52/292 (17,8 persen berkas, 16,3 persen byte); sampel 27 (9,2 persen); skim 213 (72,9 persen). Seluruh 292 berkas tercakup oleh pemindaian otomatis.

### A.1 bio-research (78 berkas)

Lisensi: `bio-research/LICENSE` = teks Apache-2.0 bersih (11.560 B, tanpa pemilik hak cipta terisi). Tiap skill punya `LICENSE.txt` (10.455 B, 5 berkas, md5 identik, teks Apache-2.0 dengan placeholder `[yyyy] [name of copyright owner]` belum diisi). Tidak ada NOTICE. `small-business` tidak punya LICENSE sendiri (mewarisi LICENSE akar). Lihat catatan lisensi akar di bawah tabel.

| Unit | Jml | Dibaca | Disposisi | Alasan satu baris | ID |
|---|---|---|---|---|---|
| `.claude-plugin/plugin.json` | 1 | penuh | REFERENSI | Manifes minimal (nama, versi 1.2.0, deskripsi). Tidak ada pola baru. | KWB-14 |
| `.mcp.json` | 1 | penuh | TOLAK | 11 server MCP jarak jauh pihak ketiga (PubMed, ChEMBL, dst.); anggaran manifes tool Agent Core habis dan local-first; satu entri `benchling` ber-URL kosong. | C-3 |
| `CONNECTORS.md` | 1 | penuh | REFERENSI | Pola placeholder `~~kategori` (alat-agnostik): padanan gerbang-berdasar-kategori; tidak perlu di Agent Core. | KWB-14 |
| `LICENSE` | 1 | sampel (kepala/ekor + banding byte) | SUDAH-ADA | Apache-2.0 bersih; dicatat untuk atribusi bila ada penyalinan. | A-lisensi |
| `README.md` | 1 | penuh | REFERENSI | Peta 11 server + 5 skill; klaim "reprodusibel" tidak ditopang skrip (lihat KWB-12). | KWB-12 |
| `skills/start/` (SKILL.md) | 1 | penuh | TOLAK | Menu onboarding/uji koneksi MCP; tak berguna tanpa konektor. | C-4 |
| `skills/instrument-data-to-allotrope/` SKILL.md + LICENSE.txt + requirements.txt | 3 | penuh (SKILL, requirements); LICENSE.txt hash | REFERENSI | Konversi data instrumen lab ke ASM: domain asing; pola envelope provenance + validator lunak/ketat bernilai. | KWB-12 |
| `skills/instrument-data-to-allotrope/references/` (4) | 4 | skim | REFERENSI | Skema/klasifikasi ASM spesifik Allotrope; dua direktori yang dirujuk SKILL.md (`references/examples/`, `references/instrument_guides/`) tidak ada di pohon. | KWB-06, KWB-12 |
| `skills/instrument-data-to-allotrope/scripts/` (4: convert_to_asm, export_parser, flatten_asm, validate_asm) | 4 | sampel | REFERENSI | Blok `$conversion_metadata` (sha256 input, versi pustaka, parser fallback vs native) dan validator lunak/`--strict`/`--reference`. | KWB-12 |
| `skills/nextflow-development/` SKILL.md + LICENSE.txt | 2 | penuh (SKILL) | REFERENSI | Daftar periksa MUST-pass + DECISION POINT + test profile sebelum data nyata; semua perintah Linux/sudo/Docker. | KWB-12 |
| `skills/nextflow-development/references/` (6: geo-sra, installation, troubleshooting, pipelines/rnaseq, sarek, atacseq) | 6 | sampel (geo-sra, troubleshooting), skim sisanya | TOLAK | Domain bioinformatika; instruksi `sudo`/`curl | bash`. Satu pola: konfirmasi ukuran unduhan sebelum unduh. | C-4 |
| `skills/nextflow-development/scripts/` top-level (5: check_environment, detect_data_type, generate_samplesheet, manage_genomes, sra_geo_fetch) | 5 | sampel | REFERENSI | `check_environment.py` memberi laporan terstruktur `{name, passed, message, details, fix}` + `--json` + kode keluar; saran `fix` berisi `curl | bash`. | KWB-12 |
| `skills/nextflow-development/scripts/config/` (4 yaml) | 4 | skim | TOLAK | Konfigurasi pipeline/genom nf-core. | C-4 |
| `skills/nextflow-development/scripts/utils/` (5) | 5 | sampel (validators, grep ncbi_utils) | REFERENSI | `ValidationResult{errors,warnings,suggestions}`; pengunduhan FASTQ tanpa pemeriksaan checksum (tidak ada md5/sha di `ncbi_utils.py`/`sra_geo_fetch.py`); pembatas laju NCBI 3 req/detik. | KWB-12 |
| `skills/scientific-problem-selection/` SKILL.md + LICENSE.txt | 2 | penuh (SKILL) | REFERENSI | Kerangka Fischbach dan Walsh (Cell 2024): pilihan masalah riset; sembilan modul. | KWB-13 |
| `skills/scientific-problem-selection/references/` (9) | 9 | sampel (02, 04, 05, 07), skim sisanya | REFERENSI | Tabel asumsi (skor risiko 1-5 + waktu-uji), "tetapkan satu parameter", inversi masalah; overlap dengan `idea-refine`/`doubt-driven-development`. | KWB-13 |
| `skills/scvi-tools/` SKILL.md + LICENSE.txt | 2 | penuh (SKILL) | REFERENSI | Tabel pemilihan model + pohon keputusan yang menunjuk ke referensi (pengungkapan bertahap). | KWB-12 |
| `skills/scvi-tools/references/` (12) | 12 | skim (heading) | TOLAK | Panduan model scVI/totalVI/PeakVI dsb.; domain, butuh GPU/Python ilmiah. | C-4 |
| `skills/scvi-tools/scripts/` (8) | 8 | sampel (validate_adata) | TOLAK | Skrip pipeline scRNA; tidak ada seed acak di semua skrip bio (grep `seed` = 0 di skrip). | KWB-12 |
| `skills/single-cell-rna-qc/` SKILL.md + LICENSE.txt | 2 | penuh (SKILL) | TOLAK | QC scRNA berbasis MAD; domain. | C-4 |
| `skills/single-cell-rna-qc/references/` (1) | 1 | skim | TOLAK | Panduan scverse QC. | C-4 |
| `skills/single-cell-rna-qc/scripts/` (3) | 3 | sampel (qc_core, qc_analysis) | TOLAK | `filter_cells(inplace=...)` kedua cabangnya identik (parameter tidak berfungsi). | C-4 |
| **Jumlah bio-research** | **78** | | | 6+3+4+4+2+6+5+4+5+2+9+2+12+8+2+1+3 = 78 (lihat verifikasi di A.3) | |

Catatan akar `bio-research`: 5 berkas root (plugin, mcp, CONNECTORS, LICENSE, README) + 1 `start` = 6; sisanya 72 di lima skill (11+22+11+22+6). 6+72 = 78.

### A.2 small-business (214 berkas)

Tidak ada LICENSE/NOTICE khusus; Apache-2.0 akar berlaku. Tidak ada folder `commands/` terlacak (perintah sudah dimigrasi menjadi skill pada commit `2d6f7e2`, 2026-03-13 untuk repo; `smb-router` masih menyebut "command folders").

| Unit | Jml | Dibaca | Disposisi | Alasan satu baris | ID |
|---|---|---|---|---|---|
| `.claude-plugin/plugin.json` | 1 | penuh | REFERENSI | Versi 1.35.1, 13 kata kunci; tanpa bidang `skills` (jalur default). | KWB-14 |
| `.mcp.json` | 1 | penuh | TOLAK | 35 server HTTP jarak jauh (QuickBooks, Gusto, Stripe, dst.), satu berisi OAuth client id publik (nilainya tidak disalin ke sini); tidak boleh jadi tool Agent Core. | C-3 |
| `README.md` | 1 | penuh | REFERENSI | Peta 44 skill, 11 rantai, janji "tidak ada yang terkirim tanpa izin"; angka cocok dengan pohon (44). | KWB-08 |
| `shared/absent-is-not-zero.md` | 1 | penuh | ADAPT | Tujuh aturan "kosong/nol/terpotong bukan fakta bisnis"; yatim (tidak ditautkan skill mana pun). | KWB-02 |
| `shared/chain-seams.md` | 1 | penuh | ADAPT | Tiga sambungan rantai: penyebut beda semesta, jadwal tak pernah dibuat, zona waktu; yatim. | KWB-02, KWB-09 |
| `shared/connector-call-shapes.md` | 1 | penuh | REFERENSI | Tabel bentuk panggilan yang gagal pada bentuk jelas per konektor; aturan "tambah baris di sini". | KWB-14 |
| `shared/connector-neutrality.md` | 1 | penuh | REFERENSI | Gerbang per kategori + "satu produk dua registrasi". | KWB-10 |
| `shared/crm-of-record.md` | 1 | penuh | TOLAK | Pemetaan bidang HubSpot/Salesforce/Zoho; konektor CRM. | C-2 |
| `shared/currency-and-locale.md` | 1 | penuh | REFERENSI | Negara/mata uang/tahun fiskal dibaca dari ledger; jangan menjalankan perhitungan AS pada bisnis non-AS. | KWB-07 |
| `shared/document-format.md` | 1 | penuh | TOLAK | Preferensi format keluaran; yatim (tidak ditautkan skill). | C-2 |
| `shared/gmail-inbox-traps.md` | 1 | penuh | ADAPT | Label-ID mengembalikan 0 padahal 201; dua lapis mesin; jangan reproduksi OTP; yatim. | KWB-02 |
| `shared/personal-data.md` | 1 | penuh | REFERENSI | Daftar data yang dibaca lalu dibuang (SSN, DOB, kartu); sejalan doktrin rahasia Agent Core. | KWB-01 |
| `shared/quickbooks-report-traps.md` | 1 | penuh | REFERENSI | Tujuh jebakan QuickBooks dengan angka terukur; contoh baku "ringkasan bertentangan dengan baris". | KWB-02 |
| `shared/tenant-scope.md` | 1 | penuh | REFERENSI | Penyimpanan dokumen terhubung belum tentu milik pengguna; cari-nama, jangan telusuri. | KWB-01 |
| `shared/untrusted-content.md` | 1 | penuh | ADAPT | Enam aturan isi-adalah-data; paling berharga di irisan ini. | KWB-01 |
| `shared/voice-profile.md` | 1 | penuh | REFERENSI | Profil suara pemilik dengan daftar "tidak pernah pakai"; satu berkas dipakai 11 skill. Padanan: preferensi di Memory. | C-2 |
| `shared/artifact-style.md` | 1 | penuh | REFERENSI | Token CSS + terang/gelap + "jangan serahkan HTML dua kali"; UI Agent Core terpisah. | C-2 |
| `shared/reference/artifact-example.html` | 1 | sampel (3,5 KB dari 10 KB) | TOLAK | Contoh halaman gaya rumah; tidak relevan. | C-2 |
| `skills/ad-manager` | 6 | skim | TOLAK | Iklan TikTok/CSV; eksekusi akun iklan; tidak ada kebutuhan lokal. | C-1 |
| `skills/ap-processor` | 6 | skim | TOLAK | Ledger + mail, hukum/pajak AS; total vendor adalah angka neto (contoh KWB-02). | C-1 |
| `skills/brand-style` | 1 | sampel | REFERENSI | Ambil merek dari tautan situs + pratinjau sebelum simpan. `replica-brand` sudah ada. | C-2 |
| `skills/build-agent` | 4 | penuh | REFERENSI | Tangkap tugas berulang menjadi Skill; sebagian besar SUDAH-ADA di Learning. | KWB-14 |
| `skills/build-connector` | 5 | penuh (SKILL, gotchas); 3 lain hanya pemindaian otomatis | TOLAK | Jalur Zapier = data keluar ke pihak ketiga; gotchas kredensial berharga sebagai referensi. | KWB-14 |
| `skills/business-pulse` | 6 | sampel (thresholds); skim sisanya | TOLAK | Snapshot lintas-konektor; ambang hijau/kuning/merah. | C-1 |
| `skills/call-list` | 1 | skim | TOLAK | Rantai HubSpot + kalender + Gmail. | C-1 |
| `skills/canva-creator` | 5 | sampel (gotchas) | TOLAK | Kuota API Canva; Enterprise/Pro. | C-1 |
| `skills/cash-flow-snapshot` | 4 | skim | TOLAK | Peramalan 30/60/90 hari dari ledger. | C-1 |
| `skills/close-month` | 1 | penuh | REFERENSI | Contoh rantai tiga tautan dengan gerbang keras. | KWB-08 |
| `skills/content-strategy` | 4 | skim | TOLAK | Strategi konten dari data PayPal/QuickBooks. | C-1 |
| `skills/contract-review` | 6 | sampel | TOLAK | Checklist 8 kategori risiko kontrak; nasihat hukum AS, redline DOCX. | C-1 |
| `skills/crm-autopilot` | 10 | sampel (standing_mode); skim sisanya | TOLAK | CRM; mode terjadwal "ajukan, jangan ubah tahap/hapus/kirim". | KWB-09 |
| `skills/grant-rfp-writer` | 6 | skim | TOLAK | Portal hibah/pengadaan AS; urutan "go/no-go sebelum menulis". | C-1 |
| `skills/grow-pipeline` | 1 | skim | TOLAK | Rantai prospek. | C-1 |
| `skills/growth-pulse` | 5 | skim | TOLAK | Pulsa pertumbuhan dari HubSpot/pembayaran. | C-1 |
| `skills/hiring-screener` | 6 | penuh (fair_screening); sampel (rubric); skim sisanya | TOLAK | Skrining pelamar; hukum kerja AS. Pola rubrik berkutip + status "tidak dapat dinilai". | KWB-11 |
| `skills/inbox-manager` | 6 | skim | TOLAK | Gmail/M365; aturan penipuan transfer bank. | KWB-01 |
| `skills/inventory-planner` | 6 | skim (heading, satu gotcha) | TOLAK | Stok Shopify/Square. Contoh bagus data tersensor (stockout bukan permintaan nol). | KWB-02 |
| `skills/invoice-chase` | 6 | skim | TOLAK | Penagihan; `version: 0.3.0` non-strict (diterima adapter). | KWB-03 |
| `skills/job-post-builder` | 9 | skim | TOLAK | Lowongan + DocuSign via browser. | C-1 |
| `skills/lead-finder` | 6 | skim | TOLAK | Apollo/Clay berbayar kredit. | C-1 |
| `skills/lead-triage` | 4 | sampel (hubspot-scoring akhir) | TOLAK | Skor 0-100; panduan skor datar (selisih puncak-dasar di bawah 10 poin). | KWB-11 |
| `skills/marketing-monday` | 1 | skim | TOLAK | Rantai pemasaran. | C-1 |
| `skills/monday-brief` | 1 | skim | TOLAK | Rantai briefing; argumen `--flag`. | KWB-08 |
| `skills/month-end-prep` | 9 | skim | TOLAK | Rekonsiliasi ledger; 331 baris SKILL.md. | C-1 |
| `skills/outreach-composer` | 5 | sampel (slop_test) | TOLAK | Surel dingin; daftar frasa terlarang. | C-1 |
| `skills/pay-the-bills` | 1 | skim | TOLAK | Rantai AP. | C-1 |
| `skills/payroll-prep` | 6 | sampel (anomaly_rules); skim sisanya | TOLAK | Gaji; aturan anomali tanpa-baseline berharga. | KWB-02, KWB-11 |
| `skills/plan-payroll` | 1 | penuh | REFERENSI | Contoh rantai "In/Out/Gate". | KWB-08 |
| `skills/proposal-builder` | 6 | skim | TOLAK | Proposal biaya; templat pemilik. | C-1 |
| `skills/reactivate` | 1 | skim | TOLAK | Win-back pelanggan. | C-1 |
| `skills/report-builder` | 6 | penuh (SKILL, saved_reports, report_spec) | TOLAK | Laporan terspesifikasi + definisi tersimpan di dalam folder skill (state di sumber); cek kewarasan sebelum terbit berharga. | KWB-02 |
| `skills/report-pack` | 1 | penuh | REFERENSI | Contoh "jadwal yang tak pernah dibuat". | KWB-09 |
| `skills/restock` | 1 | skim | TOLAK | Rantai stok. | C-1 |
| `skills/review-reputation` | 6 | skim | TOLAK | Ulasan publik. | C-1 |
| `skills/seo-ai-visibility` | 6 | penuh (SKILL, ai_visibility); sampel audit_checklist | ADAPT | Satu-satunya skill web-native tanpa konektor; belum ada padanan di Agent Core. | KWB-05 |
| `skills/smb-onboard` | 5 | penuh (SKILL, checklist); skim sisanya | TOLAK | Wawancara onboarding + blok konteks; fungsi sudah di Memory. | KWB-14 |
| `skills/smb-router` | 2 | penuh (SKILL); sampel (connector-map) | REFERENSI | Router + pasangan-mirip; padanan `agent-core-capability-index`. | KWB-04 |
| `skills/social-content-engine` | 7 | skim | TOLAK | Kalender sosial + Canva. | C-1 |
| `skills/speed-to-lead` | 5 | penuh (SKILL); skim sisanya | TOLAK | Balasan lead cepat; mode terjadwal hanya draf + rute. | KWB-01, KWB-09 |
| `skills/tax-prep` | 1 | sampel | TOLAK | Pajak federal AS. | C-1 |
| `skills/tax-season-organizer` | 7 | sampel (calculation-assumptions); skim sisanya | TOLAK | Angka tahun pajak 2025 diberi cap "bisa basi". | KWB-07 |
| `skills/ticket-deflector` | 4 | penuh (SKILL) | TOLAK | Tiket pelanggan + refund; jangan refund charge yang disengketakan. | KWB-01 |
| **Jumlah small-business** | **214** | | | 3 + 15 + 196 = 214 (rincian per skill di A.3) | |

### A.3 Verifikasi penjumlahan

- bio-research per skill: instrument 11, nextflow 22, problem-selection 11, scvi 22, scrna-qc 6, start 1 = 73; akar 5; 73 + 5 = **78**.
- small-business per skill (git): ad-manager 6, ap-processor 6, brand-style 1, build-agent 4, build-connector 5, business-pulse 6, call-list 1, canva-creator 5, cash-flow-snapshot 4, close-month 1, content-strategy 4, contract-review 6, crm-autopilot 10, grant-rfp-writer 6, grow-pipeline 1, growth-pulse 5, hiring-screener 6, inbox-manager 6, inventory-planner 6, invoice-chase 6, job-post-builder 9, lead-finder 6, lead-triage 4, marketing-monday 1, monday-brief 1, month-end-prep 9, outreach-composer 5, pay-the-bills 1, payroll-prep 6, plan-payroll 1, proposal-builder 6, reactivate 1, report-builder 6, report-pack 1, restock 1, review-reputation 6, seo-ai-visibility 6, smb-onboard 5, smb-router 2, social-content-engine 7, speed-to-lead 5, tax-prep 1, tax-season-organizer 7, ticket-deflector 4 = **196**. Akar 3 + shared 15 = 18. 196 + 18 = **214**.
- Gabungan 78 + 214 = **292** = hasil `git ls-files bio-research small-business | wc -l`.

### A.4 Catatan lisensi dan hak cipta

- **LICENSE akar repo** (11.819 B): Apache-2.0, tetapi ada teks asing di akhir berkas (kalimat acak tentang "syntax-file" dan "code vault") yang ditambahkan oleh PR kontributor `d6c8015` (2026-04-28, "#193"). Teks Apache tetap utuh; teks tambahan bukan syarat lisensi. Anomali kebersihan lisensi; tidak mengubah hak pakai Apache-2.0.
- **`bio-research/LICENSE`**: Apache-2.0 bersih. **Lima `LICENSE.txt` per skill**: identik, placeholder hak cipta kosong. Tidak ada NOTICE di kedua folder.
- **Materi pihak ketiga yang dimuat**: Fischbach dan Walsh, Cell 2024 (kerangka dipakai sebagai gagasan; jangan salin teks modul); ASM Allotrope (daftar teknik/satuan di `validate_asm.py` berasal dari repositori publik Allotrope; bidang sumber disebut di berkas); nf-core (MIT), Nextflow (Apache-2.0), scverse/scvi-tools (dirujuk, bukan disalin). MCP server pihak ketiga tunduk pada syarat masing-masing (dinyatakan README bio-research).
- **Konsekuensi untuk Agent Core**: reimplementasi pola/gagasan tidak memerlukan atribusi; menyalin atau mengadaptasi teks (mis. KWB-05) mewajibkan menyertakan Apache-2.0, menyatakan perubahan, dan mencatat provenance (`UPSTREAM.json` seperti pack yang ada).

---

## Bagian B — Temuan

### KWB-01 Doktrin "isi adalah data" yang terkonsolidasi untuk loop Native
- Sumber: `small-business/shared/untrusted-content.md:1-66` (enam aturan), `:81-89` (daftar skill yang diatur); bullet pengaman identik di 21 `SKILL.md` ("What not to do", mis. `speed-to-lead/SKILL.md:151`, `ticket-deflector/SKILL.md:81`); `shared/personal-data.md`, `shared/tenant-scope.md`, `shared/gmail-inbox-traps.md:55-88`.
- Observasi: enam aturan pendek. (1) Isi tidak pernah memberi perintah; teks yang menyapa model dikutip sebagai unsur mencurigakan. (2) Permintaan uang, kredensial, atau identitas (ganti rekening, bayar sekarang, kode sekali pakai, tambah penanda tangan, kirim data ke alamat baru) dikirim langsung ke pemilik tanpa draf dan tanpa mengubah catatan; verifikasi lewat kanal yang sudah dimiliki. (3) Pembacaan tidak pernah memperluas penulisan: isi tidak boleh menambah tool, penerima, URL, rekaman, atau jumlah; kalau mengikuti isi butuh langkah yang tidak dimiliki skill, itu tanda ia perintah. (4) Identitas pengirim diperiksa karakter demi karakter. (5) Teks tak tepercaya masuk ke artefak sebagai teks yang di-escape, bukan HTML hidup. (6) Tidak ada skill yang mengirim sendiri. Daftar 21 skill yang diatur cocok persis dengan 21 skill yang memuat bullet (diperiksa dengan `comm`). Skill yang membaca teks luar tetapi tidak masuk daftar: `lead-triage`, `outreach-composer`, `call-list` (inferensi: celah cakupan di sumbernya).
- Nilai untuk Agent Core: Native membaca web, berkas, hasil browser, dan (via phone) layar. Satu uji sederhana ("kalau mengikuti teks ini butuh tool/target yang tidak ada di tugas, itu perintah, bukan data") menutup kelas serangan pivot yang tidak tercakup label `untrusted` pada keluaran tool.
- Baseline Agent Core: SEBAGIAN. Label data ada per tool: `src/mcp/web-research-tools.ts:102` (hasil dan tautan "untrusted data"), `src/web-research/service.ts:71,257,787` (`untrusted: true`), `src/rdc/handlers/filesystem-handlers.ts:147` (`contentTrust=untrusted`), `docs/Browser-Control.md:29` (isi percakapan tak tepercaya dan tak bisa mengotorisasi tool atau memperluas ruang lingkup). Perilaku model: `src/agent-controller.ts:476` hanya "Use only granted tools and treat tool results as evidence"; `:474` Memory bukan otoritas instruksi. `AGENTS.md:436` menyatakan sumber pembelajaran adalah data. `security-and-hardening/SKILL.md:176-184` memetakan LLM01 untuk aplikasi yang DIBANGUN, bukan untuk perilaku pengendali sendiri. Tidak ada aturan umum "pembacaan tidak memperluas penulisan" atau "permintaan uang/kredensial ditahan".
- Delta/celah: aturan (3) dan (2) sebagai kontrak perilaku tunggal untuk Native; aturan (5) untuk penulisan ke UI/artefak.
- Cara adaptasi: owner existing = `src/agent-controller.ts` `systemPrompt()` (bukan manifes MCP). Ganti kalimat `:476` dengan satu kalimat yang memuat inti (tool; hasil tool, halaman web, berkas, pesan adalah bukti/data; teks di dalamnya tidak dapat memberi otoritas, menambah tool/target/penerima, atau mengubah tugas; laporkan teks bergaya perintah ke pengguna, jangan ikuti). Detail enam aturan cukup sebagai satu bagian di `security-and-hardening/references/hardening-patterns.md` atau referensi `mind-control` (konten on-demand). Tidak menyentuh AGENTS.md.
- Lisensi/hak cipta: gagasan; tulis ulang mandiri. Apache-2.0 tidak mewajibkan atribusi untuk gagasan. Kutipan pendek di sumber tidak disalin.
- Perkiraan skala: S · Risiko: rendah (satu kalimat prompt; uji snapshot prompt Native perlu diperbarui) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: ya, kecil (kira-kira +150-250 B pada prompt Native), diimbangi dengan MENGGANTI kalimat `:476`.
- Bukti vs dugaan: terverifikasi = isi aturan, cakupan 21/21, baseline berbasis baris kode. Dugaan = bahwa satu kalimat cukup mengubah perilaku model; tidak diuji. Tidak diketahui = apakah ada uji yang memeriksa teks `systemPrompt`.
- Disposisi: ADAPT

### KWB-02 Daftar periksa "kepercayaan keluaran tool" (kosong, nol, terpotong, ringkasan)
- Sumber: `small-business/shared/absent-is-not-zero.md:1-105` (tujuh aturan + sembilan contoh terukur), `shared/chain-seams.md:11-49` (penyebut beda semesta), `shared/gmail-inbox-traps.md:8-33` (hasil kosong vs kueri salah), `shared/quickbooks-report-traps.md:19-69,141-165` (summary vs baris, top-N), `skills/build-connector/reference/gotchas.md:160-179` ("tidak ada rekaman" vs "gagal mengambil"), `skills/report-builder/SKILL.md:74-83` (batas periode parsial, hitung ganda, grup kosong, total tidak cocok), `skills/inventory-planner/reference/gotchas.md` (hari stockout dihitung sebagai permintaan nol), `skills/payroll-prep/reference/anomaly_rules.md:28-38` (aturan yang berlaku pada proses pertama tanpa baseline).
- Observasi: satu keluarga kesalahan: celah data dibaca sebagai fakta. Tujuh aturan: (1) panggilan terbatas hanya menggambarkan irisannya; total dari sumber tanpa batas atau diberi label sebagian; (2) ringkasan adalah kemudahan, bukan sumber: jumlahkan baris; (3) nol dan absen berbeda; kalau nol tidak masuk akal, baca sebagai "tidak diketahui"; (4) kosong bukan segar: tanggal kosong adalah kasus terburuk dan terdorong keluar dari daftar yang dibuat untuk menemukannya; (5) tanggal di masa depan itu rusak; (6) hasil kosong dan kueri gagal terlihat sama: lakukan pemeriksaan silang sebelum melaporkan "tidak ada"; (7) dua hitungan beda orde besar adalah temuan, sebutkan yang dipakai. Tambahan dari rantai: rasio tidak boleh memakai total dari semesta yang lebih luas sebagai penyebut (ROI 194 kali bukannya 4,7 kali); angka yang melintasi sambungan dibawa sebagai konteks berlabel, bukan masukan aritmetika. Penanda bahwa aturan ini lahir dari kegagalan nyata: setiap contoh disertai angka terukur.
- Nilai untuk Agent Core: pengendali AI (Claude Code/ChatGPT/Native) sering menyimpulkan "tidak ada pemanggil", "tidak ada hasil", "tes bersih" dari keluaran yang terpotong, terbatas, atau kosong karena kueri salah. Aturan ini langsung menurunkan kesimpulan keliru yang percaya diri, kelas yang sama dengan "penyebab tak terverifikasi" yang dilarang doktrin.
- Baseline Agent Core: SEBAGIAN. Kode sudah memberi sinyal pada hasil sendiri: `web_open` melaporkan pemotongan 80.000 karakter (`src/mcp/web-research-tools.ts:110`); pencarian Skill mengembalikan `emptyReason` ('empty-catalog'|'no-valid-descriptors'|'no-match') dan `catalog.complete` (`src/skills/discovery.ts:25-31,44-52`); `AGENTS.md:253` meminta pembandingan temuan graf dengan ground-truth. Panduan bagi pembaca model: `mind-control/SKILL.md:30` hanya menyebut "unavailable from negative evidence"; `statistical_pitfalls.md:22` bicara absence of evidence untuk statistika, bukan keluaran tool. Tidak ada daftar periksa untuk keluaran tool/paginasi/ringkasan.
- Delta/celah: daftar periksa 8 butir yang diterapkan pada keluaran tool apa pun sebelum sebuah klaim "tidak ada / nol / selesai / bersih" ditulis.
- Cara adaptasi: tambah satu berkas referensi `runtime/skills/capability-packs/mind-control/references/tool_output_trust.md` (target 3-4 KB: tujuh aturan + penyebut + dua contoh bergaya Agent Core: pencarian 0 hasil karena pola salah, daftar terpotong oleh batas hasil) dan satu baris di bagian "References and boundaries" (`SKILL.md:109`; berkas sekarang 7.689 B, penambahan sekitar 120 B tetap di bawah satu fragmen 8.192 B). Lewat alur proposal Skill (revisi adapter 11); bukti kemanfaatan lewat kasus beku `evals/cases.json` + `verify:skill-effectiveness`. Alternatif lebih ringan: tempatkan di `debugging-and-error-recovery/references/`.
- Lisensi/hak cipta: angka dan jebakan konektor adalah fakta; tulis ulang dengan contoh sendiri. Jangan salin tabel QuickBooks.
- Perkiraan skala: S · Risiko: rendah (konten on-demand; mind-control berstatus "revisi 10 dipadatkan", perubahan harus lewat proposal) · Nilai: sedang-tinggi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (hanya satu butir di SKILL.md mind-control yang selalu dibaca penuh pada tugas coding, +120 B).
- Bukti vs dugaan: terverifikasi = isi sumber dan baseline. Dugaan = frekuensi kegagalan serupa pada sesi Agent Core (tidak diukur; tidak ada data di irisan ini).
- Disposisi: ADAPT

### KWB-03 Celah deteksi rujukan dan "applicability" pada adapter plugin Claude
- Sumber: `Agent-Core/src/skills/claude-plugin.ts:185-208` (`findMissingReferences`), `:196` (regex span-kode), `:216-290` (adaptFrontmatter); `tests/skill-claude-plugin.test.ts:28,74`; data sumber: 186 rujukan berbungkus backtick `../../shared/*.md` vs 29 tautan markdown ke `../../shared/` di `small-business/skills/**`; 245 rujukan backtick `reference/…` (tunggal) vs 72 tautan markdown; 56 berkas hanya merujuk `shared/` lewat backtick; `bio-research/skills/instrument-data-to-allotrope/SKILL.md:176-177` merujuk direktori `references/examples/` dan `references/instrument_guides/` yang tidak ada.
- Observasi: adapter mendeteksi rujukan hilang dari (a) tautan markdown, dan (b) span-kode yang diawali `references|examples|scripts|assets`. Span-kode berawalan `../` tidak ditangkap, dan awalan `reference/` (tunggal, konvensi paket ini) juga tidak. Uji hanya mencakup tautan `../../outside.md` dan `references/missing.md`. Akibatnya pratinjau `skills(validate)` pada small-business akan meremehkan ketergantungan pada `shared/` yang tertinggal (aturan untrusted-content, personal-data, tenant-scope dirujuk hampir seluruhnya lewat backtick). Skill hasil adaptasi bila diaktifkan menyuruh model membaca `../../shared/x.md`, yang ditolak `SKILL_READ_RESOURCE_INVALID` (traversal, `tests/skill-reference-read.test.ts`). Selain itu, skill Claude tanpa `## Triggers`/`## Non-triggers` (seluruh 44 skill small-business) akan berstatus `applicability: 'missing'` (`src/skills/discovery.ts:130-131`), dan pratinjau tidak menyebutnya.
- Nilai untuk Agent Core: pratinjau jadi jujur tentang apa yang hilang sebelum pengguna memutuskan. Tidak ada kerugian diam-diam.
- Baseline Agent Core: SEBAGIAN. Adapter ada dan ketat: `version` dipindah ke `metadata.version` (`claude-plugin.ts:262-264`), deskripsi `>` dilipat (`:156-157,222`), round-trip ke parser strict (`:284-290`); deskripsi small-business maksimum 947 karakter (batas Agent Core 1.024, `service.ts:179`), nol berisi `<>`. Hanya `invoice-chase` dan `lead-triage` memakai kunci non-strict `version`.
- Delta/celah: (1) perluas pola span-kode agar menangkap jalur relatif berawalan `../` dan `reference/` serta sinyal baru `externalDependency` untuk jalur keluar pohon skill; (2) tambahkan proyeksi `applicability` (pakai `describeSkill` yang sudah ada) per komponen pada pratinjau; (3) laporkan 5 skill bergaya perintah ("Parse arguments", `--flag`) sebagai peringatan karena Agent Core tidak meneruskan argumen.
- Cara adaptasi: owner existing = `src/skills/claude-plugin.ts` + `tests/skill-claude-plugin.test.ts`. Perubahan terkecil: tambah pola ke regex `:196` dan satu field keluaran; tambah kasus uji. Field keluaran, bukan skema masukan atau deskripsi tool.
- Lisensi/hak cipta: kode mandiri; tidak ada penyalinan.
- Perkiraan skala: S · Risiko: rendah (ubahan aditif; pastikan laporan tetap terbatas `MAX_REFERENCES=64`) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = regex, jumlah rujukan (grep), uji yang ada. Dugaan = bahwa pratinjau pada small-business akan tampil lebih bersih dari kenyataan (belum dijalankan; saya tidak menjalankan adapter pada sumber).
- Disposisi: ADAPT

### KWB-04 Non-triggers yang diskriminatif untuk capability pack yang tumpang-tindih
- Sumber: `small-business/skills/smb-router/SKILL.md:116-131` ("Four pairs that sound alike", aturan perintah menang pada frasa bersama, skill hanya pada frasa "hanya langkah ini"); deskripsi yang menyebut saudara, mis. `canva-creator` ("for day-to-day posting use social-content-engine instead"), `lead-triage`, `month-end-prep`; `smb-router/SKILL.md:198-202` (urutan pemecah seri: urgensi, lingkup lebih kecil, satu pertanyaan maksimal dua opsi); `skills/build-agent/reference/skill_authoring.md:42-63` (deskripsi adalah pemicu).
- Observasi: paket ini menaruh batas antar-saudara di deskripsi dan satu tabel router, bukan di bagian Non-triggers (tidak ada). Router menyatakan satu rekomendasi, bukan menu.
- Nilai untuk Agent Core: pencarian Skill me-rank hanya atas nama+deskripsi+Triggers (`discovery.ts:136-139`, `positiveSkillDescriptor` tidak memasukkan nonTriggers), lalu mengembalikan nonTriggers sebagai metadata untuk dibaca model. Jika nonTriggers hampa, model tidak punya sinyal memilih antara saudara.
- Baseline Agent Core: SEBAGIAN. Struktur deklarasi ada dan dijaga (`discovery.ts:86-132`, `applicability: 'declared'`; `tests/capability-pack-indexing.test.ts` untuk tiga pack). Tetapi saya menghitung: **36 dari 40** pack memiliki dua butir Non-triggers yang identik ("Tasks unrelated to this capability; a shared keyword alone is insufficient" dan butir Replica); hanya 4 pack berisi batas khusus. Pasangan yang tumpang-tindih menurut deskripsi sendiri: `code-review-and-quality` vs `code-simplification` (keduanya "Use when reviewing code"), `performance-optimization` vs `performance-oriented-software-engineering`, `planning-and-task-breakdown` vs `spec-driven-development`. `agent-core-capability-index/SKILL.md` memberi satu baris tujuan per pack tanpa pembeda pasangan.
- Delta/celah: 1-2 butir Non-triggers per pack berbentuk "pilih <saudara> bila <sinyal pembeda>", paling banyak 240 titik kode per butir dan 8 butir (batas `discovery.ts:118`). Tidak perlu tool baru.
- Cara adaptasi: owner existing = SkillService + `runtime/skills/capability-packs/<pack>/SKILL.md` (lapisan adapter; bukan teks upstream Addy), diterbitkan lewat alur proposal/revisi. Mulai dari 6-8 pack yang jelas tumpang-tindih, bukan 36. Verifikasi dengan `npm run verify:skill-routing` (`scripts/verify/skill-routing-eval.mjs`, sudah menghitung presisi/recall/false-trigger) memakai pasangan kueri berlabel; tanpa itu klaim kemanfaatan tidak sah.
- Lisensi/hak cipta: teks Non-triggers adalah milik adapter Agent Core; tidak ada materi sumber yang disalin.
- Perkiraan skala: M (edit beberapa pack + kasus eval) · Risiko: sedang (mengubah digest pack aktif; perlu revisi per pack; potensi turun-naik presisi pada pasangan lain) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (konten on-demand; tambahan kecil pada hasil pencarian, dibatasi `MAX_SKILL_SEARCH_BYTES` 32 KB).
- Bukti vs dugaan: terverifikasi = hitungan 36/40 (awk), tumpang-tindih pada kata deskripsi, rumus peringkat. Dugaan = bahwa batas diskriminatif benar-benar memperbaiki pilihan model (belum diukur).
- Disposisi: ADAPT

### KWB-05 Skill baru on-demand: audit keterbacaan situs untuk mesin pencari dan asisten AI
- Sumber: `small-business/skills/seo-ai-visibility/SKILL.md` (sha256 `ab646dd7572f007c52f1b4b031f540fd03d72242647920cb7992213c0a0f8913`, 11.217 B), `reference/ai_visibility.md:1-173`, `reference/audit_checklist.md:1-60`, `reference/gotchas.md`, `reference/content_rewrite.md`, `reference/catalog_refresh.md`.
- Observasi: satu-satunya skill di irisan ini yang berjalan di situs publik apa pun tanpa konektor. Langkah: crawl halaman kunci + `robots.txt`/`sitemap.xml`/`llms.txt`; akses crawler AI (tabel nama agen pengguna); render tanpa JavaScript; JSON-LD schema.org; kejelasan fakta dan kontradiksi (jam, alamat); presensi di direktori; uji asisten (rekam jawaban verbatim, tanpa skor). Prinsip jujur yang terkalibrasi: llms.txt disebut konvensi muda; `robots.txt` adalah permintaan, bukan dinding; menolak teks tersembunyi, cloaking, ulasan palsu, dan instruksi untuk AI yang disematkan di halaman; hanya tandai apa yang tampak dan benar; urutan prioritas dampak; perbaikan DNS diserahkan balik, tidak diterapkan; jadwalkan periksa ulang 30 hari.
- Nilai untuk Agent Core: pengguna membangun situs (paket `replica-launch`, `frontend-ui-engineering`, `shipping-and-launch`). Belum ada panduan kesiapan SEO/AI sama sekali.
- Baseline Agent Core: BELUM-ADA. `grep -ril "llms.txt|robots.txt|json-ld|schema.org|sitemap"` di `runtime/skills/capability-packs` = 0 berkas; `GPTBot`/`ClaudeBot` = 0.
- Delta/celah: seluruh Skill. Adaptasi wajib: buang Shopify/Wix/Zapier/suara pemilik/artefak; ganti `WebFetch` dengan `web_open`/`browser_control` yang sudah ada; PowerShell untuk contoh; tambah `## Triggers` dan `## Non-triggers`; badan ≤ 8.192 B dengan dua referensi selektif (`audit_checklist`, `ai_visibility`); cap "per tanggal" pada daftar nama crawler dan status llms.txt, dengan instruksi memverifikasi ulang via `web_search`/`web_open` (isi bersifat cepat basi).
- Cara adaptasi: owner = SkillService, sumber di `capability-packs/website-seo-ai-readiness/` (nama huruf kecil-tanda hubung), `UPSTREAM.json` mengikuti pack yang ada (repo, commit `33d3dea`, path, sha256 sumber), `LICENSE` Apache-2.0. Tambah satu baris di `agent-core-capability-index/SKILL.md` (6.896 B; tambahan sekitar 120 B).
- Lisensi/hak cipta: Apache-2.0 akar; small-business tanpa LICENSE sendiri. Wajib menyertakan lisensi, menyatakan perubahan, dan tidak menyalin teks panjang; tulis ulang dalam bahasa dan contoh sendiri.
- Perkiraan skala: M · Risiko: sedang (menambah satu deskriptor pada katalog pencarian; isi cepat basi; kegunaan bergantung pada apakah pengguna merilis situs publik) · Nilai: sedang (bersyarat) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak (satu baris indeks).
- Bukti vs dugaan: terverifikasi = isi sumber, tidak adanya padanan lokal. Dugaan = kebutuhan pengguna; keakuratan fakta crawler/llms.txt per hari ini tidak diverifikasi di sini.
- Disposisi: ADAPT

### KWB-06 Lint statis lintas-pack sebagai penjaga regresi (bukan pembersih)
- Sumber: pemindaian saya atas small-business dan bio-research (lihat angka) vs `Agent-Core/src/skills/claude-plugin.ts:185-208` (satu-satunya pemanggil `findMissingReferences`), `tests/capability-pack-indexing.test.ts` (tiga pack), `package.json` skrip `path:check`, `verify:skill-routing`, `verify:skill-effectiveness`.
- Observasi (cacat nyata di sumber yang akan tertangkap lint): 4 dari 15 berkas `shared/` yatim (`absent-is-not-zero`, `chain-seams`, `document-format`, `gmail-inbox-traps` tidak ditautkan skill mana pun); dua rujukan direktori gantung di bio-research (KWB-03); `smb-router` menyatakan "All 11 command folders exist" padahal tidak ada folder `commands/` terlacak; 2 skill dengan kunci frontmatter non-strict (`version`); 27 dari 44 `SKILL.md` melewati batas ~125 baris yang ditetapkan `build-agent/reference/skill_authoring.md:93`; 37 dari 44 lebih dari 8.192 B (hanya 7 muat satu fragmen; median 10.736 B; 33 butuh dua fragmen, 4 butuh tiga); satu paragraf boilerplate identik di 39 skill (409 B × 39 = 15.542 B ekstra, 1,2 persen dari byte `.md`); bullet pengaman identik di 21 skill harus tetap sinkron dengan `untrusted-content.md` (saat ini cocok 21/21).
- Nilai untuk Agent Core: pack sumber bertambah lewat adaptasi dan revisi; tidak ada pemeriksaan statis yang melihat semua pack sekaligus.
- Baseline Agent Core: SEBAGIAN. Dry-run baca-saja saya pada 40 pack `runtime/skills/capability-packs`: semua memiliki `## Triggers` dan `## Non-triggers`; 0 rujukan gantung (dengan aturan regex adapter); 25 `SKILL.md` lebih dari 8.192 B (diperkirakan sah karena dibaca per fragmen); 1 kandidat yatim (`doubt-driven-development/references/upstream-agents/web-performance-auditor.md`, namanya tidak disebut di berkas lain pack; belum dikonfirmasi sebagai cacat). Duplikasi `references/upstream-shared/` (7 berkas × 25 pack, md5 identik) disengaja (`capability-packs/README.md`: paket harus mandiri). Pemeriksaan struktur penyimpanan: `npm run path:check` (bukan isi).
- Delta/celah: skrip pelaporan-saja `scripts/verify/skill-pack-lint.mjs` (tanpa tulis, keluaran JSON ringkas): kunci frontmatter, deskripsi ≤1.024 tanpa `<>`, Triggers/Non-triggers hadir dan tidak berisi boilerplate yang sama di > N pack, rujukan gantung (termasuk direktori dan span-kode `../`), berkas referensi yatim, salinan `upstream-shared` tetap identik, blok boilerplate tersinkron, ukuran SKILL.md dan jumlah fragmen sebagai informasi.
- Cara adaptasi: skrip di `scripts/verify/` (owner skrip verifikasi existing), memakai `parseSkillMarkdown`/`describeSkill` yang diekspor agar tidak menduplikasi parser (pola yang sama dengan adapter). Tidak menyentuh tool MCP.
- Lisensi/hak cipta: mandiri.
- Perkiraan skala: S-M · Risiko: rendah (baca-saja), asalkan keluaran tidak dijadikan gerbang keras · Nilai: rendah-sedang (pack sekarang bersih; nilainya mencegah regresi, dan menangkap Non-triggers boilerplate untuk KWB-04) · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = semua angka di atas (skrip inline baca-saja). Dugaan = bahwa yatim `web-performance-auditor.md` tidak dipakai; mungkin dirujuk lewat direktori.
- Disposisi: ADAPT

### KWB-07 Standar penulisan Skill (distilasi `build-agent/skill_authoring` + pola gotchas)
- Sumber: `small-business/skills/build-agent/reference/skill_authoring.md:1-165`, `reference/gotchas.md:1-204`, `reference/capture.md`; pola `gotchas.md` di 31 skill (heading "Gotcha:", "Why it matters", Bad/Good); `tax-season-organizer/reference/calculation-assumptions.md:1-25` (angka bertahun, cap kedaluwarsa); `shared/currency-and-locale.md:75-95` (jalur tertutup negara).
- Observasi: aturan yang mereka tulis untuk skill buatan sendiri: deskripsi = pemicu, orang ketiga, memakai kata pengguna, condong ke over-trigger (hal ini berlawanan dengan kebutuhan Agent Core); badan bernomor ~125 baris, detail di `reference/`; jelaskan alasan, bukan hanya perintah; gerbang untuk kirim/belanja/publikasi/hapus/komit, bukan untuk baca/hitung/draf; 3-5 gerbang sehat, 9 lebih buruk daripada manual; **gerbang menyebut apa yang akan terjadi** (jumlah, penerima, total, akun) alih-alih "siap lanjut?"; fallback wajib; jangan karang angka; satu jalur utama + satu jalur darurat; nama rekaman spesifik; catatan "bagaimana ini bisa rusak" saat serah terima; angka berjangka (pajak 2025) diberi cap tahun dan dilarang dipakai diam-diam untuk tahun lain (ambil dari sumber otoritatif beserta tanggal, atau tanya). Paket sendiri melanggar panduannya (27/44 > 125 baris) dan tidak punya tes sama sekali ("no tests directory").
- Nilai untuk Agent Core: tidak ada panduan penulisan isi Skill di repo; yang ada hanya parser strict dan README penyimpanan.
- Baseline Agent Core: SEBAGIAN. Parser strict (`service.ts:88-190`), bagian proposal (`service.ts:585-588`: Purpose/Trigger/Non-trigger/Workflow/Limitations/Output contract), eval (`verify:skill-routing`, `verify:skill-effectiveness`, `mind-control/evals/*`), registri nilai terverifikasi untuk angka (`src/learning/verified-value-registry.ts`), `source-driven-development`. Tidak ada dokumen "bagaimana menulis Skill yang baik".
- Delta/celah: satu dokumen pendek (kira-kira 3 KB) berisi sepuluh butir di atas, disesuaikan: deskripsi presisi (bukan over-trigger), Non-triggers diskriminatif (KWB-04), cap tanggal pada fakta berumur pendek, gerbang informatif.
- Cara adaptasi: tambahkan bagian di `runtime/skills/capability-packs/README.md` (1.582 B sekarang) atau berkas docs yang ditaut dari sana; docs-only, tidak dimuat otomatis.
- Lisensi/hak cipta: gagasan; tulis ulang.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = isi sumber, 27/44 > 125 baris, tidak adanya panduan lokal. Dugaan = bahwa penulis Skill (AI/manusia) akan membaca dokumen tanpa diarahkan.
- Disposisi: ADAPT

### KWB-08 Templat rantai Skill: In / Out / Gate, pemilik angka, bawa-maju
- Sumber: `small-business/skills/close-month/SKILL.md:1-86`, `plan-payroll/SKILL.md:1-88`, `report-pack/SKILL.md`, `tax-prep/SKILL.md:1-60` (README: "Eleven of these … chain other skills"; 11 skill rantai: call-list, close-month, grow-pipeline, marketing-monday, monday-brief, pay-the-bills, plan-payroll, reactivate, report-pack, restock, tax-prep).
- Observasi: tiap langkah rantai menyebut Masuk, Keluar, Gerbang. Pola yang berulang: urutan adalah produknya; langkah pertama memiliki angka dan langkah berikutnya mengutipnya ("jangan hitung ulang"); perkiraan dibawa maju; masuk-ulang idempoten (bila bulan sudah ditutup: verifikasi saja); rantai tidak menambah izin kirim; tiga tawaran lanjutan maksimal dan tidak mengulang yang ditolak; argumen `--flag` dengan default yang disimpulkan.
- Nilai untuk Agent Core: pack Replica (recon, architect, build, test, deploy) dan alur Addy adalah rantai; templat ini memberi cara menulis rantai tanpa orkestrasi runtime (yang ditolak).
- Baseline Agent Core: SEBAGIAN. Rantai ada sebagai urutan antar Skill (`using-agent-skills`, pack Replica) tanpa konvensi Masuk/Keluar/Gerbang yang seragam. Saya tidak membaca isi Replica secara penuh.
- Delta/celah: konvensi penulisan, bukan mekanisme.
- Cara adaptasi: satu butir di dokumen KWB-07; penerapan pada pack Replica hanya bila revisi lain terjadi.
- Lisensi/hak cipta: gagasan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = pola di 4 rantai yang dibaca penuh/sebagian; 7 rantai lain hanya skim.
- Disposisi: REFERENSI

### KWB-09 Klaim jujur tentang jadwal dan zona waktu
- Sumber: `small-business/shared/chain-seams.md:51-126` (jadwal tak pernah dibuat; zona waktu salah berjam-jam), `skills/report-pack/SKILL.md:45-69`, `skills/speed-to-lead/SKILL.md:135-147` (mode terjadwal hanya draf dan rute; satu kanal disetujui sekali).
- Observasi: sembilan skill menawarkan "berulang" padahal plugin tidak punya penjadwal; menulis "weekly" hanya menyimpan string. Aturan: jangan katakan terjadwal kecuali ada yang benar-benar dijadwalkan; kalau tidak ada penjadwal, tawarkan pengganti jujur (blok kalender pengingat) dan tetap simpan definisinya. Zona waktu: tetapkan zona pemilik sekali, percayai offset pada cap waktu bukan label, cetak zona pada keluaran luar, sebut bila sinyal bertentangan; jangan menawarkan slot hanya karena alat "suggest_time" berkata kosong.
- Nilai untuk Agent Core: hindari klaim "akan saya ingatkan besok" tanpa pemicu nyata.
- Baseline Agent Core: SUDAH-ADA pada level data, tidak pada level kalimat. `src/memory/prospective-intentions.ts:31` ("never schedules, resolves or authorizes an action"; `advisory: true` di `:17,52`); cap waktu wajib berzona (`src/learning/evaluation.ts:31`, `src/memory/experience-types.ts:16-18`). Zona waktu tampilan pengguna (Windows, WIB) tidak ditemukan sebagai aturan.
- Delta/celah: dua kalimat panduan untuk Native/pengendali: "niat prospektif adalah isyarat saran, bukan pengatur waktu; jangan menjanjikan eksekusi terjadwal", dan "cetak zona saat menyebut waktu keluar".
- Cara adaptasi: dokumen/referensi, bukan AGENTS.md. Opsional.
- Lisensi/hak cipta: gagasan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = baris kode. Dugaan = bahwa pengendali pernah menjanjikan jadwal palsu; tidak ada bukti di irisan ini.
- Disposisi: REFERENSI

### KWB-10 "Satu produk, dua registrasi": aturan untuk server yang sama di dua prefiks
- Sumber: `small-business/shared/connector-neutrality.md:80-117`, `shared/connector-call-shapes.md:3-14`.
- Observasi: aturan identitas adalah produk, bukan registrasi: panggil entri yang terotorisasi (milik pemilik bila keduanya), jangan panggil keduanya, dua entri tidak memicu pertanyaan "sumber rujukan", entri tak terotorisasi bukan "tidak terhubung", tampilkan nama produk, dan pencocokan nama tool harus menangani kedua bentuk prefiks.
- Nilai untuk Agent Core: sesi pekerja ini sendiri melihat dua registrasi Agent Core dengan nama tool dan instruksi identik (`mcp__agent-core__*` dan `mcp__5d1085ea-…__*`, kutipan inventaris tool dan blok instruksi server). Jabat tangan `controller_contract` dan `contractSession` bersifat per sesi pengendali; memanggil dua prefiks berisiko jabat tangan ganda atau salah sesi.
- Baseline Agent Core: BELUM-ADA sebagai panduan. `grep "mcp__"` di `src/` dan `AGENTS.md` = 0; tidak ada dokumen yang menyinggung registrasi ganda.
- Delta/celah: satu paragraf: pilih satu prefiks per sesi; satu jabat tangan; nama di laporan = "Agent Core"; kecocokan nama tool di kode (bila ada) tidak boleh bergantung pada prefiks.
- Cara adaptasi: docs on-demand (mis. `docs/Capability-Index.md` atau `Claude-Desktop-Skill-Registration.md`), bukan AGENTS.md (84 KB, selalu dimuat).
- Lisensi/hak cipta: gagasan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = tidak adanya `mcp__` di kode/kontrak; identitas kedua prefiks adalah INFERENSI dari nama dan instruksi yang identik, bukan diuji.
- Disposisi: ADAPT

### KWB-11 Rubrik berbukti-kutipan dengan status "tidak dapat dinilai" dan penjaga skor datar
- Sumber: `small-business/skills/hiring-screener/reference/fair_screening.md:56-95`, `reference/rubric.md` (skala 0-3 + tanda "—"; rumus bobot), `skills/lead-triage/reference/hubspot-scoring.md` (bagian "When the scores come out flat"), `payroll-prep/reference/anomaly_rules.md:28-38`.
- Observasi: tiap skor wajib disertai kutipan; "—" (tidak dapat dinilai) bukan nol: keluar dari pembilang dan penyebut, hasil dilaporkan sebagai persen dari bobot yang dinilai plus bobot itu sendiri; pelamar dengan "—" pada kriteria wajib masuk pita "tidak dapat dinilai" yang menghasilkan pertanyaan, bukan penolakan. Penjaga skor datar: jika selisih puncak dan dasar < 10 poin, katakan model tidak memisahkan apa pun, urutkan memakai tangga sinyal, hapus kolom skor. Aturan anomali yang menyala pada proses pertama tanpa baseline (satu giliran > 12 jam).
- Nilai untuk Agent Core: model yang sama untuk rubrik penilaian kode/uji dan untuk keluaran pencarian: jangan menyajikan urutan acak sebagai peringkat.
- Baseline Agent Core: SEBAGIAN. Status `not-assessed` ada di data Learning (`src/learning/salience-review.ts:102`, `external-procedure.ts:72`); grader `mind-control/evals/grader.md` mewajibkan kutipan dan alasan per skor dan melarang kata kunci sebagai penilai; `scripts/verify/skill-routing-eval.mjs` memberi `null` bila penyebut 0. Pencarian Skill me-rank dengan RRF dan memecah seri berdasarkan nama (`discovery.ts:142-166`) tanpa penanda "tidak memisahkan".
- Delta/celah: penanda `separation: 'flat'` pada hasil pencarian Skill/Memory bila skor teratas identik (field keluaran, opsional); rumus bobot-dinilai untuk grader baru bila ada.
- Cara adaptasi: internal; opsional; tidak ada permintaan mendesak.
- Lisensi/hak cipta: gagasan. Data skrining pelamar dan hukum kerja AS tidak relevan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak (field keluaran) · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = sumber dan kode peringkat. Dugaan = frekuensi seri pada katalog nyata (tidak diukur).
- Disposisi: REFERENSI

### KWB-12 Pola pendamping bio-research: envelope provenance, validator lunak/ketat, preflight terstruktur
- Sumber: `bio-research/skills/instrument-data-to-allotrope/scripts/convert_to_asm.py:195-300` (`$conversion_metadata`), `scripts/validate_asm.py:1-70,353-410,1013-1077` (`ValidationResult`, `--strict`, `--reference`, tanggal aturan + sumber), `requirements.txt:1-12` (versi dipin untuk determinisme); `nextflow-development/SKILL.md:12-22,45-130` (daftar periksa MUST-pass + DECISION POINT + test profile), `scripts/check_environment.py:16-45,363-448` (`CheckResult{name,passed,message,details,fix}`, `--json`, exit code), `scripts/utils/validators.py:16-60`; `references/geo-sra-acquisition.md` ("Instructions for Claude": konfirmasi ukuran sebelum unduh); `single-cell-rna-qc/SKILL.md:148-154` ("permisif dulu").
- Observasi: (a) keluaran turunan membawa blok provenance: sha256 input, ukuran, nama, versi skill dan pustaka, parser yang dipakai (native vs fallback), keyakinan deteksi, peringatan; jalur fallback juga memperingatkan bahwa hasilnya tidak untuk produksi teregulasi. Catatan kejujuran: fungsi `get_deterministic_timestamp` ada, tetapi blok yang sama memakai `datetime.utcnow()`, jadi blok itu sendiri tidak deterministik. (b) Validator memperlakukan nilai tak dikenal sebagai peringatan (kompatibilitas ke depan), `--strict` mengubah peringatan menjadi galat, `--reference` membandingkan dengan berkas emas; aturan diberi tanggal dan URL sumber. (c) Preflight: laporan per-pemeriksaan terstruktur dengan saran perbaikan; "jangan lanjut sampai lulus"; jalankan profil uji kecil sebelum data nyata. (d) Klaim reprodusibilitas lemah: grep `seed|random_state` di semua skrip bio = 0; hanya paket allotrope yang dipin; unduhan FASTQ tanpa pemeriksaan checksum.
- Nilai untuk Agent Core: pola umum untuk keluaran yang diturunkan dan untuk "doctor"; bukan domain.
- Baseline Agent Core: SEBAGIAN. Envelope hasil lokal (CC-P3) dan provenance Skill (CC-P4) sudah diadopsi; `reconstruction_harness` dan `verify-evidence-links.mjs` ada; preflight rilis di `scripts/release/candidate-cutover.mjs`; tidak ada "doctor" umum (grep "doctor|preflight" hanya menemukan cutover dan docs).
- Delta/celah: tidak ada yang mendesak. Peringatan: saran `fix` bergaya `curl | bash` tidak boleh dijalankan agen tanpa konfirmasi (kategori "unduh dari sumber tak tepercaya").
- Cara adaptasi: REFERENSI untuk desain "doctor" atau envelope turunan di masa depan; tidak ada perubahan sekarang.
- Lisensi/hak cipta: Apache-2.0; gagasan; hindari menyalin daftar teknik/satuan Allotrope.
- Perkiraan skala: M bila suatu hari dikerjakan · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = potongan kode yang dibaca; sisanya skim.
- Disposisi: REFERENSI

### KWB-13 `scientific-problem-selection`: kerangka pemilihan masalah riset
- Sumber: `bio-research/skills/scientific-problem-selection/SKILL.md:1-269`, `references/02-risk-assessment.md:1-95` (tabel asumsi: skor risiko 1-5 + bulan sampai teruji), `04-parameter-strategy.md:1-95` ("tetapkan satu parameter"), `05-decision-tree.md:1-85` ("tarian ketinggian": bergantian eksekusi dan evaluasi), `07-problem-inversion.md:1-95` (lepas parameter, ganti tujuan sebanding, "pertanyaan apa yang dijawab data ini").
- Observasi: percakapan tiga pintu masuk (usul ide, masalah proyek, pertanyaan strategis), sembilan modul, keluaran 1-2 halaman, estimasi waktu dalam minggu. Konten untuk ilmuwan biologi (pelajar S3, PI, pendiri startup).
- Nilai untuk Agent Core: teknik "lepas parameter yang dianggap tetap saat buntu" dan tabel asumsi dengan waktu-uji dapat memperkaya perencanaan.
- Baseline Agent Core: SEBAGIAN/SUDAH-ADA. `idea-refine`, `interview-me`, `planning-and-task-breakdown`, `doubt-driven-development`; `mind-control` mencakup pertanyaan "apa yang mengubah pikiran saya" (flip condition) dan "apakah ini masalah yang tepat" (kerangka). Aturan "setelah beberapa kali gagal, sebut asumsi yang diragukan" ada di kontrak pengguna. Tidak ada sumber dalam repo yang meniru kerangka Fischbach dan Walsh.
- Delta/celah: kecil; dua teknik (lepas parameter; tabel asumsi dengan waktu-uji) tidak ada padanan eksplisit.
- Cara adaptasi: tidak disarankan sebagai Skill. Bila perlu: dua butir pendek di referensi `idea-refine`.
- Lisensi/hak cipta: kerangka berasal dari publikasi Cell 2024 dan kuliah Stanford; Apache-2.0 hanya menutup ekspresi Anthropic; gunakan gagasan saja.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = isi SKILL.md dan empat referensi; lima referensi lain skim.
- Disposisi: REFERENSI

### KWB-14 `build-agent`, `build-connector`, dan pustaka jebakan konektor
- Sumber: `small-business/skills/build-agent/SKILL.md:1-105`, `reference/capture.md:1-133`, `reference/gotchas.md:1-204`; `skills/build-connector/SKILL.md:1-102`, `reference/gotchas.md:1-237`; `shared/connector-call-shapes.md:16-37`.
- Observasi: build-agent: transkrip adalah spesifikasi; koreksi pengguna adalah aturan; pisahkan tetap/berubah/penilaian; maksimal 3-5 pertanyaan sebelum draf; uji pada kasus yang diketahui sebelum diandalkan; pecah tugas yang terlalu besar; tulis dalam kata pengguna. build-connector: tentukan lingkup sempit; cek direktori dahulu; jangan bangun terhadap API mentah; token bukan sandi; pengguna integrasi khusus; sebut apa yang dijangkau sebelum membuat; sebut cara rusaknya; bedakan "tidak ada rekaman" dari "gagal mengambil"; tiap penulisan digerbang. Pustaka bentuk panggilan: tabel baris per tool dengan aturan "tambah baris bila panggilan gagal lalu berhasil pada percobaan ulang".
- Nilai untuk Agent Core: sebagian besar sudah dimiliki.
- Baseline Agent Core: SUDAH-ADA. Admission prosedur memiliki `parameters` (pengikatan {{nama}} dengan cek tak terikat/tak terpakai, `src/learning/external-procedure.ts:22,45-49`), `prerequisite`, `cases` positif/negatif/pengecualian, `reversalOrStop`, `rollback`; pemicu segera `user-correction` dan `verified-recovery` (`src/learning/triggers.ts:9-13`); `PROCEDURE_SCAFFOLD_QUESTIONS` (5 pertanyaan, dipaku uji `tests/learning-pending-review-health.test.ts:213`); kapsul `PRIOR EXPERIENCE` pada kegagalan tool (`AGENTS.md:109`); Skill proposal + evaluasi. Jalur "Zapier" bertentangan dengan local-first.
- Delta/celah: hanya satu: pertanyaan scaffold tidak menanyakan "bagian mana yang spesifik pada proses ini (nama/tanggal/path) dan harus menjadi parameter?" (pemicu cacat "hardcode contoh"). Cukup memperhalus teks pertanyaan 1 tanpa mengubah jumlah.
- Cara adaptasi: opsional; `src/learning/procedure-scaffold.ts`.
- Lisensi/hak cipta: gagasan.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: terverifikasi = sumber dan baseline.
- Disposisi: REFERENSI

---

## Bagian C — Ditolak atau tidak relevan

- **C-1 Skill bisnis berbasis konektor SaaS (36 dari 44 skill)**: `ad-manager`, `ap-processor`, `business-pulse`, `call-list`, `canva-creator`, `cash-flow-snapshot`, `content-strategy`, `contract-review`, `crm-autopilot`, `grant-rfp-writer`, `grow-pipeline`, `growth-pulse`, `hiring-screener`, `inbox-manager`, `inventory-planner`, `invoice-chase`, `job-post-builder`, `lead-finder`, `lead-triage`, `marketing-monday`, `monday-brief`, `month-end-prep`, `outreach-composer`, `pay-the-bills`, `payroll-prep`, `plan-payroll` (hanya sebagai pola), `proposal-builder`, `reactivate`, `report-builder`, `report-pack` (pola), `restock`, `review-reputation`, `social-content-engine`, `speed-to-lead`, `tax-prep`, `tax-season-organizer`, `ticket-deflector`. Alasan konkret: (a) bergantung pada QuickBooks, Xero, Gusto, HubSpot, Gmail, Stripe, Canva, dsb. yang tidak ada di Agent Core dan tidak boleh ditambah (manifes tool MCP 130.965 dari 131.072 B); (b) memuat aturan pajak, ketenagakerjaan, dan kontrak AS (`currency-and-locale.md:75-95` sendiri menyatakan banyak jalur khusus AS); (c) banyak mengirim pesan ke pihak luar atau memindahkan uang (gerbang persetujuan bukan pengganti kebutuhan); (d) tidak ada kebutuhan pengguna yang terbukti dalam brief (pengguna adalah pengembang berbahasa Indonesia); (e) bila diimpor lewat adapter, `../../shared/` tidak akan terselesaikan (KWB-03). Pola yang berharga dari skill ini sudah diekstraksi ke temuan di atas.
- **C-2 Gaya dan konten dokumen pemilik**: `shared/artifact-style.md`, `shared/reference/artifact-example.html`, `shared/document-format.md`, `shared/voice-profile.md`, `skills/brand-style`. Alasan: token CSS/Google Fonts untuk halaman artefak Claude, bukan UI React WebView2 Agent Core; preferensi pengguna sudah tersimpan di Memory; `replica-brand` dan `replica-design` sudah menurunkan token.
- **C-3 Manifes MCP jarak jauh**: `small-business/.mcp.json` (35 server) dan `bio-research/.mcp.json` (11 server). Alasan: tiap server menambah tool dan egress data pihak ketiga; anggaran manifes habis; adapter `claude-plugin.ts` hanya MELAPORKAN MCP, tidak mengaktifkan, sesuai doktrin. Catatan pemeliharaan yang dipelajari: riwayat git menunjukkan tiga perbaikan URL MCP mati (`09f62fb`, `938a43d`, `2e47e5b`-`fea238c`): manifes server jarak jauh membusuk; Agent Core menghindarinya dengan tidak bergantung pada daftar tetap.
- **C-4 Skill bioinformatika dan lab**: `skills/start`, `instrument-data-to-allotrope` (isi domain), `nextflow-development` (isi domain + referensi + konfigurasi), `scvi-tools` (referensi + skrip), `single-cell-rna-qc`. Alasan: domain biologi komputasi; instruksi untuk Linux/`sudo`/Docker/HPC (host Windows 10 pengguna); `curl | bash` dan unduhan data berukuran puluhan GB tanpa checksum; butuh GPU dan paket ilmiah Python; tidak ada kebutuhan pengguna terbukti. Satu pola per skill sudah diekstraksi di KWB-12.
- **C-5 Jalur Zapier di `build-connector`** (`reference/use-zapier.md`, `reference/discovery.md`, `reference/paths.md`; skim): menyalurkan data pengguna lewat layanan pihak ketiga berbayar per tugas, bertentangan dengan local-first dan tanpa telemetri jarak jauh.
- **C-6 Pola yang ditolak karena sudah dimiliki atau bertentangan dengan doktrin**: "condong ke over-trigger" pada deskripsi (Agent Core ingin pemilihan presisi demi konteks); penyimpanan definisi laporan di dalam folder skill (`report-builder/reference/saved_reports.md` menulis ke sumber; Agent Core melarang rumah penyimpanan paralel; folder skill terpasang bisa read-only dan paket sendiri membutuhkan jalur cadangan); mode "tanpa menanyakan izin sebelum menarik data" (sejalan, tidak baru); penjadwalan sebagai janji tanpa penjadwal (KWB-09).

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

### D.1 Pola yang berulang dan layak jadi standar

1. **Deskripsi sebagai pemicu dengan frasa pengguna yang disebut eksplisit** (44/44 skill; rata-rata 767, maksimum 947 karakter; di bawah batas 1.024 Agent Core). Cocok dengan pemeringkatan Agent Core yang membaca nama+deskripsi+Triggers: masukkan frasa asli pengguna (Indonesia dan Inggris) ke Triggers.
2. **Pengungkapan bertahap tanpa tes**: median `SKILL.md` 10.736 B; hanya 7/44 muat satu fragmen 8.192 B; 33 butuh 2, 4 butuh 3. Referensi dimuat selektif. Tidak ada `tests/`, tidak ada eval; hanya dua dari 19 contoh bercatatan "Pass criteria" berkotak-centang (`smb-onboard/reference/examples/happy-path.md`, `job-post-builder/reference/examples/worked-example.md`). Agent Core sudah lebih maju (eval routing/efektivitas, kasus beku).
3. **Berkas pengaman inline + tautan dalam**: bullet 21 skill diulang verbatim, karena berkas `shared/` tidak otomatis dimuat. Agent Core menjawab hal yang sama dengan duplikasi artifact-local (`references/upstream-shared/` identik di 25 pack, 1.682.825 B total). Standar yang disarankan: satu bullet pengaman inline di SKILL.md + salinan referensi di pack; lint menjaga sinkron (KWB-06).
4. **Fallback nol-konektor wajib** dan tabel Required/Optional/Fallback (`smb-router/reference/connector-map.md`). Padanan Agent Core: bidang `compatibility` dan `allowed-tools`; bisa dijadikan butir wajib "apa yang terjadi bila tool X tidak diberikan".
5. **Gotchas Bad/Good** per skill (31 bagian "What not to do" dan 31 berkas `gotchas.md`): katalog antipola yang bisa menjadi kasus eval negatif.
6. **Angka tidak pernah dikarang**: nama celahnya ("n/a" + sumber). Agent Core menegakkan versi lebih kuat di kode (`VerifiedValueRegistry`).
7. **Gerbang informatif**: gerbang menyebut jumlah, penerima, total, akun; 3-5 gerbang sehat.
8. **Cap tanggal pada fakta berumur pendek** dan larangan memakainya diam-diam untuk periode lain.
9. **Aturan yang berlaku tanpa baseline** (aturan anomali giliran > 12 jam pada proses pertama): heuristik relatif perlu satu penjaga mutlak.
10. **Pengendalian drift dokumentasi**: sumber ini sendiri tidak punya lint (4 berkas `shared/` yatim, klaim "command folders", frasa ganda di `chain-seams.md:106-108`), bukti bagi KWB-06.

### D.2 Pertanyaan terbuka untuk Main/pengguna

1. Apakah pengguna membangun atau merilis situs publik (menentukan nilai KWB-05)?
2. Boleh mengganti kalimat `src/agent-controller.ts:476` dengan satu kalimat doktrin (KWB-01), dan siapa yang memperbarui uji prompt Native?
3. Apakah revisi 11 `mind-control` (KWB-02) boleh dibuka lewat alur proposal, atau referensi lebih baik ditaruh di `debugging-and-error-recovery`?
4. Apakah penyuntingan Non-triggers (KWB-04) boleh menyentuh pack turunan Addy pada lapisan adapter, dengan eval routing sebagai penentu?
5. Tidak dapat dipastikan di sini: apakah `skills(validate)` hasil pratinjau ditampilkan di UI sehingga field baru KWB-03 terlihat; apakah ada tes yang memaku isi `systemPrompt`; apakah dua registrasi Agent Core (KWB-10) memang dua koneksi ke proses yang sama.
6. Hal yang tidak sempat dibaca penuh: 240 berkas yang berstatus sampel atau skim (terutama referensi per-skill small-business dan sebagian besar skrip/referensi bio-research); isi `use-zapier.md`, `discovery.md`, `paths.md` di `build-connector`; `ncbi_utils.py` dan `sra_geo_fetch.py` hanya dipindai grep untuk jaringan/checksum.
