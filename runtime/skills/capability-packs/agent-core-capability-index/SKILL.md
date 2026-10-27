---
name: agent-core-capability-index
description: Compact router for 39 task-specialized capabilities. Always evaluate mind-control for coding and any other reasoning task; load the remaining workflows only when selected.
license: MIT
metadata:
  adapter-revision: "3"
---

# Capability index

## Triggers
- Every task requires relevance assessment; this index routes to matching capabilities.

## Non-triggers
- Full child workflows are not loaded for unrelated tasks.

## Mandatory routing workflow
1. Assess the current goal against the purposes below. Before topical relevance, apply the `mind-control` activation gate: select and fully read it for every coding task and for any other task that requires reasoning or judgment; skip it only for non-coding work that is routine, mechanical, deterministic, and needs no reasoning. Select the remaining skills only when materially relevant; explain a no-match decision briefly without reading every child skill.
2. Inspect each selected name with `skills(action=inspect)`. Read its exact active digest using `skills(action=read, expectedActiveDigest, maxBytes=8192)`, following every `nextOffset` until null. Load only referenced sections needed for the task.
3. Apply the selected workflow to real decisions, actions and verification. Record applied/adapted use through the existing Native strategy artifactUse or external controller_learning artifact_receipt, with exact revision and action evidence. Read/inspect/search alone is not actual use. Skip a capability only when unrelated; unavailable tools are an explicit limitation, not a silent skip.
4. Reassess after a material task change or failed approach. Keep existing task grants, user authorization, safety and cancellation. Upstream tool names are adapted by each Skill; use existing owners and do not run all examples automatically.
5. Preserve one concise usage notice for actual meaningful use. The host can enforce read coverage before accepting use, but semantic relevance and claimed benefits still require evidence.

## Replica: app reconstruction only
| Capability | Purpose |
|---|---|
| replica-architect | Rancang stack, data dan API clone dari hasil recon. |
| replica-backend | Tambahkan auth, database, pembayaran dan integrasi backend clone. |
| replica-brand | Buat nama, warna, suara dan identitas asli bagi clone. |
| replica-build | Bangun ulang layar dan flow clone sebagai potongan fungsional. |
| replica-deploy | Siapkan deployment clone, domain dan pemeriksaan produksi. |
| replica-design | Turunkan token desain dan spesifikasi komponen clone. |
| replica-diff | Bandingkan kelengkapan fitur dan layout clone dengan acuan. |
| replica-entrepreneur | Riset ulasan publik untuk gap produk dan positioning clone. |
| replica-launch | Siapkan landing page, harga dan listing peluncuran clone. |
| replica-recon | Petakan layar, flow dan fitur aplikasi acuan; app reconstruction/recon. |
| replica-test | Uji flow, edge case dan bug clone dengan bukti e2e. |

## Engineering: choose the current phase
| Capability | Purpose |
|---|---|
| api-and-interface-design | Rancang kontrak API, tipe dan batas modul yang stabil. |
| browser-testing-with-devtools | Verifikasi UI di browser nyata: DOM, console, network dan profil. |
| ci-cd-and-automation | Rancang pipeline build, tes dan deployment otomatis. |
| code-review-and-quality | Review diff untuk correctness, maintainability dan risiko regresi. |
| code-simplification | Kurangi kompleksitas kode sambil mempertahankan perilaku. |
| constraint-driven-development | Tetapkan standar mutu dan jaga agar pemeriksaan tidak dilemahkan. |
| context-engineering | Susun aturan, indeks dan konteks relevan secara bertingkat. |
| debugging-and-error-recovery | Reproduksi masalah, cari akar penyebab, perbaiki dan verifikasi. |
| deprecation-and-migration | Rencanakan penggantian API, sistem atau skema dengan transisi aman. |
| documentation-and-adrs | Catat perilaku, keputusan arsitektur dan bukti verifikasi. |
| doubt-driven-development | Uji asumsi keputusan penting dengan review independen terarah. |
| frontend-ui-engineering | Bangun UI responsif, aksesibel dan lengkap state-nya. |
| git-workflow-and-versioning | Kelola branch, konflik, commit dan versi saat operasi Git diperlukan. |
| idea-refine | Kembangkan dan seleksi alternatif dari ide yang masih kasar. |
| incremental-implementation | Implementasikan perubahan bertahap dalam potongan kecil. |
| interview-me | Gali kebutuhan ketika tujuan/pengguna belum jelas. |
| observability-and-instrumentation | Tambahkan log, metrik, tracing dan sinyal kegagalan yang berguna. |
| performance-optimization | Ukur bottleneck lalu optimalkan frontend, backend atau query. |
| planning-and-task-breakdown | Pecah kebutuhan jelas menjadi langkah yang dapat diverifikasi. |
| security-and-hardening | Audit input, auth, dependency dan batas kepercayaan; perkuat kontrol. |
| shipping-and-launch | Periksa kesiapan rilis, rollout, monitoring dan rollback. |
| source-driven-development | Verifikasi keputusan API/library melalui dokumentasi resmi. |
| spec-driven-development | Tulis spesifikasi dan acceptance sebelum perubahan besar. |
| test-driven-development | Buktikan bug/perilaku dengan tes gagal, lalu perbaikan terfokus. |
| using-agent-skills | Pilih workflow engineering dan urutan skill yang relevan. |

## Evidence and specialized engineering: scientific gate first, others by relevance
| Capability | Select when | Do not use for |
|---|---|---|
| mind-control | Every coding task, plus any other task requiring reasoning, judgment, inference, tradeoffs, planning, debugging, evidence assessment or uncertainty handling—even when ordinary, familiar, standard or outside science. | Only non-coding work that is routine, mechanical, deterministic and needs no reasoning or judgment. |
| performance-oriented-software-engineering | Workload scale, measured latency, throughput, CPU/I/O, or memory materially affects a software design decision. | Routine edits unrelated to performance. |
| reverse-engineer-anything | A shipped executable/app/archive or observed runtime artifact must be investigated and grounded in bytes. | Ordinary source-code maintenance. |

`mind-control` is the user's default reasoning capability. Its compact descriptor is always exposed; its exact active instructions are read for every coding task and every other task that needs reasoning, regardless of topic or lexical rank. Only the explicitly defined routine non-coding/no-reasoning case skips the body. References remain selective, and unrelated scientific methods, ML libraries and diagram services are not implicitly installed or invoked. `agent-core-runtime-activation-audit` remains a separate task-specific operational Skill.

Source pins and adaptation evidence: `UPSTREAM.json`. Child names are exact catalog keys; no child body is embedded in this index.
