// scripts/build-web.js
// Production minification and packaging pipeline for Sora web assets
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'frontend');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('⚡ [Sora Build] Starting web asset bundling and minification...');

// Clean & prepare destination
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

function copyRecursive(src, dest, filterFn = null) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      if (filterFn && !filterFn(item)) continue;
      copyRecursive(path.join(src, item), path.join(dest, item), filterFn);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Copy static assets (excluding raster PNG icons in favor of vector icon.svg)
console.log('📁 [Sora Build] Copying static assets (icons, manifest)...');
if (fs.existsSync(path.join(SRC_DIR, 'assets'))) {
  copyRecursive(path.join(SRC_DIR, 'assets'), path.join(DIST_DIR, 'assets'), (filename) => {
    return filename !== 'icon-192.png' && filename !== 'icon-512.png';
  });
}
if (fs.existsSync(path.join(SRC_DIR, 'manifest.webmanifest'))) {
  fs.copyFileSync(path.join(SRC_DIR, 'manifest.webmanifest'), path.join(DIST_DIR, 'manifest.webmanifest'));
}
if (fs.existsSync(path.join(SRC_DIR, 'sw.js'))) {
  fs.copyFileSync(path.join(SRC_DIR, 'sw.js'), path.join(DIST_DIR, 'sw.js'));
}

// 2. Minify CSS
console.log('🎨 [Sora Build] Minifying stylesheets (style.css)...');
fs.mkdirSync(path.join(DIST_DIR, 'css'), { recursive: true });
const cssSrcPath = path.join(SRC_DIR, 'css', 'style.css');
const cssDistPath = path.join(DIST_DIR, 'css', 'style.css');
esbuild.buildSync({
  entryPoints: [cssSrcPath],
  outfile: cssDistPath,
  minify: true,
  loader: { '.css': 'css' },
});

// 3. Minify JavaScript files
console.log('📦 [Sora Build] Minifying JavaScript modules (api.js, catalog.js, app.js)...');
fs.mkdirSync(path.join(DIST_DIR, 'js'), { recursive: true });
const jsModules = ['api.js', 'catalog.js', 'app.js'];
for (const mod of jsModules) {
  const src = path.join(SRC_DIR, 'js', mod);
  const dest = path.join(DIST_DIR, 'js', mod);
  if (fs.existsSync(src)) {
    esbuild.buildSync({
      entryPoints: [src],
      outfile: dest,
      minify: true,
      target: ['es2020'],
      legalComments: 'none',
      drop: ['console', 'debugger'],
    });
  }
}

// 4. Minify HTML & inject cache-busting query params for WebView and browsers
console.log('📄 [Sora Build] Processing index.html with cache buster...');
const buildVer = Date.now().toString(36);
let html = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf-8');
html = html
  .replace(/(?:\.\/|\/)css\/style\.css/g, `./css/style.css?v=${buildVer}`)
  .replace(/(?:\.\/|\/)js\/api\.js/g, `./js/api.js?v=${buildVer}`)
  .replace(/(?:\.\/|\/)js\/catalog\.js/g, `./js/catalog.js?v=${buildVer}`)
  .replace(/(?:\.\/|\/)js\/app\.js/g, `./js/app.js?v=${buildVer}`)
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\n\s*\n/g, '\n')
  .replace(/^\s+/gm, ' ');
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf-8');

// 4b. Process privacy.html
if (fs.existsSync(path.join(SRC_DIR, 'privacy.html'))) {
  console.log('📄 [Sora Build] Processing privacy.html...');
  let privHtml = fs.readFileSync(path.join(SRC_DIR, 'privacy.html'), 'utf-8');
  privHtml = privHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*\n/g, '\n')
    .replace(/^\s+/gm, ' ');
  fs.writeFileSync(path.join(DIST_DIR, 'privacy.html'), privHtml, 'utf-8');
}

// Summary report
function getFileSize(filePath) {
  return (fs.statSync(filePath).size / 1024).toFixed(1);
}

console.log('\n📊 [Sora Build] Asset Minification Report:');
console.log(`- catalog.js:  ${getFileSize(path.join(SRC_DIR, 'js', 'catalog.js'))} KB -> ${getFileSize(path.join(DIST_DIR, 'js', 'catalog.js'))} KB`);
console.log(`- app.js:      ${getFileSize(path.join(SRC_DIR, 'js', 'app.js'))} KB -> ${getFileSize(path.join(DIST_DIR, 'js', 'app.js'))} KB`);
console.log(`- api.js:      ${getFileSize(path.join(SRC_DIR, 'js', 'api.js'))} KB -> ${getFileSize(path.join(DIST_DIR, 'js', 'api.js'))} KB`);
console.log(`- style.css:   ${getFileSize(cssSrcPath)} KB -> ${getFileSize(cssDistPath)} KB`);
console.log(`- index.html:  ${getFileSize(path.join(SRC_DIR, 'index.html'))} KB -> ${getFileSize(path.join(DIST_DIR, 'index.html'))} KB`);
console.log('✨ [Sora Build] All assets bundled successfully in dist/\n');
