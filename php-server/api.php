<?php
/**
 * =========================================================================
 * SUSHEE Karaoke - Smart PHP Hosting API Endpoint (api.php)
 * Kompatibel dengan: cPanel, my.php.id, Apache, Nginx, LiteSpeed (PHP 7.4 - 8.x)
 * =========================================================================
 * 
 * Fitur:
 * 1. Otomatis memindai file musik (.mp3, .m4a, .wav, .flac, .ogg) di folder saat ini (__DIR__) maupun subfolder 'songs/'
 * 2. Smart Match file lirik (.lrc): otomatis mencocokkan variasi penamaan seperti:
 *    "the-offspring-hit-that_vocals-back.mp3" <---> "Hit That - The Offspring.lrc"
 * 3. Ekstraksi otomatis tag [ti:Judul] & [ar:Artis] dari file .lrc
 * 4. Encoding URL aman untuk spasi (%20) dan karakter khusus
 * 5. Mendukung query pencarian (?q=judul_atau_penyanyi)
 */

// Header CORS agar bisa diakses oleh aplikasi Android & Web browser
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, HEAD");
header("Access-Control-Allow-Headers: Range, Content-Type, Authorization");
header("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges");
header("Content-Type: application/json; charset=UTF-8");

// Tangani HTTP OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 1. Deteksi protokol URL (http:// atau https://)
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') 
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

$protocol = $isHttps ? "https://" : "http://";
$host = $_SERVER['HTTP_HOST'];

// Normalisasi direktori URL tempat api.php berada
$rawScriptDir = dirname($_SERVER['PHP_SELF']);
$rawScriptDir = str_replace('\\', '/', $rawScriptDir);
$segments = array_filter(explode('/', $rawScriptDir), function($s) {
    return $s !== '' && $s !== '.';
});
$encodedDir = '/' . implode('/', array_map('rawurlencode', array_map('urldecode', $segments)));

// Tentukan direktori fisik yang akan dipindai
$scanDirs = [];

// Cek jika ada subfolder 'songs/'
$subSongs = __DIR__ . DIRECTORY_SEPARATOR . 'songs';
if (is_dir($subSongs)) {
    $scanDirs[] = [
        'path' => $subSongs . DIRECTORY_SEPARATOR,
        'baseUrl' => $protocol . $host . $encodedDir . '/songs/'
    ];
}

// Pindai folder utama tempat api.php berada
$scanDirs[] = [
    'path' => __DIR__ . DIRECTORY_SEPARATOR,
    'baseUrl' => $protocol . $host . $encodedDir . '/'
];

// Helper: Tokenisasi string untuk fuzzy matching cerdas
function getTokens($str) {
    $str = strtolower($str);
    // Hapus suffix umum seperti _vocals-back, _instrumental, dsb
    $str = preg_replace('/(_vocals-back|_vocals|_instrumental|_karaoke|-karaoke|\(karaoke\)|\(instrumental\)|\(\d+\))/i', '', $str);
    preg_match_all('/[a-z0-9]+/i', $str, $matches);
    $tokens = !empty($matches[0]) ? $matches[0] : [];
    $filtered = array_filter($tokens, function($t) {
        return strlen($t) >= 2 || is_numeric($t);
    });
    sort($filtered);
    return array_values(array_unique($filtered));
}

// Helper: Ekstraksi tag [ti:...] dan [ar:...] dari isi file LRC
function parseLrcMetadata($content) {
    $title = null;
    $artist = null;
    if ($content) {
        if (preg_match('/\[ti:\s*([^\]\r\n]+)\]/i', $content, $m)) {
            $title = trim($m[1]);
        }
        if (preg_match('/\[ar:\s*([^\]\r\n]+)\]/i', $content, $m)) {
            $artist = trim($m[1]);
        }
    }
    return ['title' => $title, 'artist' => $artist];
}

// 2. Kumpulkan dan indeks seluruh file .lrc terlebih dahulu
$allLrcFiles = [];
$lrcIndex = [];

foreach ($scanDirs as $target) {
    $dir = $target['path'];
    if (!is_dir($dir)) continue;
    $files = @scandir($dir);
    if (!$files) continue;

    foreach ($files as $file) {
        if ($file === '.' || $file === '..' || is_dir($dir . $file)) continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if ($ext === 'lrc') {
            $base = pathinfo($file, PATHINFO_FILENAME);
            $fullPath = $dir . $file;
            $url = $target['baseUrl'] . rawurlencode($file);

            $content = null;
            if (@filesize($fullPath) < 153600) {
                $content = @file_get_contents($fullPath);
            }
            $meta = parseLrcMetadata($content);
            $tokens = getTokens($base);
            $tokenKey = implode('-', $tokens);

            $lrcItem = [
                'filename' => $file,
                'basename' => $base,
                'path' => $fullPath,
                'url' => $url,
                'content' => $content,
                'metaTitle' => $meta['title'],
                'metaArtist' => $meta['artist'],
                'tokens' => $tokens,
                'tokenKey' => $tokenKey
            ];

            $allLrcFiles[] = $lrcItem;
            $lrcIndex[strtolower($base)] = $lrcItem;
        }
    }
}

// 3. Pindai file audio dan lakukan smart matching ke file LRC
$query = isset($_GET['q']) ? strtolower(trim($_GET['q'])) : '';
$audioExtensions = ['mp3', 'm4a', 'wav', 'ogg', 'flac'];
$catalog = [];
$processedFiles = [];

