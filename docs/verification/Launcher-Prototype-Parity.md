# Koreksi migrasi launcher: prototype menjadi acuan utama

Tanggal: 2026-10-29. Status: UI prototype aktif dan terverifikasi di launcher resident. Review Native telah didispatch dengan Opus 5.5/max, tetapi laporan akhirnya belum tersedia karena provider wait.

## Keputusan dan batas penerimaan

Pengguna menolak hasil migrasi pertama karena struktur halaman masih mengikuti launcher lama. Bukti build dan tes pada laporan sebelumnya tetap berlaku untuk build tersebut, tetapi **bukan bukti penerimaan visual**. Target sekarang adalah susunan layar, kepadatan, navigasi, composer, inspector, daftar, kartu, dan dialog dari prototype. Nama Agent Core dan ikon assets dipertahankan. Fungsi yang tersedia memakai owner existing; bagian tanpa kontrak UI ditampilkan sebagai planned upgrade.

Claim: prototype menjadi kerangka UI default, bukan sekadar tema untuk halaman lama.
Observed: source dan enam screenshot pengguna menunjukkan composer bawah, menu +, inspector empat kelompok, cockpit dashboard, daftar Tools Hub, kartu model, dua kolom Goals, dan Dreaming Review.
Inferred: mock data, angka token, fake inference, dan izin lokal prototype bukan fungsi runtime yang dapat dimigrasikan apa adanya.
Rival: mempertahankan page layout lama dengan warna baru akan mengulang kesalahan yang dikoreksi pengguna.
Test: render donor dan target pada viewport 1202 × 811, inspeksi halaman, pengujian callback dan state unknown, lalu pemeriksaan resident.
Flip condition: hasil render masih memakai susunan halaman lama, kontrol existing tidak bisa dipakai, atau UI menampilkan keberhasilan simulasi.

## Sumber dan provenance

- Source diberikan pengguna: `E:\\Projects\\Launcher\\src`. README donor menunjuk AI Studio app `https://ai.studio/apps/1f49c29b-8660-40eb-8203-09d1161bf89d`. Ini identitas sumber lokal yang diotorisasi pengguna, bukan klaim lisensi atau publisher publik yang terverifikasi.
- Enam gambar yang diberikan pengguna dibaca langsung dari `E:\\Projects\\Launcher\\.aistudio\\artifacts\\brain\\734ca3f9-4f7c-46e8-83f3-ecd57ef889b0\\.tempmediaStorage`: `media_1793210353313_a4041d81.png`, `media_1793211551866_7f4704f6.png`, `media_1793211560856_2712f26b.png`, `media_1793210816082_2f15446d.png`, `media_1793209777753_6d4e3651.png`, `media_1793209768663_f9f9dc60.png`.
- Source-derived migration, bukan clean-room clone. Tidak membaca browser profile, credential, arsip, atau file lain di .aistudio.
- Replica recon/diff diadaptasi untuk sumber milik pengguna dan rumah evidence existing. Addy frontend-ui-engineering dipakai untuk reference-led layout, state availability, keyboard, serta responsive checks.

## Peta layar dan alur

| Layar | Implementasi default | Fungsi existing / batas |
| --- | --- | --- |
| AI Workspace | Pesan + avatar, composer bawah, menu +, picker model/effort, inspector kanan | Draft-first send, history, stop/recovery, archive, Memory-use, task-bound actual changes tetap memakai host existing. |
| Dashboard | Operating Cockpit, empat metrik, health cards dua kolom | Semua subsistem nyata; jumlah/baris berbeda dari data contoh donor. Proposal reader tetap dipertahankan. |
| Tools Hub & MCP | Search, tab Installed/For This Task/Discover/Needs Setup, list + Inspect | Sumber adalah health subsystems; bukan klaim negotiated tool inventory. Workflows dapat dibuka dari sini. |
| AI Models | Kartu model dua kolom dengan fakta dan actions | Provider/model selection nyata; busy/recovery guard tetap berlaku. Harga/context tidak ditebak. |
| Memory Explorer | Header, metrics, kategori, record view | Hanya health dan conversation-use yang tersedia; kategori full-store disabled. |
| Goals & Plans | Dua kolom tujuan/rencana dan task evidence | Strategic CRUD/milestone/structured planner ditunda; taskId guard dipertahankan. |
| Artifacts | Header, tab deliverables, task-change inspection | Import/editor/export tipe artifact ditunda. Diff reader/redaction tetap owner existing. |
| Dreaming Review | Header, tiga metrik Learning, proposed findings/audit sections | Tidak membuat job atau finding contoh; antrean yang tidak tersedia tidak dianggap kosong. |
| Core Runtime | Supervisor header, resource metrics, identity/recovery/events | Aksi native start/stop/restart/process/folder/log existing. |
| Activity Log | Timeline cards, filter/search, expandable details | Reader request/response sanitized existing; lifecycle incomplete tetap unknown. |
| Diagnostics | Recovery notice, health checks dan action list | Snapshot aktual; tidak mengaku menjalankan pemeriksaan menyeluruh baru. |
| Settings | Section cards untuk display, startup, paths, instructions, provider | Autostart dan open path nyata; tema/density/instruction editor tidak menyimpan konfigurasi palsu. |
| Setup Wizard | Langkah review Workspace → Provider → Capabilities → Ready | Review konfigurasi existing, bukan installer atau golden-task acceptance palsu. |
| Window Size | Modal, dimensi, preset, footer seperti referensi | Show/close/Escape aktif; resize/preset/apply ditunda. Native window frame tetap dapat digunakan. |

