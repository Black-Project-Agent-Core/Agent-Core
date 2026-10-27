# W10b — Putaran penutupan terakhir `claude-code/mods` (hooks telemetry, agents-md, sec-default; prefix GCH)

Tanggal: 2026-10-27. Pekerja: W10b (baca-saja). Sumber: `E:\Projects\Side-Project-Dont-Touch\claude-code`, HEAD `a5b0f2e`. Putaran ini melanjutkan `W2-claude-code-mods.md` (MOD-), `W9a-claude-code-gap-closure.md` (GCA-) dan `W9d-claude-code-mods-source-closure.md` (GCD-); ketiganya dibaca sebelum bekerja (W2 sampai baris 359, W9a sampai baris 210 dan seluruh ledgernya, W9d seluruhnya). Pengecualian dari pengguna dipatuhi: tidak ada yang dibaca atau dilaporkan tentang finance, zoom, atau aplikasi lintas-platform.

Lisensi: seluruh `claude-code` berlisensi all-rights-reserved (Anthropic Commercial Terms). Semua temuan hanya mengambil ide, invarian, dan angka fungsional untuk reimplementasi mandiri. Tidak ada kode donor atau teks panjang yang disalin; nama identifier (mis. `isWholeRead`, `foldedName`) dikutip sebagai fakta kontrak. Tidak ada skrip, hook, atau biner sumber yang dijalankan. Satu-satunya eksekusi: `git ls-files` dan `git rev-parse` pada donor; pengecekan barrel dengan `grep`; dua uji string murni dengan `node -e` (regex `featureId` dan `path.win32.basename`, tanpa memuat kode Agent Core); penghitungan `grep -c` baca-saja atas `E:\Projects\Agent-Core\runtime\tracker\activity.jsonl`. Tidak ada yang ditulis di `E:\Projects\Agent-Core` atau di folder sumber. Tidak ada rahasia yang dicatat.

## Ringkasan eksekutif

1. 7 temuan baru: ADAPT 4, REFERENSI 3, ADOPT 0. Tidak ada yang butuh skema tool MCP baru dan tidak ada yang menambah teks selalu-dimuat.
2. Temuan terpenting datang dari membandingkan skema outcome donor dengan tracker lokal, bukan dari donor itu sendiri. GCH-01: `recordSkillOutcome` memakai `featureId: 'skill:' + nama`, padahal `sanitizeFeatureOutcome` hanya menerima `[a-z0-9._-]`, sehingga pemanggilan itu pasti melempar `TRACKER_FEATURE_ID_INVALID` bila memakai tracker nyata. Uji `skill-outcome-review.test.ts` memock `recordOutcome` sehingga bug ini tidak terlihat, dan tidak ada satu pun uji yang menyebut kode galat itu. Jurnal nyata tidak memuat bukti jalur ini pernah dijalankan (0 dari 110.732 baris), jadi statusnya bug laten, belum teramati.
3. GCH-03: `command-manager.ts` (daftar blokir perintah) tidak punya satu pun uji, tidak menormalkan `.exe` (daftar bawaan berisi `reg`, `net`, `netsh`, `diskpart`, `shutdown`, dst., tetapi `reg.exe` dibaca sebagai `reg.exe`), dan tidak membaca baris baru sebagai pemisah pernyataan. Daftar ini bersifat penasihat, bukan batas keamanan; perbaikannya kecil.
4. GCH-02 merinci kontrak skema outcome lokal (batas 16 properti memakan slot kunci invalid, validasi melempar sinkron padahal kontrak tracker menyatakan fail-soft, tanpa hitungan buangan) dan menambahkan pelajaran dari donor sendiri: komentarnya menyatakan "closed value" tetapi `terminalOf` mengembalikan `TERM_PROGRAM` mentah.
5. Koreksi atas ledger lama: GCD-10 menduga adapter plugin Claude tidak memeriksa tabrakan nama terlipat; sebenarnya sudah ada (`src/skills/service.ts:923-937` dan `src/skills/claude-plugin.ts:109`, diuji di `tests/skill-claude-plugin.test.ts`). W9d menyebut 15 barrel di `agents-md/hooks`; yang benar 14 (57 = 43 non-barrel + 14 barrel).
6. Setelah putaran ini, semua sumber non-tes non-barrel di `telemetry/hooks` (106), `agents-md/hooks` (43) dan `sec-default/hooks` (58) sudah dibaca penuh. Yang tersisa: badan sebagian besar tes (hanya judul), 40-an berkas UI pane terminal di `diff/hooks/views`.

---

## Bagian A — Ledger cakupan (hanya unit yang ditutup putaran ini)

Metode jangkauan: hitungan dari `git -c safe.directory=* ls-files` per subfolder (dijumlahkan di bawah); semua `index.ts` diuji dengan `grep` bahwa tiap baris adalah komentar, kosong, `import`, atau `export ... from`/`export default`/`export *`/`export {` (0 pengecualian pada 104 + 14 + 28 berkas); setiap berkas sumber non-barrel dibuka dengan `cat` per kelompok (alat Read untuk tes) dan dibaca seluruh isinya, bukan disaring. Baseline Agent Core dibaca dengan Read/grep.

### A.1 `mods/telemetry/hooks` (210 berkas = 106 non-barrel + 104 barrel)

| Unit | File | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `entries/` | 55 | penuh 29 non-barrel; 26 barrel (skrip grep) | ADAPT / REFERENSI | Validator baris tertutup (`checkedProps`, `checkedValue`, `checkedMark`, `refusal`), `batch-of`, `wire-of`, `metadata-of` | GCH-02 |
| `batching/` | 19 | penuh 9; 10 barrel | REFERENSI | Batas 100 baris / 5 detik / satu retry 500 ms hanya untuk 5xx, 408, 429 | Bagian C, D |
| `gate/`, `answer-of/` | 11 + 2 | penuh 5 + 1; 7 barrel | REFERENSI | Gerbang berdasar tier asal; `.catch` yang memutar ulang jawaban bawah bila sudah dipanggil | Bagian D |
| `is-analytics-off/`, `environment/`, `policy-pins/` | 6 + 2 + 2 | penuh 3 + 1 + 1; 5 barrel | REFERENSI | Tafsir saklar: "terisi apa pun" vs "hidup tertutup 1/true/yes/on"; pembacaan saklar gagal berarti tidak mengirim | GCH-02, Bagian D |
| `telemetry-of/`, `telemetry-deps/`, `sender/`, `register.ts`, `index.ts`, `hooks.json` | 2 + 2 + 2 + 3 | penuh 1 + 1 + 1 + 2 (register, hooks.json); 4 barrel | REFERENSI | Rantai pengiriman serial, antrean yang tidak meracuni, memo konteks yang direset saat gagal | Bagian C, D |
| `context/` (client-type, entrypoint, environment-fields, identity, linux-distro, machine, probe, remote-hash, session-fields, shell, terminal, vcs, version, wsl) | 92 | penuh 46 non-barrel; 46 barrel | TOLAK (transport/sidik jari) / REFERENSI (reduksi nilai) | Sidik jari mesin ditolak (C-2 W2); hanya pola reduksi ke himpunan tertutup dan cacat konsistensinya yang diambil | GCH-02, Bagian C |
| `deployment/`, `facts/`, `config-location/` | 8 + 2 + 2 | penuh 4 + 1 + 1; 6 barrel | TOLAK | Daftar 34 nama deployment dan 60-an variabel lingkungan untuk baris analitik | Bagian C |
| **Subtotal** | **210** | 106 penuh + 104 barrel | | | |

