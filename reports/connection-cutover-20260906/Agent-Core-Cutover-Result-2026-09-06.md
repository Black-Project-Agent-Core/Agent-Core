import type { SubAgentCoreProviderId } from '../types.js';

export type ProviderFailureKind = 'auth' | 'credits_exhausted' | 'rate_limit' | 'model_entitlement' | 'forbidden' | 'model_not_found' | 'invalid_request' | 'server' | 'network' | 'timeout' | 'unknown';

export interface ProviderFailure {
  kind: ProviderFailureKind;
  status?: number;
  message: string;
  retryAfterMs?: number;
  model?: string;
}

export interface ProviderInvocation {
  provider: SubAgentCoreProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  taskPrompt: string;
  timeoutMs: number;
}

export interface ProviderInvocationResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  actualModel?: string;
  recordedCost?: number;
}

export interface SubAgentProvider { invoke(input: ProviderInvocation): Promise<ProviderInvocationResult>; }

export class ProviderInvocationError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(failure.message);
    this.name = 'ProviderInvocationError';
  }
}

function retryAfter(headers?: Headers): number | undefined {
  const raw = headers?.get('retry-after')?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) && at > Date.now() ? at - Date.now() : undefined;
}

export function classifyProviderFailure(status: number | undefined, message: string, headers?: Headers): ProviderFailure {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const retryAfterMs = retryAfter(headers);
  const authoritativeModelEntitlement = lower.includes('team_model_access_denied')
    || lower.includes('team not allowed to access model')
    || lower.includes('not allowed to access model')
    || lower.includes('model access denied');
  if (authoritativeModelEntitlement) {
    return { kind: 'model_entitlement', ...(status === undefined ? {} : { status }), message: text || 'Model entitlement denied' };
  }
  if (status === 401) return { kind: 'auth', status, message: text || 'Authentication failed' };
  if (status === 402) return { kind: 'credits_exhausted', status, message: text || 'Provider credits exhausted' };
  if (status === 403) return { kind: 'forbidden', status, message: text || 'Provider forbids this request' };
  if (status === 404 && lower.includes('model')) return { kind: 'model_not_found', status, message: text || 'Model not found' };
  if (status === 429 || (lower.includes('rate') && lower.includes('limit'))) return { kind: 'rate_limit', status, message: text || 'Rate limited', ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
  if (status === 408 || status === 504) return { kind: 'timeout', status, message: text || 'Provider timeout' };
  if (status !== undefined && status >= 500) return { kind: 'server', status, message: text || 'Provider server error' };
  if (status === 400 || status === 422) return { kind: 'invalid_request', status, message: text || 'Invalid provider request' };
  if (status === undefined || status === 0) return { kind: 'network', status, message: text || 'Provider network error' };
  return { kind: 'unknown', status, message: text || 'Provider request failed' };
}

export function redactProviderText(text: string, secrets: readonly string[]): string {
  let safe = String(text || '');
  for (const secret of secrets) if (secret) safe = safe.split(secret).join('[REDACTED]');
  safe = safe.replace(/Bearer\s+[^\s\"',}]+/gi, 'Bearer [REDACTED]').replace(/\b(?:sk|nvapi|nvidia|oh)[-_][A-Za-z0-9._-]{8,}\b/gi, '[REDACTED]');
  return safe.slice(0, 4_000);
}

export async function responseErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText;
    try {
      const parsed = JSON.parse(text) as any;
      return String(parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? text);
    } catch { return text; }
  } catch { return response.stti pemulihan audit

Sebelum penerapan, rantai audit yang tersedia berisi sequence 1–28.608. Head hash-nya adalah:

```text
cb2087b1b54ac7b565acdb9ad41280d9a1be7c5cde37f46fdeca5bd59cc357fe
```

Penyalinan ke generasi baru mempertahankan seluruh 28.608 record dan head hash yang sama. Sesudah startup, rotasi pertama berhasil. Berkas arsip hasil rotasi identik secara byte dengan berkas audit aktif lama. Event baru pertama memiliki sequence **28.609** dan menunjuk head lama sebagai `previousHash`.

Pada akhir canary, verifier melaporkan rantai valid dari sequence 1 sampai **28.681**, sebanyak 28.681 record dalam dua file. Selama 16 sampel kesehatan canary, `audit.writeErrors` selalu **0**, rotasi berjumlah **1**, dan penulisan baru terus bertambah. Ini merupakan bukti bahwa pencatatan kembali bekerja, bukan sekadar penghitung error yang kembali nol setelah restart.

**Gap pencatatan sebelum perbaikan tidak direkonstruksi.** Rantai tersimpan yang valid tidak berarti event yang gagal dicatat pada interval sebelumnya telah dipulihkan. Tidak dibuat event historis palsu untuk menutupi gap tersebut.

## 5. Pengujian sebelum dan setelah deployment

| Gate | Hasil |
|---|---|
| Kecocokan hash baseline produksi dan 13 file kandidat | PASS sebelum penerapan. |
| Pengujian ulang kandidat lengkap | 71/71 PASS. |
| Build kandidat | PASS. |
| Typecheck source produksi setelah penerapan | PASS. |
| Kesamaan snapshot autentikasi dan integritas audit sebelum startup | PASS. |
| Regresi penemuan tes sebelum perubahan konfigurasi | 1 FAIL yang diharapkan. |
| Pengujian akhir instalasi utama | **73/73 PASS, 15 file tes, 0 file gagal.** |
| Startup melalui binary native yang sudah ada | PASS. |
| Canary MCP lokal pada server produksi | PASS. |
| Dua percakapan ChatGPT nyata dan soak jangka panjang | BELUM diuji/disertifikasi. |

Pengujian pertama dari root sempat exit 1 walaupun assertion yang berjalan lulus. Penyebabnya adalah runner ikut menemukan salinan tes dalam `reports/connection-review-20260906/tests` dan `reports/connection-repair-20260906/candidate-files/tests`; lima suite salinan tidak mempunyai dependency relatif yang lengkap. Bukti kegagalan itu dipertahankan di `deployed-tests.json`. Perbaikan berupa pembatas penemuan artefak laporan diuji RED/GREEN; assertion aplikasi tidak dihapus atau dilonggarkan.

Pengujian terfokus ini bukan klaim bahwa seluruh suite repository atau seluruh subproyek telah disertifikasi ulang.

## 6. Pemeriksaan runtime yang sebenarnya

Launcher native dibuka kembali pada sekitar **03:13 WIB**. Identitas proses pada startup tercatat sebagai native PID 21768, server PID 20172, dan tunnel PID 7584. PID bersifat historis; sesi berikutnya harus memeriksa ulang, bukan menghentikan proses berdasarkan angka tersebut.

Canary berlangsung **03:14:51–03:15:26 WIB**, sekitar 35 detik. Dua klien SDK independen memakai protokol legacy dan modern. Sebanyak **14 pemanggilan status** berhasil; penutupan satu klien tidak mematikan klien lain, dan klien baru dapat terhubung kembali. Endpoint produksi mengembalikan **69 alat**, termasuk `subagentcore`.

Permintaan tanpa autentikasi sengaja diuji dan ditolak dengan HTTP 401. Respons tersebut adalah hasil negatif yang diharapkan, bukan insiden login baru. Canary tidak membuat grant OAuth baru atau memanggil provider model eksternal.

Semua 16 sampel kesehatan pada canary menunjukkan `overallHealth: healthy`, memory sehat, execution sehat, dan tidak ada error tulis audit. Ini adalah canary singkat, bukan jaminan uptime tanpa batas.

## 7. Batas yang masih berada di sisi ChatGPT

Pencarian katalog menunjukkan satu Agent Core terpasang. Namun, discovery namespace `Agent_Core` pada pesan ini tidak menyediakan fungsi, baik sebelum maupun setelah server dibuka kembali. Karena itu, **tidak ada klaim bahwa pemanggilan melalui konektor ChatGPT telah berhasil pada pesan ini**. Keberhasilan canary lokal tidak disamakan dengan keberhasilan dua chat nyata.

Pesan `FORBIDDEN: This conversation does not support developer MCPs` adalah observasi sesi sebelumnya. Pada pesan sekarang observasinya adalah namespace tidak diekspos; keduanya tidak boleh dicampur menjadi satu error yang diklaim baru terjadi.

Dokumentasi OpenAI menyatakan pemilihan app berlaku untuk pesan tempat app dipilih, bukan otomatis seluruh percakapan; pemanggilan baru dapat memerlukan penyebutan app lagi. Dokumentasi juga menjelaskan bahwa pembaruan tool server tidak selalu memperbarui daftar action host secara otomatis. Fakta umum tersebut membantu pemeriksaan, tetapi tidak membuktikan seluruh kejadian historis pengguna berasal dari satu penyebab.

Tool pengelolaan yang tersedia tidak menyediakan penyegaran manifest action developer MCP. Tidak dilakukan penghapusan/pemasangan ulang plugin, pelemahan izin global, atau perubahan autentikasi sebagai percobaan.

Uji akhir yang masih diperlukan: chat baru dengan Agent Core dipilih secara eksplisit, kemudian pengujian panggilan berulang dan lintas dua chat sambil mengamati audit yang sekarang sudah sehat.

## 8. Artefak, handoff dan rollback

Folder hasil:

```text
E:\Projects\Agent-Core\reports\connection-cutover-20260906
```

Bukti utama: `offline-preflight.json`, `offline-deployment.json`, `full-candidate-retest.json`, `deployed-tests.json`, `discovery-red.json`, `deployed-green-tests.json`, `native-start.json`, `first-live-health.json`, dan `live-canary.json`. Source/build sebelum penerapan disimpan dalam `preapply-source-backup`. Script `offline-cutover.py` memiliki pemeriksaan offline dan penolakan penerapan ulang; ia bukan script yang perlu dijalankan setiap membuka aplikasi.

Panduan terbaru berada pada `docs/agent-core-connection-troubleshooting.md`; versi sebelum pembaruan dipertahankan. Laporan review/repair lama tidak ditimpa. Checkpoint DMF tidak diperbarui melalui konektor pada pesan ini karena tool Agent Core tidak diekspos; handoff yang berhasil disimpan adalah file laporan dan panduan.

**Jangan menghapus `runtime/persistence.json` atau kembali memakai snapshot autentikasi lama setelah generasi aktif menerima aktivitas baru.** Rollback harus mempertahankan state autentikasi aktif terbaru. Backup source bukan izin mengembalikan credential ke masa lalu. Jangan commit seluruh worktree overlay atau menyalin ulang seluruh `src/dist`.

## 9. Referensi

Bukti instalasi berasal dari source dan artefak pengujian lokal yang disebutkan di atas. Sumber web hanya dipakai untuk perilaku host umum, bukan untuk menetapkan status PC pengguna.

OpenAI, Developer mode and MCP apps in ChatGPT, diperiksa 6 September 2026:
https://help.openai.com/en/articles/12584461

**Kesimpulan: perbaikan produksi lokal sudah diterapkan dan berjalan sehat pada pengujian. Sertifikasi konektor lintas chat ChatGPT masih menunggu pengujian host.**

## 10. Catatan verifikasi setelah canary

Pada pemeriksaan berikutnya, PID server berubah dari 20172 menjadi 10292 dan PID tunnel menjadi 9608, sementara aplikasi native tetap PID 21768. Proses pemicu pergantian tersebut tidak lagi tersedia untuk diperiksa; penyebab restart ini tidak ditetapkan. Jangan menganggapnya sebagai restart kedua yang sengaja dilakukan oleh script cutover.

Penghitung `audit.written` adalah penghitung per proses, sehingga pemeriksaan awal yang menuntut nilainya selalu lebih besar dari 72 memberikan alarm yang keliru setelah pergantian proses. Bukti lanjutan pada 03:22:27 WIB menunjukkan sequence persisten bertambah dari 28.731 menjadi 28.732, error tulis tetap 0, dan kesehatan keseluruhan healthy. Pemeriksaan kemajuan lintas restart harus memakai sequence persisten, bukan membandingkan penghitung per proses tanpa identitas proses. Observasi ini disimpan dalam `post-canary-process-observation.json`; belum ada klaim tentang penyebab pergantian proses.
