const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 5173;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.lrc': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive'
};

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  
  // Convenient alias routes for testing & downloading APK
  if (reqPath === '/') reqPath = '/index.html';
  if (reqPath === '/test' || reqPath === '/download' || reqPath === '/portal') {
    reqPath = '/test.html';
  }

  const filePath = path.join(__dirname, reqPath);

  // Security check to avoid path traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Support HTTP Range requests for audio streaming
    const range = req.headers.range;
    if (range && (contentType.startsWith('audio/') || contentType.startsWith('video/'))) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fileStream.pipe(res);
    } else {
      const headers = {
        'Content-Length': stats.size,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      // Ensure proper APK download triggering on Android mobile browsers
      if (ext === '.apk') {
        const fileName = path.basename(filePath);
        headers['Content-Disposition'] = `attachment; filename="${fileName}"`;
      }

      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

const localIp = getLocalIp();

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log('🎤 SUSHEE KARAOKE - DEVELOPMENT & TESTING SERVER AKTIF');
  console.log('================================================================');
  console.log('⚡ LINK UNTUK MENGETEST APLIKASI SEBELUM BUILD APK:');
  console.log(`   👉 Buka di HP (Satu Wi-Fi)  : http://${localIp}:${PORT}`);
  console.log(`   👉 Buka di Browser PC       : http://localhost:${PORT}`);
  console.log('   (Gunakan link di atas untuk menguji vokal, rekaman, efek');
  console.log('    StarMaker, dan lirik lagu secara instan tanpa perlu build APK)');
  console.log('----------------------------------------------------------------');
  console.log('📱 PORTAL PENGUJIAN & DOWNLOAD APK ANDROID:');
  console.log(`   👉 Portal QR Code HP        : http://${localIp}:${PORT}/test.html`);
  console.log(`   👉 Unduh APK Langsung       : http://${localIp}:${PORT}/SUSHEE-Karaoke.apk`);
  console.log(`   👉 Unduh APK Release        : http://${localIp}:${PORT}/SUSHEE-Karaoke-Release.apk`);
  console.log('================================================================');
});
