# Penilaian mekanisme microduck terhadap mekanisme Agent Core

Tanggal 2026-10-25. Status: **penilaian baca-saja; satu perubahan source (butir 4) sudah dikerjakan
atas persetujuan pengguna**. Penilaian dilakukan dua kali pada hari yang sama: putaran kedua membaca
sisa dokumen dan kode updater/rilis yang belum dibaca pada putaran pertama (cakupan di bagian
terakhir). Daftar mekanisme
microduck ada di [Microduck-Mechanisms-20261025.md](Microduck-Mechanisms-20261025.md); catatan ini
hanya menjawab tiga pertanyaan per mekanisme: apakah Agent Core sudah punya padanannya, kegagalan
nyata apa yang akan dicegah (dengan bukti dari Agent Core), dan apa perubahan terkecil.

Bukti Agent Core diambil dari: `scripts/windows/Restart-Agent-Core.ps1`,
`scripts/windows/Invoke-Agent-Core-Restart.ps1`, `runtime/restart/` (97 receipt, 149 log),
`scripts/release/package-release.mjs`, `scripts/portability/check-path-policy.mjs`, `tests/`, dan
`GET /health` pada server yang berjalan.

## Ringkasan putusan

| # | Mekanisme microduck | Putusan |
| --- | --- | --- |
| 1 | Preflight tanpa efek samping, satu proses pada satu waktu | **Sudah ada** |
| 2 | Cek "apakah ini meninggalkan sesuatu yatim", penolakan menyebut jalan keluar | **Sudah ada untuk proses**; celah di receipt (lihat 4) |
| 3 | Swap atomik dengan cadangan, verifikasi, dan pemulihan | **Ada untuk launcher**; untuk `dist` belum cukup bukti |
| 4 | Transkrip yang selalu berakhir dengan alasan | **Layak dikerjakan** (bukti kuat) |
| 5 | Gerbang kesehatan setelah aktivasi | **Dikerjakan 2026-10-25** (hanya lapor), atas persetujuan pengguna |
| 6 | Tes kontrak lintas berkas dengan penjaga meta | **Sudah ada**; tidak ada pekerjaan |
| 7 | Penandatanganan dan himpunan kunci | **Tidak relevan sekarang** |
| 8 | Penjaga downgrade dan visibilitas staleness | **Tidak relevan sekarang** |
| 9 | Paritas pemasangan baru dan update | **Belum cukup bukti** |
| 10 | Satu halaman memiliki satu mekanisme | **Belum ada bukti drift**; tidak diadopsi |
| 11 | Versi skew dilayani, versi API diumumkan | **Hipotesis**; manfaat belum terbukti |
| 12 | Identitas proses yang diterbitkan sendiri, dibandingkan dengan build aktif | **Dikerjakan 2026-10-25**, atas persetujuan pengguna |
| 13 | Self-test biner baru sebelum commit | **Belum cukup bukti** (tidak ada insiden tercatat) |
| 14 | Jaring pemulihan yang tidak bergantung pada rilis yang dipulihkan | **Ada padanannya dan memenuhi prinsipnya** (`Recover-Agent-Core.ps1` tidak merujuk `node`, `npm`, atau `dist`) |
| 15 | Retensi transkrip terbatas, dipangkas sebelum menulis | **Tidak perlu sekarang**: `runtime/restart` berisi 344 berkas, ±100 KB isi |
| 16 | Lint semua skrip yang berjalan tanpa dikompilasi | **Belum cukup bukti**: 17 skrip PowerShell, 0 galat parse hari ini; biaya tes hampir nol |
| 17 | Batas waktu berbasis keheningan, bukan batas total | **Tidak relevan**: batas total pembungkus sudah diturunkan dari anggaran fase |

## Rincian

**1. Preflight dan satu proses pada satu waktu: sudah ada.** `Restart-Agent-Core.ps1` memegang mutex
`Global\AgentCoreManualRestart` (baris 214) dan memeriksa identitas proses, sesi Windows, terminal
yang independen, serta duplikasi launcher sebelum menutup apa pun. Pembungkus `Invoke-...Restart.ps1`
memakai mutex permintaan dan berkas `.claimed` yang hanya bisa dipakai sekali per `RunId`
(98 klaim tercatat). `npm run build` menjalankan `path:check` sebelum `tsc`. Tidak ada yang perlu
diadopsi.

