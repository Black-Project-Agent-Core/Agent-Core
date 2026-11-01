# Agent Core — Peta Struktur Folder

Snapshot direktori: **2026-10-27 (Asia/Bangkok)**. Root logis: **`<PROJECT_ROOT>/`**, diperoleh dari root proyek tervalidasi, bukan drive atau working directory kebetulan. Dokumen tunggal ini adalah peta penempatan, dipakai bersama [AGENTS.md](../AGENTS.md) dan [CODEBASE.md](CODEBASE.md).

## Wajib sebelum membuat folder — semua agent, termasuk Raka

1. Baca bagian tujuan/root relevan pada peta ini, Storage ownership di AGENTS.md, dan owner pada CODEBASE.md.
2. Periksa filesystem aktual, termasuk nama alternatif dengan fungsi sama. Snapshot dapat tertinggal; folder yang tidak tercantum bukan izin membuat pengganti.
3. Gunakan rumah dan owner existing. **Dilarang keras membuat folder lain untuk tujuan yang sudah ada**, memindahkan fungsi ke rumah lebih baru, atau memakai nama new/v2/copy/backup/final/tanggal/nama-agent untuk membenarkannya.
4. Untuk tujuan baru yang memang diminta task, tetapkan owner, lokasi di induk yang sesuai, pembaca/penulis dan lifecycle sebelum membuat folder. Perbarui peta ini serta bagian terkait CODEBASE.md pada task yang sama. Jangan membuat registry atau peta tandingan.
5. Main menyertakan root, pointer peta, rumah canonical dan batas file dalam brief setiap partner. Raka dan agent lain mematuhi aturan yang sama; Main memeriksa hasil partner. Akses tidak tersedia dilaporkan, bukan diganti rumah baru.

Peta tidak memberi izin membuka data terlindungi, mengedit artifact/state owner, menghapus history, atau memulai task dari catatan historis. Instruksi tertulis dan acknowledgment bukan bukti semua host/agent selalu patuh; pemeriksaan perubahan aktual tetap diperlukan.

## Root dan tujuan existing

