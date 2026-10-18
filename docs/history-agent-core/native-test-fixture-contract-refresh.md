# Perbaikan identitas host pada tiga fixture tes Native

Status: **COMPLETE — disetujui manusia, diterapkan dan diverifikasi pada 19 Oktober 2026 (Asia/Bangkok).**

## Masalah dan bukti

Tiga berkas tes frozen masih memasukkan runtime `{}` ketika membentuk sesi MCP Native. Server sekarang membedakan Native melalui `nativeTaskId`; fixture kosong justru masuk gate controller eksternal. Kegagalan ini menghalangi klaim keseluruhan suite lulus. Tes tersebut memang menguji Native, bukan client eksternal yang perlu ditambahkan handshake.

Source diperiksa pada `f32ff6bd046887caf3c82b5e17ecfa2244314e72`. File aktual masih cocok dengan baseline freeze. Hasil external yang hijau bukan bukti global stable.

## Perubahan paling kecil

| File | Perubahan fixture saja |
| --- | --- |
| `tests/agent-tool-session.test.ts` | Empat runtime kosong memakai konstanta task `fixture-native-task`, workspace `agent-core`. |
| `tests/agent-capability-execution-parity.test.ts` | Discovery dan sesi memakai task `nacp-fixture-task`, workspace `agent-core`. |
| `tests/dtc1-durable-turn-continuation.test.ts` | Dua runtime kosong memakai task `task-1`, workspace `fixture`, sesuai controller yang diuji. |

Usulan mengubah delapan argumen runtime dan menambahkan dua konstanta lokal. Semua assertion tetap. Setelah penerapan yang diizinkan, hanya tiga entri hash berkas tes tersebut pada `scripts/governance/native-freeze.json` diperbarui dengan algoritme normalisasi yang sudah ada. Seluruh hash implementasi Native dan protected sections tetap sama.

## Batas, risiko, dan verifikasi

Tidak mengubah implementasi, grant, katalog, routing, provider, UI atau launcher Native. Tidak ada skip, penghapusan tes, pelemahan assertion atau bypass gate. Izin dibutuhkan karena manifest freeze juga mencakup ketiga berkas tes, dan `AGENTS.md` mensyaratkan permintaan manusia yang eksplisit untuk membuka scope tersebut.

Manfaat yang diharapkan adalah pengujian jalur Native yang benar, bukan peningkatan kemampuan Native. Saat usulan dibuat, salinan belum dieksekusi dan hasil belum diketahui. Setelah izin: terapkan diff persis, perbarui tiga hash tes saja, verifikasi freeze, jalankan tiga berkas aktual, kemudian nilai kembali hasil suite keseluruhan. Kegagalan produk yang baru ditemukan harus tetap dilaporkan; izin fixture bukan izin pengembangan Native lebih luas.

## Artefak yang dapat ditinjau

- [Diff delapan argumen dan dua konstanta](../../runtime/build/stable-release-20261019/native-fixture-proposal/native-fixture-only.patch)
- [Hash lama dan usulan](../../runtime/build/stable-release-20261019/native-fixture-proposal/baseline-hashes.proposed.json)
- [Ringkasan dan salinan byte exact](../../runtime/build/stable-release-20261019/native-fixture-proposal/README.md)

Keputusan yang diminta: APPROVE untuk **tiga fixture dan tiga hash tes saja**, atau HOLD untuk mempertahankan freeze seluruhnya. Proposal selesai dipindahkan ke `docs/history-agent-core` dengan keputusan dan bukti setelah verifikasi.

## Keputusan dan hasil penyelesaian

Manusia memberi izin spesifik dalam chat: **“Izinkan hanya tiga fixture dan hash tes tersebut”.** Izin ini tidak membuka pengembangan Native lain. Diff di bawah diterapkan persis; hanya tiga hash berkas tes berubah. Semua hash implementasi dan 78 protected sections tetap utuh. Pemeriksa freeze: **31 berkas / 78 bagian lulus**. Tiga berkas aktual: **28 tes lulus, 0 gagal, 0 skip**.

