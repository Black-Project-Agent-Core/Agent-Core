# Workflow Memory — source konsolidasi

Status: konsolidasi source, main build, migrasi metadata offline, dan aktivasi resident Windows sudah terverifikasi pada 16 Oktober 2026. Marker canonical `runtime/memory/state/host/activation.json` berstatus complete dengan rootId tetap; Node Core baru memuat `dist/memory`, dan MCP `memory_status` maupun `memory_v2_read(capabilities)` berhasil. Semua nama tool publik tetap; nama tool tidak menandakan mesin berbeda.

## 1. Startup (sekali saat host dimulai)

`src/index.ts` → `src/memory/host-runtime.ts::initializeAgentCoreMemory` → validasi identitas root dan aktivasi → satu `MemoryService` dari `src/memory/service.ts`.

Host menyuntikkan instance yang sama kepada MCP, Learning, dan controller native. Tidak ada pemilihan kelas legacy dari source lain. Metadata aktivasi lama harus dipindahkan melalui operasi offline yang eksplisit; startup tidak membuat store kosong sebagai pengganti.

Lokasi source: `src/memory`. Hasil main build: `dist/memory`. Data yang sudah ada: `runtime/memory`.

## 2. Permintaan AI eksternal

1. MCP umum menerima permintaan terautentikasi.
2. Registrasi, schema, dan scope khusus memory berada di `src/memory/mcp`.
3. Tool biasa seperti `memory_search`/`memory_remember` memanggil service yang sama. Tool task-scoped `memory_v2_read`/`memory_v2_write` memvalidasi identitas task dari host sebelum memanggil `ControllerMemorySession` dan dispatcher dalam domain memory.
4. Operasi membaca atau mengubah store melalui implementasi memory tunggal. Hasil dibatasi sesuai kontrak masing-masing tool dan dikembalikan melalui MCP.

Task binding bukan engine kedua. Schema bukan database. Transport bukan pemilik data. Jangan menggambar panah setiap request ke startup seolah host runtime memilih mesin pada setiap pencarian.

## 3. Recall

`MemoryService.search` atau `ControllerMemorySession.recall` → snapshot canonical → validasi scope/visibility/waktu/provenance → ranking dan index turunan bila tersedia → proyeksi hasil sesuai budget → pencatatan pengiriman → hasil ke AI.

`src/memory/index.ts` tetap implementasi `MemoryIndex`, bukan barrel export. `src/memory/facade.ts` adalah permukaan export modul. Index dapat dibangun ulang dari data canonical; index bukan owner ingatan. Provider embedding tetap sesuai konfigurasi pengguna dan bukan syarat bahwa setiap operasi baca/tulis membutuhkan GPU.

Read/recall tidak otomatis sama dengan write pengetahuan baru. Jalur tertentu dapat mencatat ledger atau metadata akses. Bukti bahwa hasil terkirim bukan bukti bahwa AI menggunakannya atau tugas berhasil.

## 4. Write dan pengalaman task

- Capture langsung: tool → `MemoryService.remember/update/batch` → validasi → `FileMemoryStore` → transaksi/jurnal → notes/revisions/archive → refresh index turunan.
- Pengalaman task: tool task-scoped → controller session → `MemoryEpisodes` → evidence/event/checkpoint/capsule di store yang sama.
- Koreksi/konsolidasi: preview → pemeriksaan evidence dan revisi + host review → apply melalui pemilik transaksi yang sama.

Data tetap `runtime/memory`; source tidak disimpan di direktori data. Foundation, identitas record, revisi, archive, dan receipt tidak dibuang saat memindahkan source.

## 5. Learning

Learning tetap subsystem pembelajaran dan review umum. Penghubung khusus memory sekarang `src/memory/learning-sink.ts`. Kandidat eligible untuk ingatan umum masuk ke service memory yang sama. Pola kode dapat menuju pemilik pola kode yang sudah ada. Proses review tidak berarti ada model tersembunyi tambahan. Invocate tidak ditambahkan dalam task konsolidasi ini.

## 6. Bukti gambar sebelum perbaikan

Ketujuh gambar pengguna di `evidence/diagrams/` dipertahankan sebagai snapshot sebelum konsolidasi, bukan diagram source yang berlaku setelah perbaikan.

- `Agent-Core-Memory-Workflow-20261016.png` mencampur pemilihan engine saat startup dengan alur request; menampilkan cabang `LEGACY MODE` dan `EXPERIENCE V2` pada dua lokasi. Cabang kelas terpisah itu dihapus dari source baru.
- `01-Agent-Core-Memory-Arsitektur.png` secara eksplisit menempatkan engine aktif dalam `SubProject`. Itu cocok dengan masalah lokasi yang sedang diperbaiki, bukan lokasi akhir yang diminta pengguna.
- `02-Agent-Core-Memory-Retrieval.png`, `03-Agent-Core-Memory-Write-Transaction.png`, dan `04-Agent-Core-Memory-Task-Learning.png` memisahkan beberapa proses yang memang berbeda, tetapi menunjuk path sebelum pemindahan. Struktur data/otorisasi tidak boleh dihapus sekadar untuk menyederhanakan gambar.
- `mermaid-diagram (1).png` dan `mermaid-diagram (2).png` adalah diagram konseptual; keduanya tidak cukup untuk memastikan pemilik source, urutan startup, atau kesetaraan compiled/runtime.

Gambar bukan bukti bahwa setiap cabang telah dieksekusi. Peta ini harus selalu dibaca bersama source dan laporan konsolidasi terbaru. Riwayat diagram tidak dipakai sebagai arahan untuk membangun ulang subproject.
