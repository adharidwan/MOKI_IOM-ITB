# MOKI IOM ITB

MOKI adalah aplikasi operasional berbasis web untuk mendukung pengelolaan komunikasi dan konten IOM ITB. Aplikasi ini menyediakan dashboard untuk mengelola kontak, grup penerima, pengiriman pesan WhatsApp, tiket percakapan, scraping konten media sosial, content library, project asset, tag, access control, dan integrasi messaging API untuk sistem eksternal.

## Identitas Kelompok

| Nama | NIM |
|---|---|
| Mochammad Fariz Rifqi R | 13523069 |
| Nadhif Al Rozin | 13523076 |
| Shanice Feodora Tjahjono | 13523097 |
| Muhammad Adha Ridwan | 13523098 |
| Steven Owen Liauw | 13523103 |

## Fitur Utama

| Modul | Fungsi |
|---|---|
| Contacts | Mengelola direktori kontak penerima, import CSV, pencarian, filter, sorting, pagination, edit, hapus, dan aksi massal. |
| Groups | Mengelola segmentasi kontak berdasarkan grup dan anggota grup. |
| Blast Message | Mengirim WhatsApp blast dari kontak, grup, CSV, atau input manual dengan dukungan template, variabel pesan, gambar, preview, dan scheduled blast. |
| Ticket | Mengelola tiket percakapan, riwayat balasan, balasan teks/gambar, dan penutupan tiket. |
| WhatsApp | Memantau perangkat WhatsApp, QR login, status worker, delivery, queue, dan operasi perangkat. |
| Import | Melakukan scraping konten YouTube, X, dan Instagram untuk disimpan ke Content Library. |
| Library | Mengelola arsip konten hasil scraping atau input manual. |
| Assets | Mengelola project asset berisi file image/video dan URL asset. |
| Tags | Mengelola tag yang digunakan pada Library dan Assets. |
| Access Control | Mengatur akses fitur untuk akun non-admin. |
| External Messaging API | Menyediakan endpoint asynchronous untuk sistem eksternal yang perlu mengirim notifikasi WhatsApp. |

## Tech Stack Overview

MOKI dibangun dengan pendekatan full-stack TypeScript menggunakan Next.js sebagai aplikasi web utama. Data disimpan di PostgreSQL, state/queue ringan menggunakan Redis, dan file asset disimpan melalui MinIO/S3-compatible storage. Scraping konten menggunakan Playwright dan yt-dlp, sedangkan kontrol WhatsApp menggunakan `whatsapp-web.js`. Aplikasi juga menggunakan Drizzle untuk migrasi database, Material UI untuk komponen antarmuka, dan Vitest untuk pengujian otomatis.

## Prasyarat

Pastikan perangkat memiliki:

- Git
- Node.js 20 atau lebih baru
- npm
- Docker Desktop atau Docker Engine dengan Docker Compose
- Koneksi internet untuk mengunduh dependency, image Docker, dan dependency scraping

## Quick Start Lokal

Ada dua cara menjalankan aplikasi secara lokal:

- **Mode npm + service pendukung Docker**: direkomendasikan untuk pengembangan aktif karena perubahan kode langsung terlihat melalui `next dev`.
- **Mode Docker Compose penuh**: direkomendasikan untuk demo atau pengujian sistem utuh karena seluruh service dijalankan sebagai container.

### 1. Clone Repository

```bash
git clone https://github.com/adharidwan/MOKI_IOM-ITB.git
cd MOKI_IOM-ITB
```

### 2. Konfigurasi Environment

Salin file contoh environment.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

Untuk pengembangan lokal dengan `npm run dev`, pastikan nilai berikut mengarah ke service lokal di host machine:

```env
DATABASE_URL=postgresql://iom4:iom4_password@localhost:5432/iom4
REDIS_URL=redis://:your-password-123@localhost:6379
S3_ENDPOINT=http://localhost:9000
DISABLE_SSO=true
NEXT_PUBLIC_DISABLE_SSO=true
```

Catatan: `.env.example` berisi `REDIS_URL` default untuk jaringan Docker. Jika menjalankan aplikasi web langsung dengan npm, gunakan host `localhost` seperti contoh di atas.

### Optional: Cookie untuk Scraping

Beberapa platform dapat membatasi scraping jika request dianggap tidak terautentikasi. Repository menyediakan environment opsional untuk cookie scraping:

| Variable | Format | Keterangan |
|---|---|---|
| `INSTAGRAM_COOKIE` | Cookie header string | Digunakan untuk membantu scraping Instagram. Contoh format: `sessionid=...; csrftoken=...`. |
| `X_YT_DLP_COOKIES_PATH` | Path file cookie Netscape | Digunakan oleh `yt-dlp` untuk membaca media X/Twitter yang membutuhkan sesi login. |
| `X_YT_DLP_COOKIES_CONTENT` | Isi file cookie Netscape | Alternatif untuk deployment yang tidak memakai mounted file. |
| `YOUTUBE_YT_DLP_COOKIES_PATH` | Path file cookie Netscape | Digunakan oleh `yt-dlp` jika YouTube meminta verifikasi atau sesi login. |
| `YOUTUBE_YT_DLP_COOKIES_CONTENT` | Isi file cookie Netscape | Alternatif untuk deployment yang tidak memakai mounted file. |

