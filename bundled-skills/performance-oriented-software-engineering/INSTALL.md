# Instalasi Performance-Oriented Software Engineering

## Windows

1. Ekstrak ZIP sepenuhnya.
2. Buka folder `performance-oriented-software-engineering`, lalu klik dua kali
   `Install-Windows.cmd`. Jalankan sebagai pengguna biasa.
3. Buka CLI `codex`, ketik `/hooks`, lalu tinjau dan beri **Trust** pada hook
   dari `hooks.json` di komputer tujuan. Trust dilakukan di setiap komputer.
4. Jika skill/hook belum muncul, restart Codex Desktop. Skill dapat dipilih
   otomatis untuk task relevan atau dipanggil dengan
   `$performance-oriented-software-engineering`.

Installer memakai Python bawaan Codex yang sudah tersedia di profil pengguna,
atau Python 3 melalui `py.exe`. Tidak ada download, instalasi global, atau
permintaan administrator. Path hook dibuat dari lokasi instalasi komputer tujuan.
Python yang dipakai perlu tetap tersedia setelah instalasi.

Lokasi default adalah `skills/performance-oriented-software-engineering` di
`CODEX_HOME`, atau `%USERPROFILE%\.codex` jika variabel tersebut tidak diatur.
Jika satu salinan sudah ada di lokasi itu atau `~/.agents/skills`, installer
memakai salinan tersebut. Hook lain dalam `hooks.json` dipertahankan. File lama
yang berubah dicadangkan di `CODEX_HOME/skill-install-backups`; instalasi ulang
dengan isi yang sama tidak menggandakan hook. `config.toml`, model, permissions,
dan catatan Trust tidak disalin atau diubah installer.

## Alternatif dan lokasi lain

Jika Python tidak tersedia, salin folder skill ini ke
`~/.agents/skills/performance-oriented-software-engineering`. Skill dan pemilihan
otomatisnya dapat dipakai tanpa hook. Untuk memasang hook kemudian, jalankan
installer dengan Python 3 yang sudah tersedia dan lakukan Trust.

Di macOS/Linux, dari folder hasil ekstraksi:

```sh
python3 scripts/install_skill.py --skills-dir ~/.agents/skills
```

Opsi yang sama tersedia di Windows melalui `py -3` atau path `python.exe`:

- `--skills-dir PATH`: memilih folder induk instalasi skill, misalnya
  folder `.agents/skills` pengguna.
- `--codex-home PATH`: memilih lokasi konfigurasi host.
- `--skill-only`: memasang skill tanpa mengubah `hooks.json`.

Panduan resmi: [skill lokal](https://learn.chatgpt.com/docs/build-skills) dan
[review/Trust hook](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).