F01: New Session → ketik → Send → host membuat conversation → mengirim satu turn. Tidak membuat thread kosong saat membuka launcher.
F02: AI Models → Use → AI Workspace; pilihan tidak berubah saat task berjalan/recovering.
F03: Tools Hub → Inspect → Diagnostics atau Browse Workflows; filtering tidak membuat grant.
F04: menu + → Goals atau Tools Hub; attachment entries tampak tetapi disabled.
F05: Activity → record → sanitized detail; respons asing dan pagination ditangani owner existing.
F06: Window Size → modal → Escape/Cancel; tidak ada perubahan ukuran yang dipalsukan.

## Legacy dan perubahan source

`src/ui/src/PrototypePages.tsx` sekarang memiliki halaman prototype utama. `LauncherPages.tsx`, `LauncherInspector.tsx`, `components.tsx`, `pages.tsx` dan `launcher.css` menyesuaikan struktur/presentasi. `App.tsx` tetap menjadi owner state dan callback host, dengan route wizard tambahan.

Halaman lama yang masih diekspor dalam `pages.tsx` menjadi komponen legacy untuk bukti/regression fixtures; router default tidak memilih Dashboard/Systems/Runtime/Diagnostics/Settings/Activity lama. Workflows dan pembaca evidence existing digunakan sebagai fitur pendukung. Tidak membuat runtime, Memory store, atau host bridge tandingan.

Checkpoint source sebelum koreksi: `09d47b2e-fc91-45bd-841f-55cc098089a3`. Restore harus terbatas pada file task dengan preview owner; jangan restore seluruh manifest inherited.

## Verifikasi

- TypeScript UI: lulus.
- Suite UI: 95 tes lulus, termasuk draft/send/model/effort/recovery, task binding, escaped evidence, dan empat tes tambahan untuk planned controls, akses Workflows, lifecycle timeline, dan wizard tanpa side effect.
- Build UI dan path/storage/folder policy: lulus; tidak menambah dependency.
- Harness `scripts/verify/launcher-prototype-parity.mjs` memakai Vite/React/Tailwind yang sudah terpasang serta Chromium headless shell 1223. Donor asli dirender, lalu build target dirender dengan **fixture host sintetis**. Ini bukan bukti runtime resident.
- `Launcher-Prototype-Browser-Checks.json`: 36 pemeriksaan halaman/responsive pada 320, 768, 1024, 1440 px; exception JavaScript dan overflow halaman diperiksa; dialog Escape diperiksa.
- Screenshot reference/target berada di direktori verification dengan prefix `Launcher-Prototype-Reference-` dan `Launcher-Prototype-Target-`.
- Screenshot berbeda datanya: provider nyata/fixture, jumlah subsistem, serta panel deferred menggantikan mock donor. Nilai image-diff mentah tidak membuktikan kesiapan atau paritas fungsi. Tidak mengklaim identik piksel.
- Resident WebView pada 1536 × 960 memuat `index-BMA6CNsQ.js`, `Core: Ready`, dan 14 route (termasuk wizard serta Workflows) tanpa exception JavaScript atau overflow horizontal. Bukti: [resident checks](Launcher-Prototype-Resident-Checks.json), [workspace](Launcher-Prototype-Resident-chat.png), [dashboard](Launcher-Prototype-Resident-dashboard.png), [models](Launcher-Prototype-Resident-models.png), [tools](Launcher-Prototype-Resident-systems.png).
- [Integrity manifest](Launcher-Prototype-Integrity.json) mengikat 19 file source/test/harness/build/icon. Hash keempat file ikon tetap sama dengan baseline. Tidak ada perubahan C# yang memerlukan publish EXE.
- Restart resmi pertama mengaktifkan frontend; restart resmi kedua mengembalikan mode normal. Receipt kedua `305247d78147403395419cc9c561dc76` exit 0, Core PID 11404, `/health` status `ok`, version `1.6.0`, dan listener debug 18767 tidak ada. [Activation proof](Launcher-Prototype-Activation.json).
- Policy diagnostik per-app sementara di HKLM hanya dipakai untuk inspeksi WebView sendiri. Value dihapus setelah pemeriksaan, tiga parent key yang dibuat task dan kosong dikembalikan ke keadaan semula; [readback cleanup](Launcher-Prototype-Diagnostic-Cleanup.json). Tidak mengubah policy aplikasi lain.
- Replica layout comparison menghasilkan 56.8/100 (`partly`) untuk workspace dan 58.2/100 untuk dashboard pada pengukuran sebelumnya. Data, evidence dan panel deferred berbeda dari mock donor; skor ini **bukan penerimaan visual atau klaim pixel parity**. Struktur prototype diadopsi, tetapi kesamaan piksel penuh tidak diklaim.
- Code Intelligence melaporkan index current, tetapi pencarian `PrototypeDashboard` tidak mengembalikan entitas. Review wiring memakai source aktual: `pages.tsx` mengimpor dan memilih komponen prototype, `App.tsx` meneruskan callbacks, dan `components.tsx` memiliki inspector/dialog. Hasil graph kosong tidak diperlakukan sebagai bukti tidak ada caller.
- Batas verifikasi: tidak melakukan audit screen reader/axe menyeluruh; tidak memicu ulang operasi destruktif atau setiap restart/config action hanya untuk demonstrasi. Callback/state diuji dalam suite; sesi inference nyata baru bergantung pada ketersediaan provider.

