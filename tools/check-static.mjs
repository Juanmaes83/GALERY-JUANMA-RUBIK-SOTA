#!/usr/bin/env node
/**
 * Comprobación estática del museo (sin navegador).
 *
 *   node tools/check-static.mjs
 *
 * 1. Sintaxis de todos los .js/.mjs (`node --check`).
 * 2. Todos los .json parsean.
 * 3. Grafo de dependencias desde index.html: cada referencia local resuelve a un
 *    archivo del repositorio. Las únicas excepciones son las referencias inertes
 *    declaradas en INERT_REFERENCES, con su motivo.
 * 4. Cada `content.media.src` del World existe.
 * 5. El GLB de Marble Bust 01 coincide con el SHA-256 de su registro de procedencia.
 * 6. La versión en texto da las mismas medidas que la cartela (calculada desde `size`).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results']);

/**
 * Referencias presentes en el código pero inalcanzables en esta edición.
 * Cada una tiene que seguir sin existir; si alguien la añade, la lista se revisa.
 */
const INERT_REFERENCES = {};

const failures = [];
const fail = (msg) => failures.push(msg);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
}

const allFiles = walk(ROOT);
const exists = (rel) => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();

// 1. Syntax
let syntaxChecked = 0;
for (const file of allFiles.filter((f) => /\.(m?js)$/.test(f))) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
    syntaxChecked += 1;
  } catch (error) {
    fail(`SINTAXIS ${file}: ${String(error.stderr || error.message).split('\n').slice(0, 4).join(' ')}`);
  }
}

// 2. JSON
let jsonChecked = 0;
for (const file of allFiles.filter((f) => f.endsWith('.json') && !f.startsWith('package-lock'))) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); jsonChecked += 1; }
  catch (error) { fail(`JSON ${file}: ${error.message}`); }
}

