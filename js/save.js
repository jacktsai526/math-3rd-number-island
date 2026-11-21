// Save system: named save slots on this device + a short save code to move a game to another device.
const KEY = 'niq-v2-slots';
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)

export function newGame() { return { name: '', world: 1, stars: {}, pos: 0, slot: null }; }

function readAll() { try { const s = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
function writeAll(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }

export function listSlots() { return readAll().sort((a, b) => b.updated - a.updated); }
export function storageOK() { try { localStorage.setItem('niq-test', '1'); localStorage.removeItem('niq-test'); return true; } catch (e) { return false; } }

export function saveSlot(game, name) {
  const list = readAll();
  let slot = game.slot && game.slot !== 'auto' ? list.find(s => s.id === game.slot) : null;
  if (!slot) { slot = { id: 's' + Date.now().toString(36) }; list.push(slot); }
  Object.assign(slot, { name: name.trim() || defaultName(), world: game.world, stars: { ...game.stars }, pos: game.pos, updated: Date.now() });
  game.slot = slot.id; game.name = slot.name;
  return writeAll(list) ? slot : null;
}
export function autoSave(game) {
  const list = readAll();
  // keep the named slot in sync, plus one shared autosave slot
  if (game.slot && game.slot !== 'auto') { const s = list.find(x => x.id === game.slot); if (s) Object.assign(s, { stars: { ...game.stars }, pos: game.pos, world: game.world, updated: Date.now() }); }
  let a = list.find(s => s.id === 'auto'); if (!a) { a = { id: 'auto' }; list.push(a); }
  Object.assign(a, { name: 'Autosave 自動存檔', world: game.world, stars: { ...game.stars }, pos: game.pos, updated: Date.now() - 1 });
  writeAll(list);
}
export function deleteSlot(id) { writeAll(readAll().filter(s => s.id !== id)); }
export function loadSlot(id) { const s = readAll().find(x => x.id === id); if (!s) return null; return { name: s.name, world: s.world || 1, stars: { ...s.stars }, pos: s.pos || 0, slot: s.id }; }

export function defaultName() {
  const d = new Date(), n = readAll().filter(s => s.id !== 'auto').length + 1;
  return `Pip's Adventure ${n} · ${d.getMonth() + 1}/${d.getDate()}`;
}

// ---- save code: 40 bits = version(3) world(3) pos(5) stars 10x2 (20) + checksum(9) → 8 base32 chars ----
export function encode(game, keys) {
  let p = 1n;
  p = (p << 3n) | BigInt(game.world & 7);
  p = (p << 5n) | BigInt(Math.max(0, Math.min(31, game.pos | 0)));
  for (const k of keys) p = (p << 2n) | BigInt(Math.max(0, Math.min(3, game.stars[k] | 0)));
  const chk = Number((p * 2654435761n) % 509n);
  let v = (p << 9n) | BigInt(chk), s = '';
  for (let i = 0; i < 8; i++) { s = ALPHA[Number(v & 31n)] + s; v >>= 5n; }
  return s.slice(0, 4) + '-' + s.slice(4);
}
export function decode(code, keys) {
  const c = code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (c.length !== 8) return null;
  let v = 0n; for (const ch of c) { const i = ALPHA.indexOf(ch); if (i < 0) return null; v = (v << 5n) | BigInt(i); }
  const chk = Number(v & 511n), p = v >> 9n;
  if (Number((p * 2654435761n) % 509n) !== chk) return null;
  let q = p; const stars = {};
  for (let i = keys.length - 1; i >= 0; i--) { const st = Number(q & 3n); if (st) stars[keys[i]] = st; q >>= 2n; }
  const pos = Number(q & 31n); q >>= 5n; const world = Number(q & 7n); q >>= 3n;
  if (q !== 1n) return null;
  return { name: '', world: world || 1, stars, pos, slot: null };
}
