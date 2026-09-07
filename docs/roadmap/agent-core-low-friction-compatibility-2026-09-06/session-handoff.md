# Agent Core Low-Friction Compatibility: Session Handoff

Tanggal: 6 September 2026 (Asia/Jakarta)
Paket: agent-core-low-friction-compatibility-2026-09-06
Versi dokumen: 1.0

## Jawaban status yang harus dipakai sesi berikutnya

Usulan A-N sebelumnya hanya ada di chat. Pada tugas dokumentasi ini usulan tersebut telah ditulis menjadi paket desain dan implementation plan baru. Ini bukan klaim perubahan izin atau source telah diterapkan.

Lokasi dokumentasi pada mesin yang diperiksa:

```text
E:\Projects\Agent-Core\docs\roadmap\agent-core-low-friction-compatibility-2026-09-06\
  design.md
  implementation-plan.md
  session-handoff.md
```

Baca [design.md](design.md) lalu [implementation-plan.md](implementation-plan.md). File ini adalah pintu masuk, bukan ringkasan pengganti kedua dokumen itu.

## Status aktual pada penulisan paket

| Bagian | Status |
|---|---|
| Desain A-N dan batas otoritas | Ditulis dalam design.md |
| Urutan kerja, dependensi dan acceptance | Ditulis dalam implementation-plan.md |
| Task T00-T15 | NOT_STARTED |
| Implementasi source / tes fitur baru | Belum dilakukan |
| Build / regression / benchmark baru | Belum dijalankan |
| Aktivasi mandat atau perubahan izin live | Tidak dilakukan |
| Restart / deployment / cutover | Tidak dilakukan |
| Commit / push paket baru | Tidak dilakukan |
| Remote branch / SHA equality paket baru | Belum diverifikasi |

Laporan verifikasi file disimpan terpisah setelah write/readback; jangan menyimpulkan tests aplikasi lulus dari keberhasilan validasi dokumen. Salinan unduhan bukan bukti GitHub publication atau encrypted Memory Remote synchronization.

## Baseline inspeksi yang wajib diverifikasi ulang

Pada 2026-09-06T04:12:34+07:00:

```text
Workspace inspected: E:\Projects\Agent-Core
Branch: main
HEAD: 6b674c1f95a677dea5cb57263bb5b8b863faff5b
Working tree: banyak tracked/untracked changes sebelum paket baru ditulis
Runtime status reported: Agent Core 0.7.0, Node 24.18.0, OAuth2
Memory schema reported: 4
Memory/execution: healthy pada snapshot
```

HEAD bukan manifest source live karena ada dirty overlay. Jangan commit semua perubahan yang terlihat, jangan reset hard, jangan mengganti active runtime dengan worktree candidate tanpa gate.

## Lingkup pekerjaan ini

Tujuan: model/host yang mengikuti kontrak dapat bekerja dalam mandat operator tanpa menghafal route lifecycle atau mengulang izin yang sama. Workflow advisor terpisah dari evaluator operasi; diagnostic terstruktur; mandate scoped/revocable; context recovery; receipt/reconciliation; concurrency; memory applicability; bounded bootstrap; compatibility testing; friction observability.

Tidak ada izin bypass dalam paket ini. Approved operation yang tertahan administratif boleh dipulihkan oleh server setelah policy check. Operasi di luar mandat tetap memerlukan wewenang yang sesuai. Model tidak boleh memalsukan declared effects, memilih route yang lebih luas untuk mengakali denial, atau mengubah kebijakan live sendiri.

## Hubungan dengan dua lampiran lama

Agent-Core-Cross-Session-Memory-Nervous-System-Handoff(2).md tetap berlaku untuk program memory miliknya. Gunakan Codespace untuk implementasi program itu dan modifikasi DMF pada T11; jangan fallback ke instance Mac. Catatan schema2->3 dan status Phase1 di lampiran adalah riwayat, bukan perintah menurunkan schema4 yang sekarang teramati.

Memory Observatory.txt tetap memegang observer-only, shadow ports privat, replay faktual, 19 task dan cutover berizin. Sumber plan itu di branch plan/memory-observatory-shadow-mode menurut lampiran, belum dibaca dari remote dalam tugas ini. Tidak ditemukannya file pada roadmap lokal bukan bukti remote plan hilang.

Paket baru adalah companion plan. Tidak menimpa atau menyatakan selesai plan memory/Observatory yang lama.

## Urutan melanjutkan

1. Discover tool connector yang benar dan panggil status nyata. Jangan menyatakan connector unavailable tanpa percobaan nyata.
2. Baca paket di atas melalui Agent Core; periksa file hash terhadap laporan verifikasi bila tersedia.
3. Ketika implementasi diminta, kerjakan T00: verifikasi base/branch/dirty overlay, buat candidate worktree terisolasi, ambil baseline source/tests yang benar. Pekerjaan DMF menggunakan Codespace. Windows acceptance pada candidate Windows, bukan root live.
4. Lanjut T01 RED: task terminal harus bisa selesai dengan nextCandidates:[] dan projectTerminal:false. Jangan men-disable guard atau menambah kandidat fiktif untuk menyembunyikan bug.
5. Ikuti dependency table T00-T15; setiap checkpoint RED -> GREEN -> regression -> scoped review -> evidence. Commit/push sesuai otorisasi publikasi ke branch yang jelas, tanpa force, dengan readback.
6. Tandai task selesai hanya sesudah evidence nyata. NOT_TESTED/UNSUPPORTED bukan PASS. Cutover tetap gate terpisah.

## Instruksi siap pakai untuk sesi berikutnya

```text
Lanjutkan paket Agent Core Low-Friction Compatibility, bukan brainstorming ulang:
E:\Projects\Agent-Core\docs\roadmap\agent-core-low-friction-compatibility-2026-09-06\session-handoff.md

Baca design.md dan implementation-plan.md pada folder yang sama.
Verifikasi lokasi, Git/worktree, source aktual dan status publication sebelum coding.
Mulai T00 baseline candidate, lalu T01 RED, dan lanjut sesuai dependency table.
Jangan menganggap plan sudah di-commit/push atau fiturnya sudah diterapkan.
Jangan build, mengubah kebijakan, atau restart root live untuk menguji candidate.
Pertahankan single DMF, guardrail memory, Codespace-only untuk program memory,
observer-only Observatory, redaction, non-force publication dan separate cutover approval.
```

## Stop/resume record untuk pelaksana

Checkpoint berikutnya harus menyebut task terakhir, exact candidate SHA/diff, evidence path, remaining failures, publication status dan next task. Tidak menyimpan secret atau private chain-of-thought. Jika berhenti setelah side effect tetapi sebelum receipt, tandai UNKNOWN dan rekonsiliasi; jangan mengulang otomatis.