File cookie untuk `yt-dlp` sebaiknya menggunakan format **Netscape HTTP Cookie File**, yaitu format umum yang diawali header seperti berikut:

```text
# Netscape HTTP Cookie File
.example.com	TRUE	/	FALSE	1893456000	cookie_name	cookie_value
```

Untuk lokal dengan Docker Compose, file contoh tersedia di `secret/x.com_cookies.example`. Jika tidak memakai cookie X, tetap buat file kosong `secret/x.com_cookies.txt` agar bind mount Docker Compose valid.

Jangan commit cookie asli atau session pribadi ke repository.

## Opsi A: Menjalankan dengan npm run dev

Mode ini menjalankan aplikasi web secara lokal, sementara PostgreSQL, Redis, dan MinIO dijalankan melalui Docker Compose.

### 1. Install Dependency

```bash
npm ci
```

### 2. Jalankan Service Pendukung

```bash
docker compose up -d postgres redis minio
```

Service yang tersedia:

| Service | URL/Port |
|---|---|
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

### 3. Jalankan Migrasi Database

```bash
npm run db:migrate
```

### 4. Jalankan Aplikasi Web

```bash
npm run dev
```

Aplikasi dapat dibuka di:

```text
http://localhost:3000
```

### 5. Opsional: Jalankan Web dan WhatsApp Bot Bersamaan

Jika ingin menjalankan aplikasi web sekaligus integrasi WhatsApp lokal:

```bash
npm run dev:with-bot
```

Alternatifnya, jalankan bot saja di terminal terpisah:

```bash
npm run bot
```

QR login dan status perangkat dapat dipantau melalui dashboard WhatsApp pada aplikasi. Jika QR tidak tampil di dashboard, periksa log terminal bot.

## Opsi B: Menjalankan dengan Docker Compose Penuh

Mode ini menjalankan seluruh stack sebagai container. Mode ini cocok untuk demo dan pengujian sistem secara utuh.

### 1. Siapkan Environment untuk Docker Compose

Docker Compose menggunakan `.env.local` sebagai `env_file`, tetapi interpolasi variabel `${...}` juga membutuhkan file `.env` atau environment shell. Untuk lokal, salin `.env.local` menjadi `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.local .env
```

Linux/macOS:

```bash
cp .env.local .env
```

Pastikan `.env` dan `.env.local` memiliki nilai Docker berikut:

```env
DATABASE_URL_DOCKER=postgresql://iom4:iom4_password@postgres:5432/iom4
REDIS_URL=redis://:your-password-123@redis:6379
S3_ENDPOINT_DOCKER=http://minio:9000
```

Jika file cookie X tidak digunakan untuk scraping, siapkan file kosong agar bind mount Docker Compose tetap valid.

Windows PowerShell:

```powershell
New-Item -ItemType File -Force secret/x.com_cookies.txt
```

Linux/macOS:

```bash
touch secret/x.com_cookies.txt
```

### 2. Build dan Jalankan Semua Service

```bash
docker compose up --build
```

Aplikasi dapat dibuka di:

```text
http://localhost:3000
```

### 3. Migrasi Database

Pada mode Docker Compose penuh, container `web` menjalankan migrasi secara otomatis melalui `node migrate.mjs` sebelum aplikasi Next.js dimulai. Jika perlu menjalankan migrasi ulang secara manual, gunakan:

```bash
docker compose exec web node migrate.mjs
```

### 4. Melihat Log WhatsApp Bot

```bash
docker compose logs -f bot
```

### 5. Menghentikan Service

```bash
docker compose down
```

Untuk menghentikan service sekaligus menghapus volume data lokal:

```bash
docker compose down -v
```

Catatan: pada mode Docker Compose penuh, perubahan source code tidak selalu langsung terlihat karena aplikasi berjalan dari image hasil build. Jalankan ulang `docker compose up --build` jika ingin memasukkan perubahan kode terbaru ke container.

## Scheduled Blast Cron

Scheduled blast membutuhkan pemicu berkala untuk menjalankan schedule yang sudah jatuh tempo. Aplikasi menyediakan endpoint internal berikut:

```text
POST /api/internal/scheduled-blasts/run-due
```

Endpoint ini harus dipanggil dengan bearer token yang sama dengan environment variable `SCHEDULER_SECRET`.

Contoh request dari jaringan Docker Compose:

```bash
curl -X POST \
  -H "Authorization: Bearer $SCHEDULER_SECRET" \
  http://web:3000/api/internal/scheduled-blasts/run-due
```

