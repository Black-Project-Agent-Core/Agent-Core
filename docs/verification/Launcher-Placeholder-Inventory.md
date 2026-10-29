# Launcher baru — daftar fungsi prototype yang belum fungsional

Tambahan 2026-10-29: Goals mode pada composer sekarang memakai turn Native yang sebenarnya: instruksi/status persisten, Pause pada checkpoint aman, Continue eksplisit, dan Stop. Ini tidak menyelesaikan CRUD/milestone pada halaman Goals & Plans; item halaman tersebut tetap mengikuti status pada tabel di bawah.

Tanggal: 2026-10-29. Scope: migrasi tampilan dan fungsi Agent Core existing terlebih dahulu, sesuai klarifikasi pengguna. Ikon tetap dari `E:\Projects\Agent-Core\assets`.

Referensi: source yang diberikan pengguna di `E:\Projects\Launcher\src`, terutama `App.tsx`, `services/storage.ts`, `services/stateMachine.ts`, serta komponen masing-masing halaman. Prototype tidak menjadi sumber kebenaran runtime: beberapa tombol hanya mengubah React state/localStorage, memakai timer, atau menghasilkan konten contoh.

**Arti status:** “owner ada, UI belum terhubung” berbeda dari “belum ada fitur mandiri/kontrak UI yang ditemukan”. Audit dibatasi pada owner dan jalur yang disebut; daftar ini tidak mengklaim absensi seluruh repository. Fungsi yang belum didukung tidak diberi hasil simulasi pada launcher hasil migrasi.

## Fungsi existing yang sudah disambungkan

| Area | Hasil migrasi |
| --- | --- |
| Chat / AI Workspace | Memakai host bridge existing: provider/model/effort, draft, history, send, progress, resume/stop recovery, cancel, archive, Memory use dan inquiry evidence. Tidak memakai respons timer prototype. |
| Runtime | Start/restart/stop memakai aksi native yang sudah ada dan status HTTP/process aktual. |
| Dashboard, Systems/Tools Hub, Activity, Diagnostics, Settings, Workflows | Koreksi prototype-first: Dashboard/Tools/Runtime/Activity/Diagnostics/Settings memakai layout baru; handler dan evidence reader existing tetap dipakai. Workflows diakses dari Tools Hub. |
| AI Models | Menampilkan descriptor provider/model nyata; tombol Use mengubah pilihan turn melalui callback existing. Pemilihan dinonaktifkan ketika turn berjalan/recovery. |
| Memory Explorer | Health canonical, jumlah note aktual dan Memory-use dari percakapan terpilih; pencarian terbatas pada records yang ditampilkan. Open Memory Store menggunakan owner native. |
| Goals & Plans | Membaca task/turn dan keputusan milik task yang sedang dipilih. Temuan tetap controller-declared; tidak menjadi klaim goal verified. |
| Artifacts | Memakai TaskChangesPanel existing: checkpoint requests, applied/external changes, diff/redaction dan exact task binding. |
| Dreaming Review | Membaca health/sink dan pending-finalization/episode yang tersedia dari snapshot existing; tidak memulai job Dreaming palsu. |

## Fungsi yang masih berupa gagasan/tampilan pada prototype