**2. Penolakan yang menyebut jalan keluar: sudah ada untuk proses.** Skrip menolak bila launcher
tidak ada tetapi runtime lama masih hidup, bila ada lebih dari satu launcher, dan bila terminalnya
milik Agent Core; pesannya menyebut tindakan yang harus dilakukan, tanpa opsi paksa. Ini sejalan
dengan cek yatim microduck (§7.3). Catatan: hitungan kasar di `src` menemukan 1.186 `throw new
Error('KODE')` tanpa kalimat dan 504 dengan kalimat. Apakah kode tanpa saran perlu diperbaiki belum
dinilai; itu butuh bukti kegagalan nyata, bukan hitungan.

**3. Swap atomik: ada untuk launcher.** `Install-PendingLauncher` memverifikasi sha256, menyalin
cadangan, menyalin kandidat, memverifikasi ulang, dan memulihkan bila tidak cocok. Untuk kode Core
(`dist`), `tsc` menulis langsung ke tempat; praktik build bertahap hanya tercatat sebagai kebiasaan
pengendali (entri CODEBASE 2026-10-25: "staging build ... six compiled files were installed with
hashes identical"), bukan mekanisme bawaan. Kegagalan yang akan dicegah: build rusak membiarkan
`dist` tak bisa dipakai. **Bukti kegagalan seperti itu tidak ditemukan** dalam data yang saya baca
(keenam receipt gagal bukan soal build). Putusan: belum cukup bukti. Yang akan memutuskan: insiden
nyata `dist` rusak setelah build.

**4. Transkrip yang selalu berakhir dengan alasan: layak dikerjakan.** Bukti dari `runtime/restart`:
- 97 receipt: 91 berakhir `exitCode 0`, **6 berakhir `exitCode 1`**.
- **Keenam receipt gagal berisi `error: null`.** Pembungkus tidak menyalin alasan dari log.
- Alasan di log: 3 kali "Identitas PID ... tidak terbaca" (2026-10-12), 1 kali "file Agent Core.exe
  sedang dipakai proses lain" (2026-10-23 17:37), 1 kali "Terdeteksi beberapa launcher utama"
  (2026-10-23 17:41).
- **Satu kegagalan tanpa alasan**: run `ba17dff8103d...` (2026-10-17 10:42 UTC), `exitCode 1`,
  log berhenti di "Membuka Agent Core satu kali...". Penyebabnya tidak diketahui.
- Ada 98 klaim tetapi 97 receipt: satu run (`f2-f3-activation-20261017`) tanpa receipt dan tanpa log,
  hasilnya tidak diketahui.

Padanan microduck: `update log/show` dengan baris akhir `ended` dan kolom jeda. Perubahan terkecil:
(a) pembungkus menyalin baris `GAGAL:` terakhir ke `receipt.error`; (b) skrip kerja mencetak baris
akhir `Selesai: ok|gagal` di blok `finally`; (c) bila tidak ada baris akhir, receipt mencatat
"worker berakhir tanpa baris akhir (exit N)", sehingga kegagalan diam menjadi terlihat. Pembuktian:
tes yang membaca log fixture berenkode UTF-16 (log dibuat PowerShell 5.1 dengan `*>`) dan
menegaskan `error` terisi; lalu periksa tiga restart berikutnya. Pelemah: bila penyebab kegagalan
diam adalah proses yang dimatikan, baris akhir tidak akan sempat tercetak; butir (c) tetap
menangkapnya.

**5. Gerbang kesehatan: layak dipertimbangkan, hanya bagian lapor-saja.** Skrip menyatakan sendiri
bahwa kesiapan Core dan tunnel tidak diuji (baris 12 dan 298), dan 91 log sukses memuat kalimat itu.
Kontrak meminta pengendali memeriksa sendiri; di sesi ini saya memeriksa `/health` dan proses secara
manual setelah restart. Microduck menggabungkan commit untuk "sehat" atau "terdegradasi" dan
kembali untuk selain itu; Agent Core tidak bisa mengembalikan `dist` di tempat, jadi bagian
"kembali" tidak ditransfer. Yang bisa ditransfer: setelah jendela terbuka, polling `/health`
sampai batas waktu dan cetak `siap|belum siap` ke log dan receipt, tanpa retry dan tanpa rollback.
**Tidak ada bukti kasus nyata "jendela terbuka tetapi Core tidak sehat"**, tetapi data itu memang
tidak pernah diukur, dan menurut aturan microduck sendiri, yang tidak ada bukan bukti. Manfaat yang
terbukti hanya menghemat pemeriksaan manual.

*Batasan desain dari putaran kedua* (`robotd-design.md` §3.4, `engine.rs` `health_gate` dan
`recover_on_start`, `policy-channel-design.md` §5). Bila butir ini dikerjakan, tiga aturan berikut
mencegah kesalahan yang microduck sendiri sudah alami:
- **Vonis hanya boleh membaca kondisi yang dapat disalahkan pada restart**: proses hidup, listener
  8765 menjawab, dan `status` di `/health`. Bagian `memory.embedding`, `phone`, `webResearch` dan
  sejenisnya adalah deskripsi; bila ikut memutuskan, restart yang baik dinyatakan gagal karena
  layanan embedding atau gateway ponsel sedang mati. Microduck menulis aturan ini sebagai
  pencegahan (baterai rendah akan menggagalkan rilis yang sehat lalu menilai penggantinya pada
  baterai yang sama), bukan setelah kejadian.
- **Tiga jawaban, bukan dua**: `siap`; `belum menjawab` (tidak ada listener atau waktu habis); dan
  `menjawab tetapi ditolak atau tak terbaca` (HTTP 401, bentuk JSON tak dikenal). Microduck
  memisahkan `Incompatible` dari `Unreachable` karena pesan "unreachable" untuk robot yang sedang
  melayani socket-nya mengirim pembaca ke separuh sistem yang salah selama satu jam.
- **Hanya lapor**: `dist` tidak bisa dikembalikan di tempat, sehingga bagian "kembali ke rilis
  sebelumnya" tidak ditransfer. Pemeriksaan `/health` tidak butuh kunci API (diuji hari ini dengan
  `curl` tanpa header), jadi pembungkus tidak perlu menyentuh rahasia.