Untuk lingkungan yang memiliki cron worker internal, jalankan request tersebut secara periodik, misalnya setiap 60 detik.

Contoh crontab:

```cron
* * * * * curl -fsS -X POST -H "Authorization: Bearer ${SCHEDULER_SECRET}" http://web:3000/api/internal/scheduled-blasts/run-due >/dev/null 2>&1
```

Catatan:

- Gunakan URL `http://web:3000/...` jika cron worker berjalan di jaringan Docker Compose yang sama.
- Gunakan URL `http://localhost:3000/...` jika cron dijalankan dari host machine saat aplikasi berjalan dengan `npm run dev`.
- Pastikan `SCHEDULER_SECRET` di cron worker sama dengan nilai `SCHEDULER_SECRET` pada aplikasi web.
- Endpoint ini bersifat internal dan tidak boleh diekspos tanpa proteksi jaringan dan secret yang kuat.

## Penggunaan WhatsApp Lokal

Fitur WhatsApp digunakan untuk menghubungkan aplikasi dengan perangkat WhatsApp, memantau QR login, dan melihat status pengiriman pesan.

### Dengan npm run dev

Jalankan aplikasi web dan bot secara bersamaan:

```bash
npm run dev:with-bot
```

Atau jalankan bot di terminal terpisah:

```bash
npm run bot
```

Langkah login WhatsApp:

1. Buka aplikasi di `http://localhost:3000`.
2. Buka menu `WhatsApp`.
3. Pilih instance WhatsApp yang membutuhkan login.
4. Klik tombol `Show QR` jika QR belum terlihat.
5. Scan QR menggunakan aplikasi WhatsApp pada perangkat yang akan dipakai.
6. Tunggu sampai status perangkat berubah menjadi healthy/ready.

### Dengan Docker Compose

Jalankan seluruh stack:

```bash
docker compose up --build
```

Lihat log bot jika perlu memeriksa proses login atau error worker:

```bash
docker compose logs -f bot
```

QR login tetap dapat dipantau dari menu `WhatsApp` pada aplikasi. Jika QR tidak muncul di UI, periksa log bot dan status worker pada tab `Technical` di dashboard WhatsApp.

## Troubleshooting Singkat

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Aplikasi tidak dapat terhubung ke database | PostgreSQL belum berjalan atau `DATABASE_URL` salah. | Jalankan `docker compose up -d postgres`, pastikan `DATABASE_URL` memakai host `localhost` untuk mode npm dan `postgres` untuk mode Docker. |
| Redis connection error | Redis belum berjalan, password salah, atau host Redis salah. | Jalankan `docker compose up -d redis`, lalu pastikan `REDIS_URL` sesuai mode eksekusi: `localhost` untuk npm, `redis` untuk Docker. |
| Upload asset gagal | MinIO belum berjalan atau konfigurasi S3 salah. | Jalankan `docker compose up -d minio`, cek `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, dan `S3_BUCKET`. |
| Perubahan kode tidak muncul saat Docker Compose | Container memakai image hasil build lama. | Jalankan ulang `docker compose up --build`. Untuk pengembangan aktif, gunakan `npm run dev`. |
| Docker Compose gagal karena file cookie X tidak ada | Bind mount `secret/x.com_cookies.txt` belum tersedia. | Buat file kosong dengan `New-Item -ItemType File -Force secret/x.com_cookies.txt` di PowerShell atau `touch secret/x.com_cookies.txt` di Linux/macOS. |
| WhatsApp QR tidak muncul | Worker belum berjalan, instance belum dipilih, atau QR belum tersedia. | Buka menu `WhatsApp`, pilih instance, klik `Show QR`, cek tab `Technical`, dan lihat log dengan `docker compose logs -f bot` atau terminal `npm run bot`. |
| Pesan WhatsApp tidak terkirim | Perangkat belum login, assignment dipause, worker berhenti, atau pesan masih di antrean. | Cek menu `WhatsApp`, tab `Delivery` dan `Technical`, pastikan worker aktif dan perangkat sudah healthy/ready. |
| Scheduled blast tidak berjalan | Cron internal belum memanggil endpoint run-due atau `SCHEDULER_SECRET` salah. | Pastikan cron memanggil `POST /api/internal/scheduled-blasts/run-due` setiap 60 detik dengan header `Authorization: Bearer <SCHEDULER_SECRET>`. |
| Scraping gagal | Koneksi internet, dependency browser, cookie, atau pembatasan platform bermasalah. | Coba lagi dengan input lebih kecil, cek cookie Netscape untuk X/YouTube, cek `INSTAGRAM_COOKIE`, dan periksa log aplikasi. |
| SSO menghalangi akses lokal | Mode lokal belum menonaktifkan SSO. | Pastikan `DISABLE_SSO=true` dan `NEXT_PUBLIC_DISABLE_SSO=true` pada `.env.local`. |
