import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { archifyPlugin, renderArchify } from './archify.mjs';

let server;
let base;
beforeAll(async () => {
  let handler;
  archifyPlugin().configureServer({ middlewares: { use(value) { handler = value; } } });
  server = createServer((request, response) => handler(request, response, () => { response.writeHead(404); response.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

describe('Archify renderer request boundary', () => {
  it('rejects malformed or foreign origins before any rendering', async () => {
    for (const origin of ['not a valid origin', 'https://unrelated.example']) {
      const result = await fetch(`${base}/api/archify/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' });
      expect(result.status).toBe(403);
    }
  });
  it('rejects simple cross-origin form-compatible content types', async () => {
    const result = await fetch(`${base}/api/archify/render`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(result.status).toBe(415);
  });
  it('rejects remote assets, repository inspection and overlarge graphs', async () => {
    const baseSpec = { diagram_type: 'architecture', meta: { quality_profile: 'showcase' }, components: [], connections: [], cards: [] };
    await expect(renderArchify({ ...baseSpec, components: [{ brand: 'https://example.com/logo.svg' }] })).rejects.toThrow('Remote brands');
    await expect(renderArchify({ ...baseSpec, meta: { ...baseSpec.meta, repository: { url: 'file:///private' } } })).rejects.toThrow('repository inspection');
    await expect(renderArchify({ ...baseSpec, components: Array.from({ length: 25 }, () => ({})) })).rejects.toThrow('smaller responsibility');
    await expect(renderArchify({ ...baseSpec, connections: Array.from({ length: 49 }, () => ({})) })).rejects.toThrow('too many connections');
  });
});
