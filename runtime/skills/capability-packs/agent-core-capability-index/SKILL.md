---
name: agent-core-capability-index
description: Compact router for 20 task-specialized capabilities. Always evaluate mind-control for coding and any other reasoning task; load the remaining workflows only when selected.
license: MIT
metadata:
  adapter-revision: "4"
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

## App replica: app reconstruction only
| Capability | Purpose |
|---|---|
| app-replica | Bangun ulang aplikasi acuan sebagai clone milik sendiri: recon, riset ulasan, desain, arsitektur, backend, build, tes, parity, rebrand, peluncuran dan deploy. |

## Engineering: choose the current phase
| Capability | Purpose |
|---|---|
| api-and-interface-design | Rancang kontrak API, tipe dan batas modul yang stabil. |
| code-review-and-quality | Review diff untuk correctness, maintainability dan risiko regresi; termasuk menyederhanakan kode tanpa mengubah perilaku. |
| constraint-driven-development | Tetapkan standar mutu dan jaga agar pemeriksaan tidak dilemahkan. |
| context-engineering | Susun aturan, indeks dan konteks relevan secara bertingkat. |
| debugging-and-observability | Reproduksi masalah, cari akar penyebab, perbaiki dan verifikasi; tambahkan log, metrik, tracing dan sinyal kegagalan. |
| delivery-and-release | Rancang pipeline build, tes dan deployment otomatis; periksa kesiapan rilis, rollout, monitoring dan rollback. |
| deprecation-and-migration | Rencanakan penggantian API, sistem atau skema dengan transisi aman. |
| documentation-and-adrs | Catat perilaku, keputusan arsitektur dan bukti verifikasi. |
| doubt-driven-development | Uji asumsi keputusan penting dengan review independen terarah. |
| frontend-and-browser-testing | Bangun UI responsif, aksesibel dan lengkap state-nya; verifikasi di browser nyata: DOM, console, network dan profil. |
| git-workflow-and-versioning | Kelola branch, konflik, commit dan versi saat operasi Git diperlukan. |
| incremental-implementation | Implementasikan perubahan bertahap dalam potongan kecil. |
| requirements-and-planning | Gali kebutuhan, kembangkan ide kasar, tulis spesifikasi dan acceptance, lalu pecah menjadi tugas yang dapat diverifikasi. |
| security-and-hardening | Audit input, auth, dependency dan batas kepercayaan; perkuat kontrol. |
| source-driven-development | Verifikasi keputusan API/library melalui dokumentasi resmi. |
| test-driven-development | Buktikan bug/perilaku dengan tes gagal, lalu perbaikan terfokus. |

Memilih workflow dan urutan skill yang relevan: bila langkah routing di atas belum cukup, baca [using-agent-skills](references/using-agent-skills.md) (digabung dari Skill `using-agent-skills` yang dipensiunkan; asal dan jalur pemulihan di [merged-from](references/merged-from.md)).

## Nama lama dan rumah barunya
Skill berikut sudah digabung; teks lengkapnya menjadi stage/referensi di Skill tujuan. Sebutan nama lama di teks upstream dibaca sebagai Skill tujuan.
- `replica-recon`, `replica-entrepreneur`, `replica-design`, `replica-architect`, `replica-backend`, `replica-build`, `replica-test`, `replica-diff`, `replica-brand`, `replica-launch`, `replica-deploy` -> `app-replica`
- `interview-me`, `idea-refine`, `spec-driven-development`, `planning-and-task-breakdown` -> `requirements-and-planning`
- `ci-cd-and-automation`, `shipping-and-launch` -> `delivery-and-release`
- `debugging-and-error-recovery`, `observability-and-instrumentation` -> `debugging-and-observability`
- `frontend-ui-engineering`, `browser-testing-with-devtools` -> `frontend-and-browser-testing`
- `code-simplification` -> `code-review-and-quality`; `performance-optimization` -> `performance-oriented-software-engineering`

## Evidence and specialized engineering: scientific gate first, others by relevance
| Capability | Select when | Do not use for |
|---|---|---|
| mind-control | Every coding task, plus any other task requiring reasoning, judgment, inference, tradeoffs, planning, debugging, evidence assessment or uncertainty handling—even when ordinary, familiar, standard or outside science. | Only non-coding work that is routine, mechanical, deterministic and needs no reasoning or judgment. |
| performance-oriented-software-engineering | Workload scale, measured latency, throughput, CPU/I/O, or memory materially affects a software design decision. | Routine edits unrelated to performance. |
| reverse-engineer-anything | A shipped executable/app/archive or observed runtime artifact must be investigated and grounded in bytes. | Ordinary source-code maintenance. |

`mind-control` is the user's default reasoning capability. Its compact descriptor is always exposed; its exact active instructions are read for every coding task and every other task that needs reasoning, regardless of topic or lexical rank. Only the explicitly defined routine non-coding/no-reasoning case skips the body. References remain selective, and unrelated scientific methods, ML libraries and diagram services are not implicitly installed or invoked. `agent-core-runtime-activation-audit` remains a separate task-specific operational Skill.

Source pins and adaptation evidence: `UPSTREAM.json`. Child names are exact catalog keys; no child body is embedded in this index.
