import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../web/public/portfolio-embed.js', import.meta.url), 'utf8');
const parentOrigin = 'https://shahyan-khalid-360.vercel.app';
const session = '12345678-1234-1234-1234-123456789012';

function fixture({ path = '/', visible = true, demo = false, top = false, ready = true } = {}) {
  const messages = [];
  const windowHandlers = new Map();
  const documentHandlers = new Map();
  const parent = { postMessage: (data, origin) => messages.push({ data: JSON.parse(JSON.stringify(data)), origin }) };
  const element = { textContent: demo ? 'Explore demo workspace' : 'Public application', getClientRects: () => visible ? [{}] : [] };
  const window = { parent, location: { pathname: path }, addEventListener: (name, fn) => windowHandlers.set(name, fn) };
  if (top) window.parent = window;
  const document = { documentElement: { dataset: { portfolioReady: ready ? 'true' : 'false' } }, querySelectorAll: () => [element], addEventListener: (name, fn) => documentHandlers.set(name, fn) };
  vm.runInNewContext(source, { window, document, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }), Set });
  const ping = (extra = {}) => windowHandlers.get('message')?.({
    source: parent, origin: parentOrigin,
    data: { type: 'shahyan:embed:ping', version: 1, session }, ...extra,
  });
  return { messages, ping, documentHandlers, windowHandlers };
}

test('only acknowledges visible public UI to the exact parent origin', () => {
  const f = fixture(); f.ping();
  assert.deepEqual(f.messages, [{ data: { type: 'shahyan:embed:ready', version: 1, session, access: 'public' }, origin: parentOrigin }]);
});
test('rejects untrusted origins, unrelated windows and malformed sessions', () => {
  const f = fixture(); f.ping({ origin: 'https://attacker.example' }); f.ping({ source: {} });
  f.ping({ data: { type: 'shahyan:embed:ping', version: 1, session: '../bad' } });
  f.ping({ data: { type: 'shahyan:embed:ping', version: 2, session } });
  assert.equal(f.messages.length, 0);
});
test('does not acknowledge a blank or non-rendered document', () => {
  const f = fixture({ visible: false }); f.ping(); assert.equal(f.messages.length, 0);
});

test('waits until the simulator has initialized its public data', () => {
  const f = fixture({ ready: false }); f.ping(); assert.equal(f.messages.length, 0);
});
test('reports an authentication page without bypassing it', () => {
  const f = fixture({ path: '/login' }); f.ping(); assert.equal(f.messages[0].data.access, 'restricted');
});
test('keeps a public demo entry distinct from private authentication', () => {
  const f = fixture({ path: '/auth/login', demo: true }); f.ping(); assert.equal(f.messages[0].data.access, 'public');
});
test('Escape is sent only after a trusted parent handshake', () => {
  const f = fixture(); f.documentHandlers.get('keydown')({ key: 'Escape' }); assert.equal(f.messages.length, 0);
  f.ping(); f.documentHandlers.get('keydown')({ key: 'Escape' });
  assert.equal(f.messages[1].data.type, 'shahyan:embed:escape'); assert.equal(f.messages[1].origin, parentOrigin);
});
test('has no behavior in a standalone top-level application', () => {
  const f = fixture({ top: true }); assert.equal(f.windowHandlers.size, 0); assert.equal(f.documentHandlers.size, 0);
});
