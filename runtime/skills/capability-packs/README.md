# Sumber capability pack di rumah Skill existing

Folder ini berada di `runtime/skills/capability-packs`, di dalam rumah Skill yang lebih dahulu ada: `runtime/skills`. Koleksi sumber dipindahkan ke sini setelah koreksi pengguna 2026-10-27; rumah luar `bundled-skills` sudah dihentikan. Setiap Skill memakai satu subfolder canonical dengan `SKILL.md` langsung di dalamnya.

```text
capability-packs/
  README.md
  <skill-name>/
    SKILL.md
    references/       # bila paket memerlukannya
    scripts/          # bila paket memerlukannya
```

Edit Skill di sini, kemudian gunakan `SkillService` untuk validasi, staging dan promosi. Jangan membuat ulang `bundled-skills` atau sumber lain di luar rumah lama, maupun authoring langsung di catalog. Jangan menaruh katalog aktif, hasil build, paket ekspor, instalasi dependency atau backup di root koleksi sumber ini.

Salinan aktif mengikuti [panduan rumah Skill](../README.md) dan [pemetaan owner](../../../docs/External-Engineering-Skills.md#storage-ownership). Skill yang dibangun langsung oleh proposal/Learning tetap dimiliki lifecycle tersebut; keberadaannya di katalog tidak mengizinkan pembuatan rumah sumber manual lain.

Paket harus tetap mandiri: lisensi dan referensi artifact-local yang sama boleh dibutuhkan oleh beberapa paket. Menghapusnya atau menggantinya dengan tautan ke luar artifact dapat merusak packaging dan pembacaan referensi.

Aturan wajib: [AGENTS.md — Storage ownership](../../../AGENTS.md). Pemeriksaan struktur dijalankan melalui `npm run path:check`; validasi isi dan digest tetap milik SkillService.
