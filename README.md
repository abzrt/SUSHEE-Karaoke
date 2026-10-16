# 🎤 SUSHEE - Songbook Karaoke Android App

Aplikasi karaoke modern dengan desain minimalis untuk Android yang dilengkapi dengan **efek vokal profesional ala StarMaker**, **perekaman suara simultan bersama musik pengiring**, **pemindaian file memori HP (.mp3, .m4a, .wav, .lrc)**, dan **dukungan multi-bahasa**.

---

## ✨ Fitur Utama

### 1. 📂 Pemindaian Memori HP (.mp3, .m4a, .wav, .lrc)
- **Pindai Folder Otomatis**: Mendeteksi folder musik di penyimpanan internal maupun SD Card.
- **Dukungan Format Lengkap**: Membaca file audio `.mp3`, `.m4a`, `.wav`, `.flac`, `.ogg` dan file lirik tersinkronisasi `.lrc`.
- **Auto-Pairing Cerdas (Token Set Matching)**: Otomatis mencocokkan file audio (bahkan dengan penamaan stem AI seperti `_vocals-back`, `_other`, `bs_roformer`) dengan file lirik `.lrc` yang beririsan kata kuncinya.
- **Pasang Lirik Manual**: Opsi untuk mengunggah file lirik `.lrc` ke lagu manapun yang belum memiliki lirik.
- **Penyimpanan Lokal (IndexedDB)**: Daftar lagu yang telah dipindai akan tersimpan otomatis di perangkat tanpa perlu memindai ulang setiap kali membuka aplikasi.

### 2. 🎙️ Perekaman Suara Simultan (Dual-Track Karaoke)
- **Perekaman Real-Time**: Merekam suara vokal Anda berbarengan dengan musik latar yang sedang berputar layaknya berkaraoke sungguhan.
- **Live Earphone Monitoring**: Fitur mendengarkan suara vokal sendiri secara langsung melalui earphone lengkap dengan efek suara yang sedang aktif tanpa delay.
- **Lirik Berjalan (LRC Sync)**: Tampilan lirik otomatis bergulir mengikuti ketukan dan menit lagu dengan sorotan (highlight) baris aktif.
- **Ekspor & Download**: Hasil rekaman dapat langsung diputar ulang, diunduh ke memori HP dalam format `.wav` atau `.webm`, dan disimpan di daftar rekaman.

### 3. 🎚️ Efek Vokal ala STARMAKER (Web Audio DSP Engine)
- **Studio Pro**: Kompresi vokal hangat, gema ruangan halus, dan penajaman frekuensi tinggi untuk vokal sejernih rekaman studio.
- **KTV Karaoke**: Reverb ruangan karaoke klasik dengan stereo slap-back echo khas panggung KTV.
- **Konser Hall**: Reverb arena megah dengan ekor gema panjang dan kehangatan bass.
- **Pop Stage**: Kompresi dinamis dengan penguatan frekuensi mid/treble untuk vokal yang menonjol dan enerjik.
- **Auto-Tune / Robot**: Efek modulasi vokal elektronik futuristik dengan saturasi khas StarMaker.
- **Akustik Hangat**: Sentuhan saturasi tabung vintage dengan nuansa akustik lembut.
- **Kontrol Kustom Pro**: Slider manual untuk mengatur Volume Mic, Volume Musik, Reverb Wet, Delay Time (Echo), dan Karakter Treble.

### 4. 🌐 Opsi Rubah Bahasa (Indonesia & English)
- Pilihan bahasa instan antara **Bahasa Indonesia (ID)** dan **English (EN)** melalui tombol toggle di bagian atas aplikasi.
- Seluruh teks, label preset, deskripsi efek, modal, dan pesan status disesuaikan secara natural.

### 5. 🖤 Desain Minimalis & Modern (Android Oriented)
- **Estetika OLED Dark Mode**: Latar belakang hitam peka cahaya dengan aksen neon gradien (Cyber Cyan & Electric Violet).
- **Glassmorphism**: Panel transparan dengan efek blur modern (*backdrop blur*).
- **Visualizer Audio Neon**: Visualisasi spektrum gelombang suara langsung saat Anda bernyanyi.
- **Navigasi Bawah**: Menu navigasi khas aplikasi Android (Lagu, Karaoke, Rekaman, Setelan).

---

## 🚀 Cara Menjalankan Aplikasi

### Opsi 1: Menjalankan di Browser / HP (PWA)
Aplikasi ini sudah aktif dan dapat diakses di:
```bash
http://localhost:5173
```
Untuk mengakses dari HP Android dalam satu jaringan Wi-Fi:
1. Buka browser Chrome di HP Android Anda.
2. Masukkan alamat IP komputer Anda: `http://192.168.100.27:5173`.
3. Klik menu titik tiga di Chrome dan pilih **"Add to Home screen" / "Instal Aplikasi"** untuk menjadikannya aplikasi mandiri di HP Android Anda!

### Opsi 2: Membuat File APK Android (Capacitor & Android Studio)
Aplikasi ini telah disiapkan dengan konfigurasi Capacitor (`capacitor.config.json`).
Untuk membangun file APK Android:

1. Buka terminal di folder project ini:
   ```powershell
   cd C:\Users\user\.gemini\antigravity-ide\scratch\karaoke-app
   ```
2. Tambahkan platform Android:
   ```powershell
   npx.cmd cap add android
   ```
3. Sinkronisasikan berkas aplikasi:
   ```powershell
   npx.cmd cap sync android
   ```
4. Buka di Android Studio:
   ```powershell
   npx.cmd cap open android
   ```
5. Di Android Studio, klik **Build > Build Bundle(s) / APK(s) > Build APK(s)** untuk menghasilkan file `.apk` siap instal di HP Android Anda.

---

## 📁 Struktur Direktori

```
karaoke-app/
├── assets/
│   ├── icon.jpg          # Icon aplikasi resolusi tinggi
│   ├── icon-192.png      # Icon Android PWA 192px
│   └── icon-512.png      # Icon Android PWA 512px
├── css/
│   └── style.css         # Desain sistem minimalis & responsif
├── js/
│   ├── i18n.js           # Terjemahan Bahasa Indonesia & Inggris (SUSHEE)
│   ├── lrc-parser.js     # Parser lirik berformat .LRC
│   ├── audio-effects.js  # Mesin DSP efek vokal StarMaker
│   ├── storage-scanner.js# Pindai file memori HP (.mp3, .m4a, .wav, .lrc) dengan smart matching
│   ├── recorder.js       # Perekam audio simultan (mic + musik)
│   ├── visualizer.js     # Audio frequency canvas visualizer
│   └── app.js            # Controller utama antarmuka
├── capacitor.config.json # Konfigurasi Android Capacitor
├── manifest.json         # Android Web App Manifest (SUSHEE)
├── package.json          # Manajemen dependency & scripts
├── server.js             # Dev server lokal dengan audio streaming
└── index.html            # Antarmuka utama aplikasi
```