## Pembagian tugas Native

Tugas review read-only diberikan ke Native melalui conversation `3646f490-d273-4f3a-8b8e-72d75ef11e9d`, turn `f82ddeb2-34fa-41ec-9175-768e4e979f91`, task `9c0f5adc-4b3f-4156-9574-84472bc94ed7`, client request `launcher-prototype-parity-partner-20261029-v1`, model `claude-opus-5-5`, effort `max`. Native ditugaskan memetakan kontrak existing versus deferred; Main menangani source, integrasi, pengujian dan keputusan akhir. Provider sempat paused/provider-open lalu running. Readback akhir masih `resumable`, `AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT`, tanpa pesan laporan assistant. [Receipt status Native](Launcher-Prototype-Native-Status.json). Tidak menduplikasi dispatch atau mengganti model tanpa alasan. Review Native tetap tertunda; laporan mapping dan verifikasi pada dokumen ini berasal dari Main dan tidak diatribusikan ke Native.

## Action ledger dan batas

Tidak mengubah C# launcher, API, grants, provider defaults, credential, aset ikon, release version, commit atau push. Tidak memasang dependency. Test browser memakai temporary profile terpisah; prototype tidak dipasang sebagai aplikasi produksi dan mock-nya tidak masuk runtime.

File utama: `src/ui/src/PrototypePages.tsx`, `LauncherPages.tsx`, `LauncherInspector.tsx`, `pages.tsx`, `components.tsx`, `App.tsx`, `launcher.css`; tes UI terkait; `scripts/verify/launcher-prototype-parity.mjs`; laporan verification, `docs/CODEBASE.md` dan changeset migration existing. Perubahan lain yang sudah ada di worktree dipertahankan. Dua restart dilakukan melalui owner resmi, tanpa start launcher paralel. Harness donor diperbaiki setelah masalah dependency prebundle dan selector badge; pengulangan terakhir menghasilkan 32 screenshot, 36 checks, nol failure. Ini perbaikan harness, bukan bukti kegagalan produk.

Skill yang diterapkan: `frontend-ui-engineering` untuk struktur/state/responsiveness dan verifikasi UI; `replica-recon` untuk inventaris screen/flow dari sumber pengguna; `replica-diff` untuk pembandingan donor-target dengan batas bukti; `mind-control` untuk menguji klaim prototype-first terhadap rival shell-only; `agent-core-runtime-activation-audit` untuk membedakan source/build/resident serta cleanup. Tidak mengklaim peningkatan performa atau manfaat kausal Skill tanpa pembanding terisolasi.

Daftar terperinci fungsi tertunda: [Launcher-Placeholder-Inventory.md](Launcher-Placeholder-Inventory.md). Scope tetap migrasi fungsi existing; backend baru tidak dibangun pada tahap ini.
