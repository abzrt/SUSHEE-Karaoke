# 📁 Panduan Upload Hosting PHP (my.php.id / cPanel) untuk SUSHEE Karaoke

Folder ini berisi script API PHP yang siap diunggah ke web hosting Anda (seperti **https://my.php.id/**, Niagahoster, DomaiNesia, IDCloudHost, atau cPanel manapun).

---

## 🚀 Langkah Cepat Pemasangan (Hanya 2 Menit):

### 1. Buat Folder di cPanel / File Manager
* Masuk ke **cPanel** di akun hosting Anda.
* Buka menu **File Manager** -> masuk ke folder `public_html/`.
* Buat folder baru dengan nama `karaoke` (atau nama lain sesuai selera).
* Di dalam folder `karaoke/`, buat folder lagi bernama `songs`.

Sehingga strukturnya seperti ini:
```text
public_html/
└── karaoke/
    ├── api.php          <-- Upload file api.php ke sini
    ├── .htaccess        <-- Upload file .htaccess ke sini
    └── songs/           <-- Upload semua file lagu & lirik ke sini
```

### 2. Upload File
* Upload file `api.php` dan `.htaccess` ke dalam folder `public_html/karaoke/`.
* Upload seluruh lagu karaoke Anda (`.mp3`, `.m4a`, `.wav`) dan file lirik berjalan (`.lrc`) ke dalam folder `public_html/karaoke/songs/`.

> **💡 Tips Penamaan Lagu & Lirik:**
> Agar otomatis terdeteksi dengan rapi oleh aplikasi:
> - Format lagu: `Nama Artis - Judul Lagu.mp3`
> - Format lirik: `Nama Artis - Judul Lagu.lrc`
> *(Pastikan nama file lagu dan lirik sama persis agar lirik otomatis tersinkronkan).*

### 3. Masukkan URL ke Aplikasi SUSHEE
* Buka aplikasi SUSHEE Karaoke.
* Masuk ke tab **Cloud Server**.
* Masukkan URL endpoint API Anda, misalnya:
  `https://domain-anda.my.php.id/karaoke/api.php`
  *(atau `https://domainanda.com/karaoke/api.php`)*
* Klik **Simpan & Hubungkan**.
* Semua lagu Anda akan langsung muncul dan siap dinyanyikan secara *live streaming*!
