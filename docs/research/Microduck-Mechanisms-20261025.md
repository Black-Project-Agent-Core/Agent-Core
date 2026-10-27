# Mekanisme dalam microduck (catatan studi)

Tanggal 2026-10-25. Status: **catatan studi baca-saja**. Microduck dibaca dari
`DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/microduck` atas instruksi eksplisit pengguna; tidak ada
yang diubah, dibangun, atau dijalankan di sana. Catatan ini hanya menjelaskan **apa yang dilakukan
microduck**. Penilaian kecocokan terhadap Agent Core **belum dilakukan**; bagian 4 hanya mendaftar
pertanyaan yang perlu dijawab dulu.

## 1. Apa itu microduck

Robot bipedal kecil (sekitar 25 cm, 800 g) yang dijalankan beberapa daemon Rust di Rockchip RK3566:
`robotd` (loop kontrol 50 Hz), `updaterd` (memasang rilis bertanda tangan dan mengembalikannya bila
robot tidak sehat), `configd` (wifi dan identitas), `btd` (Bluetooth), `padd`, `mediad`, `tofd`.
Semua berbicara lewat satu kontrak JSON-RPC di soket Unix. Bagian yang menarik di luar robotika
adalah mesin update, aturan menerima artefak pihak ketiga, dan cara tes serta dokumentasinya dijaga.

## 2. Mesin update (`docs/design/updater-design.md`)

- **Urutan** (§7): preflight tanpa efek samping, ambil manifest, verifikasi tanda tangan, bandingkan
  versi dan kompatibilitas, unduh, verifikasi sha256 dan tanda tangan artefak, ekstrak ke staging,
  cek unit yatim, hook pra-pasang, swap simlink atomik (`rename(2)`), hook pasca-pasang, gerbang
  kesehatan. Hook gagal, probe gagal, atau timeout diperlakukan sama: batalkan dan kembalikan.
- **Preflight** (§7.2): kunci single-flight on-disk, jam waras, robot berhenti, tidak ada sesi jarak
  jauh, ruang disk. Gagal berarti keluar bersih tanpa perubahan.
- **Tata letak** (§7.1): `releases/<ver>/`, `current` (simlink), `golden` (tidak pernah dipangkas),
  `keep_previous` membatasi disk sambil selalu menyisakan target kembali.
- **Cek unit yatim** (§7.3): kandidat ditolak bila ada unit terpasang yang menjalankan biner yang
  tidak ia bawa. Pesan penolakan menyebut unit, biner yang hilang, dan jalan keluarnya; sengaja
  tanpa flag `--force`. Tidak berlaku pada rollback, reset ke golden, dan `select`, karena jalur
  pemulihan tidak boleh punya sesuatu yang bisa menolak.
- **Gerbang kesehatan** (§8): "sehat" dan "terdegradasi" di-commit, selain itu dikembalikan. Alasan
  terdegradasi di-commit: kegagalan perangkat keras terjadi sama persis pada golden, jadi
  mengembalikan hanya menyembunyikannya di balik perubahan perangkat lunak.
- **Penjaga downgrade** (§8.4.1): target "terbaru" tidak boleh mundur; target eksak boleh, karena
  itu tindakan operator yang tidak bisa dipicu mirror. Staleness dibuat terlihat, bukan dipaksakan
  (`last_checked`, peringatan setelah seminggu sunyi).
- **Manifest** (§5.3): `schema_version` adalah konteks migrasi, bukan gerbang kompatibilitas;
  `min_supported` dipesan sejak versi pertama karena tidak bisa ditambahkan belakangan ke robot yang
  belum tahu mencarinya.
- **Kepercayaan** (§5.4): himpunan kunci tepercaya, bukan satu kunci; kunci cadangan harus ikut sejak
  image pertama dan berbeda frasa sandi serta keterpaparan; kunci dev hanya untuk papan dev
  (`allow_dev_keys=false` di robot pelanggan); urutan verifikasi manifest, unduh, sha256, tanda
  tangan; tidak ada byte tak bertanda tangan yang dieksekusi atau diekstrak ke jalur aktif.
- **Hook** (§9): ikut dalam tarball bertanda tangan, lingkungan dibersihkan dengan `PATH` tetap, output
  ditangkap dan dicatat. Aturan §9.1: apa pun yang dilakukan pemasangan baru juga harus dilakukan
  hook, ditegakkan tes pemaksa; langkah hook harus idempoten dan murah (pakai stamp); perangkat keras
  opsional tidak pernah membuat hook gagal.