| Root/folder | Fungsi / owner / penempatan |
| --- | --- |
| `src/` | Implementasi Agent Core; pilih modul existing menurut owner map CODEBASE.md. |
| `src/ui/` | Sumber UI existing; dependency/output lokal tetap di owner UI. |
| `src/launcher/`, `src/launcher.tests/` | Launcher Windows dan pengujian owner launcher. |
| `scripts/` | Otomasi proyek; gunakan subfolder existing sesuai domain, bukan script-root tandingan. |
| `tests/` | Tes/fixture proyek; tes lokal owner juga dapat berada di modulnya, sesuai pola existing. |
| `docs/` | Dokumentasi; `CODEBASE.md` arsitektur, `PROJECT-STRUCTURE.md` peta folder tunggal. |
| `docs/instructions/` | Referensi topik kontrak `AGENTS.md`; owner dokumentasi Agent Core, dibaca selektif sesuai task dengan batas konteks host. Teks aturan aktif dipelihara di sini, riwayat ditandai eksplisit; bukan Memory/Skill/store runtime baru. |
| `docs/proposals/` | Proposal untuk review; proyeksi Skill di `skills/<workspace>/` melalui owner existing. |
| `docs/history-agent-core/` | Dokumen penyelesaian/keputusan historis; bukan antrean kerja aktif. |
| `docs/research/`, `docs/plans/`, `docs/verification/`, `docs/releases/` | Riset, rencana, bukti verifikasi, dokumentasi rilis menurut folder existing. |
| `subagents/` | Profil/panduan partner: `raka.md`, `README.md`, `CORTEX_MEMORY.md`, `CLAUDE_CODE_HOST.md`. |
| `runtime/` | Induk state, toolchain, cache dan output proyek yang dikelola owner existing; bukan tempat membuat engine/store tandingan. |
| `runtime/skills/` | **Rumah pertama dan satu-satunya induk penyimpanan Skill proyek.** Rincian role di bawah. |
| `runtime/memory/` | Satu store Memory canonical; owner `src/memory/`. Tidak ditelusuri pada peta ini. |
| `runtime/bridge-auth/` | Metadata autentikasi existing; owner `src/auth/key-store.ts`. `proposal-approvers.json` menyimpan allowance controller per key ID/workspace untuk proposal Skill; hanya provisioning operator, tanpa secret atau grant tool baru. Mutasi memakai lock/atomic write owner auth. |
| `runtime/learning/` | State Learning owner existing `src/learning/`; bukan salinan Memory. |
| `runtime/build/`, `runtime/checkpoints/`, `runtime/tmp/` | Output/bukti/checkpoint existing sesuai lifecycle owner; bukan authoring Skill atau backup ad hoc. |
| `assets/` | Aset proyek existing. |
| `extensions/` | Integrasi browser existing; bukan owner state browser runtime. |
| `SubProject/` | Proyek mandiri existing; hormati root/kontrak masing-masing, jangan duplikasi source Agent Core ke sini. |
| `vendor/` | Komponen pihak ketiga existing; ikuti provenance/lisensi, tidak ditelusuri. |
| `tunnel-client/` | Tool/integrasi tunnel existing; konfigurasi lokal dan credential tidak diinventarisasi. |
| `.changeset/`, `.github/` | Metadata intent rilis dan konfigurasi workflow existing. |
| `.handoff/` | Status kerja skill `/agent-handoff` (setup, plan, execute, verify): `config.md`, dan selama satu siklus terbuka `plan.md`, `review.md`, `backlog.md`. Hanya ditulis oleh skill itu atas permintaan operator; tidak dibaca Core, Native, atau tooling rilis. Bukan Memory, Skill, atau store runtime. |
| `dist/`, `node_modules/`, `release/` | Output build, dependency dan arsip rilis; jangan edit sebagai source. |
| `Backups/` | Rumah backup existing/historis; bukan alasan membuat backup baru atau mengubah arsip. |
| `.git/`, `.grafel/`, `.superpowers/`, `.claude/`, `.impeccable/`, `.remember/` | Metadata/state owner terkait; tidak ditelusuri. `.claude/` hanya berisi pengaturan lokal Claude Code (`settings.local.json`: izin dan hook PostToolUse yang memanggil `scripts/verify/claude-code-post-edit-check.mjs`; `settings.json`: plugin lokal). `.impeccable/` adalah cache hook plugin Claude Code `impeccable`. `.remember/` adalah state dan log plugin Claude Code `remember`, ditulis oleh sesi Claude Code yang aktif di folder ini dan diabaikan Git oleh `.remember/.gitignore`. Keduanya diabaikan Git lewat `.gitignore` dan bukan bagian Agent Core. |
| `.rdc-standalone/` | Tool operator eksternal, terpisah dari machine-control internal `src/rdc/`. |
| `secrets/`, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/` | Terlindungi; hanya nama boundary dicatat, tanpa inspeksi isi. `.env` juga dikecualikan. |

## Profil operator Native lokal

`<PROJECT_ROOT>/runtime/agent-runtime/profile/` adalah satu rumah profil operator Native, di bawah owner runtime Native existing. Owner pembaca: src/agent-profile.ts; penulis: operator melalui authoring manual. Berisi SOUL.md, IDENTITY.md, USER.md, AGENTS.md (catatan operator opsional, tunduk pada kebijakan tetap Native) dan avatar opsional; data privat diabaikan Git, tidak dipindai dari cwd, dan tidak menambah Memory/Skill/job store. Ini data operator Native, berbeda dari panduan partner yang dipublikasikan di subagents/. Pilihan konfigurasi portabel: AGENT_CORE_AI_PROFILE_ROOT=@project/runtime/agent-runtime/profile. Startup hanya membaca; file dipertahankan sampai operator mengubah/menghapusnya. Matikan flag untuk rollback perilaku tanpa menghapus file. Lokasi home pengguna yang sempat dipilih pada aktivasi pertama 2026-10-31 adalah kesalahan penempatan dan digantikan koreksi ini; deklarasi lama bukan izin pengecualian. Respect mewajibkan file/folder portabel tetap di dalam Agent Core tanpa bertanya ulang; satu-satunya toleransi drive C adalah kebutuhan teknis yang terbukti tidak portabel dan memang wajib di sana.

## Skill: satu induk, role berbeda

```text
runtime/skills/                         # rumah pertama; jangan dipindah keluar
|-- README.md                          # panduan rumah
|-- capability-packs/<skill-name>/      # satu source authoring per nama
|   |-- SKILL.md                       # entrypoint langsung
|   `-- <subfolder paket existing>/    # references/scripts/evals/... sesuai paket
|-- catalog/<skill-name>/              # artifact aktif; hanya SkillService
|-- revisions/<skill-name>/
|   |-- staged/<digest>/               # kandidat immutable
|   `-- history/<digest>/              # rollback immutable
|-- .staging/                          # transaksi/proposal build owner
|-- proposals/<workspace>/             # proyeksi owner Learning/Skills
|-- packages/                          # output paket .skill
|-- exports/claude/ atau exports/codex/ # ekspor host melalui exporter
`-- tooling/                           # integrasi tooling lokal existing
```