*Dikerjakan 2026-10-25 sebagai laporan saja.* `Restart-Agent-Core.ps1` kini, setelah jendela launcher
terbuka, memanggil `GET /health` tiap detik (default 60 detik, `-ReadinessTimeoutSeconds`) dan mencetak
satu baris `Kesiapan: <siap | belum menjawab | menjawab tidak sesuai> (<rincian>; N dtk)` sebelum
`Selesai:`. Vonis hanya membaca `status`, dan apakah proses yang menjawab dimulai setelah peluncuran
(toleransi 2 detik); blok memory, phone, dan web tidak dibaca. Baris itu tidak mengubah kode keluar dan
tidak ada retry atau rollback. `Invoke-Agent-Core-Restart.ps1` menyalinnya ke receipt sebagai
`readiness` (null bila tak ada) dan menambah 65 detik pada batas tunggunya. Tes:
`tests/restart-readiness.test.ts` (5 tes: dua kontrak statis, vonis atas 12 jawaban sintetis, lima
skenario terhadap listener HTTP nyata, pembacaan receipt dari log UTF-16). Terbukti hidup pada restart
resmi receipt `a8fc7fcc…`: `exitCode 0`, `error null`, `readiness` "siap (PID 16508 mulai
2026-10-25T05:30:49Z; dist basi: tidak; 21 dtk)", dan `Selesai: ok` tetap baris terakhir log. Tidak
teramati di server hidup: jawaban `belum menjawab` dan `menjawab tidak sesuai` (hanya di tes). Batas:
port dibaca dari `AGENT_CORE_PORT` bila ada di lingkungan task, jika tidak 8765; `.env` sengaja tidak
dibaca.

**6. Tes kontrak lintas berkas: sudah ada.** `check-path-policy.mjs` memeriksa registri
pengecualian terhadap dokumen (id harus muncul di `PATH-GOVERNANCE.md`), id ganda, dan
pengecualian basi (baris 204-236), yaitu padanan penjaga meta microduck.
`tests/mcp-manifest-contract.test.ts` mengunci manifest tool dan anggaran byte. Tes bersyarat:
6 pemakaian `skipIf`/`describe.skipIf`; lima berdasarkan platform (wajar) dan satu
(`browser-conversation-integration.test.ts`) bergantung pada variabel lingkungan
`AGENT_CORE_BROWSER_BRIDGE_FIXTURE`, dengan skrip pelari khusus
`scripts/verify/browser-bridge-v020.mjs`. Pelari itu mengisi variabel tersebut tanpa syarat (baris
55) dan hanya memeriksa kode keluar, sehingga lewat pelari suite itu tidak terlewat diam-diam;
`npm test` biasa melewatinya dengan sengaja. Tidak ada pemeriksaan jumlah tes yang dijalankan,
tetapi dengan variabel yang pasti terisi pemeriksaan itu tidak diperlukan. Tidak ada pekerjaan di
butir ini.