// 3. Reference graph from the visitor entry point
const IMPORT_MAP = { three: 'vendor/three/three.module.min.js' };
const PATTERNS = [
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
  /import\s*['"]([^'"]+)['"]/g,
  /import\(\s*['"`]([^'"`$]+)['"`]\s*\)/g,
  /new URL\(\s*['"`]([^'"`$]+)['"`]\s*,\s*import\.meta\.url/g,
  /(?:href|src)\s*=\s*['"]([^'"#?]+)/g,
  /fetch\(\s*['"`]([^'"`$]+)['"`]/g,
  /['"`]((?:\.{1,2})?\/[^'"`$\s]+\.(?:js|mjs|css|json|glb|jpg|png|webm|webp|html|svg))['"`]/g,
  /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
  /['"`]((?:assets|scenes)\/[^'"`$\s]+\.(?:png|jpe?g|webp|glb|gltf|obj|hdr|json|js|css|mp4|webm|svg))['"`]/g
];
// Documentation strings inside vendored code, not references.
const NESTED_DOCUMENTS = ['experiences/wet-paint-flow/', 'experiences/breeze-studio-pro/'];
const IGNORE = new Set(['vendor/three/addons/textures/texture.png']);

const seen = new Set();
const missing = new Map();
const queue = ['index.html'];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!/\.(m?js|html|css|json)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const rx of PATTERNS) {
    for (const match of text.matchAll(rx)) {
      const ref = match[1];
      if (/^(https?:|data:|blob:|mailto:|\/\/)/.test(ref)) continue;
      let target;
      if (IMPORT_MAP[ref]) target = IMPORT_MAP[ref];
      else if (ref.startsWith('/')) {
        // Absolute URLs that do not name a file (regex literals and the like in
        // minified bundles) are not references.
        if (!/\.[a-z0-9]{2,5}$/i.test(ref)) continue;
        target = ref;
      } else if (/^[\w.-]+\.(?:png|jpe?g|webp|glb|gltf|obj|hdr|mp4|webm|svg)$/i.test(ref)
        && NESTED_DOCUMENTS.some((base) => file.startsWith(base))) {
        // Vite emits module-relative bare names: new URL("name-hash.png", import.meta.url).
        target = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));
      } else if (/^(assets|scenes)\//.test(ref)) {
        const docBase = NESTED_DOCUMENTS.find((base) => file.startsWith(base));
        if (!docBase) continue;
        target = path.posix.normalize(path.posix.join(docBase, ref));
      }
      else if (ref.startsWith('.')) {
        // Module specifiers resolve against the file; DOM-assigned URLs resolve
        // against the document. Accept whichever exists.
        // Wet Paint Flow runs as its own document inside an iframe.
        const docBase = NESTED_DOCUMENTS.find((base) => file.startsWith(base)) || '';
        const fromFile = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));
        const fromDoc = path.posix.normalize(path.posix.join(docBase, ref));
        target = exists(fromFile) ? fromFile : exists(fromDoc) ? fromDoc
          : INERT_REFERENCES[fromDoc] ? fromDoc : fromFile;
      } else continue;
      if (IGNORE.has(target)) continue;
      if (target.startsWith('/') || !exists(target)) {
        if (!missing.has(target)) missing.set(target, new Set());
        missing.get(target).add(file);
        continue;
      }
      queue.push(target);
    }
  }
}
for (const [target, from] of missing) {
  if (INERT_REFERENCES[target]) continue;
  fail(`REFERENCIA ROTA ${target}  <- ${[...from].join(', ')}`);
}
for (const target of Object.keys(INERT_REFERENCES)) {
  if (!target.startsWith('/') && exists(target)) fail(`INERTE YA EXISTE ${target}: revisar INERT_REFERENCES`);
}

// 4. World media
const WORLD = 'worlds/museum-v1.world.json';
const world = JSON.parse(fs.readFileSync(path.join(ROOT, WORLD), 'utf8'));
let mediaChecked = 0;
for (const entity of world.entities || []) {
  const src = entity.content?.media?.src;
  if (!src) continue;
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(WORLD), src));
  if (!exists(rel)) fail(`MEDIA ${entity.id}: ${src} no existe`);
  mediaChecked += 1;
}

// 5. Marble Bust 01 provenance
const provenance = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/sculpture/marble_bust_01_1k.provenance.json'), 'utf8'));
const glb = fs.readFileSync(path.join(ROOT, 'assets/models/sculpture/marble_bust_01_1k.glb'));
const glbSha = crypto.createHash('sha256').update(glb).digest('hex');
if (glbSha !== provenance.runtimeSha256) fail(`GLB SHA-256 ${glbSha} ≠ ${provenance.runtimeSha256}`);
if (glb.length !== provenance.runtimeBytes) fail(`GLB bytes ${glb.length} ≠ ${provenance.runtimeBytes}`);
if (provenance.license !== 'CC0 1.0') fail(`GLB licencia inesperada: ${provenance.license}`);

// 6. Text version = wall label. The label prints the measurements from `size`;
// the text version is written by hand. Five works once disagreed (220 × 150 in
// the text, 260 × 178 on the wall), so a screen-reader visit got other numbers.
let parityChecked = 0;
for (const entity of world.entities || []) {
  const m = /(\d+) por (\d+) cent/.exec(entity.accessibility?.description || '');
  if (!m || !entity.size) continue;
  const wall = [Math.round(entity.size[0] * 100), Math.round(entity.size[1] * 100)];
  if (Number(m[1]) !== wall[0] || Number(m[2]) !== wall[1]) {
    fail(`TEXTO ≠ CARTELA ${entity.id}: «${m[1]} por ${m[2]}» frente a ${wall[0]} × ${wall[1]} cm`);
  }
  parityChecked += 1;
}

console.log(`sintaxis: ${syntaxChecked} archivos JS`);
console.log(`json: ${jsonChecked} archivos`);
console.log(`grafo desde index.html: ${seen.size} archivos alcanzados, ${missing.size} referencias inertes declaradas`);
console.log(`media del World: ${mediaChecked} rutas`);
console.log(`Marble Bust 01: ${glb.length} bytes, sha256 ${glbSha}`);
console.log(`texto = cartela: ${parityChecked} medidas`);
if (failures.length) {
  console.error(`\n${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nOK');