foreach ($scanDirs as $target) {
    $dir = $target['path'];
    if (!is_dir($dir)) continue;
    $files = @scandir($dir);
    if (!$files) continue;

    foreach ($files as $file) {
        if ($file === '.' || $file === '..' || is_dir($dir . $file)) continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (!in_array($ext, $audioExtensions)) continue;

        // Cegah duplikasi jika file ada di dua direktori
        if (isset($processedFiles[$file])) continue;
        $processedFiles[$file] = true;

        $basename = pathinfo($file, PATHINFO_FILENAME);
        $fullPath = $dir . $file;
        $audioUrl = $target['baseUrl'] . rawurlencode($file);

        // Filter query pencarian jika ada
        if (!empty($query)) {
            $searchHaystack = strtolower($file . ' ' . $basename);
            if (strpos($searchHaystack, $query) === false) {
                continue;
            }
        }

        // Cari file lirik (.lrc) yang cocok
        $matchedLrc = null;

        // Cek 1: Nama sama persis (case-insensitive)
        $lowerBase = strtolower($basename);
        if (isset($lrcIndex[$lowerBase])) {
            $matchedLrc = $lrcIndex[$lowerBase];
        }

        // Cek 2: Bersihkan suffix umum (_vocals-back, _vocals, dsb)
        if (!$matchedLrc) {
            $cleanSuffix = preg_replace('/(_vocals-back|_vocals|_instrumental|_karaoke|-karaoke|\(karaoke\)|\(instrumental\))$/i', '', $basename);
            $lowerClean = strtolower($cleanSuffix);
            if (isset($lrcIndex[$lowerClean])) {
                $matchedLrc = $lrcIndex[$lowerClean];
            }
        }

        // Cek 3: Fuzzy matching berdasarkan kesamaan token kata
        if (!$matchedLrc) {
            $audioTokens = getTokens($basename);
            $audioTokenKey = implode('-', $audioTokens);

            if (!empty($audioTokens)) {
                // Cek token exact set
                foreach ($allLrcFiles as $lrc) {
                    if ($lrc['tokenKey'] === $audioTokenKey) {
                        $matchedLrc = $lrc;
                        break;
                    }
                }

                // Cek Jaccard similarity >= 0.6
                if (!$matchedLrc) {
                    $bestScore = 0;
                    $bestCandidate = null;
                    foreach ($allLrcFiles as $lrc) {
                        $intersect = count(array_intersect($audioTokens, $lrc['tokens']));
                        $union = count(array_unique(array_merge($audioTokens, $lrc['tokens'])));
                        $sim = $union > 0 ? ($intersect / $union) : 0;
                        if ($sim >= 0.6 && $sim > $bestScore) {
                            $bestScore = $sim;
                            $bestCandidate = $lrc;
                        }
                    }
                    if ($bestCandidate) {
                        $matchedLrc = $bestCandidate;
                    }
                }
            }
        }

        // Tentukan Judul Lagu dan Nama Artis
        $title = null;
        $artist = null;

        if ($matchedLrc && !empty($matchedLrc['metaTitle'])) {
            $title = $matchedLrc['metaTitle'];
            $artist = !empty($matchedLrc['metaArtist']) ? $matchedLrc['metaArtist'] : 'Karaoke Track';
        } elseif ($matchedLrc && strpos($matchedLrc['basename'], ' - ') !== false) {
            $parts = explode(' - ', $matchedLrc['basename'], 2);
            $title = trim($parts[0]);
            $artist = trim($parts[1]);
        } else {
            $cleanName = preg_replace('/(_vocals-back|_vocals|_instrumental|_karaoke|-karaoke|\(karaoke\)|\(instrumental\))$/i', '', $basename);
            if (strpos($cleanName, ' - ') !== false) {
                $parts = explode(' - ', $cleanName, 2);
                $artist = trim($parts[0]);
                $title = trim($parts[1]);
            } else {
                $cleanName = str_replace(['_', '-'], ' ', $cleanName);
                $title = $cleanName;
                $artist = 'Karaoke Track';
            }
        }

        $cleanTitle = ucwords(trim(str_replace(['_', '-'], ' ', $title)));
        $cleanArtist = ucwords(trim(str_replace(['_', '-'], ' ', $artist)));

        $hasLyrics = ($matchedLrc !== null);

        $catalog[] = [
            'id' => 'host_' . substr(md5($file), 0, 10),
            'title' => $cleanTitle,
            'artist' => $cleanArtist,
            'filename' => $file,
            'format' => '.' . strtoupper($ext),
            'source' => 'custom_host',
            'audioUrl' => $audioUrl,
            'hasLyrics' => $hasLyrics,
            'lrcUrl' => $hasLyrics ? $matchedLrc['url'] : null,
            'lrcContent' => $hasLyrics ? $matchedLrc['content'] : null,
            'fileSize' => @filesize($fullPath) ?: 0
        ];
    }
}

// 4. Urutkan berdasarkan judul secara alfabetis
usort($catalog, function($a, $b) {
    return strcasecmp($a['title'], $b['title']);
});

echo json_encode([
    'status' => 'success',
    'server' => 'SUSHEE PHP Hosting Server',
    'total' => count($catalog),
    'songs' => $catalog
], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
