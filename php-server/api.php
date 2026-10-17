<?php
/**
 * =========================================================================
 * SUSHEE Karaoke - PHP Hosting API Endpoint (api.php)
 * Kompatibel dengan: cPanel, my.php.id, Apache, Nginx, LiteSpeed (PHP 7.4 - 8.x)
 * =========================================================================
 * 
 * Fungsi:
 * 1. Otomatis memindai file musik (.mp3, .m4a, .wav, .flac, .ogg) di folder 'songs/'
 * 2. Otomatis mencocokkan dengan file lirik (.lrc) yang memiliki nama sama
 * 3. Mengirim respons JSON ke aplikasi SUSHEE Karaoke lengkap dengan lirik & audio URL
 * 4. Mendukung query pencarian (?q=judul_atau_penyanyi)
 */

// Header CORS agar bisa diakses oleh aplikasi Android & Web browser
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Range, Authorization");
header("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges");
header("Content-Type: application/json; charset=UTF-8");

// Tangani HTTP OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Deteksi protokol URL (http:// atau https://)
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') 
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

$protocol = $isHttps ? "https://" : "http://";
$host = $_SERVER['HTTP_HOST'];
$scriptDir = rtrim(dirname($_SERVER['PHP_SELF']), '/\\');
$baseUrl = $protocol . $host . $scriptDir . '/songs/';
$songsDir = __DIR__ . '/songs/';

// Buat folder songs otomatis jika belum ada
if (!is_dir($songsDir)) {
    @mkdir($songsDir, 0755, true);
}

$query = isset($_GET['q']) ? strtolower(trim($_GET['q'])) : '';
$audioExtensions = ['mp3', 'm4a', 'wav', 'ogg', 'flac'];
$catalog = [];

if (is_dir($songsDir)) {
    $files = scandir($songsDir);
    
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        
        $filePath = $songsDir . $file;
        if (!is_file($filePath)) continue;

        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (in_array($ext, $audioExtensions)) {
            $basename = pathinfo($file, PATHINFO_FILENAME);
            
            // Filter query pencarian
            if (!empty($query) && strpos(strtolower($basename), $query) === false) {
                continue;
            }

            // Ekstrak Artist dan Title jika format penamaan: "Artist - Title"
            $parts = explode(' - ', $basename, 2);
            if (count($parts) === 2) {
                $artist = trim($parts[0]);
                $title = trim($parts[1]);
            } else {
                $artist = 'Karaoke Track';
                $title = $basename;
            }

            // Bersihkan simbol underscore jika ada
            $cleanTitle = str_replace(['_', '-'], ' ', $title);

            // Cek file lirik (.lrc)
            $lrcPath = $songsDir . $basename . '.lrc';
            $hasLyrics = file_exists($lrcPath);
            $lrcUrl = $hasLyrics ? $baseUrl . rawurlencode($basename . '.lrc') : null;
            $lrcContent = null;

            // Baca isi file LRC langsung jika ukuran wajar (< 100KB)
            if ($hasLyrics && filesize($lrcPath) < 102400) {
                $lrcContent = @file_get_contents($lrcPath);
            }

            $catalog[] = [
                'id' => 'host_' . substr(md5($file), 0, 10),
                'title' => ucwords(trim($cleanTitle)),
                'artist' => ucwords(trim($artist)),
                'filename' => $file,
                'format' => '.' . strtoupper($ext),
                'source' => 'custom_host',
                'audioUrl' => $baseUrl . rawurlencode($file),
                'hasLyrics' => $hasLyrics,
                'lrcUrl' => $lrcUrl,
                'lrcContent' => $lrcContent,
                'fileSize' => filesize($filePath)
            ];
        }
    }
}

// Urutkan berdasarkan judul abjad
usort($catalog, function($a, $b) {
    return strcasecmp($a['title'], $b['title']);
});

echo json_encode([
    'status' => 'success',
    'server' => 'SUSHEE PHP Hosting Server',
    'total' => count($catalog),
    'songs' => $catalog
], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