**7 dan 8. Tanda tangan, downgrade, staleness: tidak relevan sekarang.** `package-release.mjs`
membuat arsip yang tidak bisa ditimpa (baris 116) dengan manifest SHA-256 per berkas dan hash zip,
yaitu integritas tanpa keaslian. Tidak ada sumber update jarak jauh di Agent Core, sehingga serangan
yang dicegah microduck (mirror basi atau dibekukan) tidak ada. Tinjau ulang hanya bila arsip mulai
didistribusikan atau ada sumber update jarak jauh.

**9. Paritas pemasangan baru dan update: belum cukup bukti.** Aturan microduck lahir dari empat
insiden nyata. Saya tidak menelusuri jalur pemasangan baru versus update Agent Core dan tidak
mengumpulkan insiden serupa, jadi tidak ada dasar untuk menilai.

**10. Satu halaman satu mekanisme: tidak diadopsi.** `docs/README.md` adalah indeks dan
`CODEBASE.md` adalah sumber kebenaran arsitektur; kontrak Agent Core menjadikan source otoritatif,
berlawanan dengan aturan microduck "dokumen yang bug". Rantai restart disebut di 19 dokumen, hampir
semuanya catatan bertanggal yang memang dibiarkan basi. Tidak ada bukti drift yang ditemukan.

**11. Skew versi: hipotesis.** `/health` memuat `version` (0.15.0) dan `toolSurface`
(`desktop-commander-0.2.50-local`, versi lapisan kontrol mesin yang di-vendor), tetapi tidak ada
revisi atau digest skema tool. Ada satu insiden terdokumentasi di Memory (Batch 2, 13 Oktober):
skema klien basi menolak aksi sebelum sampai ke MCP, dan kontrak mewajibkan langkah manual "Refresh
tools". Digest di `/health` tidak dapat membuktikan bahwa klien sudah menyegarkan cache-nya, karena
cache itu milik klien; manfaat terbatas pada skrip yang membandingkan sisi server. Manfaat belum
terbukti.

**12. Identitas proses yang diterbitkan sendiri: layak dipertimbangkan.** Microduck membuat tiap
daemon menerbitkan versi, revisi, waktu build, jalur `exe` dan pid, lalu membandingkannya dengan
rilis aktif; `robotctl health` menampilkannya (`restart-order.md` §5). Di Agent Core, `GET /health`
memuat `version` statis (0.15.0) dan satu pid, yaitu pid mesin Grafel (`enginePid`); **tidak ada
waktu start, pid, atau stempel build milik proses Core**. Akibatnya "apakah server yang berjalan
memakai `dist` yang sekarang" hanya bisa dijawab dengan membandingkan waktu start proses dengan
waktu tulis `dist` secara manual. Itu yang saya lakukan hari ini (build 11:16:12, proses 11:16:35),
dan enam entri `CODEBASE.md` membuktikan residensi dengan PID dan waktu start yang ditulis tangan.
Kegagalan yang dicegah: menganggap perubahan sudah aktif padahal server masih menjalankan build lama.
**Tidak ada insiden tercatat yang saya temukan** di mana ini menyebabkan kesalahan nyata; buktinya
adalah pekerjaan manual yang berulang. Perubahan terkecil: `/health` memuat `process: {pid,
startedAt, entry}` dan `build: {distNewestMtime}` yang dihitung sekali saat start, serta bendera
`stale` bila ada berkas `dist` yang lebih baru dari `startedAt`. Pembuktian: tes unit untuk fungsi
perbandingan murni (gaya `verdict_for`), lalu satu restart sungguhan yang membuat bendera berubah
dari `stale` ke segar. Pelemah: dengan beberapa build berturut-turut tanpa restart, bendera hanya
berkata "ada yang lebih baru", bukan "apa yang berbeda".