Pola role adalah kontrak penempatan, **bukan daftar folder yang harus dibuat**. Pohon snapshot di bawah menunjukkan yang benar-benar ada. Source, catalog, staged/history, ekspor dan paket memiliki konsumen/lifecycle berbeda; kemiripan payload bukan duplikasi authoring. Jangan deduplikasi fisik, menghapus rollback, atau mengganti dengan junction/hardlink. Ubah isi Skill melalui source dan lifecycle [SkillService](External-Engineering-Skills.md#storage-ownership).

Lokator lama `bundled-skills/capability-packs/<name>` (termasuk dua engineering Skill yang dahulu langsung di bawah parent lama) sudah pindah ke `runtime/skills/capability-packs/<name>`. Root `bundled-skills/` **tidak ada dan dilarang dibuat kembali**. String lama tetap diperlukan pada guard/negative test serta captured revision/provenance yang dikelola owner; bukan lokasi aktif. Untuk body proposal terikat revisi, gunakan locator sekarang di peta ini dan jangan mengedit proyeksi yang harus identik dengan render registry. Dokumen historis yang diperbarui memberi catatan perubahan locator; digest/status peristiwa tetap dipertahankan.

String internal `bundled-skills` dalam executable pihak ketiga `claude.exe` adalah cache upstream milik Claude, bukan rumah source Agent Core dan bukan target patch. Dependency, binary, arsip rilis dan state historis tidak ditulis ulang untuk menghapus sebuah kata.

| Sumber yang dirujuk catatan lama | Locator yang harus dipakai sekarang |
| --- | --- |
| Mind-Control, termasuk captured proposal | [runtime/skills/capability-packs/mind-control/SKILL.md](../runtime/skills/capability-packs/mind-control/SKILL.md) |
| Performance engineering | [runtime/skills/capability-packs/performance-oriented-software-engineering/SKILL.md](../runtime/skills/capability-packs/performance-oriented-software-engineering/SKILL.md) |
| REA dan lisensinya | [runtime/skills/capability-packs/reverse-engineer-anything/SKILL.md](../runtime/skills/capability-packs/reverse-engineer-anything/SKILL.md), [LICENSE](../runtime/skills/capability-packs/reverse-engineer-anything/LICENSE) |

## Deklarasi tujuan untuk pemeriksaan otomatis

Blok JSON ini adalah deklarasi pada peta yang sama, bukan registry terpisah. `owners` menetapkan satu rumah per tujuan. `directoryIntents` menyatakan tujuan baru di dalam owner existing sebelum pembuatan folder. Jangan memberi ID tujuan berbeda untuk menyamarkan fungsi yang sebenarnya sama. Hapus intent yang dibatalkan; intent yang sudah dipenuhi tetap menjadi bukti ownership sampai digantikan secara eksplisit.

<!-- DIRECTORY-POLICY:START -->
```json
{
  "version": 1,
  "owners": [
    {
      "purpose": "implementation",
      "path": "src",
      "aliases": [
        "source-code"
      ]
    },
    {
      "purpose": "project-automation",
      "path": "scripts"
    },
    {
      "purpose": "project-tests",
      "path": "tests"
    },
    {
      "purpose": "documentation",
      "path": "docs",
      "aliases": [
        "documentation"
      ]
    },
    {
      "purpose": "completed-proposal-history",
      "path": "docs/history-agent-core",
      "aliases": [
        "docs/archive"
      ]
    },
    {
      "purpose": "agent-profiles",
      "path": "subagents",
      "aliases": [
        "agents"
      ]
    },
    {
      "purpose": "skill-storage",
      "path": "runtime/skills",
      "aliases": [
        "bundled-skills",
        "skills",
        "capability-packs",
        "runtime/capability-packs",
        "runtime/skill-catalog",
        "runtime/skills-v2"
      ]
    },
    {
      "purpose": "skill-source",
      "path": "runtime/skills/capability-packs"
    },
    {
      "purpose": "canonical-memory-store",
      "path": "runtime/memory"
    },
    {
      "purpose": "learning-state",
      "path": "runtime/learning"
    },
    {
      "purpose": "build-output",
      "path": "runtime/build"
    },
    {
      "purpose": "project-temporary-output",
      "path": "runtime/tmp",
      "aliases": [
        "runtime/temp"
      ]
    },
    {
      "purpose": "file-checkpoints",
      "path": "runtime/checkpoints"
    },
    {
      "purpose": "runtime-portability-tools",
      "path": "runtime/portability"
    },
    {
      "purpose": "project-assets",
      "path": "assets"
    },
    {
      "purpose": "browser-extension",
      "path": "extensions"
    },
    {
      "purpose": "independent-subprojects",
      "path": "SubProject"
    },
    {
      "purpose": "third-party-vendor",
      "path": "vendor"
    },
    {
      "purpose": "tunnel-client",
      "path": "tunnel-client"
    },
    {
      "purpose": "release-intent",
      "path": ".changeset"
    },
    {
      "purpose": "github-workflows",
      "path": ".github"
    },
    {
      "purpose": "handoff-workflow",
      "path": ".handoff"
    },
    {
      "purpose": "claude-code-local-settings",
      "path": ".claude"
    },
    {
      "purpose": "impeccable-plugin-local-cache",
      "path": ".impeccable"
    },
    {
      "purpose": "remember-plugin-local-state",
      "path": ".remember"
    },
    {
      "purpose": "compiled-output",
      "path": "dist"
    },
    {
      "purpose": "project-dependencies",
      "path": "node_modules"
    },
    {
      "purpose": "immutable-releases",
      "path": "release"
    },
    {
      "purpose": "legacy-project-backups",
      "path": "Backups"
    },
    {
      "purpose": "runtime-role:backups",
      "path": "runtime/backups"
    },
    {
      "purpose": "runtime-role:bridge-auth",
      "path": "runtime/bridge-auth"
    },
    {
      "purpose": "runtime-role:data",
      "path": "runtime/data"
    },
    {
      "purpose": "runtime-role:grafel",
      "path": "runtime/grafel"
    },
    {
      "purpose": "runtime-role:home",
      "path": "runtime/home"
    },
    {
      "purpose": "runtime-role:native-dump-test-temp+",
      "path": "runtime/native-dump-test-temp+"
    },
    {
      "purpose": "runtime-role:node",
      "path": "runtime/node"
    },
    {
      "purpose": "runtime-role:npm-prefix",
      "path": "runtime/npm-prefix"
    },
    {
      "purpose": "runtime-role:playwright",
      "path": "runtime/playwright"
    },
    {
      "purpose": "runtime-role:rdc",
      "path": "runtime/rdc"
    },
    {
      "purpose": "runtime-role:semantic-ide",
      "path": "runtime/semantic-ide"
    },
    {
      "purpose": "runtime-role:semantic-ide-smoke",
      "path": "runtime/semantic-ide-smoke"
    },
    {
      "purpose": "runtime-role:test-desktop-status",
      "path": "runtime/test-desktop-status"
    },
    {
      "purpose": "runtime-role:tools",
      "path": "runtime/tools"
    },
    {
      "purpose": "runtime-role:tracker",
      "path": "runtime/tracker"
    },
    {
      "purpose": "runtime-role:webview2",
      "path": "runtime/webview2"
    },
    {
      "purpose": "runtime-role:browser-control",
      "path": "runtime/browser-control"
    },
    {
      "purpose": "runtime-role:launcher",
      "path": "runtime/launcher"
    },
    {
      "purpose": "runtime-role:agent",
      "path": "runtime/agent"
    },
    {
      "purpose": "runtime-role:terminal-output",
      "path": "runtime/terminal-output"
    },
    {
      "purpose": "runtime-role:npm-cache",
      "path": "runtime/npm-cache"
    },
    {
      "purpose": "runtime-role:downloads",
      "path": "runtime/downloads"
    },
    {
      "purpose": "runtime-role:tool-results",
      "path": "runtime/tool-results"
    },
    {
      "purpose": "runtime-role:dotnet-home",
      "path": "runtime/dotnet-home"
    },
    {
      "purpose": "runtime-role:nuget-packages",
      "path": "runtime/nuget-packages"
    },
    {
      "purpose": "runtime-role:dotnet-sdk",
      "path": "runtime/dotnet-sdk"
    },
    {
      "purpose": "runtime-role:agent-runtime",
      "path": "runtime/agent-runtime"
    },
    {
      "purpose": "runtime-role:mcp",
      "path": "runtime/mcp"
    },
    {
      "purpose": "runtime-role:android",
      "path": "runtime/android"
    },
    {
      "purpose": "runtime-role:phone",
      "path": "runtime/phone"
    },
    {
      "purpose": "runtime-role:restart",
      "path": "runtime/restart"
    },
    {
      "purpose": "runtime-role:cache",
      "path": "runtime/cache"
    },
    {
      "purpose": "runtime-role:nuget-http-cache",
      "path": "runtime/nuget-http-cache"
    },
    {
      "purpose": "runtime-role:recovery",
      "path": "runtime/recovery"
    }
  ],
  "directoryIntents": [
    {
      "path": ".remember/logs",
      "purpose": "remember-plugin-logs",
      "owner": ".remember"
    },
    {
      "path": ".remember/tmp",
      "purpose": "remember-plugin-scratch",
      "owner": ".remember"
    },
    {
      "path": "docs/instructions",
      "purpose": "agent-operating-instructions",
      "owner": "docs"
    },
    {
      "path": "docs/research/claude-ecosystem-donor",
      "purpose": "claude-ecosystem-donor-evidence",
      "owner": "docs"
    },
    {
      "path": ".changeset/applied",
      "purpose": "applied-release-intent-archive",
      "owner": ".changeset"
    },
    {
      "path": "runtime/skills/capability-packs/windows-powershell-host",
      "purpose": "skill-source-windows-powershell-host",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/skill-authoring",
      "purpose": "skill-source-skill-authoring",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/agent-runtime/attachments",
      "purpose": "agent-chat-attachments",
      "owner": "runtime/agent-runtime"
    },
    {
      "path": "runtime/agent-runtime/profile",
      "purpose": "native-operator-profile-data",
      "owner": "runtime/agent-runtime"
    },
    {
      "path": "runtime/skills/capability-packs/app-replica",
      "purpose": "skill-pack-app-replica",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/requirements-and-planning",
      "purpose": "skill-pack-requirements-and-planning",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/delivery-and-release",
      "purpose": "skill-pack-delivery-and-release",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/debugging-and-observability",
      "purpose": "skill-pack-debugging-and-observability",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/frontend-and-browser-testing",
      "purpose": "skill-pack-frontend-and-browser-testing",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/agent-core-capability-index/references",
      "purpose": "skill-pack-capability-index-references",
      "owner": "runtime/skills/capability-packs"
    },
    {
      "path": "runtime/skills/capability-packs/performance-oriented-software-engineering/references/upstream-shared",
      "purpose": "skill-pack-performance-shared-references",
      "owner": "runtime/skills/capability-packs"
    }
  ]
}
```
<!-- DIRECTORY-POLICY:END -->

Contoh intent untuk tujuan baru yang benar-benar diperlukan task: `{"path":"docs/manual/bagian","purpose":"manual-bagian","owner":"docs"}`. Ini contoh, bukan instruksi membuat folder. Tujuan yang sudah mempunyai home wajib memakai home itu.

## Pohon direktori aktual

<!-- DIRECTORY-SNAPSHOT:START -->

Daftar otomatis: **448 direktori/boundary**. Subtree privat, dependency, generated output, arsip dan link diberi label tanpa ditelusuri. Jangan edit blok ini; gunakan `npm run structure:sync`.

```text
<PROJECT_ROOT>/
|-- .changeset/
|   `-- applied/
|       |-- 0.10.0-1789797235291/
|       |-- 0.11.0-1789818980306/
|       |-- 0.12.0-1789915870203/
|       |-- 0.13.0-1790331390160/
|       |-- 0.14.0-1790585693322/
|       |-- 0.15.0-1792358684619/
|       |-- 0.8.1-1789707493393/
|       |-- 0.9.0-1789732259531/
|       |-- 1.0.0-1793126592399/
|       |-- 1.1.0-1793126983953/
|       |-- 1.2.0-1793127535995/
|       |-- 1.3.0-1793127996796/
|       |-- 1.4.0-1793165653363/
|       |-- 1.4.1-1793166007219/
|       |-- 1.5.0-1793169060797/
|       |-- 1.5.1-1793169263926/
|       |-- 1.5.10-1793172437148/
|       |-- 1.5.11-1793173173940/
|       |-- 1.5.12-1793175293549/
|       |-- 1.5.13-1793175949059/
|       |-- 1.5.14-1793175993021/
|       |-- 1.5.2-1793169389146/
|       |-- 1.5.3-1793169475349/
|       |-- 1.5.4-1793169573453/
|       |-- 1.5.5-1793169692079/
|       |-- 1.5.6-1793170895506/
|       |-- 1.5.7-1793172246996/
|       |-- 1.5.8-1793172297306/
|       |-- 1.5.9-1793172401547/
|       `-- 1.6.0-1793176214037/
|-- .claude/  [izin lokal Claude Code (settings.local.json); tidak ditelusuri]
|-- .git/  [metadata Git; tidak ditelusuri]
|-- .github/
|   `-- ISSUE_TEMPLATE/
|-- .grafel/  [state/index lokal; tidak ditelusuri]
|-- .handoff/
|-- .impeccable/
|-- .rdc-standalone/  [tool operator eksternal; tidak ditelusuri]
|-- .remember/
|   |-- logs/
|   |   `-- autonomous/
|   `-- tmp/
|       `-- capture-alive.d/
|-- .superpowers/  [state host lokal; tidak ditelusuri]
|-- assets/
|-- Backups/  [backup existing; tidak ditelusuri]
|-- dist/  [hasil build; tidak ditelusuri]
|-- DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/  [terlindungi; tidak ditelusuri]
|-- docs/
|   |-- agent-core/
|   |-- diagrams/
|   |   `-- Agent-Core-Full-Anatomy/
|   |-- history-agent-core/
|   |-- instructions/
|   |-- memory/
|   |   |-- diagrams/
|   |   |-- engine-history/
|   |   |   |-- plans/
|   |   |   |-- progress/
|   |   |   `-- verification/
|   |   |-- evidence/
|   |   |   `-- diagrams/
|   |   |-- history-agent-core/
|   |   |-- MEMORY-ACTUAL-STATE-FOR-VIDEO-REVIEW/
|   |   |-- plans/
|   |   |-- release-intents/
|   |   |   `-- applied/
|   |   |       |-- 0.14.0-1790585693322/
|   |   |       `-- 0.15.0-1792358684619/
|   |   `-- verification/
|   |-- plans/
|   |-- proposals/
|   |   `-- skills/
|   |       `-- agent-core/
|   |-- releases/
|   |-- research/
|   |   |-- always-on-budget-phase0/
|   |   |-- claude-ecosystem-donor/
|   |   |-- harness2-donor/
|   |   |-- learning-state-closure-r8s0/
|   |   `-- weknora-donor/
|   |-- superpowers/
|   |   |-- plans/
|   |   `-- specs/
|   |-- UI Agent Core/
|   `-- verification/
|-- extensions/
|   `-- agent-core-open-browser-use/
|       |-- icons/
|       `-- images/
|-- node_modules/  [dependency; tidak ditelusuri]
|-- release/  [arsip rilis; tidak ditelusuri]
|-- runtime/
|   |-- agent/  [state/tooling/output existing; tidak ditelusuri]
|   |-- agent-runtime/  [state/tooling/output existing; tidak ditelusuri]
|   |-- android/  [state/tooling/output existing; tidak ditelusuri]
|   |-- backups/  [state/tooling/output existing; tidak ditelusuri]
|   |-- bridge-auth/  [state/tooling/output existing; tidak ditelusuri]
|   |-- browser-control/  [state/tooling/output existing; tidak ditelusuri]
|   |-- build/  [dependency/output/profile; tidak ditelusuri]
|   |-- cache/  [state/tooling/output existing; tidak ditelusuri]
|   |-- checkpoints/  [state/tooling/output existing; tidak ditelusuri]
|   |-- data/  [state/tooling/output existing; tidak ditelusuri]
|   |-- dotnet-home/  [state/tooling/output existing; tidak ditelusuri]
|   |-- dotnet-sdk/  [state/tooling/output existing; tidak ditelusuri]
|   |-- downloads/  [state/tooling/output existing; tidak ditelusuri]
|   |-- grafel/  [state/tooling/output existing; tidak ditelusuri]
|   |-- home/  [state/tooling/output existing; tidak ditelusuri]
|   |-- launcher/  [state/tooling/output existing; tidak ditelusuri]
|   |-- learning/  [state/tooling/output existing; tidak ditelusuri]
|   |-- mcp/  [state/tooling/output existing; tidak ditelusuri]
|   |-- memory/  [state/tooling/output existing; tidak ditelusuri]
|   |-- native-dump-test-temp+/  [state/tooling/output existing; tidak ditelusuri]
|   |-- node/  [state/tooling/output existing; tidak ditelusuri]
|   |-- npm-cache/  [state/tooling/output existing; tidak ditelusuri]
|   |-- npm-prefix/  [state/tooling/output existing; tidak ditelusuri]
|   |-- nuget-http-cache/  [state/tooling/output existing; tidak ditelusuri]
|   |-- nuget-packages/  [state/tooling/output existing; tidak ditelusuri]
|   |-- phone/  [state/tooling/output existing; tidak ditelusuri]
|   |-- playwright/  [state/tooling/output existing; tidak ditelusuri]
|   |-- portability/  [state/tooling/output existing; tidak ditelusuri]
|   |-- rdc/  [state/tooling/output existing; tidak ditelusuri]
|   |-- restart/  [state/tooling/output existing; tidak ditelusuri]
|   |-- semantic-ide/  [state/tooling/output existing; tidak ditelusuri]
|   |-- semantic-ide-smoke/  [state/tooling/output existing; tidak ditelusuri]
|   |-- skills/
|   |   |-- .staging/  [artifact/state SkillService; lihat pola role]
|   |   |-- capability-packs/
|   |   |   |-- agent-core-capability-index/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- api-and-interface-design/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- app-replica/
|   |   |   |   `-- references/
|   |   |   |       `-- kit/
|   |   |   |-- code-review-and-quality/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- constraint-driven-development/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- context-engineering/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- debugging-and-observability/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- delivery-and-release/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- deprecation-and-migration/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- documentation-and-adrs/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- doubt-driven-development/
|   |   |   |   `-- references/
|   |   |   |       |-- upstream-agents/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- frontend-and-browser-testing/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- git-workflow-and-versioning/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- incremental-implementation/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- mind-control/
|   |   |   |   |-- evals/
|   |   |   |   `-- references/
|   |   |   |-- performance-oriented-software-engineering/
|   |   |   |   |-- agents/
|   |   |   |   |-- references/
|   |   |   |   |   `-- upstream-shared/
|   |   |   |   `-- scripts/
|   |   |   |-- requirements-and-planning/
|   |   |   |   `-- references/
|   |   |   |       |-- kit/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- reverse-engineer-anything/
|   |   |   |   |-- agents/
|   |   |   |   |-- references/
|   |   |   |   |-- scripts/
|   |   |   |   `-- tooling/
|   |   |   |       `-- rea/
|   |   |   |-- security-and-hardening/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- skill-authoring/
|   |   |   |   `-- references/
|   |   |   |-- source-driven-development/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   |-- test-driven-development/
|   |   |   |   `-- references/
|   |   |   |       `-- upstream-shared/
|   |   |   `-- windows-powershell-host/
|   |   |-- catalog/  [artifact/state SkillService; lihat pola role]
|   |   |-- exports/  [artifact/state SkillService; lihat pola role]
|   |   |-- packages/  [artifact/state SkillService; lihat pola role]
|   |   |-- proposals/  [artifact/state SkillService; lihat pola role]
|   |   |-- revisions/  [artifact/state SkillService; lihat pola role]
|   |   `-- tooling/  [artifact/state SkillService; lihat pola role]
|   |-- terminal-output/  [state/tooling/output existing; tidak ditelusuri]
|   |-- test-desktop-status/  [state/tooling/output existing; tidak ditelusuri]
|   |-- tmp/  [state/tooling/output existing; tidak ditelusuri]
|   |-- tool-results/  [state/tooling/output existing; tidak ditelusuri]
|   |-- tools/  [state/tooling/output existing; tidak ditelusuri]
|   |-- tracker/  [state/tooling/output existing; tidak ditelusuri]
|   `-- webview2/  [state/tooling/output existing; tidak ditelusuri]
|-- scripts/
|   |-- browser-control/
|   |-- external/
|   |-- governance/
|   |-- inspect/
|   |-- learning/
|   |-- memory/
|   |   |-- evaluation/
|   |   |-- migrations/
|   |   `-- outcome/
|   |-- portability/
|   |-- release/
|   |-- research/
|   |-- tunnel/
|   |-- verify/
|   `-- windows/
|-- secrets/  [terlindungi; tidak ditelusuri]
|-- src/
|   |-- artifact-analysis/
|   |-- assets/
|   |   `-- branding/
|   |-- auth/
|   |-- code-intelligence/
|   |-- harness/
|   |   `-- reconstruction/
|   |-- http/
|   |-- launcher/
|   |   |-- bin/  [dependency/output/profile; tidak ditelusuri]
|   |   `-- obj/  [dependency/output/profile; tidak ditelusuri]
|   |-- launcher.tests/
|   |   |-- bin/  [dependency/output/profile; tidak ditelusuri]
|   |   `-- obj/  [dependency/output/profile; tidak ditelusuri]
|   |-- learning/
|   |-- mcp/
|   |-- memory/
|   |   |-- evaluation/
|   |   |-- examples/
|   |   |-- mcp/
|   |   |-- outcome/
|   |   `-- reconsolidation/
|   |-- net/
|   |-- oauth/
|   |-- persistence/
|   |-- phone/
|   |-- portability/
|   |-- process/
|   |-- rdc/
|   |   |-- browser-control/
|   |   |-- checkpoints/
|   |   |-- data/
|   |   |-- document-projection/
|   |   |-- handlers/
|   |   |-- tools/
|   |   |   `-- pdf/
|   |   |       `-- lib/
|   |   |-- ui/
|   |   |   |-- config-editor/
|   |   |   |-- file-preview/
|   |   |   |   `-- shared/
|   |   |   `-- styles/
|   |   |       |-- apps/
|   |   |       `-- components/
|   |   `-- utils/
|   |       `-- files/
|   |-- security/
|   |-- semantic-ide/
|   |-- skills/
|   |-- tracker/
|   |-- ui/
|   |   |-- node_modules/  [dependency/output/profile; tidak ditelusuri]
|   |   |-- public/
|   |   `-- src/
|   |-- verification/
|   |-- web-research/
|   `-- workflows/
|-- subagents/
|-- SubProject/
|   |-- Market-Signal-Lab/
|   |   |-- .github/
|   |   |   `-- workflows/
|   |   |-- .vscode/
|   |   |-- cmd/
|   |   |   |-- analytics-bench/
|   |   |   `-- market-signal-lab/
|   |   |-- companion/
|   |   |   `-- browser-extension/
|   |   |       `-- extractors/
|   |   |-- docs/
|   |   |   |-- checkpoints/
|   |   |   |-- market-intelligence/
|   |   |   |-- plans/
|   |   |   |-- project/
|   |   |   |-- qa/
|   |   |   |-- release-history/
|   |   |   `-- specs/
|   |   |-- engines/
|   |   |   `-- rust/
|   |   |       |-- src/
|   |   |       `-- tests/
|   |   |-- frontend/
|   |   |   |-- src/
|   |   |   `-- tests/
|   |   |-- installer/
|   |   |-- internal/
|   |   |   |-- analytics/
|   |   |   |-- analyticsengine/
|   |   |   |   `-- testdata/
|   |   |   |-- app/
|   |   |   |-- autopilot/
|   |   |   |-- connectors/
|   |   |   |   `-- envato/
|   |   |   |-- consensus/
|   |   |   |-- credentials/
|   |   |   |-- domain/
|   |   |   |-- evidence/
|   |   |   |-- i18n/
|   |   |   |   `-- locales/
|   |   |   |-- indexing/
|   |   |   |   `-- testdata/
|   |   |   |       `-- c1/
|   |   |   |-- ingest/
|   |   |   |-- insights/
|   |   |   |-- quality/
|   |   |   |-- ranking/
|   |   |   |   `-- testdata/
|   |   |   |       `-- c1/
|   |   |   |-- repository/
|   |   |   |-- sampling/
|   |   |   |-- security/
|   |   |   |-- segmentation/
|   |   |   |-- semantics/
|   |   |   |-- sources/
|   |   |   |-- storage/
|   |   |   |-- telemetry/
|   |   |   |-- temporal/
|   |   |   |-- universe/
|   |   |   `-- web/
|   |   |       |-- assets/
|   |   |       |   |-- css/
|   |   |       |   `-- js/
|   |   |       `-- templates/
|   |   |-- releases/
|   |   |   `-- manifests/
|   |   |-- scripts/
|   |   |   `-- tests/
|   |   |-- testdata/
|   |   |   `-- analytics_v2/
|   |   |       `-- c1/
|   |   `-- tools/
|   |       `-- calibration_lab/
|   |           |-- testdata/
|   |           `-- tests/
|   |-- Presentation-Bridge/
|   |   |-- corpus/
|   |   |-- desktop/
|   |   |-- docs/
|   |   |-- runtime/  [runtime subproyek; tidak ditelusuri]
|   |   |-- scripts/
|   |   |-- secrets/  [terlindungi; tidak ditelusuri]
|   |   |-- src/
|   |   |   |-- application/
|   |   |   |-- cli/
|   |   |   |-- config/
|   |   |   |-- converters/
|   |   |   |   |-- google/
|   |   |   |   `-- keynote/
|   |   |   |-- fidelity/
|   |   |   |   |-- scoring/
|   |   |   |   |-- structural/
|   |   |   |   `-- visual/
|   |   |   |-- hosted/
|   |   |   |-- jobs/
|   |   |   |-- pptx/
|   |   |   |   |-- ir/
|   |   |   |   |-- ooxml/
|   |   |   |   |-- opc/
|   |   |   |   `-- preflight/
|   |   |   |-- renderers/
|   |   |   |-- repairs/
|   |   |   |-- reports/
|   |   |   |-- security/
|   |   |   |-- types/
|   |   |   `-- workers/
|   |   |       `-- keynote/
|   |   |           `-- assets/
|   |   |-- tests/
|   |   |   |-- acceptance/
|   |   |   |-- integration/
|   |   |   `-- unit/
|   |   `-- ui/
|   |       `-- src/
|   |-- Super-Runtime/
|   |   |-- benchmarks/
|   |   |-- docs/
|   |   |   |-- architecture/
|   |   |   `-- research/
|   |   |-- research/
|   |   |   `-- references/
|   |   |       |-- kimi-k3-in-c/
|   |   |       `-- llama.cpp/
|   |   |-- runtime/  [runtime subproyek; tidak ditelusuri]
|   |   `-- tests/
|   |       `-- contracts/
|   `-- Tools-Photoshop/
|-- tests/
|   |-- activity-visual-capture/
|   |   |-- bin/  [dependency/output/profile; tidak ditelusuri]
|   |   `-- obj/  [dependency/output/profile; tidak ditelusuri]
|   |-- fixtures/
|   |   |-- memory-outcome-v2/
|   |   `-- memory-subquestion/
|   |-- harness/
|   |-- helpers/
|   |-- launcher/
|   |   |-- bin/  [dependency/output/profile; tidak ditelusuri]
|   |   `-- obj/  [dependency/output/profile; tidak ditelusuri]
|   `-- memory/
|       |-- engine/
|       |   |-- fixtures/
|       |   |   |-- code-identifiers-v1/
|       |   |   |-- memory-lifecycle/
|       |   |   |-- memory-passage/
|       |   |   `-- relevance-v1/
|       |   `-- helpers/
|       |-- evaluation/
|       |   `-- helpers/
|       |-- fixtures/
|       |   |-- memory-outcome-v2/
|       |   `-- memory-subquestion/
|       `-- helpers/
|-- tunnel-client/  [tool/config lokal; tidak ditelusuri]
`-- vendor/  [pihak ketiga; tidak ditelusuri]
```

<!-- DIRECTORY-SNAPSHOT:END -->

## Pemeliharaan dan pemeriksaan

- **Pemeriksa dan writer tunggal:** `src/portability/project-structure.ts`; CLI `scripts/portability/project-structure.mjs`. Jalankan `npm run structure:check` untuk pemeriksaan read-only, `npm run structure:sync` untuk sinkronisasi blok snapshot. `path:check` dan build menjalankan pemeriksaan yang sama. Output selain blok snapshot serta deklarasi tujuan tidak diganti oleh sync.
- Folder authored baru harus cocok dengan intent dan owner di atas sebelum dibuat. Alias home, tujuan yang dideklarasikan di dua path, atau sibling dengan nama copy/new/v2 yang dikenali ditolak sebelum operasi. Subtree yang masuk melalui move juga diperiksa sebelum rename. Folder runtime opaque tetap dikelola owner-nya tanpa memindai data privat. Tujuan semantik yang disamarkan dengan nama arbitrer tidak dapat disimpulkan algoritme; kewajiban memilih owner yang jujur tetap berlaku.
- Shared `create_directory` dan directory `move_file` memakai guard yang sama untuk Native, external dan Raka. Sesudah mutasi yang diterima, snapshot disinkronkan secara atomik dengan lock lintas proses. Map regular file dan parent bukan link; links pada path proyek ditolak untuk mutasi direktori. Read dan pemindahan file biasa tidak memindai seluruh struktur. Jika update gagal setelah mutasi, tool menyatakan filesystem sudah berubah; jangan retry tanpa inspeksi.
- Perubahan di luar tool itu (shell, editor, internal lifecycle writer, atau aplikasi lain) tidak diintersep atau di-sandbox. Semua agent wajib menjalankan sync/check setelah perubahan direktori sah melalui jalur itu; drift/rumah baru yang tidak dideklarasikan menggagalkan path check/build. Tidak ada watcher yang diam-diam menulis ulang dokumen saat aplikasi lain berjalan. Ini jaminan pemeriksaan dan jalur mutasi bersama, bukan klaim bisa melarang semua system call dari host lain.
- Paket rilis membawa peta, CLI dan owner compiled yang sama. Packager menyinkronkan pohon output sebelum integrity manifest; `source/` pada paket adalah snapshot source dengan tujuan lifecycle tersendiri, bukan home authoring baru di working tree.
- Hanya `docs/PROJECT-STRUCTURE.md` pada instalasi aktif bersifat mutable dalam integrity/recovery karena snapshot dan deklarasinya dipelihara lokal; recovery tidak menimpanya. Source snapshot `source/docs/PROJECT-STRUCTURE.md`, kode pemeriksa dan dokumen arsitektur tetap immutable. ZIP terverifikasi tetap menjadi sumber seed saat bootstrap instalasi baru.
- Sumber aktual tetap authority lokasi; perbarui pohon dan tujuan yang berubah di dokumen ini, jangan buat salinan peta baru. Hormati batas tidak-ditelusuri saat memperbarui.
- `npm run path:check` memeriksa path policy dan struktur Skill pada filesystem nyata; bukan detector semua sinonim, parser seluruh Markdown, atau jaminan perilaku semua host.
- Ketika mengubah locator, periksa target file/folder dan link relatif. Pertahankan digest/status/keputusan peristiwa historis; locator saat ini tidak menyatakan byte terbaru sama dengan baseline lama.
- Memindah source tidak berarti mengubah catalog/history langsung. Validasi source dan bandingkan digest aktif melalui Skills API bila task menyentuh isi atau lifecycle Skill.
- Pembuatan peta ini tidak membuat folder penyimpanan, dependency baru, build, restart, promosi Skill atau publikasi.
