# External Learning: recall, kontinuitas dan validasi ulang klaim

Status: source implemented, aktivasi dan penerimaan resident dicatat terpisah
di `docs/External-Learning-Priorities-20261019.md`. Scope hanya external AI;
Native AI Agent Core tersedia untuk pengembangan dan operasi sejak keputusan pengguna 2026-10-24. Owner tetap `src/memory`, Learning dan Skills existing.

## Recall dengan batas waktu

`memory_v2_read(action=recall)` eksternal memakai satu budget lokal 15 detik
sejak pemanggilan, mencakup lookup scope, semantic wait dan admission disclosure.
Abort satu waiter tidak membatalkan query embedding bersama milik caller lain.
Provider dapat tetap bekerja setelah caller berhenti menunggu. Tidak ada klaim
preemption I/O sinkron, pembatalan operasi yang sudah committed atau konfirmasi
pengiriman jaringan. Riwayat lama dapat dikompaksi; attempt baru hanya di-append
durable setelah admission terakhir. Mirror Learning bersifat tambahan, bukan
otoritas baru atas ledger canonical.

## Kontinuitas task

Mulai/reconnect `controller_learning(action=episode,episodeOperation=start)`
dengan `taskKey` stabil, workspace terdaftar dan `description` berisi tujuan.
Respons `memoryTask.status=linked` berarti episode Memory existing berhasil
dihubungkan. Jika unavailable, lihat reason; jangan mengklaim checkpoint ada.
Tanpa description, workflow manual `memory_v2_write(action=task_start)` tetap.

Gunakan `scope:{taskId:<id Learning yang dikembalikan host>}` pada Memory tool.
Baca task_context; expand episodeRef jika handle-only dan ikuti paging. Simpan
constraint, failed-path, blocker serta next-action lewat event_append existing,
dengan `expectedRevision` dan `operationId` stabil. Lakukan checkpoint Memory
saat handoff. Reconnect tidak mengganti tujuan lama, mereset working state atau
membuka ulang task paused/completed. Learning checkpoint/review tetap terpisah.

Saat mengubah item critical existing, gunakan event kind `correction` dan
pertahankan seluruh SourceRef lama bersama bukti baru. Gunakan operasi resolve
untuk blocker/next-action yang sudah selesai, dengan alasan dan bukti; jangan
mengganti histori critical lewat upsert biasa. `MEMORY_PRESERVATION_REQUIRED`
berarti perubahan ditolak, bukan izin mengosongkan state atau mengulang mutasi
tanpa membaca ulang revisi dan kontraknya.

## Validasi ulang klaim (opt-in)

Baca `memory_v2_read(action=capabilities)` untuk structured guide. `claim_review`
adalah action baru pada dua facade external yang sudah ada; bukan store/engine,
scheduler atau sistem izin baru. Metadata bounded disimpan melalui transaksi
Memory canonical di `state/claim-reviews`; note utama tidak ditulis ulang.

1. Baca record Memory yang exact dan ambil semantic revision-nya. Baca metadata
   dengan `memory_v2_read(action=claim_review,payload:{memoryId})`.
2. Definisikan kontrak dengan `memory_v2_write(action=claim_review)`:

```json
{
  "operation": "define",
  "memoryId": "<id record>",
  "expectedRevision": "<semantic sha256 record>",
  "expectedReviewRevision": null,
  "operationId": "review-contract-v1",
  "contract": {
    "validationKind": "dependency",
    "claim": "Klaim spesifik yang diperiksa",
    "scope": "Lingkup klaim dan batas berlakunya",
    "authority": { "basis": "source", "sourceRefs": [] },
    "method": { "instructions": "Periksa dependency dan perilaku representatif", "lookups": [] },
    "triggers": ["dependency-changed"],
    "cadence": { "kind": "event" }
  }
}
```

Ini hanya contoh shape; ganti placeholder dan lengkapi SourceRef dari evidence
existing yang diizinkan. Definisi bukan hasil validasi. HOW mencatat
validationKind, authority, instruksi dan lookup source/field. WHEN mencatat
trigger event, interval.hours, atau durable tanpa expiry otomatis.

3. Inspeksi source/perilaku terkini melalui tool yang diizinkan. Capture bukti
   lewat `evidence_capture` existing; controller-text tetap deklarasi controller,
   bukan verifier independen. Append attempt dengan revision note dan metadata
   terbaru, operationId stabil, observation, evidenceRefs serta checks:
   - Semua jenis: sourceAccess available/unavailable; method pass/fail/unavailable.
   - Decision: authority supported/unknown dan effectiveAt; keputusan masa depan
     belum efektif, otoritas tidak diketahui tetap unresolved.
   - Dependency: dependencyBehavior pass/fail/unavailable dan environmentRevision;
     file hash yang sama tidak membuktikan perilaku dependency tetap benar.
   - Relevance: applicable yes/no/unknown. Tidak relevan pada task ini tidak
     berarti fakta salah atau harus dihapus.
   - Externalize: externalization.status written dan target SourceRef yang dapat
     diakses. Pending/unavailable tidak dianggap selesai.
4. Read ulang metadata. LastAttempt berbeda dari lastSuccessfulValidation.
   Attempt gagal/unavailable tidak memajukan last-success. Outcome supported,
   contradicted, unresolved atau not-applicable adalah **controller-assessed**.
   Resolusi sumber membuktikan ketersediaan, bukan kebenaran semantik. Disposition
   retain/revise/externalize/retire adalah rekomendasi; tidak mengubah fact,
   authority, validity atau izin. Sumber baru bisa membantah klaim meski byte
   source lama tidak berubah.

CAS menolak revision lama dan operationId yang dipakai ulang dengan payload
berbeda. Histori bounded: 32 definisi, 64 attempt dan 128 operation per klaim;
kapasitas penuh meminta review, tidak memangkas bukti diam-diam. Complete backup
mempertahankan metadata dan evidence; knowledge-only export menyatakan metadata
review dihilangkan. Tidak ada migrasi otomatis bagi record lama: unknown tetap
unknown, dan usia atau frekuensi pemakaian tidak menghapus safeguard yang jarang
digunakan.

Proposal dan revisi: baca `docs/proposals/REVIEW-GUIDE.md`. Dashboard card hanya
notifikasi/pembacaan Markdown; keputusan memakai alur pengguna existing.