- **Transkrip** (`robotctl update log/show/watch`): satu baris per langkah dengan kolom `+` berisi
  jeda dari baris sebelumnya, "cara menemukan dua menit yang hilang".

### Urutan restart dan jaring pemulihan (`restart-order.md`, `boot-recovery-net.md`)

- **Identitas yang diterbitkan sendiri** (`restart-order.md` §5): tiap daemon menulis
  `/run/<service>/identity.json` (service, version, revision, built_at, `exe`, pid) saat start; `exe`
  berasal dari `/proc/self/exe` sehingga menyebut direktori rilis tempat proses benar-benar
  diluncurkan. Berkas dihapus systemd saat unit berhenti, jadi daemon yang mati tidak bisa meninggalkan
  identitas palsu. `reconcile.rs` membandingkan rilis yang diterbitkan dengan rilis aktif pada setiap
  start `updaterd`, memakai fungsi murni `verdict_for` (semua syscall di luarnya). Daemon tanpa
  identitas dianggap tidak diketahui, bukan basi. `robotctl health` menampilkan rilis asal tiap proses.
- **Self-test sebelum commit** (§2 langkah 13): biner baru dijalankan dengan `--self-test` (memuat
  konfigurasi, membangun engine, keluar sebelum menyentuh state, batas 10 detik) karena `updaterd` tidak
  me-restart dirinya selama update; kegagalan membatalkan update.
- **Restart tertunda lewat timer sementara di luar cgroup** (§2 langkah 16-18): `systemd-run
  --on-active=5s` agar proses tidak mematikan dirinya sendiri; kunci dilepas sebelum spawn; kegagalan
  menjadwalkan dicatat, tidak dikembalikan, supaya update yang berhasil tidak dilaporkan gagal.
- **Daftar unit diturunkan dari rilis, bukan dari papan** (§1): unit dengan bagian `[Install]`; daftar
  di konfigurasi bersifat tambahan; tiap unit di-restart sendiri-sendiri karena `systemctl restart a b`
  gagal seluruhnya bila salah satu tidak dikenal. Tes `every_unit_held_back_is_restarted_once_the_answer_is_out`
  memastikan dua daftar (`NEVER_RESTART`, `RESTART_AFTER_REPLYING`) adalah himpunan yang sama.
- **Jaring pemulihan boot** (`boot-recovery-net.md`): batas waktu 180 detik (bukan `OnFailure=`, karena
  unit memakai `Restart=always` dan tidak pernah masuk `failed`); skrip `/bin/sh` yang disalin ke
  `/usr/local/sbin` agar tidak bergantung pada rilis yang sedang dipulihkan; membaca dua simlink tanpa
  parsing apa pun; memilih golden, bukan previous; menolak bila `current` sudah golden (agar kegagalan
  perangkat keras tidak menjadi reboot berulang); jejak `rescued` sebagai penjaga loop yang dibuka
  hanya ketika `updaterd` terbukti bisa hidup lagi.
- **Aturan keanggotaan dan asimetri biaya**: sebuah unit boleh diawasi hanya bila ia menunggu
  perangkat kerasnya, bukan keluar. Prinsipnya: "kegagalan mendeteksi merugikan diagnosis operator;
  salah mendeteksi merugikan rilis yang baik."
- **Yang tidak diuji** (dinyatakan sendiri): perilaku systemd (timer `OnBootSec`, `NRestarts`,
  `Conflicts=shutdown.target`) belum diverifikasi; jaring ini diverifikasi di papan bench atau tidak
  sama sekali.

## 3. Aturan menerima artefak orang lain dan pola tes

- **Manifest kebijakan pihak ketiga** (`docs/policy-manifest.md`; `policy-channel-design.md` §9.2):
  manifest tidak tepercaya, alasan untuk menolak dan tidak pernah alasan untuk percaya; field yang
  absen bukan bukti, penolakan hanya atas klaim yang ada dan salah; penolakan terjadi sebelum unduh;
  asal diturunkan dari jalur penyimpanan (organisasi penerbit ada di jalur) sehingga jujur tanpa
  pencarian; bila repo punya beberapa kandidat, pengguna memilih eksplisit (`<repo>:<file>`);
  deskripsi tampil di hasil pencarian; sandbox adalah batas sebenarnya. Konstanta kontrak diterbitkan
  di satu tempat (`duck_ipc_proto`) dengan assertion saat kompilasi bahwa kedua sisi sepakat.
