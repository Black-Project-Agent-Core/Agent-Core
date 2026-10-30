# Penglihatan Native Agent Core
Tanggal: 2026-10-30
Revisi: 1
Status: APPROVED (revisi 1, scope V1+V2+V5 build; belum diimplementasikan)
Jenis: Improvement
Asal dan bukti: `src/agent-provider.ts:49` dan `:86`, `src/agent-tool-session.ts:183`, `src/mcp/result-budget.ts:14` dan `:207`, `src/agent-provider-readiness.ts:223`, pesan pengguna 2026-10-30.

## Masalah dan tujuan

Model yang dipanggil Native dapat melihat gambar, tetapi jalur Native hanya membawa teks. Akibatnya Native hanya menerima metadata gambar dan akurasi pengamatannya rendah. Tujuan: pixel dari gambar yang relevan sampai ke model, dengan batas ukuran, tanpa memperlebar izin tool.

## Bukti dan ketidakpastian

Diperiksa langsung pada kode:

- `image_inspect` mengembalikan blok gambar sungguhan (`type: 'image'`, base64) kepada klien MCP, dengan anggaran 2 MiB gambar dan 3 MiB total (`result-budget.ts`). Controller eksternal karenanya melihat pixel.
- Sesi tool Native menerima hasil yang sama, tetapi `agent-tool-session.ts:183-189` hanya meneruskan `text: toolText(raw)` ke controller. Berkas itu tidak punya penanganan gambar; blok gambar tidak sampai ke model.
- Kontrak pesan hanya teks: `AgentModelMessage.content: string | null` (`agent-provider.ts:86`), dan `modalities: Array<'text'>` (`:49`). Blok Anthropic yang ada hanya `text`, `tool_use` dan `thinking`.
- Pembaca katalog model mem-parse `input_modalities` hanya untuk memastikan teks (`agent-provider-readiness.ts:223`); kemampuan gambar per model tidak dicatat.
- Composer chat tidak punya lampiran, tempel atau seret gambar (pencarian di `src/ui/src` tidak menemukannya).

Belum diperiksa: apakah katalog model gateway yang dipakai benar-benar mengumumkan `image` pada `input_modalities`, dan bentuk wire tiap provider yang aktif. Keduanya diverifikasi pada V1 sebelum kode lain ditulis. Manfaat akurasi belum diukur.

## Mekanisme dan owner existing yang dipakai

V1 — Kemampuan gambar di jalur provider (server). Catat `image` dari `input_modalities` (`agent-provider-readiness.ts`) dan lebarkan `modalities`. Pesan pengguna boleh membawa `images` (jumlah dan byte dibatasi). Adapter OpenAI-chat dan Anthropic menuliskannya sebagai bagian gambar hanya bila rute model mendukung; bila tidak, pesan memakai teks dan menyebut secara eksplisit bahwa model tidak menerima gambar, bukan diam-diam hanya metadata.

V2 — Jembatan tool ke penglihatan (server). Setelah hasil tool yang `raw.content`-nya memuat blok gambar (`image_inspect`, tangkapan layar `browser_control`, `phone_observe`), controller menyisipkan satu pesan pengguna lanjutan bertanda "Gambar dari tool X (invocation …)" yang membawa gambar tersebut, karena pesan peran `tool` pada format OpenAI hanya teks. Batas ukuran mengikuti anggaran yang sudah ada. Langkah yang disimpan hanya mencatat sha256, dimensi dan rujukan invocation; pixel tidak masuk ke chat store maupun ringkasan kompaksi (yang menulis "[image omitted]").

V3 — Akurasi lewat owner existing. `image_inspect` sudah punya `overview` dan `crop`. Deskripsi tool untuk Native diberi petunjuk memakai `crop` untuk teks kecil atau area padat. Tidak ada tool baru.

V4 — Lampiran di composer (UI, ditunda). Tempel, seret dan pilih berkas, dengan chip dan thumbnail; gambar dikirim sebagai `images` pada pesan. Disimpan terbatas oleh `agent-chat-store.ts`, tanpa folder baru.

V5 — Akuntansi konteks. `accountContext` menghitung karakter; tambahkan estimasi token per gambar agar meter, pemicu kompaksi dan anggaran tetap jujur.

Urutan yang diusulkan: V1 + V2 + V5 sebagai satu paket (inilah yang memperbaiki keluhan), lalu V3 (kecil), lalu V4 bila diminta.

## Scope, batas Native, risiko dan otorisasi

- Tidak ada grant baru: gambar hanya datang dari tool yang sudah diizinkan pada giliran itu. Tidak ada tool baru.
- Saklar mati: `AGENT_CORE_NATIVE_VISION=off` mengembalikan perilaku teks-saja.
- Privasi: gambar tidak dapat di-mask seperti teks dan dikirim ke penyedia model, sebagaimana teks pada giliran yang sama. Tangkapan layar dapat memuat rahasia; gambar tidak disimpan di chat store pada V1 dan V2.
- Biaya: gambar menambah token masukan; dibatasi jumlah, ukuran dan estimasi pada V5.
- Risiko kompatibilitas: bentuk wire berbeda antar provider; adapter yang tidak mendukung jatuh ke teks dengan pemberitahuan.
- Berkas yang tersentuh (`agent-controller.ts`, `agent-provider.ts`) sedang diubah paket B4c-1; paket ini dijalankan sesudahnya.

## Manfaat yang diharapkan dan keterbatasan

Harapan, belum terukur: Native dapat membaca teks pada tangkapan layar, memeriksa tata letak, dan memverifikasi hasil visual, yang kini tidak mungkin. Keterbatasan: model tanpa input gambar tetap hanya menerima metadata; akurasi bergantung pada model dan ukuran gambar yang lolos anggaran.

## Acceptance, evaluasi dan rollback

- Uji unit: serialisasi bagian gambar untuk kedua format wire; fallback teks dengan pemberitahuan; pesan lanjutan disisipkan hanya setelah hasil tool bergambar; kompaksi tidak membawa base64; estimasi token gambar masuk ke `accountContext`.
- Verifikasi hidup (kebenaran, bukan benchmark): `image_inspect` pada PNG kecil buatan sendiri yang memuat teks acak; Native harus membacakan teks itu dengan benar.
- Rollback: `AGENT_CORE_NATIVE_VISION=off`, atau revert paket; tidak ada migrasi data pada V1 dan V2.

## Riwayat revisi

- Revisi 1 (2026-10-30): dokumen pertama.

## Keputusan pengguna dan scope

APPROVE revisi 1, scope V1 + V2 + V5 (build), diberikan pengguna di chat pada 2026-10-30 ("aku setujui sesuai dengan rekomendasi kamu saja") atas pertanyaan keputusan proposal ini; rekomendasinya adalah tepat paket V1 + V2 + V5. V3 belum disetujui dan V4 tidak diminta. Persetujuan ini tidak mencakup revisi berikutnya atau scope tambahan. Status APPROVED belum berarti selesai: implementasi, validasi dan arsip ke `docs/history-agent-core` menyusul setelah acceptance terpenuhi.
