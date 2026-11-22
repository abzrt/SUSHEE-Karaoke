const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const wwwDir = path.join(__dirname, 'www');

if (!fs.existsSync(wwwDir)) {
  fs.mkdirSync(wwwDir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    for (const file of files) {
      if (file === 'node_modules' || file === 'android' || file === 'www' || file === '.git') continue;
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy essential folders and files to www and android public assets
const targets = [wwwDir, path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public')];

targets.forEach(targetDir => {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'assets'].forEach(item => {
    const itemPath = path.join(srcDir, item);
    if (fs.existsSync(itemPath)) {
      copyRecursive(itemPath, path.join(targetDir, item));
    }
  });
  // Remove leftovers that must not ship inside the APK
  ['diagnostics.html', 'test.html', path.join('js', 'default-cloud-catalog.json')].forEach(item => {
    const stale = path.join(targetDir, item);
    if (fs.existsSync(stale)) fs.rmSync(stale, { force: true });
  });
});

console.log('✓ Successfully prepared www and android assets for Android build');
