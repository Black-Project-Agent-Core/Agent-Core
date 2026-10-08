# Dokumentasi Agent Core Memory

## Rencana untuk direview

- [Rencana evolusi Agent Core Memory, 7 Oktober 2026](plans/2026-10-07-agent-core-memory-evolution.md): desain, baseline source, adaptasi Cookbook, kontrak API usulan, tahap implementasi, evaluasi, dan keputusan yang perlu direview.

Status dokumen tersebut adalah **usulan desain dan rencana implementasi**, bukan fitur yang sudah tersedia atau persetujuan untuk mulai implementasi. Source produk tidak diubah dalam pekerjaan dokumentasi ini.

Untuk penggunaan engine yang sudah ada, lihat [README utama](../README.md).

Status pelaksanaan terbaru tersedia pada [progress evolusi](progress/memory-evolution.md). Bukti tahap capsule/freshness tersedia pada [verifikasi T4](verification/memory-capsules.md); persetujuan rencana tidak menggantikan review hasil setiap fase.

- [Retention, safety and receipt integrity (T7)](verification/memory-retention-safety.md): archive/restore, immutable replay, nested visibility, safety and verification boundaries; G7 reviewed; see current progress for gate history.

## Controller integration and T9

- [Controller contract and transfer/2](controller-integration.md): host-bound identity, allowlisted request flow, budgets, complete isolated restore and knowledge-only limits.
- [T9 verification](verification/memory-controller-transfer.md): deterministic continuation, preservation and Linux portability evidence; G9 independent review pending. Live autonomous controllers and the separate Windows matrix are NOT RUN.

The design document above preserves the original planning-stage status. T0–T8 have since passed their independent gates; the progress document records implementation chronology.