*Dikerjakan 2026-10-25 bersama butir 5.* `GET /health` kini memuat `process` (`pid`, `startedAt`,
`uptimeSeconds`, `entry` relatif terhadap root proyek, tanpa jalur absolut) dan `build`
(`distNewestModifiedAt`, `stale`; `stale: null` bila dist tak terbaca, bukan `false`). Pemindaian `dist`
dibatasi dan di-cache 5 detik oleh pemeriksa yang sama dengan blok diagnostik lain, sehingga disk lambat
hanya menurunkan blok ini menjadi `stale: null`. Kode: `src/http/process-identity.ts`, tes:
`tests/process-identity.test.ts`. Terbukti hidup: sebelum restart `/health` tidak memuat kedua blok;
sesudahnya `process.pid` 16508 sama dengan pemilik listener 8765, `startedAt` selisih 36 ms dari
`StartTime` sistem operasi, `build.stale` false. Cabang `stale: true` hanya diuji oleh tes unit dan
tes HTTP dengan pohon sementara, belum di server hidup.

**13. Self-test sebelum commit: belum cukup bukti.** `src/index.ts` tidak punya flag
`--self-test` atau `--check-only` (pencarian kosong). Hipotesis: `tsc` lulus tetapi Core gagal start
(modul hilang, konfigurasi ditolak). **Pencarian di `CODEBASE.md` dan `docs/releases` tidak
menemukan insiden seperti itu.** Tanpa insiden, mekanisme ini tidak dibenarkan; jika muncul satu,
tinjau ulang.