### A.2 `mods/agents-md/hooks` (57 berkas = 43 non-barrel + 14 barrel)

| Unit | File | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `register.ts`, `hooks.json`, `index.ts` | 3 | penuh 2; 1 barrel | REFERENSI | Tiga hook (`prompt.context`, `agent.spawn` fork, `tool.call` Read) dan mode `managed-only` | GCH-05 |
| `files/` | 11 | penuh 10; 1 barrel | REFERENSI | `unseenFiles` (dedupe path + isi), `insertionIndex`, `chainRootOf` (penjaga siklus), `withProjectFiles` | GCH-05 |
| `frames/` | 7 | penuh 6; 1 barrel | REFERENSI | `normalSpellingOf`, `isBelow` (ketat di bawah), `absoluteOf` (`~`), `nestedFrame`, `outsideClaudeDirs` | GCH-05 |
| `modes/`, `names/`, `switches/` | 8 + 4 + 2 | penuh 5 + 3 + 1; 5 barrel | REFERENSI | Nilai tak dikenal jatuh ke default atau ke mode paling pasif; ejaan saklar hidup tertutup | GCH-05 |
| `telemetry/` | 22 | penuh 16; 6 barrel | REFERENSI | Baris hanya berisi hitungan (tanpa path dan teks); `quietly` menelan kegagalan pengamat | GCH-05 |
| **Subtotal** | **57** | 43 penuh + 14 barrel | | | |

### A.3 `mods/sec-default/hooks` (86 berkas = 58 non-barrel + 28 barrel)

| Unit | File | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `register.ts`, `hooks.json`, `index.ts` | 3 | penuh 2; 1 barrel | REFERENSI / TOLAK | Hook "outermost" berjenjang: mesin tier organisasi, tidak ada padanan (C-1 W2) | Bagian C |
| `policy/` | 44 | penuh 30; 14 barrel | REFERENSI | Memo pembacaan 500 ms termasuk penolakan, `decidedByPolicy` gagal-tertutup, `memberOf` (baca properti milik sendiri), lipat nama, daftar variabel pemuat kode | GCH-06 |
| `held-verdict/` | 19 | penuh 14; 5 barrel | REFERENSI | Peringkat deny<ask<allow, `isSameVerdict` (semua bidang), `UNCHECKED_DENY` | GCH-06 |
| `past-users/`, `skill-row/`, `tool-register-refusal/` | 7 + 3 + 4 | penuh 4 + 2 + 3; 5 barrel | TOLAK | Pemilihan tier penyedia dan penolakan registrasi tool organisasi | Bagian C |
| `admission-failure/`, `managed-mods-only-refusal/`, `pinned-variable-refusal/` | 2 + 2 + 2 | penuh 1 + 1 + 1; 3 barrel | TOLAK | Teks penolakan dan baris debug | Bagian C |
| **Subtotal** | **86** | 58 penuh + 28 barrel | | | |

Cek jumlah: 210 + 57 + 86 = 353 berkas hooks pada tiga mod ini, seluruhnya terlacak dalam ledger.

### A.4 `mods/diff/hooks/views` (172 berkas; hanya logika non-visual)

| Unit | File | Dibaca | Disposisi | Alasan satu baris | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `entries/` | 9 | penuh 4; 5 barrel | REFERENSI | Pemetaan baris ke entri tampilan | — |
| `detail/` | 41 | penuh 12 putaran ini (`code-blocks-of`, `leading-hunk-of`, `hunk-header-of`, `hunk-source-of`, `body-budget`, batas `max-*`, `drawn-line-of`, dst.) di atas 12-an yang dibaca W9d; 21 barrel | ADAPT (ringan) | Anggaran isi dikeluarkan berurutan, hunk dipotong per baris utuh, header dihitung ulang | GCH-07 |
| `body/` | 25 | penuh 5 (`segments-of`, `dock-plan-of`, `hunk-window-of`, `body-layout-of`, `place-at-file`); 7 barrel; 13 tidak dibuka | TOLAK | Windowing baris sel terminal | Bagian C |
| `layout/` | 25 | penuh 3 putaran ini (`wrapped-lines`, `plural`, `pad-end`) di atas 4 milik W9d; 13 barrel; ±5 tidak dibuka (`cell-width`, rentang lebar) | TOLAK | Lebar sel terminal | Bagian C |
| `sections/`, `dialog-pane/`, `kit/`, `pane-*`, `prelude-of`, `sidebar-pane`, `inset-of` | 38 + 18 + 4 + 2 + 2 + 2 + 2 + 2 + 2 | penuh 4 + 1 + 0 (`ask-key-of`, `file-key-of`, `file-row-model`, `stat-text-of`, `inset-of`, `pane-actions`); sisanya barrel atau render | TOLAK | Render Ink dan dialog terminal | Bagian C |
| **Subtotal** | **172** | ±30 dibaca putaran ini; 78 barrel; ±40 non-barrel tidak dibuka (tumpang tindih dengan 25 berkas W9d tidak dapat dipastikan) | | | |

### A.5 Tes

| Unit | File | Dibaca | Disposisi | Alasan | Temuan |
| --- | ---: | --- | --- | --- | --- |
| `agents-md/tests` | 16 (1 uji, 5 `test()`) | `register.test.ts` penuh (140 baris); fixture `project-of`, `ancestor-of`, `unreadable-project-of` penuh; 6 fixture lain tidak dibuka | REFERENSI | Hanya mode default yang diuji; sisanya klaim README | GCH-05 |
| `telemetry/tests` | 62 (2 uji, 33 + 7 judul) | `gate.test.ts` baris 60-189 (5 dari 7 uji); `register.test.ts` baris 100-136, 356-567, 679-771 (±17 dari 33 uji); judul semua; 60 fixture tidak dibuka | REFERENSI | Penolakan tanpa mengantre, retry sekali, kegagalan `authorize` tidak lengket, gerbang tier | GCH-02, Bagian D |
| `sec-default/tests` | 108 (5 uji, 162 judul) | tiga uji `policy/*.test.ts` penuh (8 uji); `register.test.ts` baris 1655-1725, 1860-1975, 2120-2180, 2405-2437 (±22 dari 136 uji); judul `held-verdict.test.ts` (18) dan 136 judul `register.test.ts` didata; 103 fixture tidak dibuka | REFERENSI | Kasus nama terlipat, prefiks batas, id plugin, memo gagal-tertutup | GCH-06 |

Daftar judul yang dipilih untuk dibaca penuh (kata kunci edge case): "free text and a malformed entry are refused, nothing queued", "a number that is not finite is refused, nothing queued", "a failed authorize is not held against the next batch", "a full queue goes out at once, before the window", "a server error is tried once more; a second one drops the batch", "a client error is not retried", "a name that only begins like one is no server of theirs", "a server whose name folds to nothing refuses every name", "an unreadable server file refuses every name and owns every server tool", "a plugin of the same name from another source is refused it", "a listed id that is one at-sign refuses every registration of theirs", "a burst of reads inside the window is one read", "a failed read is served for its window: fails closed", "the option mistyped lifts nothing: only the literal true does". Tes yang hanya dibaca judulnya: 119 dari 136 uji `register.test.ts` sec-default (alasan: mesin tier tidak punya padanan), 16 dari 33 `register.test.ts` telemetry (jalur konteks, GitHub Actions, Linux, Windows: sidik jari mesin yang ditolak).