- **Tes kontrak lintas berkas** (`xtask/tests/sideload.rs`): skrip dorong-rilis dan unit systemd tidak
  saling membaca, jadi satu tes membaca keduanya (`PrivateTmp=yes` menyembunyikan `/tmp` dan
  `/var/tmp`, sehingga jalur sideload tidak boleh di sana). Dua tes bersyarat dilengkapi tes-meta
  yang gagal bila syaratnya berhenti berlaku, karena tes bersyarat yang berhenti berlaku tidak
  bisa dibedakan dari tes yang lulus.
- **Pola nama `every_*`**: `every_unit_in_the_artifact_can_exec_what_it_names` (`artifact.rs`),
  `every_unit_on_apply_restarts_is_actually_shipped` (`config.rs`),
  `installer_guard_and_shipped_config_agree_about_the_placeholder`.
- **Contoh yang diuji parse** (§10): `updater/updater.example.toml` di-parse oleh tes unit sehingga
  contoh di dokumen tidak bisa menyimpang dari kode.
- **Sumber kebenaran tunggal** (§9.3): manifest set kebijakan hidup hanya di Hub, tanpa salinan di
  repo, karena salinan menjadi sumber kebenaran kedua dan tes atasnya menguji salinan, bukan yang
  diunduh robot.

## 4. Dokumentasi dan prinsip kerja (`docs/README.md`, `AGENTS.md`)

- **Satu halaman memiliki satu mekanisme**; halaman lain menulis satu kalimat dan menautkannya. Bila
  dua halaman berbeda, yang bukan pemilik mekanisme adalah bug. Bila perilaku dan dokumen desain
  berbeda, dokumenlah yang bug (kebalikan dari kontrak Agent Core, yang menjadikan source
  otoritatif).
- **Jangan merancang di sekitar perbedaan versi**: komponen lama adalah pertanyaan untuk diangkat,
  bukan sesuatu untuk dihindari; naikkan `API_VERSION` dan sebut konsekuensi pemasangan; skew versi
  dicatat dan dilayani, tidak pernah ditolak; hanya rute yang benar-benar hilang atau parameter
  tak dikenal yang boleh menolak.
- **Volume prosa bukan sinyal preferensi**: `AGENTS.md` memperingatkan bahwa `media.stream` ditulis
  panjang karena dibangun saat jalur WebRTC mati, sehingga repo "terbaca terbalik" bila hanya
  mengikuti kode. Jalur default tetap WebRTC.
- **Rilis adalah cara perbaikan sampai ke robot**: `main` yang sudah benar belum berarti robot benar.

## 4b. Tambahan dari pembacaan kedua (hanya fakta microduck)

Ditulis sebelum folder sumber dibuang, supaya pengetahuan tidak bergantung pada folder itu. Semua
butir di sini milik microduck; perbandingannya ada di catatan penilaian.

**Transkrip per run** (`updater/src/transcript.rs`)
- Satu berkas per run di `state_dir/runs`, di luar `install_dir` sehingga swap dan rollback tidak
  bisa menghapus catatannya. Id = id tertinggi + 1; berkas kosong dibuat lebih dulu supaya nomor tidak
  dipakai ulang bila run tidak mencatat apa pun.
- Pemangkasan ke `max_runs` terjadi sebelum menulis. Batas per run: 4.000 peristiwa, 2 MB, 64 KB per
  teks. Setelah batas tercapai peristiwa dihitung dan dibuang, kecuali peristiwa penutup, yang selalu
  ditulis dan didahului penanda `Truncated {dropped}`.
- Baris terakhir yang robek (mati listrik saat menambah) dilewati saat membaca. `sync_data` per
  baris, karena kegagalan yang hendak dijelaskan bisa membawa mati listrik. Gagal menulis tidak pernah
  menggagalkan update.
- `/var/log` di papan adalah zram, jadi jurnal systemd tidak bertahan dari mati listrik; itu alasan
  catatan disimpan sendiri.

**Identitas proses dan rekonsiliasi** (`duck-ipc-proto`, `updater/src/reconcile.rs`)
- Tiap daemon menulis `/run/<service>/identity.json` di `RuntimeDirectory=` miliknya: satu direktori
  per service karena `ProtectSystem=strict` hanya memberi hak tulis ke direktori itu, dan karena
  systemd menghapusnya saat unit berhenti, jadi identitas basi tidak mungkin tertinggal.
- `ServiceUnit` menggabungkan `UnitState` (`Active`, `Restarting`, `Failed`, `Inactive`, `Absent`,
  `Unknown`; `Unknown` sengaja berbeda dari `Absent`) dengan identitas yang diterbitkan. Proses lama
  tidak bisa ditanya karena ia belum belajar cara menjawab, jadi versi yang berjalan juga bisa dibaca
  dari luar lewat `/proc/<pid>/exe`.