| Fungsi prototype | Bukti perilaku prototype | Dukungan codebase existing | Disposisi migrasi ini |
| --- | --- | --- | --- |
| Switch Native ↔ External controller | `App.handleToggleController` hanya mengganti field React. | Controller Native/external, autentikasi dan grant ada; bukan satu toggle UI. | Tidak membuat toggle otoritas. Workspace tetap Native; kontrol eksternal tetap lewat jalur terautentikasi existing. |
| Chat response/tool invocation contoh | `handleSendMessage` memakai `setTimeout` dan klasifikasi keyword untuk merakit respons/diff. | Runtime/chat/provider/tool owner nyata sudah ada. | Diganti oleh bridge chat existing. Bukan placeholder yang dibawa ke produk. |
| Prompt-aware tool auto-match/manual selection | `toolMatcher` memakai `INITIAL_TOOLS_INVENTORY` dan rule lexical lokal. | `agent-capability-catalog`, resolver dan Skill routing ada; daftar/grant per-task berbeda. | Hub menampilkan subsistem aktual. Recommendation picker dan manual grant toggle belum terhubung; tidak menyebut subsistem sebagai jumlah tool siap. |
| Add/register/reconnect MCP server | Data/status prototype berubah lokal. | MCP/auth/capability owners ada; provisioning memerlukan alur dan batas akses nyata. | Arbitrary Add Server/credential provisioning tidak diaktifkan. |
| API-key/model configuration editor | Model/config prototype disimpan bersama state lokal. | Provider config dan secret/auth owner ada; descriptor read tersedia di UI. | Model selection nyata aktif. Editor API key/context limit/custom model belum ada pada bridge UI yang diperiksa; tidak menyimpan credential di localStorage. |
| Context-window meter dan breakdown token | Inspector menetapkan `estimatedTokens=18450` dan angka kategori tetap. | Metrik provider/task ada di runtime; kontrak UI ini tidak memasok breakdown/context-capacity tersebut. | Angka contoh dihapus. Inspector menunjukkan field yang benar-benar tersedia atau Not recorded. |
| Attachment/upload ke konteks model | File input menyimpan nama/ukuran; `App` membuat artefak User Import berisi deskripsi contoh. | Filesystem/tool owner ada, tetapi `agent-chat-send`/HTTP yang diperiksa menerima prompt teks, bukan pipeline attachment. | Upload/context ingestion belum disambungkan; tidak mengaku file dibaca hanya karena namanya dipilih. |
| Permission/Auto-Approve mode picker | Mengubah `permissionMode` lokal dan preview callback prototype. | Dynamic task-scoped grants/approval boundaries nyata sudah ada. | Tidak menambah toggle yang melewati atau mengubah grant host. |
| Create/edit/delete goal mandiri | `GoalsPlansView` dan `handleAddGoal` mengubah array `goals` lokal. | Task goal dan working-goal Memory ada; CRUD koleksi goal prototype tidak tersedia pada bridge yang diperiksa. | Halaman read-only untuk task/decisions existing. CRUD goal baru belum dibangun. |
| Milestone/plan checkbox persistent | `handleMilestoneToggle` mengubah state lokal. | Native strategy, decisions dan turn/checkpoint ada; bukan planner CRUD yang sama. | Tidak membuat checklist yang seolah mengubah rencana Native. |
| Canonical Memory CRUD, import/export dan full-note search | Prototype memakai array `memoryRecords` contoh. | MemoryService/tools nyata tersedia. Kontrak desktop yang diperiksa hanya health dan conversation memory-use. | Recent-use search dan Open Memory Store aktif. Browser/editor/import/export seluruh canonical notes belum disambungkan. |
| Run Dreaming session/finding generation | Komponen Dreaming menerima callback yang merakit finding lokal. | Learning, curator, procedure/proposal owners ada. Tidak ada bukti bahwa callback ini menjalankannya. | Layout Dreaming dan tombol Run Dreaming Now ditampilkan dengan status planned upgrade. Health Learning nyata aktif; tidak menjalankan job palsu. |
| Apply/promote Dreaming finding | Prototype mengganti status finding. | Skill/proposal approval/revision/activation owner sudah ada dan terikat identity/task/digest. | Tidak memasang promosi lokal palsu atau mengabaikan keputusan historis. |
| Generic artifact import/editor/save/download/delete | Banyak operasi bekerja atas `ArtifactItem.content`/state browser. | Filesystem/checkpoint/task-change owner ada; kontrak artifact-editor prototype belum terhubung. | File-change inspection nyata aktif. Generic library/editor/import pipeline belum dibangun. |
| First-run wizard dan “test connection/first task” | Wizard/state menyimpan `hasCompletedWizard`; task contoh bukan hasil runtime owner. | Config/health/model owners existing dapat menjadi consumer kelak. | Wizard review Workspace/Provider/Capabilities/Ready sudah tersedia. Installer orchestration dan first-run acceptance belum disambungkan. Tidak mengganti status configured dengan flag lokal. |
| Custom window-size modal/resize handles | Prototype mengubah ukuran div dan boolean maximize; close hanya kembali ke workspace. | Native WinForms window/chrome menangani ukuran jendela yang sebenarnya. | Sesuai permintaan lanjutan, preset/Apply/Reset dan penyimpanan ukuran kini diimplementasikan; [verifikasi dan status aktivasi](Launcher-Window-Size.md). Tombol minimize/maximize/close dalam app masih ditunda, kontrol OS tetap tersedia. |
| Theme/density/accent, prompt instruction editor, root isolation dan task budget editor | Settings menyimpan state lokal dan menampilkan Saved setelah timer. | Sebagian setting native existing bekerja; runtime/config/grant/budget memiliki owner terpisah. | Hanya setting existing yang tetap berfungsi. Editor baru tidak diklaim memodifikasi config, sandbox atau budget backend. |
| Generate/export diagnostic report, rebuild index, force/clean restart | Beberapa callback kosong/simulasi atau tombol existing memang disabled. | Diagnostics/Memory/restart owners ada dengan scope berbeda. | Snapshot/log/runtime actions existing dipertahankan; operasi yang belum wired tetap tidak diaktifkan. |
| Inspector “live” task tool tracker | Prototype menampilkan daftar contoh dengan tanda sukses tetap. | Desktop log DTO ada; DTO itu tidak membawa taskId. | Diberi scope **Desktop tool activity**; tidak diatribusikan ke chat tanpa bukti. Status/durasi unknown tidak diubah menjadi sukses/0ms. |

## Prioritas bila tahap berikutnya diminta

1. Hubungkan read-only Memory/registry/metrics yang sudah punya owner, dengan paging, redaction dan scope yang eksplisit.
2. Definisikan kontrak attachment dan artifact ingestion sebelum menambah tombol upload/editor.
3. Putuskan semantik Goals/Plans/Dreaming: wiring owner existing, bukan store/agent paralel atau localStorage sebagai authority.
4. Integrasikan mutasi config/grants/proposal hanya melalui owner terautentikasi dan receipt/revision existing.

Daftar ini adalah laporan gap, bukan proposal baru atau otorisasi implementasi lanjutan. Pengguna belum meminta tahap backend baru. [Verifikasi migrasi](Launcher-Migration.md).


## Koreksi visual prototype-first

Laporan migrasi pertama tidak lagi menjadi klaim penerimaan visual. Lihat [bukti koreksi prototype-first](Launcher-Prototype-Parity.md). Menu +, kategori Memory, New Goal, Dreaming, Add Provider/MCP dan Import File mendapat tempat pada desain baru; operasi tanpa bridge tetap disabled atau diberi status planned upgrade. Sesuai permintaan berikutnya, [Window Size](Launcher-Window-Size.md) kini memiliki bridge resize/persistence; status build dan resident dicatat pada laporan tersebut. Tombol window dalam app ditunda; native window frame tetap berfungsi. Tidak ada angka token, latency inference, job sukses, atau artifact contoh yang dijadikan data runtime.