---

## Bagian B — Temuan

### GCH-01 `featureId` Skill (`skill:<nama>`) tidak lolos sanitizer tracker; uji memock penghalangnya
- Sumber: donor `mods/telemetry/hooks/entries/token/token.ts` (nama dan kunci = token `[a-z][a-z0-9_]{0,63}`), `entries/checked-fields.ts` (event diperiksa dan ditolak, bukan dinormalkan), `telemetry/tests/register.test.ts:453-497` ("free text and a malformed entry are refused, nothing queued": lalu `posts` kosong setelah jendela lewat). Agent Core: `src/learning/skill-outcome-review.ts:15`, `src/tracker/activity-tracker.ts:66-79`, `tests/skill-outcome-review.test.ts:23-29`, `src/agent-runtime.ts:1198-1210`, `src/learning/external-controller.ts:1798-1815`.
- Observasi: Donor menolak nama event yang tidak memenuhi bentuk tertutup dan mengujinya di sisi "tidak ada yang diantre". Di Agent Core, `recordSkillOutcome` memanggil `activityTracker.recordOutcome(..., { featureId: 'skill:' + input.skillName, ... })`. `sanitizeFeatureOutcome` memeriksa `featureId` dengan `/^[a-z0-9][a-z0-9._-]{0,79}$/` dan melempar `TRACKER_FEATURE_ID_INVALID`. Titik dua tidak ada dalam kelas karakter itu. Uji string murni: `skill:abc` ditolak, `skill.abc` diterima. `dist/learning/skill-outcome-review.js:10` memuat kode yang sama. Pemanggil membungkus `recordSkillOutcome` dengan `try/catch` yang hanya memanggil `captureFailure('LEARNING', ..., 'native-skill-outcome-unavailable')` atau `'external-skill-outcome-unavailable'`, sehingga kegagalan tertelan setelah validasi bukti selesai. `reviewSkillOutcomes` membaca event dari `readFeatureOutcomes` dengan `context.artifactKind === 'skill'`; tanpa event tersimpan, tidak ada bukti yang dapat dihitung dan rekomendasi "retain/review" tidak pernah muncul. `tests/skill-outcome-review.test.ts:23-29` memakai `vi.spyOn(activityTracker, 'recordOutcome').mockImplementation(...)`, jadi sanitizer asli tidak pernah dijalankan. `grep TRACKER_FEATURE_ID_INVALID` pada `tests/` kosong.
- Nilai untuk Agent Core: Loop pembelajaran Skill (outcome terverifikasi, lalu peninjauan revisi) mungkin tidak pernah menerima satu bukti pun dari jalur ini. Ini persis kelas kegagalan yang diceritakan donor lewat uji "tidak ada yang diantre": tulis dan baca harus diuji pada skema yang sama, tanpa mock di antaranya.
- Baseline Agent Core → SEBAGIAN (jalur ada, pasangannya rusak): daftar `featureId` lain valid (`memory.use`, `memory.retrieval`, `code.security.changed-source`, `agent-artifact.<kind>.<sha24>`, `external.<kind>.<sha24>`); hanya `skill:` yang tidak. Pengecekan empiris baca-saja pada `runtime/tracker/activity.jsonl` (110.732 baris, 2026-09-22 sampai 2026-10-27): `skill-proposal-use-outcome` = 0, `native-skill-outcome-unavailable` = 0, `external-skill-outcome-unavailable` = 0. Tiga baris yang memuat teks `TRACKER_FEATURE_ID_INVALID` adalah event `tool-detail` hasil `read_file` atas berkas sumber (bukan kegagalan nyata). Artinya jalur ini belum pernah dieksekusi pada data nyata; bug-nya laten.
- Delta/celah: (a) ganti `'skill:' + nama` menjadi `'skill.' + nama` (panjang maksimum 6 + 64 = 70 ≤ 80), atau lebarkan regex; periksa dulu apakah ada pembaca yang mencocokkan `featureId` dengan awalan `skill:` (grep `featureId` pada `src/learning/curator.ts` dan `external-controller.ts` menunjukkan pengelompokan per `featureId`, bukan per awalan; tidak ditelusuri lebih jauh); (b) satu uji kontrak yang memakai `ActivityTracker` asli pada root sementara dan menjalankan `recordSkillOutcome` hingga event terbaca kembali oleh `readFeatureOutcomes`; (c) satu uji "semua literal `featureId` di `src/` lolos sanitizer".
- Cara adaptasi: `src/learning/skill-outcome-review.ts` (satu string), `tests/skill-outcome-review.test.ts` (tambah kasus tanpa mock; `new ActivityTracker(mkdtemp(...))`, dibersihkan di `afterEach` sesuai preferensi tanpa sisa file). Tanpa skema tool.
- Lisensi/hak cipta: temuan berasal dari kode Agent Core; donor hanya menginspirasi uji "sisi tidak diantre".
- Perkiraan skala: S · Risiko: rendah (satu string; periksa pembaca per `featureId`) · Nilai: tinggi bila terkonfirmasi · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dari kode: regex, baris pemanggil, `dist`, mock di uji, ketiadaan uji penolakan, dan hitungan nol pada jurnal nyata. Uji string regex dijalankan. Dugaan: bahwa `recordSkillOutcome` sungguh tercapai dan melempar pada pemakaian nyata (tidak dijalankan end-to-end dengan tracker asli; wajib dikonfirmasi lewat uji (b) sebelum diperbaiki).
- Disposisi: ADAPT.

