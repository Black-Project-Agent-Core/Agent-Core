# Handoff Config

## Verification Commands
test:      npm test
typecheck: node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
lint:      npm run path:check
build:

> lint di sini adalah kebijakan path dan struktur folder (`path:check`), bukan ESLint; proyek tidak punya linter kode.
> Paket UI bersarang `src/ui` (bukan workspace). Tes dan typecheck-nya tidak ikut perintah root (vitest.config.ts mengecualikan src/ui):
> - src/ui: `npm --prefix src/ui test`, `npm --prefix src/ui run typecheck`

## Conventions
response_language: id
handoff_dir:       .handoff
commit_style:      conventional
convention_docs:   docs/instructions

## Project Documentation Index

### Agent guidance
- [AGENTS.md](AGENTS.md) — kontrak operasi ringkas (aturan agen root)

### Project docs
- [README.md](README.md) — ikhtisar proyek
- [docs/README.md](docs/README.md) — indeks dokumentasi
- [docs/CODEBASE.md](docs/CODEBASE.md) — indeks arsitektur dan owner
- [docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md) — peta penempatan folder
- [docs/PATH-GOVERNANCE.md](docs/PATH-GOVERNANCE.md) — kebijakan path dan pengecualian
- [docs/instructions/](docs/instructions/) — 23 topik kontrak operasi
- [docs/proposals/REVIEW-GUIDE.md](docs/proposals/REVIEW-GUIDE.md) — alur tinjau proposal
- [docs/verification/](docs/verification/) — laporan verifikasi dan aktivasi
- [CHANGELOG.md](CHANGELOG.md) — catatan perubahan
- [CONTRIBUTING.md](CONTRIBUTING.md) — panduan kontribusi
- [SECURITY.md](SECURITY.md) — kebijakan keamanan
- [Maintenance.md](Maintenance.md) — catatan pemeliharaan

### Detected toolchain
- package manager: npm
- monorepo: none (paket UI bersarang di src/ui)
- frameworks: TypeScript 7 + Node >=24.15, MCP SDK 2.0, vitest 4; UI: React + Vite + Tailwind