- `verdict_for` murni: `Current`, `Restarted`, `ReportedOnly`, `RestartFailed`, `Unknown`. Unit yang
  berhenti bukan unit basi. `updaterd` tidak me-restart dirinya sendiri dari jalur start (loop
  tanpa jalan keluar di proses yang memegang pemulihan). `stale_units` adalah pembacaan yang sama
  tanpa tindakan, dipakai `apply` saat rilis sudah terpasang.

**Jaring pemulihan** (`scripts/robot-rescue`, `scripts/robot-boot-check`)
- Skrip `sh` yang disalin keluar dari rilis; membaca dua simlink dan tidak mengurai berkas yang bisa
  menjadi penyebab kerusakan. Remah-roti `key=value` (bukan JSON, karena ditulis di papan yang sudah
  bermasalah dan dibaca manusia lebih dulu) ditulis sebelum swap; daemon menghapusnya saat start
  berikutnya setelah menyalinnya ke log, sehingga penjaga loop terlepas tepat ketika papan
  membuktikan daemon bisa hidup lagi. Menolak bila `current` sudah golden. `mv -T` (GNU) atau `-h`
  (BSD) karena `mv` biasa memindahkan simlink ke dalam direktori. Reboot hanya bila diminta.
- `robot-boot-check`: empat anggota (yang menunggu perangkat kerasnya, bukan keluar); gagal =
  `failed` atau ≥3 restart; `MAX_UPTIME` 600 detik supaya cek bukan dijalankan di tengah update;
  satu properti per panggilan `systemctl show`; keluar 2 = menolak, bukan gagal.

**Mesin dan kesehatan** (`engine.rs`, `robotd-design.md` §3.4, `policy-channel-design.md` §5)
- `recover_on_start` menanyakan keadaan nyata sebelum membatalkan percobaan yang tak pernah
  dikonfirmasi: sehat atau terdegradasi karena sebab yang tak bisa diperbaiki rollback → commit;
  selain itu → kembali. "Anggaran memutuskan kapan bertanya; robot memutuskan apakah kembali."
  `record_rescue` dijalankan sebelum `record_boot`.
- Percobaan di-arm sebelum swap, divalidasi sebelum di-arm, dan di-disarm pada setiap return awal.
- Kolom `to` di log berarti versi yang dibicarakan entri (untuk kegagalan: versi yang gagal), karena
  `known_bad` membacanya.
- Vonis sehat/terdegradasi hanya boleh dibaca dari kondisi yang bisa disalahkan pada rilis; baterai,
  suhu, dan penghitung adalah deskripsi. Kesehatan dihitung dari atomik yang diterbitkan loop, bukan
  dengan bertanya ke loop, sehingga loop macet melapor tidak sehat alih-alih menggantung.
  `Incompatible` (menjawab dalam bentuk tak terbaca) dipisah dari `Unreachable`.
- Override kebijakan komunitas atau lokal yang gagal dimuat → kembali ke bawaan resmi dan melapor
  terdegradasi dengan nama berkas; kebijakan resmi yang gagal → tidak sehat. Konfigurasi tidak
  diperbaiki diam-diam.
- `spawn.rs`: `ETXTBSY` diulang 10 kali @10 ms; sebuah tes memindai sumber agar semua spawn lewat
  pembantu itu. `faults.rs`: injeksi kegagalan dikompilasi selalu, dikunci izin konfigurasi, nama
  tak dikenal ditolak.
- `read-only` memakai `try_lock` dan menjawab `BUSY` seketika saat update berjalan; update
  diselesaikan walau semua klien terputus; klien lambat tidak boleh menunda pekerjaan.

**Rilis dan CI** (`release.yml`, `_build-release.yml`, `prune-dev-releases.yml`, `ci-setup.md`)
- Tag menentukan mode (`staging`, `promote`, `stable`) dan ringkasan run menyebut mana yang terjadi;
  tag salah bentuk gagal keras dengan jawabannya (run abu-abu terbaca "belum terjadi apa-apa");
  `concurrency` per tag tanpa `cancel-in-progress` (run yang dibatalkan dihitung sebagai cek gagal).
- Promosi menandatangani ulang byte yang sama; rilis stabil membawa salinan artefaknya sendiri,
  karena manifest yang menunjuk tag staging pernah menjadi yatim saat tag itu dihapus.
- Langkah "verifikasi seperti robot" memakai jalur kode, kunci publik dan hak akses robot; hook tetap
  berjalan (berkas prasyarat dipalsukan, hook tidak dilewati); tidak ada jatuh balik ke jaringan.
