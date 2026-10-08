# Baseline Linux Agent Core Memory

Tanggal verifikasi: **7 Oktober 2026 UTC**. Gate **G0 selesai**: baseline bisa dibangun dan diuji di cloud Linux dengan dependency terkunci. Ini bukan klaim bahwa fitur T1–T9 sudah tersedia.

## Scope dan provenance

- Source yang diuji: `09eb7e1eabb8c77963074b1e879c2d3b5006634c`, branch `feat/memory-evolution`, working tree bersih sebelum T0.
- Perbedaan terhadap baseline source pada desain, `dbaab11a8ed922406ed2085ba8822d54bf79b5b4`, hanya dua file dokumentasi. Source produk, package ranges, `tsconfig.json`, export root, dan tiga test files asli tidak diubah dalam T0.
- T0 menambahkan lockfile, lima characterization tests, dan dokumentasi verifikasi/progress. Tidak ada fix produksi yang diperlukan.
- Semua store pengujian bersifat synthetic di root temporary. Writer dan reader pada smoke tambahan adalah dua proses Node terpisah; reader berjalan setelah writer keluar.
- Build membuat ulang `dist/`. Eksekusi suite juga membuat runtime tracker activity files pada checkout sebagai efek samping tracker baseline. Isinya berasal dari aktivitas test; canonical memory fixtures tetap berada pada temporary roots. `dist/` dan `runtime/` ignored oleh Git, dan package dry-run tidak memasukkan runtime tracker. File tersebut tidak dihapus atau diubah sebagai cleanup T0.
- Field verification pada `EXTRACTION-MANIFEST.json` adalah catatan ekstraksi historis. Hasil Linux baru di bawah berasal dari eksekusi 7 Oktober 2026.

## Toolchain dan dependency

| Komponen | Versi yang benar-benar digunakan |
|---|---|
| OS | Debian GNU/Linux 13.6, Linux x86_64, kernel 6.18.44 |
| Node.js | 24.19.0; memenuhi `>=24.15.0` |
| npm | 11.9.0 |
| TypeScript | 7.0.2 |
| Vitest | 4.1.11 |
| proper-lockfile | 4.1.2 |
| zod | 4.6.5 |
| @types/node | 24.19.1 |
| @types/proper-lockfile | 4.1.4 |

Lockfile v3 memiliki 99 dependency entries, termasuk optional dependencies lintas-platform. Review memeriksa bahwa setiap resolved URL berasal dari `https://registry.npmjs.org` dan setiap integrity memakai SHA512. Dependency ranges tetap identik dengan baseline. `npm ci --ignore-scripts` memasang 57 packages pada Linux ini; tidak ada install script yang perlu diaktifkan. Satu entry dengan install script, `fsevents`, adalah optional dependency platform Darwin.

Resolusi awal gagal dengan `ENOENT` karena default npm cache tidak tersedia. Retry dengan cache temporary yang writable pada registry resmi berhasil. Tidak ada penggantian registry, pengubahan range, atau bypass akses.

npm mengeluarkan warning konfigurasi environment `http-proxy` yang tidak dikenali. Warning tercatat, tidak menyebabkan kegagalan, dan konfigurasi mesin tidak diubah.

## Reproduksi

Jalankan dari root repository pada Node yang memenuhi package engines. Built-package process smoke memerlukan hasil build, jadi urutannya adalah build sebelum test.

```bash
node --version
npm --version
git rev-parse HEAD
git status --short

# Setelah lockfile ini direview, instalasi normal memakai lockfile.
NPM_CACHE="${TMPDIR:-/tmp}/agent-core-memory-npm-cache"
npm ci --ignore-scripts --registry=https://registry.npmjs.org/ --cache="$NPM_CACHE"
TZ=UTC npm run build
TZ=UTC npm test
TZ=UTC npm run verify

# Nama test dan hasil individual, opsional untuk pemeriksaan.
TZ=UTC npm test -- --reporter=verbose
```

Perintah yang menetapkan lockfile pada T0 adalah `npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/`, dengan cache writable dan bounded fetch timeout/retries. Jangan menjalankan ulang resolusi sebagai pengganti `npm ci` ketika memverifikasi baseline terkunci.

## Perintah dan hasil aktual

