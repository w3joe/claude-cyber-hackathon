import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const runtime = fileURLToPath(new URL('../vendor/archify/bin/archify.mjs', import.meta.url));
const cache = new Map();
const pending = new Map();

function inspectSpecification(specification) {
  if (specification?.diagram_type !== 'architecture' || specification?.meta?.quality_profile !== 'showcase') throw new Error('An Archify architecture specification with showcase quality is required.');
  if (specification.meta.output || specification.meta.repository || specification.meta.engineering_profile) throw new Error('File outputs and repository inspection are not supported by this map endpoint.');
  if (!Array.isArray(specification.components) || specification.components.length > 24) throw new Error('Choose a smaller responsibility or control detail map.');
  if (!Array.isArray(specification.connections) || specification.connections.length > 48) throw new Error('The map contains too many connections.');
  if (!Array.isArray(specification.cards) || specification.cards.length > 6 || specification.cards.some(card => !Array.isArray(card.items) || card.items.length > 12)) throw new Error('The map contains too many explanation cards.');
  if (specification.components.some(component => component.brand || component.sources)) throw new Error('Remote brands and filesystem source links are not supported by this map endpoint.');
}

export async function renderArchify(specification) {
  inspectSpecification(specification);
  const source = JSON.stringify(specification, null, 2) + '\n';
  const key = createHash('sha256').update(source).digest('hex');
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mandate-archify-'));
    try {
      const input = path.join(directory, 'map.architecture.json');
      const output = path.join(directory, 'map.html');
      await writeFile(input, source);
      const options = { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' } };
      await execute(process.execPath, [runtime, 'validate', 'architecture', input, '--quality', 'showcase', '--json'], options);
      const delivered = await execute(process.execPath, [runtime, 'deliver', 'architecture', input, output, '--quality', 'showcase', '--json'], options);
      const receipt = JSON.parse(delivered.stdout);
      const html = await readFile(output, 'utf8');
      const result = { html, receipt, specification, sourceHash: key, url: `/api/archify/map/${key}.html` };
      cache.set(key, result);
      if (cache.size > 20) cache.delete(cache.keys().next().value);
      return result;
    } catch (error) {
      let diagnostics;
      try { diagnostics = JSON.parse(error.stdout || error.stderr); } catch { /* The error may be a process timeout. */ }
      throw Object.assign(new Error(diagnostics?.error ?? 'Archify could not validate this map.'), { diagnostics });
    } finally { await rm(directory, { recursive: true, force: true }); }
  })();
  pending.set(key, job);
  try { return await job; } finally { pending.delete(key); }
}

function middleware(request, response, next) {
  const artifact = request.url?.split('?')[0].match(/^\/api\/archify\/map\/([a-f0-9]{64})\.html$/);
  if (artifact && request.method === 'GET') {
    const result = cache.get(artifact[1]);
    if (!result) { response.writeHead(404); response.end('This map has expired. Return to the app to rebuild it.'); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(result.html); return;
  }
  if (request.url?.split('?')[0] !== '/api/archify/render') return next();
  if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) { response.writeHead(415); response.end('JSON requests only.'); return; }
  const origin = request.headers.origin;
  try {
    if (origin && new URL(origin).host !== request.headers.host) { response.writeHead(403); response.end('Same-origin requests only.'); return; }
  } catch { response.writeHead(403); response.end('Invalid request origin.'); return; }
  let body = '';
  request.on('data', chunk => {
    body += chunk;
    if (Buffer.byteLength(body) > 256 * 1024) { response.writeHead(413); response.end('Map is too large.'); request.destroy(); }
  });
  request.on('end', async () => {
    if (response.writableEnded) return;
    try {
      const payload = JSON.parse(body);
      const result = await renderArchify(payload.specification);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(422, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message, diagnostics: error.diagnostics?.diagnostics ?? [] }));
    }
  });
}

export function archifyPlugin() {
  return { name: 'mandate-archify', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
