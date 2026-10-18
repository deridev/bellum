// Turns dist/index.html into dist/artifact.html: a body-only page for the artifact host
// (it supplies doctype/head), loading the built script and stylesheet as classic files.
import fs from 'node:fs';
const html = fs.readFileSync('dist/index.html', 'utf8');
const js = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(m => m[1]);
const css = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(\.\/assets[^"]+)"[^>]*>/g)].map(m => m[1]);
const page = `<title>Bellum</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
${css.map(h => `<link rel="stylesheet" href="${h}">`).join('\n')}
<div id="app"></div>
${js.map(s => `<script src="${s}" defer></script>`).join('\n')}
`;
fs.writeFileSync('dist/artifact.html', page);
const files = {};
for (const dir of ['assets', 'data']) for (const f of fs.readdirSync(`dist/${dir}`)) files[`${dir}/${f}`] = `game/dist/${dir}/${f}`;
fs.writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 1));
console.log('artifact page written;', Object.keys(files).length, 'files');