**14. Jaring pemulihan: ada padanannya.** Agent Core punya `Recover-Agent-Core.ps1`
(`recovery:audit`/`recovery:repair`), bootstrap pemulihan portabel di paket rilis dan tes
`release-recovery-repair`. Prinsip microduck yang relevan adalah pemulihan tidak boleh bergantung pada
hal yang dipulihkan (skrip `/bin/sh` yang disalin keluar dari rilis, hanya membaca dua simlink).
Putaran kedua menelaahnya: `Recover-Agent-Core.ps1` (22,9 KB) adalah PowerShell mandiri dengan mode
`Audit`, `Repair`, `Bootstrap`; pencarian `node|npm|dist\` di dalamnya tidak menemukan apa pun, jadi
tidak bergantung pada runtime yang dipulihkan. `Test-ProtectedRelativePath` menandai `.env`,
`secrets\`, `runtime\memory\`, `runtime\skills\`, `runtime\learning\` dan sejenisnya sebagai
terlindung (saya membaca daftarnya, bukan jalur pemakaiannya), searah dengan aturan microduck bahwa
semua di luar `releases/<ver>/` selamat dari pembaruan dan rollback. Yang tidak ada
di Agent Core adalah pemicu otomatis saat boot dan penjaga loop dengan remah-roti
(`robot-boot-check`, `robot-rescue`); keduanya menjawab ancaman yang tidak ada di sini, yaitu
pembaruan tanpa pengawasan yang membuat daemon tidak bisa hidup. Dibaca: judul dan pencarian saja;
skrip pemulihan tidak dijalankan.

**15. Retensi transkrip terbatas: tidak perlu sekarang.** Microduck memangkas `runs/` ke jumlah
tetap sebelum menulis, mengklaim nomor run dengan berkas kosong lebih dulu, membatasi peristiwa
(4.000), byte (2 MB) dan panjang teks (64 KB) per run, dan selalu menulis peristiwa penutup walau
batas terlewati (`transcript.rs`). Di Agent Core `runtime/restart` tidak dipangkas oleh skrip mana
pun (pencarian `prune|retain|unlink|Remove-Item` hanya menemukan penghapusan penanda launcher), jadi
isinya bertambah: 344 berkas dari 2026-10-13 sampai 25, 96 di antaranya pada 10-24. **Diukur: isinya
hanya ±100 KB** (97 receipt 33,8 KB, 149 log 67,9 KB, 98 klaim 61 byte). Angka "25 MB" dari `du`
adalah blok disk, bukan isi, dan tidak dipakai. Tanpa biaya terukur tidak ada kegagalan yang dicegah.
Satu jebakan untuk bila suatu hari dikerjakan: berkas `.claimed` adalah penjaga pemutaran ulang
`RunId` (satu klaim per run) dan harus dipertahankan; yang boleh dipangkas hanya log dan receipt.
Bagian "peristiwa penutup selalu ditulis" sudah diadopsi lewat butir 4.

**16. Lint semua skrip yang berjalan tanpa dikompilasi: belum cukup bukti.** CI microduck
menjalankan `shellcheck` atas setiap skrip yang baru ketahuan salah saat dipakai, dengan alasan
tertulis bahwa skrip pemulihan adalah yang paling buruk untuk ketahuan salah (`ci.yml`). Di Agent
Core ada 17 skrip `.ps1` di bawah `scripts/`; hanya empat yang disebut oleh tes mana pun (restart,
pembungkus restart, pemulihan, fixture symlink). Parser PowerShell dijalankan hari ini atas
ketujuh belas: **0 galat parse**. Jadi tidak ada cacat yang ditemukan, hanya celah cakupan. Tes yang
mem-parse semua `scripts/**/*.ps1` dan menegaskan nol galat berbiaya satu berkas kecil dan hanya jalan
di Windows; saya tidak mengusulkannya sebagai pekerjaan sampai ada alasan selain keteraturan.

**17. Batas waktu berbasis keheningan: tidak relevan.** `update-over-ble.md` §2.6: batas total
memotong pekerjaan yang masih jalan atau menunggu robot mati, sehingga deadline dihitung dari
keheningan (progres adalah bukti hidup). Batas tunggu `Invoke-Agent-Core-Restart.ps1` (baris 257)
adalah `StopTimeout + StartTimeout + 90` detik, yaitu jumlah anggaran fase worker sendiri ditambah
selisih, bukan tebakan. Pekerjaan berpanjang tak terbatas tidak ada di jalur ini.

**Dipertimbangkan dan tidak diadopsi** (putaran kedua; tiap butir dengan alasan satu baris):
- *Tulis atomik dengan fsync berkas dan direktori* (`fsutil.rs`): `src/persistence/atomic-file.ts`
  sudah lebih kuat (berkas sementara `wx`, `sync`, rename dengan retry `EPERM/EACCES/EBUSY`, fsync
  direktori, penolakan simlink, mode berkas).
- *Retry `ETXTBSY` dan tes yang memaksa semua spawn lewat satu pembantu* (`spawn.rs`): padanan Windows
  (retry saat file dikunci) ada di `atomic-file.ts`. Invarian "semua spawn meneruskan `windowsHide`"
  **tidak seragam**: dari 25 berkas `src` yang mengimpor `child_process`, 19 memuat `windowsHide`
  (dihitung per berkas, bukan per panggilan), satu hanya mengimpor tipe (`rdc/types.ts`), dan lima
  yang memanggil proses tidak memuatnya: `rdc/tools/process.ts` dan `feedback.ts` (`exec`),
  `rdc/utils/ripgrep-resolver.ts` (`where rg.exe`), `rdc/utils/system-info.ts` (`execSync`) dan
  `rdc/tools/filesystem.ts` (`osascript`, hanya macOS). Semuanya kode turunan Desktop Commander di
  `src/rdc`. Server dijalankan dari konsol launcher, sehingga proses anak mewarisi konsol; tidak
  ada laporan jendela berkedip di data yang saya baca, jadi ini catatan drift, bukan kegagalan, dan
  tes pemindai-sumber ala `spawn.rs` akan gagal hari ini pada empat berkas itu. Tidak diadopsi.
- *Injeksi kegagalan yang dikunci izin konfigurasi dan gagal-tertutup pada nama tak dikenal*
  (`faults.rs`): jalur receipt gagal sudah dibuktikan dengan worker salinan yang benar-benar gagal
  (`tests/restart-receipt-reason.test.ts`); tidak ada rollback di Agent Core yang perlu diinjeksi.
- *Pemilihan keparahan di hook pasca-pasang: gagal hanya bila rilis tidak bisa dipasang, selain itu
  peringatan* (`hooks/postinstall`): Agent Core tidak punya hook pasca-pasang; kegagalan
  `Install-PendingLauncher` memulihkan dan berhenti, yang sudah berarti "fatal".
- *Satu kode untuk event dan penyapu* (`prune-dev-releases.yml`), *kegagalan keras untuk tag salah
  bentuk*, *concurrency per tag tanpa cancel* (`release.yml`): Agent Core tidak memakai alur rilis
  GitHub Actions (`.github/` hanya berisi templat dan CODEOWNERS).
- *Kunci rilis bertingkat dan risiko yang diterima ditulis terang* (`ci-setup.md`): sudah dicatat di
  butir 7 sebagai tidak relevan sampai ada distribusi; yang berharga adalah bentuk penulisannya
  (risiko, alasan diterima, dan dua syarat peninjauan ulang), yang sama dengan format "syarat
  peninjauan ulang" catatan ini.
- *Lease dan heartbeat, backoff berjitter yang dibatasi, 401 bukan alasan retry*
  (`remote-access-design.md` §3.3-3.4): `agent-core-stdio-bridge.mjs` (3,6 KB) tidak punya loop
  retry sama sekali; ia meneruskan galat seketika dengan petunjuk 401 atau ECONNREFUSED.
  Satu-satunya titik yang cocok adalah kunci API yang dibaca sekali saat start, tetapi pesan galatnya
  sudah menyuruh menjalankan setup lalu memulai ulang Claude.
- *Fake adalah spesifikasi, tak ada yang memeriksa implementasi nyata terhadapnya*
  (`app-path-design.md` §2.3): tidak ada fake yang saya temukan di jalur restart; tesnya
  mengekstrak fungsi asli dengan AST.
- *Sensor/pekerjaan tanpa konsumen dimatikan secara bawaan, diukur sebelum dioptimalkan*
  (`idle-cpu.md`, `tof-on-demand.md`): prinsip pengukuran sudah dipakai di catatan ini (butir 15);
  tidak ada pekerjaan latar tanpa konsumen yang saya ukur di Agent Core, jadi tidak ada klaim.

**Prinsip dari `boot-recovery-net.md` yang bukan mekanisme:** "kegagalan mendeteksi merugikan
diagnosis; salah mendeteksi merugikan rilis yang baik." Aturan biaya asimetris ini sejalan dengan
standar bukti menurut taruhan yang sudah ada di `mind-control`; tidak ada tindakan terpisah.

## Urutan yang disarankan

1. **Butir 4** (receipt membawa alasan, baris akhir wajib): bukti paling kuat dan perubahan paling
   kecil. **Dikerjakan 2026-10-25** atas persetujuan pengguna (lihat entri di `CODEBASE.md`).
2. **Butir 12** (identitas proses di `/health`) dan **butir 5** (lapor kesiapan setelah restart):
   keduanya menjawab pertanyaan "apakah yang berjalan adalah yang saya kira". **Dikerjakan
   2026-10-25** sebagai satu perubahan atas persetujuan pengguna (lihat entri di `CODEBASE.md`).
3. Sisanya (termasuk butir 15-17) tidak dikerjakan sekarang; syarat peninjauan ulang tertulis di
   tiap butir.

Butir 5 dan 12 tetap menunggu keputusan pengguna. Keduanya tidak lagi membutuhkan folder `microduck`:
rancangannya, sumber bagian dokumen, dan batasan desainnya tertulis di catatan ini dan di
[Microduck-Mechanisms-20261025.md](Microduck-Mechanisms-20261025.md).

**Status folder sumber.** Setelah putaran kedua, folder `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\microduck`
dipindahkan ke Recycle Bin (2026-10-25), sesuai instruksi pengguna untuk menghapus bila tidak ada
pengetahuan baru yang tersisa. Sebelum dihapus klon itu diperiksa: bersih, HEAD `942e58e`, cabang
`main`, tanpa stash, tanpa commit yang belum ada di remote, tidak dangkal, asal
`https://github.com/pollen-robotics/microduck.git`, tidak dilacak git Agent Core dan tidak dirujuk
kode mana pun. Dapat dipulihkan dari Recycle Bin atau diklon ulang pada commit itu. Penghapusan
bergantung pada penilaian di bagian berikut, termasuk batasnya: bagian yang tidak dibaca adalah kode
domain robot, dan klaim "tidak ada lagi" tidak berlaku untuk byte yang tidak dibaca.

