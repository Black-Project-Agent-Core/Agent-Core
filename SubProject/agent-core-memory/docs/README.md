# Dokumentasi Agent Core Memory

## Status dan panduan aktif

Engine ini tersedia sebagai package mandiri dan diimpor ke `SubProject/agent-core-memory` pada monorepo Agent Core. Integrasi host memilih engine melalui activation marker; package ini tidak menjalankan server Memory kedua.

- [README package](../README.md): API, build mandiri, default storage, dan integrasi host.
- [Controller integration dan transfer/2](controller-integration.md): scope yang diikat host, continuation, budgets, dan isolated restore.
- [Patch lokal](../PATCHES.md): perbedaan terhadap import upstream yang dipin.
- [Instalasi host](../../../docs/Agent-Core-Memory-v2-Installation-20261008.md) dan [live acceptance host](../../../docs/Agent-Core-Memory-v2-Live-Acceptance-20261009.md): catatan lingkungan integrasi Agent Core, bukan hasil uji checkout pembaca.

## Riwayat desain dan verifikasi

[Rencana evolusi 7 Oktober 2026](plans/2026-10-07-agent-core-memory-evolution.md) mempertahankan konteks review awal. Status usulan dan checkbox di dalamnya tidak lagi menjadi daftar pekerjaan aktif: [progress evolusi](progress/memory-evolution.md) mencatat T0–T9 dan final independent review selesai.

- [Progressive disclosure (T1)](verification/memory-disclosure.md)
- [Preservation (T2)](verification/memory-preservation.md)
- [Episodes (T3)](verification/memory-episodes.md)
- [Capsule/freshness (T4)](verification/memory-capsules.md)
- [Consolidation/promotion (T5)](verification/memory-promotion.md)
- [Temporal (T6)](verification/memory-temporal.md)
- [Retention/safety (T7)](verification/memory-retention-safety.md)
- [Lifecycle evaluation (T8)](verification/memory-evolution-results.md)
- [Controller/transfer (T9)](verification/memory-controller-transfer.md)
- [Final integration acceptance](verification/memory-integration.md)

Hasil 503 tests dan package consumer adalah bukti historis synthetic Linux yang tercatat, bukan pengujian baru pada refresh dokumentasi. Status pending di bagian fase lama dibaca bersama keputusan gate berikutnya. Bukti Windows host yang lebih baru tetap berscope; full Windows regression, real cross-provider continuation, dan Native-Agent-specific acceptance tidak otomatis dianggap lulus.