- `prune-dev-releases`: tag mati tetap dapat dipasang karena memang bertanda tangan, sehingga
  dipangkas; satu kode untuk event dan penyapu mingguan. Tripwire pengemasan membaca
  `_build-release.yml` agar berkas yang tidak dikemas gagal di tes, bukan di robot.
- `ci-setup.md`: risiko yang diterima ditulis terang (siapa yang bisa membaca kunci, alasan diterima,
  dua syarat peninjauan ulang); rahasia GitHub tidak bisa dibaca kembali sehingga hanya salinan
  penyebaran, pengelola kata sandi adalah catatan sistem.
- `hooks/postinstall`: gagal hanya bila rilis tak bisa dipasang, selain itu peringatan; unit tanpa
  `[Install]` tidak di-`enable --now` (akan menjalankan cek rollback di tengah update); timer
  di-enable tetapi tidak di-start.

**Pelajaran lain**
- `install-path-gap.md`: empat bug lolos dari 418 tes; set restart diturunkan dari rilis, bukan dari
  konfigurasi papan; `already_current` harus membandingkan yang berjalan, bukan hanya yang terpasang;
  `RollbackFailed` dipisah dari kegagalan apply setelah swap berhasil; anggaran CI: menghapus
  pekerjaan lebih berharga daripada tes yang ditambah, dan filter jalur memakai "default jalankan".
- `update-over-ble.md`: batas waktu = keheningan, bukan total; progres dibatasi satu per persen dan
  empat per detik, nilai akhir selalu dipublikasi; rollback dan select dibuka dari ponsel tetapi `pin`
  tidak, karena `pin` menghasilkan kegagalan yang tampak seperti perilaku benar.
- `idle-cpu.md`, `tof-on-demand.md`: ukur sebelum mengoptimalkan; yang akhirnya diganti adalah sensor
  tanpa konsumen; hitung-referensi tidak selamat dari `SIGKILL`.
- `remote-access-design.md` §3.3-3.4: lease 30 s dengan heartbeat 10 s; split-brain diatasi dengan
  memeriksa status dan menyambung ulang setelah dua kali meleset; backoff 5 s ke 60 s plus ±10%;
  401 bukan alasan backoff; kredensial dibaca ulang tiap tick.
- `app-path-design.md` §2.3: fake adalah satu-satunya bentuk tertulis dari kontrak, tetapi tidak ada
  yang memeriksa implementasi nyata terhadapnya.

## 5. Penilaian terhadap Agent Core

Sudah dikerjakan di [Microduck-vs-Agent-Core-Assessment-20261025.md](Microduck-vs-Agent-Core-Assessment-20261025.md).
Bagian ini dipertahankan sebagai kerangka pertanyaan yang dipakai di sana.

### Pertanyaan per butir

Sebelum ada mekanisme yang diadopsi, bandingkan dulu dengan mekanisme Agent Core sendiri (rantai
build, restart dan release, tes, dokumentasi). Yang perlu dijawab per butir:
1. Apakah Agent Core sudah punya padanannya, dan di mana (file dan baris)?
2. Kegagalan nyata apa yang akan dicegah, dengan bukti dari Agent Core, bukan dari microduck?
3. Apa perubahan terkecil, dan apa yang diuji untuk membuktikannya?

Butir yang paling layak dinilai lebih dulu menurut pembacaan ini: tes kontrak lintas berkas dengan
tes-meta; aturan paritas pemasangan baru versus jalur update; penolakan sebelum perubahan dengan
pesan yang menyebut jalan keluar; tabel pemilik mekanisme untuk dokumen. Ini hipotesis awal, bukan
temuan.

## 6. Batas bukti

- Daftar lengkap yang dibaca pada kedua putaran, yang dipilah tanpa dibaca, dan batasnya ada di bagian
  "Cakupan dan batas bukti" di
  [Microduck-vs-Agent-Core-Assessment-20261025.md](Microduck-vs-Agent-Core-Assessment-20261025.md).
  Ringkasnya: dokumen mesin update, restart, pemulihan, rilis, CI dan tes dibaca; kode domain robot,
  dokumen WebRTC, seluler dan simulasi, serta skrip provisioning hanya dipilah dari judulnya.
- Dokumen yang tidak dibaca bukan bukti bahwa isinya tidak berguna.
- Tidak ada kode microduck yang dibangun atau dijalankan; klaim di atas adalah apa yang tertulis di
  dokumen dan kode, bukan hasil eksekusi.