| Perintah | Exit | Hasil |
|---|---:|---|
| Lock-only resolution awal | 1 | Cache environment tidak tersedia; bukan kegagalan produk |
| Lock-only resolution dengan cache writable | 0 | Registry resmi, ranges tidak berubah |
| Review lock origins/ranges/integrity | 0 | 99 entries diperiksa sebelum instalasi |
| `npm ci --ignore-scripts` | 0 | 57 packages terpasang |
| `npm ls --depth=0` | 0 | Versi sesuai tabel |
| `npm run build`, source asli | 0 | TypeScript build |
| Test suite asli, verbose dan exclude test T0 | 0 | 3 files, 14/14 tests |
| Characterization draft pertama | 1 | 3 pass, 2 kesalahan fixture; detail di bawah |
| Characterization setelah koreksi fixture | 0 | 5/5 tests |
| `TZ=UTC npm run build`, final | 0 | Build fresh |
| `TZ=UTC npm test`, final | 0 | 4 files, 19/19 tests |
| `TZ=UTC npm run verify`, final | 0 | Build dan 19/19 tests |
| Full suite verbose + JSON report | 0 | 19 passed, 0 failed, 0 pending |
| `npm pack --dry-run --ignore-scripts --json` | 0 | 239 file paths; boundary check lolos |
| `git diff --check` | 0 | Tidak ada whitespace error |

Dua failure awal characterization adalah kesalahan pada test draft: assertion memakai body sebelum normalisasi whitespace, dan fixture forget memakai `feedback()` padahal API yang sesuai adalah `lifecycle()`. Investigasi source mengonfirmasi kedua penyebab tersebut. Fixture diperbaiki, tanpa mengubah produk. Tidak ada failure baseline asli, regression produksi baru, atau intentional failing test tersisa.

## Test yang dieksekusi

`tests/memory-integrity-repair.test.ts` (11):

1. rejects empty foundation without fabricating healthy memory
2. rejects nul foundation without fabricating healthy memory
3. rejects mixed foundation without fabricating healthy memory
4. rejects unrelated foundation without fabricating healthy memory
5. rejects binary foundation without fabricating healthy memory
6. retains valid heading, Unicode, CRLF and optional BOM
7. uses the same BOM-normalized offsets for metadata and content
8. rejects binary ordinary content before serialization
9. propagates post-start corruption through health and prevents writes; valid repair recovers
10. reports a binary ordinary note while preserving the healthy note
11. parses BOM metadata without adding a closing-header character to adjacent content

`tests/memory-phase8-10.test.ts` (2):

1. uses semantic vectors, conservative evolution, and proposal-only consolidation
2. falls back to deterministic retrieval when query embedding fails

`tests/standalone-smoke.test.ts` (1):

1. persists and recalls canonical memory across service restarts

`tests/memory-baseline-contract.test.ts` (5):

1. serializes the full record even when delivery contains only a budgeted preview
2. applies current expiry filtering before an asOf query from before expiry
3. applies currently active supersession before an asOf query from before the link interval
4. applies current forgotten lifecycle to asOf search while retaining canonical content
5. recalls a built standalone record after the writer process exits in a temporary root

## Gap baseline yang tetap terlihat

- Legacy `search()` masih menyertakan body lengkap pada `record` dalam JSON return, walaupun `delivery` sudah berupa preview. `budgetChars` belum menjamin ukuran JSON return legacy. T1 menyediakan kontrak public compact-first baru.
- Legacy service masih memilih kandidat memakai status expiry/supersession/forgotten saat ini sebelum memproses `asOf`. Parameter itu belum merupakan historical fact query. T6 memiliki semantics temporal yang baru; forgotten visibility tetap merupakan boundary tersendiri.
- Characterization merekam perilaku yang ada, bukan kriteria keberhasilan fitur baru. T0 tidak mengimplementasikan facade, episode, archive, capsule, promotion, atau query temporal baru.

## Artifact identity dan batas verifikasi

SHA256:

- `package-lock.json`: `f6e124f787c9b5958bdb2bcd13a1076a8018be525b40c75458f4b0b65db03505`
- `tests/memory-baseline-contract.test.ts`: `fadd06bb2428263fcb60943945d4b8f87004478194c948d3cfcb6529cbd1078d`
- Sorted build manifest: `f43333f8b63b0c6fa173d22b7780e2b4a737afa50dfed8511cb0d1ce269da841`

Build manifest dibuat dengan `LC_ALL=C find dist -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum`, lalu file manifest di-hash dengan SHA256. Ini identity hasil build T0, bukan benchmark performa atau jaminan lintas-toolchain.

Raw stdout/stderr, JSON test report, dan per-file artifact manifest disimpan sebagai artifact verifikasi terpisah, tidak di repository. Inventory manifest/package tidak memuat path runtime, secrets, backups, `.env`, atau raw logs. Pemeriksaan boundary ini bukan audit keamanan menyeluruh.

Tidak ada test skipped atau pending dalam 19 tests. Belum dijalankan: Windows/macOS, live Cloudflare/model/API, benchmark latency, failure injection lintas-proses, dan evaluasi fitur T1–T9. Fake embedder pada suite asli tidak membuktikan layanan eksternal.

Langkah berikutnya: **T1, progressive disclosure**, sesuai [progress implementasi](../progress/memory-evolution.md).
