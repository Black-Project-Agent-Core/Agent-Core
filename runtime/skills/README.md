# Rumah Skill canonical — runtime/skills

Folder ini adalah rumah Skill yang pertama dipakai dan harus dihormati. Setelah koreksi pengguna 2026-10-27, sumber dan artifact/state terkelola berada di bawah induk ini. Sumber yang diedit manusia/AI adalah [capability-packs](capability-packs/README.md); katalog aktif dan revisi tetap dikelola SkillService. Pemetaan terpelihara: [Engineering Skills — Storage ownership](../../docs/External-Engineering-Skills.md#storage-ownership).

| Lokasi | Tujuan dan penulis |
| --- | --- |
| `capability-packs/<skill-name>/` | Satu rumah sumber yang dipelihara proyek; dipindahkan dari rumah luar ke dalam induk existing. |
| `catalog/<skill-name>/` | Artifact aktif immutable; import/promote/rollback oleh SkillService. |
| `revisions/<skill-name>/staged/<digest>/` | Kandidat revisi tervalidasi; staging oleh SkillService. |
| `revisions/<skill-name>/history/<digest>/` | Snapshot revisi terdahulu untuk rollback; dikelola SkillService. |
| `revisions/<skill-name>/retired.json` | Catatan pensiun (alasan, bukti, pengganti); ditulis `retire`, dihapus saat dipulihkan atau diimpor ulang. |
| `.staging/` | Transaksi tulis/aktivasi dan build proposal sementara; bukan sumber permanen. |
| `packages/` | Artifact `.skill` keluaran packaging SkillService. |
| `exports/claude/`, `exports/codex/` | Ekspor profil host; dibuat melalui `render_export`. |
| `proposals/<workspace>/` | State/proyeksi canonical proposal Skill milik Learning. Mirror manusia-baca memakai alur docs/proposals existing. |
| `tooling/` | Konfigurasi integrasi tooling lokal existing; bukan katalog atau rumah sumber lain. |

**Dilarang membuat rumah Skill di luar folder lama ini atau membuat ulang bundled-skills.** Gunakan child `capability-packs` untuk sumber dan role existing untuk artifact/state. Jangan author di root atau catalog, membuat `catalog-new`, `backup`, `v2`, atau menyalin folder aktif untuk diedit. Perubahan isi Skill tetap melalui sumber dan lifecycle owner-nya. Sebelum membuat folder, semua agent termasuk Raka wajib memeriksa [peta struktur proyek](../../docs/PROJECT-STRUCTURE.md) dan filesystem aktual.

Katalog tidak harus mempunyai jumlah entri yang sama dengan bundled source: proposal dan Learning dapat menghasilkan artifact sendiri. Source/catalog yang identik, kandidat yang berbeda dari active, dan riwayat rollback adalah keadaan yang sah. Jangan menghapusnya hanya berdasarkan kesamaan nama, umur, atau perbedaan digest.

Audit 2026-10-27: 40 sumber cocok dengan 40 artifact katalog, ditambah 2 Skill hasil Learning/proposal dan 1 artifact historis `scientific-critical-thinking`. Sebanyak 17 history dan 1 kandidat staged menyimpan revisi unik. Artifact historis tidak dipindah/dihapus manual. Pembaruan 2026-11-01: aksi `retire` (konfirmasi `RETIRE_SKILL`, digest aktif yang tepat, bukti) memindahkan Skill aktif ke riwayat revisi dan menulis `revisions/<skill-name>/retired.json`; `list_retired` menampilkannya dan `rollback_revision` dengan digest yang dipensiunkan mengembalikannya. Tidak ada penghapusan langsung. Penggabungan 2026-11-01: 24 Skill yang isinya bersambung atau sama dipensiunkan ke lima Skill baru (`app-replica`, `requirements-and-planning`, `delivery-and-release`, `debugging-and-observability`, `frontend-and-browser-testing`) dan tiga Skill yang sudah ada (`code-review-and-quality`, `performance-oriented-software-engineering`, `agent-core-capability-index`); sumber 24 pack lama dihapus dari `capability-packs`, riwayatnya tetap di `revisions/<nama>/history`. Pemetaan lengkap: [Capability-Index](../../docs/Capability-Index.md#penggabungan-2026-11-01).

Hanya subtree sumber dan README ini yang dibuka untuk source control dan packaging; katalog, Memory, history, tooling dan state lokal tetap dikecualikan. Provenance historis boleh menyebut path sebelum migrasi; itu bukti asal, bukan instruksi membuat ulang rumah luar.

Aturan wajib berada di [AGENTS.md — Storage ownership](../../AGENTS.md). `npm run path:check` menolak rumah luar/role alternatif yang dikenali, nama artifact tidak valid, entrypoint yang salah, serta symlink/junction pada boundary penyimpanan. Pemeriksa tidak memodifikasi file, memigrasi data, menghapus history, atau menggantikan validasi isi/digest.