### GCH-02 Kontrak skema outcome lokal: penolakan harus jujur, tidak boleh melempar ke pemanggil, dan harus diuji
- Sumber: donor `entries/checked-props/checked-props.ts` (menolak, bukan membuang: bentuk objek, jumlah > 16, tiap kunci token, lalu tiap nilai), `entries/checked-value/checked-value.ts` (boolean; angka hanya bila `Number.isFinite`; string bebas ditolak; Choice `{value, of}` dengan daftar 1 sampai 32 token huruf kecil dan `value` harus anggota), `entries/refusal/refusal.ts` (pesan menyebut metode dan sebab tanpa memuat teks pemanggil; hanya kunci yang sudah lolos token), `entries/checked-mark/checked-mark.ts` (`ok` tidak boleh punya alasan; `sad` dan `bad` wajib alasan token), `agents-md/hooks/telemetry/quietly.ts` (pengamat yang gagal ditelan), `telemetry-of/telemetry-of.ts:167-183` (validasi sebelum antrean, `queued` tidak dipanggil bila ditolak), `telemetry/tests/register.test.ts:453-565`, `context/terminal-of/terminal-of.ts`, `entries/event-data-of/metadata-of/metadata-of.ts`.
- Observasi: Skema donor bekerja dengan tiga janji: (1) pelanggaran pertama menolak seluruh entri dengan alasan yang tidak membocorkan nilai; (2) penolakan terjadi sebelum apa pun masuk antrean, dan uji menegaskan "tidak ada yang terkirim" setelah jendela lewat; (3) pengamat tidak boleh mengganggu alur utama (`quietly`). Dua cacat konsistensi donor sendiri terbaca dari kode: (a) komentar `context-of.ts` menyatakan semua kolom adalah nilai tertutup, tetapi `terminalOf` mengembalikan `TERM_PROGRAM`, `TERM`, `wsl-<nama distro>` dan `MSYSTEM` mentah, dan `tags`, id kontainer, serta id GitHub diteruskan mentah; (b) `metadataOf` menyusun `{ rh, ...props }`, sehingga properti bernama `rh` (lolos `TOKEN`) menimpa hash repositori. Pelajaran: klaim "nilai tertutup" tanpa penegakan di batas dan tanpa uji acak/fuzz tidak dapat dipercaya; kunci yang dipesan harus ditolak atau diletakkan terakhir.
- Nilai untuk Agent Core: Tracker lokal adalah satu-satunya sumber bukti outcome untuk Learning, Reflexion, review keputusan, dan verifikasi eksternal (konsumen: `workflow-evidence.ts:18,67`, `decision-review.ts:88`, `curator.ts:61`, `external-controller.ts:1531,1996,2030`, `memory/service.ts:939`). Skema yang membuang atau melempar secara tak terduga mengurangi kualitas bukti tanpa tanda.
- Baseline Agent Core → SEBAGIAN. Terverifikasi dengan Read pada `src/tracker/activity-tracker.ts`:
  1. Baris 72: `Object.entries(input.properties ?? {}).slice(0, 16)` dipotong SEBELUM kunci diperiksa (baris 73 `continue`). Kunci invalid di 16 posisi pertama memakan slot, sehingga properti valid sesudahnya hilang; dan lebih dari 16 properti valid dipotong diam-diam (donor menolak). Ini memperkuat GCA-08 dengan cacat urutan yang belum tercatat.
  2. Baris 66-70 dan 157: `sanitizeFeatureOutcome` melempar secara sinkron dari `recordOutcome`, sebelum `persist`. Padahal komentar `persist` (baris 389-391) menyatakan kegagalan tracker tidak boleh menjatuhkan Agent Core. Pemanggil tanpa `try/catch`: `src/mcp/code-intelligence-tools.ts:437-441` (di dalam `try` yang menangkap lalu mengubah hasil pemindaian sukses menjadi `errorResult`), `src/agent-runtime.ts:1205`, `src/learning/external-controller.ts:1805`. Pemanggil di `src/memory/service.ts:1507-1515` sudah membungkusnya dengan komentar fail-soft; jadi penulisnya mengenali kebutuhan itu di sebagian tempat.
  3. Baris 67: `input.featureId.trim()` melempar `TypeError` generik bila `featureId` bukan string, bukan `TRACKER_FEATURE_ID_INVALID`.
  4. Baris 72-76: string bebas sampai 200 karakter diterima setelah redaksi; tidak ada hitungan buangan; nilai `undefined`, objek, dan larik dibuang diam-diam.
  5. Baris 133, 158, 180: `sanitizeContext(context)` dipanggil dua kali per event (hanya efisiensi).
  6. `tests/`: 19 berkas menyebut `recordOutcome`/`featureOutcome`, tetapi `grep TRACKER_OUTCOME_INVALID|TRACKER_FEATURE_ID_INVALID` pada `tests/` kosong; tidak ada uji penolakan, `NaN`/`Infinity`, kunci invalid, atau batas 16.
- Delta/celah: (a) fungsi murni `checkFeatureOutcome(input)` yang mengembalikan `{ ok: true, value }` atau `{ ok: false, code }` dan menghitung properti dibuang; validasi kunci DULU, batas 16 sesudahnya; (b) `recordOutcome` tidak pernah melempar karena sanitizer: bila ditolak, simpan event `kind: 'feature-outcome-rejected'` dengan `code` dan nama kunci yang lolos token (tanpa nilai), dan kembalikan event itu; ini mengoreksi saran GCA-08 "tanpa menolak" menjadi "tolak tanpa melempar"; (c) `droppedProperties` pada event bila ada yang dibuang; (d) tolak kunci pada daftar dipesan bila kelak kolom turunan ditambahkan; (e) matriks uji (di bawah).
- Cara adaptasi: `src/tracker/activity-tracker.ts` (pemilik tunggal) dan satu berkas uji baru `tests/tracker-feature-outcome.test.ts` dengan `ActivityTracker` pada root sementara. Tanpa skema tool; tanpa teks selalu-dimuat.

  | Kasus | Hasil yang diharapkan |
  | --- | --- |
  | `featureId` = `skill:x`, `Foo`, `''`, 81 karakter, bukan string | event `feature-outcome-rejected` dengan kode jelas; tidak melempar |
  | 17 properti valid | 16 tersimpan, `droppedProperties: 1` |
  | 1 kunci invalid di posisi 1 + 16 valid | 16 valid tersimpan (urutan validasi benar) |
  | `NaN`, `Infinity`, `undefined`, objek, larik | dibuang dan dihitung |
  | string 500 karakter berisi pola rahasia | direduksi dan dipotong 200 |
  | `outcome` huruf besar dengan spasi | dinormalkan atau ditolak sesuai keputusan pemilik, diuji eksplisit |
  | dua pemanggilan identik | dua event berbeda `id`; tidak ada efek samping lain |
- Lisensi/hak cipta: pola umum (validasi tertutup); mandiri.
- Perkiraan skala: S · Risiko: rendah-sedang (mengubah perilaku lempar menjadi catat; pemanggil `activityTracker.recordOutcome` (grep nama menemukan 12 kemunculan, sebagian definisi dan metode `recordOutcome` lain milik game-mode) perlu dicek bahwa tidak ada yang mengandalkan lemparan untuk alur kontrol; dari yang dibaca putaran ini tidak ada) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dari kode (butir 1-6) dan dari kode donor. Dugaan: bahwa ada pemanggil yang kelak mengirim lebih dari 16 properti atau kunci invalid; tidak diaudit dari semua pemanggil.
- Disposisi: ADAPT.

