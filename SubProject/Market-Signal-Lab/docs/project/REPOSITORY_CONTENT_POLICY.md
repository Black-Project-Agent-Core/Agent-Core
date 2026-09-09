# Market Signal Lab — Repository Content Policy

Dokumen ini adalah aturan permanen untuk setiap push, commit dokumentasi, dan pengelolaan release Market Signal Lab.

## 1. README.md

README adalah sumber informasi evergreen tentang **produk**, bukan riwayat versi.

README boleh menjelaskan:

- apa itu Market Signal Lab;
- tujuan alat;
- masalah market yang ingin diselesaikan;
- cara kerja tingkat tinggi;
- filosofi Observed Market;
- kemampuan inti secara singkat;
- privacy/local-first;
- security boundary;
- cara menjalankan aplikasi;
- struktur dokumentasi;
- project guardrail;
- link umum menuju Releases dan docs.

README **tidak boleh** menjadi tempat untuk:

- nomor versi aktif;
- Alpha/Beta/release number pada judul;
- changelog per versi;
- What's New;
- daftar bug/fix suatu versi;
- known issues suatu versi;
- verification baseline per release;
- release-specific upgrade notes;
- daftar fitur panjang yang hanya berlaku pada milestone tertentu.

Jika fitur disebut di README, jelaskan sesingkat mungkin. Detail lengkap masuk ke GitHub Releases dan dokumentasi teknis.

## 2. GitHub Releases — canonical version/changelog source

GitHub Releases adalah **satu-satunya sumber informasi release-specific yang lengkap dan canonical**.

Setiap release boleh/harus memuat sesuai kebutuhan:

- version / release number;
- release title;
- changelog untuk release tersebut;
- overview;
- What's New;
- New Features;
- Improvements;
- Changed Behavior;
- Bug Fixes;
- Errors fixed;
- Known Issues;
- Breaking Changes;
- Compatibility notes;
- Database/data migration notes;
- Upgrade notes;
- QA / verification summary;
- Windows build artifacts;
- source snapshot;
- checksums;
- Browser Companion artifact bila relevan.

Prinsip: **README menjelaskan alatnya; Releases menjelaskan versi, changelog, fitur lengkap, error, bug, fix, dan apa yang baru.**

## 3. CHANGELOG.md

Jangan membuat `CHANGELOG.md` sebagai sumber versi kedua yang menduplikasi GitHub Releases.

Jika file `CHANGELOG.md` sudah ada karena kebutuhan tooling lama, isinya hanya boleh menjadi pointer singkat menuju GitHub Releases dan tidak boleh memuat release history lengkap. Informasi version/changelog canonical tetap hanya berada di **GitHub Releases**.

## 4. docs/

- `docs/specs/` — design contracts.
- `docs/plans/` — implementation plans.
- `docs/qa/` — QA dan verification reports.
- `docs/checkpoints/` — continuation checkpoints lintas sesi.
- `docs/project/` — policy permanen proyek.

## 5. Data yang dilarang masuk repository

Walaupun repository bersifat private, jangan commit/push:

```text
Envato personal token
Authorization headers
cookies
browser local/session storage
raw authenticated sessions
%LOCALAPPDATA%\MarketSignalLab\ database
real local scan history
personal runtime logs containing secrets
raw private API payloads containing credentials
```

## 6. Source dan build artifacts

Source code, tests, locale, specs, plans, QA, manifests, dan Browser Companion boleh disimpan.

Binary besar seperti `.exe` dan release ZIP ditempatkan sebagai **GitHub Release artifacts** untuk distribusi remote dan pada `E:\Market-Signal-Lab\release-stable\` untuk canonical local stable runtime. `release-stable/` di-ignore oleh Git agar binary tidak memenuhi source history.

Stable artifact **tidak boleh hanya berada di `.worktrees`, `dist/.worktrees`, temporary build directory, atau folder isolasi lain** yang secara desain dapat dihapus. Setelah sebuah kandidat dinyatakan stable/released, exact verified bytes harus dipromosikan keluar dari worktree ke `release-stable` dan diverifikasi ulang melalui SHA-256, tanpa rebuild jika kandidat sudah signed-off.

Worktree lifecycle dan integrasi root diatur oleh `docs/project/WORKTREE_INTEGRATION_POLICY.md`.

## 7. GitHub Actions

GitHub Actions/CI **DILARANG** untuk MSL berdasarkan instruksi operator yang berlaku. Local verification adalah execution authority. Jangan menjalankan, rerun, dispatch, atau menjadikan GitHub-hosted CI sebagai syarat push, integration, release, recovery, atau verifikasi ulang atas build yang sudah stable secara lokal.

Larangan ini hanya boleh berubah jika operator secara eksplisit mengganti policy permanen ini di masa depan.

## 8. Canonical root dan worktree

`E:\Market-Signal-Lab` adalah canonical integrated project root. `.worktrees` dan `dist/.worktrees` hanya temporary isolation. Sebuah task belum dianggap selesai terintegrasi hanya karena branch/worktree sudah clean atau pushed; accepted work harus masuk ke canonical root integration branch atau terdokumentasi jelas sebagai intentionally separate/unreleased. Stable executable, installer, dan launcher tidak boleh bergantung pada worktree path.

## 9. Project scope saat ini

Fokus utama MSL tetap **Trends & Insights market**. Portfolio evaluation, rejection prediction, review readiness, dan submission intelligence ditunda sampai mesin Trends & Insights terbukti berguna melalui penggunaan nyata dan backtesting.