## Cakupan dan batas bukti

Putaran kedua dilakukan atas instruksi "nilai lagi source microduck dan pastikan zero knowledge baru
hapus".

**Dibaca penuh, atau pada bagian yang memuat mekanismenya**
- Dokumen: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/README.md`, `policy-manifest.md`,
  `updater-design.md` (§5.1-5.5, §7-9, sebagian §8.4 dan §10), `restart-order.md`,
  `boot-recovery-net.md`, `architecture.md` (260 dari ±700 baris: bentuk sistem, invarian §1.1,
  komunikasi §2), `ci-setup.md`, `install-path-gap.md`, `idle-cpu.md`, `update-over-ble.md`,
  `tof-on-demand.md`. Bagian terpilih: `policy-channel-design.md` §5 dan §9.2, `robotd-design.md`
  §3.4, `remote-access-design.md` §3.3-3.4, `app-path-design.md` §2.3-2.4 dan §6.
- Kode: `updater/src/fsutil.rs`, `faults.rs`, `spawn.rs`; `reconcile.rs` (230 baris pertama);
  `transcript.rs` (200 baris pertama); `engine.rs` (peta fungsi, `transition_to`,
  `recover_on_start`, `health_gate`); judul modul `journal`, `verify`, `store`, `hooks`, `manifest`,
  `preflight`, `account`, `vetbook`, `unix`, `lib`, `ipc`; `xtask/tests/sideload.rs`; komentar
  dokumentasi `xtask/src/main.rs`; kepala `test-support/src/lib.rs`; jalur identitas dan
  `ServiceUnit` di `duck-ipc-proto/src/lib.rs`.
- Skrip dan CI: `scripts/robot-rescue` dan `robot-boot-check` (penuh), `hooks/postinstall` (penuh),
  kepala `dev-push.sh`, `systemd-test.sh`, `board-test.sh`, `install.sh`; `release.yml` (penuh),
  `_build-release.yml` (330 baris pertama), `prune-dev-releases.yml` (penuh), komentar `ci.yml`.

**Dipilah tanpa dibaca isinya** (hanya judul bagian, ukuran berkas, dan pemindaian kata kunci):
kode domain robot (`robotd`, `kinematics`, `mediad`, `padd`, `netpadd`, `nfc`, `tof`, `odometry`,
`pad-*`, `pet-detect`, `sounds`, `uyvy`, `duck-*`); dokumen WebRTC, seluler, simulasi dan konsol;
`media-bringup`, `npu-bringup`, `pad-minimal-pairing`, `slice-2-bringup`, `roadmap`, `docs/robot/*`;
rencana netpad (97 KB); skrip provisioning (`setup-*.sh`, `provision*.sh`, `migrate-network.sh`);
badan `engine.rs`, `journal.rs`, `config.rs`, `policy.rs`, `store.rs`, `verify.rs`, `vetbook.rs`,
`ipc.rs`, `hooks.rs`; workflow `ci.yml`, `dev.yml`, `_promote-release.yml`, `_build-duckctl.yml`,
`duckctl-pypi.yml`; `deploy/*`. Pemindaian kata kunci atas seluruh pohon (tombstone, quarantine,
circuit breaker, watchdog, single-flight, backpressure, canary, kill switch, feature flag,
two-phase) hanya menemukan berkas yang sudah dibaca atau kode domain robot.

**Batas**
- "Tidak ada pengetahuan baru" tidak dapat dibuktikan untuk byte yang tidak dibaca. Yang dapat
  dinyatakan: dari bahan yang relevan bagi Agent Core (mesin update dan restart, receipt, pemulihan,
  tes, rilis, dokumentasi), putaran kedua tidak menemukan mekanisme baru yang disertai bukti
  kegagalan di Agent Core selain butir 5 dan 12. Yang baru hanyalah batasan desain untuk butir 5
  dan butir 15-17 beserta daftar "tidak diadopsi".
- Putaran kedua mengoreksi dirinya sendiri: angka "25 MB" untuk `runtime/restart` dari `du` adalah
  blok disk; isinya ±100 KB (97 receipt 33.768 byte, 149 log 67.926 byte, 98 klaim 61 byte).
- Receipt dan log dibaca semuanya, tetapi log dekode UTF-16 dan JSON dengan BOM; angka 97 receipt,
  91 sukses dan 6 gagal dihitung ulang setelah menangani enkodenya.
- Penyebab kegagalan tanpa alasan (2026-10-17) tidak diketahui; tidak ada hipotesis yang diuji.
- Hitungan 1.186 dan 504 berasal dari regex kasar atas `src`, hanya indikasi.
- Dijalankan pada putaran kedua: pembacaan, `GET /health` tanpa kunci, parser PowerShell atas 17
  skrip (0 galat), penghitungan berkas dan pemindaian teks. Tidak ada tes, build, atau restart.