### GCH-03 `command-manager.ts`: daftar blokir perintah tanpa uji, tanpa normalisasi `.exe`, kutip, dan baris baru
- Sumber: Agent Core `src/rdc/command-manager.ts:11-172` (`extractCommands`), `:175-227` (`extractBaseCommand`), `:229-262` (`validateCommand`), `src/rdc/config-manager.ts:149-195` (daftar bawaan), `src/rdc/tools/improved-process-tools.ts:109-120`. Donor: `sec-default/hooks/policy/managed-tools-restored/is-org-tool/tool-prefix-of/folded-name/folded-name.ts` (lipat nama: karakter di luar `[a-zA-Z0-9_-]` menjadi `_`, huruf kecil, trim), `telemetry/hooks/context/shell-of/shell-of.ts` (basename, huruf kecil, buang `.exe`, cocok hanya bila ada di daftar tertutup), `sec-default/hooks/policy/has-mcp-allowlist.ts` (`Array.isArray` sebelum percaya), `sec-default/hooks/policy/decided-by-policy.ts` (galat berarti tindakan paling hati-hati), komentar `code-loading-variables.ts` ("a list, not a boundary"), `sec-default/tests/register.test.ts:1670-1676` ("a name that only begins like one is no server of theirs": pencocokan batas penuh, bukan awalan).
- Observasi: Donor memperlakukan perbandingan nama sebagai fungsi lipat yang sama di semua tempat, memeriksa bentuk data kebijakan sebelum memakainya, dan jujur bahwa daftar adalah pengaman, bukan batas keamanan.
- Nilai untuk Agent Core: `validateCommand` adalah satu-satunya pengaman daftar-blokir untuk `start_process`. Pengguna memakai Windows dengan PowerShell; daftar bawaan berisi nama Windows tanpa ekstensi (`format`, `diskpart`, `netsh`, `sfc`, `bcdedit`, `reg`, `net`, `sc`, `runas`, `cipher`, `takeown`, `shutdown`).
- Baseline Agent Core → SEBAGIAN, terverifikasi dengan Read dan uji string murni:
  1. `grep` pada `tests/` untuk `blockedCommands|command-manager|validateCommand|extractBaseCommand` kosong: modul ini tanpa satu pun uji.
  2. `extractBaseCommand` mengembalikan `path.basename(token).toLowerCase()`. Uji `path.win32.basename`: `reg.exe` → `reg.exe`, tidak sama dengan entri `reg`; begitu pula `shutdown.exe`, `netsh.exe`. `blockedCommands.includes(cmd)` adalah kesamaan persis.
  3. Token berkutip: `"C:\Windows\System32\reg.exe"` menghasilkan basename yang memuat tanda kutip sehingga tidak cocok. Operator panggil PowerShell `&` dianggap pemisah (baris 17), lalu sisa token berkutip.
  4. Baris baru bukan pemisah (`separators = [';', '&&', '||', '|', '&']`, baris 17). Pada masukan dua baris, hanya token pertama baris pertama yang diperiksa (`split(/\s+/)`, token pertama). PowerShell memperlakukan baris baru sebagai pemisah pernyataan. Dibaca dari kode; tidak dijalankan.
  5. `config.blockedCommands || []` lalu `.includes`: bila nilai konfigurasi berupa string (salah ketik), `.includes` menjadi pencocokan substring; entri berhuruf besar di konfigurasi tidak pernah cocok karena perintah diturunkan ke huruf kecil tetapi entri tidak dinormalkan.
  6. Sudah baik: galat saat validasi menghasilkan penolakan (baris 258-260); `$()` dan backtick diurai juga di dalam kutip; pencocokan persis mencegah `Format-Table` terblokir oleh `format`.
- Delta/celah: lipat nama perintah satu kali: buang kutip pembungkus, ambil basename, huruf kecil, buang ekstensi `.exe`/`.com`/`.cmd`/`.bat`; normalkan juga entri konfigurasi dengan fungsi yang sama; `Array.isArray` dan elemen string, bila bentuk salah gunakan daftar bawaan (gagal-tertutup); jadikan baris baru (`\r\n`, `\n`) pemisah. Tetap dinyatakan sebagai pengaman penasihat; konfirmasi untuk tindakan destruktif tidak berubah.
- Cara adaptasi: `src/rdc/command-manager.ts` (pemilik), `tests/command-manager.test.ts` baru. Uji minimal (semuanya string murni, tanpa proses):

  | Masukan | Hasil yang diharapkan |
  | --- | --- |
  | `reg delete HKCU\x`, `reg.exe delete ...`, `REG.EXE ...`, `C:\Windows\System32\reg.exe ...`, `"C:\...\reg.exe" ...`, `& 'C:\...\reg.exe' ...` | semuanya `reg` → diblokir |
  | `Get-Process\nreg delete ...` | diblokir (baris kedua terbaca) |
  | `Format-Table`, `format-list`, `formatter` | tidak diblokir (batas penuh, bukan awalan) |
  | `echo $(reg delete x)` dan `` `reg delete x` `` | diblokir (sudah ada, kunci dengan uji) |
  | konfigurasi `blockedCommands` berupa string `"reg"` atau `{}` | daftar bawaan dipakai atau penolakan; tidak ada substring-match |
  | konfigurasi `["REG"]` | diblokir setelah normalisasi |
  | `getConfig` melempar | `validateCommand` = false (sudah ada, kunci dengan uji) |
- Lisensi/hak cipta: pola lipat nama dan validasi bentuk; mandiri.
- Perkiraan skala: S · Risiko: rendah-sedang (perintah yang dulu lolos kini terblokir; pengguna dapat menyesuaikan daftar) · Nilai: sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: ketiadaan uji, kesamaan persis, `reg.exe` ≠ `reg` (uji string), pemisah tanpa baris baru (kode). Dugaan: bahwa model atau controller memakai `reg.exe` atau masukan berbaris-banyak di dunia nyata; bahwa pemilik ingin daftar menjadi lebih ketat.
- Disposisi: ADAPT.

### GCH-04 Pembaca jurnal tracker menyamakan "tidak terbaca" dengan "kosong"; penanda `activity.corrupt.*` tidak dipangkas
- Sumber: donor `telemetry-of/telemetry-of.ts:50-65` (saklar tidak terbaca: tidak mengirim dan menulis satu baris debug dengan sebab), `telemetry/tests/register.test.ts:222-250` ("unreadable switches send nothing, and the debug log says why"), `sec-default/hooks/policy/create-policy-memo/create-policy-memo.ts` (kegagalan baca di-memo selama jendelanya dan tetap gagal-tertutup). Agent Core: `src/tracker/activity-tracker.ts:187-239` (`readFeatureOutcomes`, `readToolInvocationEvents`), `:270-303` (`recoverJournal`), `:350-372` (`pruneReports`), `src/persistence/bounded-event-log.ts:60-101`; pembanding fail-closed yang disengaja: `src/rdc/utils/toolHistory.ts:150-151` (komentar "Interior malformed records fail closed"), `src/memory/retrieval-ledger.ts:339-358`, `src/mcp/mutation-safety.ts:107-122`.
- Observasi: Donor membedakan "tidak ada" dari "tidak dapat dibaca" dan menyebut sebabnya satu kali. Di Agent Core, `replaySync` hanya mengabaikan ekor yang belum lengkap; satu baris tengah yang bukan JSON membuat `JSON.parse` melempar. Kedua pembaca tracker menangkap dan mengembalikan `[]` tanpa menyentuh `journalIssue`. `journalIssue` hanya diisi di `recoverJournal` saat start. Bila baris rusak ada, setiap start proses menulis satu berkas baru `activity.corrupt.<stempel>.jsonl` (jurnal tidak diperbaiki) dan `pruneReports` hanya membersihkan `reports/*.json`, bukan berkas itu.
- Nilai untuk Agent Core: Konsumen bukti (`workflow-evidence`, `decision-review`, `curator`, verifikasi eksternal) membaca `[]` sebagai "tidak ada bukti". Arah kegagalan konservatif (bukti hilang berarti tidak terverifikasi), jadi dampaknya pada kebenaran kecil; yang hilang adalah kejujuran ("tidak terbaca") dan kebersihan berkas.
- Baseline Agent Core → SEBAGIAN. Kondisi nyata sekarang sehat: `runtime/tracker/activity.jsonl` 110.732 baris, terbaca; hanya dua berkas `activity.corrupt.*` berukuran 0 byte dari 2026-09-20 dan 2026-09-22 (peninggalan versi lama). Tidak ada uji korupsi jurnal (`grep activity.corrupt|journalIssue|getJournalIssue` pada `tests/` kosong). Jangan menggeneralisasi ke jurnal lain: `toolHistory.ts`, `retrieval-ledger.ts` dan `mutation-safety.ts` sengaja gagal-tertutup pada baris tengah rusak karena kuitansi idempotensi tidak boleh hilang.
- Delta/celah: (a) di `catch` kedua pembaca tracker, isi `this.journalIssue` dengan kode galat ringkas; (b) tulis penanda korupsi sekali per `(ukuran, stempel ubah)` jurnal, bukan per start, atau pangkas `activity.corrupt.*` yang lebih tua dari 30 hari di `pruneReports`; (c) uji pada root sementara: jurnal dengan satu baris tengah rusak menghasilkan `[]`, `getJournalIssue()` terisi, dan dua konstruksi berturut-turut menghasilkan satu penanda. Opsional: pembaca tracker (observasional saja) melewati baris rusak dan menghitungnya, setelah pemilik memutuskan.
- Cara adaptasi: `src/tracker/activity-tracker.ts` dan satu uji kecil. Tanpa skema tool.
- Lisensi/hak cipta: mandiri.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dari kode (catch tanpa `journalIssue`, pemangkasan terbatas) dan dari kondisi jurnal nyata (sehat). Dugaan: bahwa baris tengah rusak akan terjadi; penyebab yang masuk akal (edit manual, dua penulis tanpa kunci) tidak teramati.
- Disposisi: ADAPT.