Bukti lokal: `runtime/build/stable-release-20261019/native-fixtures-approved-green.json`, `native-fixture-proposal/applied-authorized.json`. SHA-256 patch: `543eacefc5c95d4300ea33df575a203cf23117cb732e9a56fbe7f71452d83bc8`. Bukti ini tidak mengklaim seluruh suite atau paket rilis selesai; keduanya memiliki pemeriksaan terpisah.

```diff
--- a/tests/agent-tool-session.test.ts
+++ b/tests/agent-tool-session.test.ts
@@ -1,9 +1,10 @@
 import { describe, expect, it } from 'vitest';
 import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';
+const nativeRuntime = { nativeTaskId: 'fixture-native-task', nativeWorkspace: 'agent-core' };
 
 describe('native agent MCP tool session', () => {
   it('discovers and dispatches only explicitly granted existing Agent Core tools', async () => {
-    const session = await AgentRuntimeToolSession.open('fixture', ['get_config'], {});
+    const session = await AgentRuntimeToolSession.open('fixture', ['get_config'], nativeRuntime);
     try {
       const tools = await session.modelTools();
       expect(tools.map(tool => tool.function.name)).toEqual(['get_config']);
@@ -18,7 +19,7 @@
   });
 
   it('discovers the current Agent Core registry without granting it', async () => {
-    const tools = await AgentRuntimeToolSession.discoverAvailableTools({});
+    const tools = await AgentRuntimeToolSession.discoverAvailableTools(nativeRuntime);
     expect(tools).toEqual(expect.arrayContaining([
       'get_config',
       'read_file',
@@ -31,7 +32,7 @@
     const session = await AgentRuntimeToolSession.open(
       'fixture-browser',
       ['browser_control'],
-      {},
+      nativeRuntime,
       { browser_control: { allowedActions: ['status'] } },
     );
     try {
@@ -53,7 +54,7 @@
     const session = await AgentRuntimeToolSession.open(
       'fixture-file',
       ['read_file'],
-      {},
+      nativeRuntime,
       { read_file: { forbidUrlRead: true } },
     );
     try {
--- a/tests/agent-capability-execution-parity.test.ts
+++ b/tests/agent-capability-execution-parity.test.ts
@@ -18,7 +18,8 @@
     const parent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
     const root = await mkdtemp(path.join(parent, 'nacp-exec-'));
     roots.push(root);
-    const availableTools = await AgentRuntimeToolSession.discoverAvailableTools({});
+    const nativeRuntime = { nativeTaskId: 'nacp-fixture-task', nativeWorkspace: 'agent-core' };
+    const availableTools = await AgentRuntimeToolSession.discoverAvailableTools(nativeRuntime);
     const resolver = new AgentCapabilityResolver({
       mode: 'dynamic',
       allowedTools: [],
@@ -41,7 +42,7 @@
     const session = await AgentRuntimeToolSession.open(
       'nacp-execution-parity',
       grant.tools,
-      {},
+      nativeRuntime,
       grant.restrictions,
     );
     try {
--- a/tests/dtc1-durable-turn-continuation.test.ts
+++ b/tests/dtc1-durable-turn-continuation.test.ts
@@ -785,7 +785,7 @@
     const oldSession = await AgentRuntimeToolSession.open(
       'old-session',
       ['get_config'],
-      {} as any,
+      { nativeTaskId: 'task-1', nativeWorkspace: 'fixture' },
     );
     const oldDigest = await oldSession.contractDigest();
     await oldSession.close();
@@ -838,7 +838,7 @@
     const currentSession = await AgentRuntimeToolSession.open(
       'budget-contract',
       [],
-      {} as any,
+      { nativeTaskId: 'task-1', nativeWorkspace: 'fixture' },
     );
     const currentDigest = await currentSession.contractDigest();
     await currentSession.close();
```