### GCH-05 `agents-md`: invarian dari kode (bukan README) dan daftar uji siap pakai bila resolver instruksi bertingkat kelak dibangun
- Sumber: `mods/agents-md/hooks/register.ts:48-60` (pemberitahuan penggantian nama opsi sekali per sesi), `:95-166` (`prompt.context`), `:169-179` (`agent.spawn` fork), `:181-253` (`tool.call` Read), `files/unseen-files.ts`, `files/insertion-index.ts`, `files/chain-root-of.ts`, `files/with-project-files.ts`, `files/is-claude-file-on-walk.ts`, `frames/absolute-of.ts`, `frames/is-below.ts`, `frames/normal-spelling-of.ts`, `frames/nested-frame.ts`, `frames/outside-claude-dirs.ts`, `modes/legacy-mode-of.ts`, `modes/mode-of.ts`, `switches/is-switched-on.ts`, `telemetry/load-counts-of.ts`, `telemetry/quietly.ts`, `tests/register.test.ts`.
- Observasi: Membaca seluruh sumber menambah invarian yang tidak ada di README maupun di MOD-01/02:
  1. Semua kegagalan bergeser ke arah "menambah lebih sedikit": walk CLAUDE.md yang melempar dihitung sebagai "proyek punya CLAUDE.md" (mod mengalah); walk AGENTS.md yang melempar menghasilkan daftar kosong; walk di hook Read yang gagal menghasilkan `[NONE, NONE]` (tidak melampirkan).
  2. `unseenFiles` membandingkan jalur berejaan-normal (`\` jadi `/`, tanpa garis miring akhir), TETAPI sensitif huruf besar-kecil; dan membandingkan isi (`trim()`, hanya bila tidak kosong) HANYA dengan berkas `project`/`local` yang diserahkan engine, bukan dengan jenis lain, dan tidak antar kandidat. Dedupe jalur antar kandidat memakai himpunan yang sama.
  3. `chainRootOf` membawa himpunan `seen` sebagai penjaga siklus impor; penempatan sebuah berkas impor mengikuti kepala rantainya.
  4. `insertionIndex`: sebelum berkas proyek pertama dari direktori yang lebih dalam; kalau tidak ada, sesudah berkas proyek terakhir; kalau tidak, sebelum memori; kalau tidak, di ujung.
  5. Pada Read, berkas yang sedang dibaca TIDAK dilampirkan (isinya sudah ada di hasil); berkas itu baru dicatat "terkirim" bila Read utuh (`offset` dan `limit` tidak diisi). Catatan "terkirim" per loop (`main` atau `agentId`), dihapus pada setiap `prompt.context` (kompaksi, `/clear`) dan bila akar sesi berpindah; fork menyalin himpunan induk; fork yang dilanjutkan memakai himpunannya sendiri.
  6. `isOutOfReach`: berkas di luar akar, atau proyek berstatus punya CLAUDE.md, tidak mendapat lampiran; `isBelow` mengharuskan benar-benar di bawah (akar sendiri tidak termasuk) dan hanya mengandalkan ejaan (tanpa mengikuti tautan, tanpa lipat huruf besar-kecil).
  7. `absoluteOf`: `~` dan `~/` diselesaikan ke `HOME`/`USERPROFILE` (urutan bergantung ejaan direktori kerja), pemisah mengikuti ejaan direktori dasar, garis miring akhir dipangkas kecuali akarnya sendiri.
  8. Nilai konfigurasi lama yang tak dikenal jatuh ke mode paling pasif (`claude-md`), bukan ke default aktif; tipe salah pada opsi baru jatuh ke default. Ejaan saklar lingkungan hidup tertutup `1|true|yes|on` setelah trim dan huruf kecil.
  9. Tidak ada batas ukuran per berkas atau total. `loadCountsOf` mengukur jumlah berkas, impor, dan panjang karakter total (lokal, tanpa path dan teks): bahan yang cocok untuk buku besar biaya konteks per sumber (MOD-06) tanpa telemetri jarak jauh.
  10. `inContext` diperbarui hanya di `.finally` setelah `next` selesai; bila hook di bawahnya gagal, nilainya basi (cacat kecil).
- Nilai untuk Agent Core: Menyempurnakan spesifikasi MOD-01/02 yang tetap BERSYARAT. Tidak ada konsumen terbukti (W2 menemukan satu `AGENTS.md` hidup). Menyimpan spesifikasi dan uji sekarang murah; membangun runtime tetap menunggu pemicu.
- Baseline Agent Core → BELUM-ADA (tidak diverifikasi ulang dari W2). Pembanding relevan: `src/semantic-ide/path-safety.ts:6-15` (`comparable` huruf kecil di win32 dan `inside` yang mengharuskan pemisah) sudah menutup butir 6 dan kelemahan huruf besar-kecil donor.
- Delta/celah (hanya bila runtime dibangun): 16 kasus uji: T1 jalur beda ejaan (`C:\r\a` vs `c:/r/a/`) dianggap sama; T2 isi sama setelah trim (symlink atau impor) tidak dimuat ganda; T3 isi kosong tidak dianggap duplikat; T4 isi sama dengan berkas jenis `user` tidak membuang kandidat; T5 siklus impor A→B→A selesai; T6 penempatan: akar sebelum bersarang, sesudah berkas proyek terakhir, sebelum memori; T7 walk CLAUDE.md gagal: tidak ada yang ditambahkan; T8 walk AGENTS.md gagal: konteks apa adanya; T9 Read terpotong (`offset` diisi) pada berkas instruksi itu sendiri tidak dihitung terkirim; T10 berkas yang sedang dibaca tidak dilampirkan ulang; T11 fork mewarisi, fork lanjutan tidak; T12 kompaksi mengosongkan catatan; T13 akar sesi berpindah mengosongkan catatan; T14 berkas di luar akar tidak mendapat apa pun; T15 `~/x` dengan dan tanpa `HOME`; T16 nilai opsi tak dikenal jatuh ke mode paling pasif.
- Cara adaptasi: tulis daftar T1-T16 sebagai bagian referensi on-demand yang sudah diusulkan MOD-01 (Skill `agent-core-capability-index`, ≤8.192 byte per fragmen), tanpa kode runtime dan tanpa teks selalu-dimuat baru. Jika runtime kelak dibangun: tambah batas ukuran per berkas dan total per loop, lampiran di pesan `system` terdepan agar bertahan kompaksi, dan bingkai asal "tidak tepercaya" (MOD-07).
- Lisensi/hak cipta: mekanisme dan daftar kasus ditulis mandiri.
- Perkiraan skala: S (spesifikasi) · M (runtime, bersyarat) · Risiko: rendah (spesifikasi) · Nilai: rendah-sedang · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi: seluruh sumber hooks dibaca penuh, `register.test.ts` penuh. Tidak diketahui: perilaku engine donor di bawah hook; konsumen nyata di Agent Core.
- Disposisi: REFERENSI.

### GCH-06 Koreksi atas GCD-10 dan kasus uji nama/id plugin dari `sec-default` (hanya yang belum ada)
- Sumber: `sec-default/hooks/policy/managed-tools-restored/is-org-tool/` (`folded-name`, `tool-prefix-of`, `spellings-of`, `name-of-id`, `forms-of`, `org-plugin-names`, `org-server-names`), `policy/names-org-tool.ts`, `sec-default/tests/register.test.ts:1662-1700, 1877-1901, 1954-1962, 2124-2178, 2412-2436`. Agent Core: `src/skills/claude-plugin.ts:105-111` (`skillIdentifier`), `src/skills/service.ts:922-938` (tabrakan), `tests/skill-claude-plugin.test.ts`.
- Observasi: GCD-10 menduga adapter plugin Claude tidak memeriksa tabrakan nama terlipat dengan 39 capability. Terverifikasi sebaliknya. `skillIdentifier` melipat nama tampilan dengan NFKD, membuang tanda diakritik, huruf kecil, dan non-alfanumerik menjadi satu tanda hubung (jadi `Code_Review` dan `code review` menjadi `code-review`); nama yang kosong setelah lipat berhenti dengan `SKILL_PLUGIN_NAME_UNMAPPABLE`; dua skill plugin yang menghasilkan identifier sama diblokir keduanya (`SKILL_PLUGIN_MAPPING_COLLISION`); identifier yang sama dengan skill aktif dilaporkan sebagai tabrakan `catalog` (tidak memblokir). Pencocokan adalah kesamaan identifier penuh, bukan awalan. Lipat donor lebih lemah di satu sisi (NFC/NFD dua bentuk, tanpa buang diakritik).
- Nilai untuk Agent Core: Mencegah kesalahan pelaporan GCD-10 dalam proposal. Kasus donor yang masih layak dipetakan sebagai uji tambahan pada adapter: id `@` saja atau `@market` tidak boleh menjadi nama kosong yang cocok dengan semua; id berskop (`@scope/nama@npm`) dipecah pada `@` TERAKHIR; plugin bernama sama dari sumber lain tidak mewarisi pengecualian; entri yang dimatikan tidak membebaskan siapa pun.
- Baseline Agent Core → SUDAH-ADA untuk deteksi tabrakan terlipat dan nama tak terpetakan; SEBAGIAN untuk uji (`grep` mengembalikan 6 kemunculan `collision|NAME_UNMAPPABLE|skillIdentifier` di `skill-claude-plugin.test.ts`; judul tidak mencakup `@`-saja atau pemecahan `@` terakhir karena Agent Core tidak memakai id berformat `nama@sumber` pada adapter).
- Delta/celah: tidak ada untuk deteksi; kasus id `nama@sumber` hanya bila adapter kelak membaca id marketplace. Dicatat sebagai REFERENSI.
- Cara adaptasi: tidak ada perubahan; koreksi ledger.
- Lisensi/hak cipta: mandiri.
- Perkiraan skala: S (hanya bila dikerjakan) · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dengan Read (`service.ts:918-945`, `claude-plugin.ts:105-111`) dan hitungan grep pada uji. Tidak diketahui: isi lengkap `tests/skill-claude-plugin.test.ts` (hanya hitungan kata kunci).
- Disposisi: REFERENSI (koreksi: SUDAH-ADA).

### GCH-07 Anggaran payload diff: header hunk setelah pemotongan dan batas total lintas berkas
- Sumber: donor `views/detail/code-blocks-of/code-blocks-of.ts`, `leading-hunk-of/leading-hunk-of.ts`, `hunk-header-of/hunk-header-of.ts`, `body-budget/body-budget.ts`, `max-body-chars/max-body-chars.ts` (80.000 di bawah batas inang 100.000), `max-body-nodes/max-body-nodes.ts` (1.500 di bawah 2.000), `max-code-chars/max-code-chars.ts` (10.000 per blok). Agent Core: `src/rdc/checkpoints/task-changes.ts:18-22, 128-144, 195-208`.
- Observasi: Donor membelanjakan satu anggaran bersama berurutan per berkas, memotong hunk pada baris utuh, menghitung ulang header `@@ -a,b +c,d @@` dari baris yang tersisa agar hunk terpotong tetap terurai, menandai `isTruncated`, dan mengembalikan sisa ruang ke berkas berikutnya.
- Nilai untuk Agent Core: Muatan `task_changes` dibatasi per berkas, bukan total.
- Baseline Agent Core → SEBAGIAN. `shapeDiff` memotong pada 600 baris dan 24 KB per berkas di batas baris (baris 135-139) dan menyatakan `additions`/`deletions` null bila terpotong (jujur, baris 140-143). `DiffState` sudah memuat `'budget'` (jumlah 40 berkas atau tenggat). Yang belum: header hunk terakhir tidak dihitung ulang setelah pemotongan; tidak ada batas byte TOTAL lintas berkas (40 × 24 KB = 960 KB teks).
- Delta/celah: bila muatan dibaca model (belum diverifikasi apakah `task_changes` masuk konteks model atau hanya UI), tambahkan anggaran total (mis. 128 KB) yang dibelanjakan berurutan dengan status `budget` untuk sisanya; hitung ulang header hunk terakhir. Bila hanya UI, tidak ada tindakan.
- Cara adaptasi: `src/rdc/checkpoints/task-changes.ts` (internal). Tanpa skema tool.
- Lisensi/hak cipta: pola umum.
- Perkiraan skala: S · Risiko: rendah · Nilai: rendah · Butuh skema tool baru: tidak · Menambah teks selalu-dimuat: tidak.
- Bukti vs dugaan: Terverifikasi dari kode kedua pihak. Tidak diketahui: konsumen `task_changes` (UI atau model) dan ukuran muatan nyata.
- Disposisi: REFERENSI.

---

## Bagian C — Ditolak / tidak relevan (alasan spesifik)

- Transport telemetri jarak jauh (`telemetry/hooks/entries/ingest-url`, `batch-of`, `event-data-of`, `telemetry-of.ts` bagian `post`): mengirim ke `api.anthropic.com` dengan kredensial sesi. Ditolak (local-first, tanpa telemetri jarak jauh). Retry satu kali untuk 5xx, 408, 429 SUDAH-ADA dalam bentuk yang lebih kaya di `src/agent-provider-errors.ts:285,306` dan `src/net/outbound-request.ts`. Pengecualian lama (GCA-08) tetap: hanya validator.
- Sidik jari mesin dan lingkungan (`context/*`, `facts`, `deployment`, `config-location`): kolom `device_id`, `email`, `accountUuid`, `organizationUuid`, hash remote, terminal, distro, WSL, ID runner GitHub, ID SWE-bench. Ditolak. Satu-satunya yang menarik (normalisasi URL remote sebelum hash: `host/path` huruf kecil, buang pengguna dan `.git`) sudah menjadi isu GCA-12; tidak ada tambahan.
- Pembaca file konfigurasi global CLI donor (`identity-of.ts` membaca `.claude.json` dan mengambil `userID`, email, id akun): tidak dibaca dan tidak akan dibaca di Agent Core.
- Mesin tier organisasi `sec-default` (`register.ts` outermost, `past-users`, `skill-row`, `tool-register-refusal`, `held-verdict` sebagai runtime, `admission-failure`, pesan penolakan): tidak ada rantai hook berjenjang di Agent Core dan doktrin melarang otoritas berjenjang tersembunyi (C-1 W2). Prinsip-prinsipnya sudah diambil di MOD-03, MOD-17, GCA-09, GCD-09.
- Memo pembacaan kebijakan 500 ms (`create-policy-memo`): Agent Core membaca konfigurasi per panggilan perintah (`configManager.getConfig()`); tidak ada ledakan pembacaan terukur. Tidak ditindaklanjuti, tanpa benchmark.
- Pembacaan properti milik sendiri (`memberOf` memakai `new Map(Object.entries(x)).get(k)` agar `__proto__`/`constructor` tidak terbaca): pola kokoh untuk konfigurasi tak tepercaya. Tidak ditemukan situs rentan di Agent Core (kunci tracker diawali alfanumerik, `JSON.parse` membuat properti milik sendiri); tidak diaudit menyeluruh. Disimpan sebagai pola di Bagian D.
- `diff/hooks/views` tata letak sel terminal (`wrapped-lines`, `cell-width`, jendela baris, dialog pane, tombol): konsep lebar sel dan windowing terminal tidak berlaku pada React/WebView. Kunci tombol `ask:`/`file:` yang diturunkan dari nama yang disanitasi dapat bertabrakan bila dua jalur menghasilkan teks tersanitasi sama (pengamatan donor; Agent Core memakai React, tidak relevan).
- `src/mcp/handler.ts` (admisi): diperiksa. Peta sesi gambar dibatasi 32 entri dan 15 menit; gerbang kontrak gagal-tertutup (`controller-contract.ts:49,87,97`). Tiga turunan "nilai header sesi" memakai normalisasi berbeda (`externalControllerSessionId` memangkas, `contractBinding` memakai nilai mentah, `imageInspectorFor` memangkas); parser HTTP Node sudah membuang spasi tepi dan menggabung header ganda dengan koma, sehingga tidak ada celah yang dapat dicapai. Hanya kerapian: satu fungsi normalisasi header. Tidak diangkat sebagai temuan.
- Pengurai opsi `projectInstructions` lama dan pemberitahuan penggantian nama opsi: migrasi konfigurasi internal donor; Agent Core tidak punya opsi itu.
- `hunkHeaderOf` dan windowing sebagai fitur UI: hanya ide anggaran yang diambil (GCH-07).

---

## Bagian D — Pola lintas-unit dan pertanyaan terbuka

Pola yang berulang dan layak jadi standar (tanpa teks selalu-dimuat):

1. Tulis dan baca diuji pada skema yang sama, tanpa mock di tengah. Donor menguji "tidak ada yang diantre" dengan klien asli melewati seluruh hook; Agent Core memock penulis tracker di `skill-outcome-review.test.ts` sehingga GCH-01 lolos. Standar: satu uji kontrak per jalur bukti yang memakai penyimpanan asli pada root sementara.
2. Validasi di batas, tolak bukan buang, dan ujikan sisi negatif: setelah penolakan, tegaskan efek samping nol (`posts` kosong, tidak ada baris jurnal). Alasan penolakan hanya memuat kunci yang lolos bentuk, tidak pernah nilai pemanggil (GCH-02).
3. Kegagalan bergeser ke arah menambah/mengirim lebih sedikit: walk gagal tidak menambah instruksi; saklar tak terbaca tidak mengirim; kebijakan tak terbaca berlaku; memo kegagalan baca tetap gagal (agents-md, telemetry, sec-default). Standar untuk komponen baru: tulis arah kegagalan dalam satu kalimat di komentar dan satu uji (GCH-03, GCH-04).
4. Pengamat tidak boleh mengganggu alur utama: `quietly` pada donor; di Agent Core komentar `persist` menjanjikan hal sama tetapi sanitizer melempar (GCH-02). Standar: fungsi pencatat bukti tidak melempar ke pemanggil.
5. Rantai pengiriman serial dengan kegagalan per batch ditelan dan dicatat sekali (`sending = sending.then(... .catch(debug))`), kredensial gagal tidak lengket ("a failed authorize is not held against the next batch"), memo konteks direset saat gagal (`context = undefined` di `catch`), badan permintaan yang sama dikirim ulang dengan `eventId` yang sama sehingga retry idempoten. Tidak diadopsi karena tidak ada antrean jarak jauh; polanya layak diingat bila kelak ada antrean lokal berbatas.
6. Gerbang berdasar asal yang dipasang host; asal hilang melempar, galat di gerbang menolak, dan `.catch` hanya memutar ulang jawaban bawah bila sudah dipanggil (`next.called ? next(e) : REFUSED`). Prinsip "jangan jalankan efek samping dua kali saat memulihkan".
7. Daftar adalah pengaman, bukan batas: donor menuliskannya di komentar (`code-loading-variables.ts`). Agent Core sebaiknya menuliskan hal yang sama di `command-manager.ts` dan docs, agar tidak ada yang mengira blokir perintah adalah batas keamanan.
8. Klaim dalam komentar tidak menggantikan penegakan: komentar donor "closed value" dibantah oleh `terminalOf` dan `tags`. Standar: setiap janji "tertutup" punya uji acak yang memeriksa keluaran terhadap himpunan.

Pertanyaan terbuka untuk Main/pemilik:

- Q1. GCH-01: boleh dikonfirmasi dengan uji tracker asli (root sementara) lalu diperbaiki sebagai perubahan satu string? Pembaca per awalan `skill:` belum ditelusuri sampai tuntas.
- Q2. GCH-02: apakah `recordOutcome` boleh berhenti melempar (mencatat penolakan sebagai event) mengingat banyak pemanggil? Dari tujuh pemanggil yang dibaca putaran ini tidak ada yang mengandalkan lemparan untuk alur kontrol, tetapi pemanggil lain belum dibaca.
- Q3. GCH-03: apakah daftar blokir perintah dianggap pengaman penasihat saja (rekomendasi) atau diharapkan lebih ketat? Menentukan apakah baris baru dan `.exe` layak dikerjakan sekarang.
- Q4. GCH-07: apakah muatan `task_changes` masuk ke konteks model? Menentukan perlu tidaknya anggaran total.

Hal yang tidak sempat dibaca atau tidak dibaca penuh (jujur): badan 119 dari 136 uji `sec-default/tests/register.test.ts` dan seluruh badan 18 uji `held-verdict.test.ts` (hanya judul); 16 dari 33 uji `telemetry/tests/register.test.ts` (jalur konteks, GitHub Actions, Linux, Windows) dan 2 dari 7 uji `gate.test.ts`; 103 fixture `sec-default`, 60 fixture `telemetry`, 6 fixture `agents-md`; ±40 berkas non-barrel UI di `diff/hooks/views` (dialog pane, render `sections`, jendela daftar `body/`, lebar sel `layout/`); isi lengkap `tests/skill-claude-plugin.test.ts` dan 19 berkas uji Agent Core yang menyebut `recordOutcome` (hanya daftar nama dan `skill-outcome-review.test.ts` baris 13-36 yang dibuka). Dua klaim perilaku Agent Core (GCH-03 butir 4, GCH-01 eksekusi end-to-end) berasal dari pembacaan kode dan uji string, tidak dari eksekusi kode proyek.
