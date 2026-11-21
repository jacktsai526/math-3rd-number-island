// Number Island Quest — main game (Three.js, toon outline style)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { createMusic } from './music.js';
import * as SAVE from './save.js';

await Promise.race([document.fonts.load('700 100px Fredoka'), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
const INK = '#3B2F4A', G = 0.3;
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 7; const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= renderer, scene, materials ================= */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
{ const c = document.createElement('canvas'); c.width = 16; c.height = 256; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#7FD0FF'); gr.addColorStop(1, '#E6F8FF'); x.fillStyle = gr; x.fillRect(0, 0, 16, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
scene.fog = new THREE.Fog('#E6F8FF', 80, 190);
const camera = new THREE.PerspectiveCamera(38, 1, .1, 250);
scene.add(new THREE.HemisphereLight('#ffffff', '#ffd9b8', 1.4));
const sun = new THREE.DirectionalLight('#fff1dd', 2.4); sun.position.set(16, 26, 18); sun.target.position.set(3, 0, 0); scene.add(sun.target); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sun.shadow.bias = -.0006; sun.shadow.radius = 1; sun.shadow.normalBias = .02; scene.add(sun);

const mats = new Map();
const GRAD = (() => { const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const M = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: GRAD }, o))); return mats.get(k); };
const EYE = new THREE.MeshBasicMaterial({ color: '#3B2A35' }), WHITE = new THREE.MeshBasicMaterial({ color: '#ffffff' }), OUTM = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
function addOutline(m) { const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const r = g.boundingSphere.radius * Math.max(1e-3, (Math.abs(m.scale.x) + Math.abs(m.scale.y) + Math.abs(m.scale.z)) / 3); const o = new THREE.Mesh(g, OUTM); o.scale.setScalar(1 + Math.min(.25, .024 / r)); o.castShadow = false; o.receiveShadow = false; o.raycast = () => {}; m.add(o); }
const SPH = new THREE.SphereGeometry(1, 28, 20), CYL = new THREE.CylinderGeometry(1, 1, 1, 32);
const world = new THREE.Group(); scene.add(world);
function mesh(geo, mat, p = [0, 0, 0], s = 1, r = [0, 0, 0], parent, noOut) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? M(mat) : mat); m.position.set(...p); m.scale.set(...(Array.isArray(s) ? s : [s, s, s])); m.rotation.set(...r);
  m.castShadow = true; m.receiveShadow = true; (parent || world).add(m);
  if (!noOut && !m.material.isMeshBasicMaterial && !m.material.transparent) addOutline(m); return m;
}
const ball = (c, p, s, par, no) => mesh(SPH, c, p, s, [0, 0, 0], par, no);
const rbox = (w, h, d, r = .06) => new RoundedBoxGeometry(w, h, d, 3, r);
const grp = (p = [0, 0, 0], par = world) => { const g = new THREE.Group(); g.position.set(...p); par.add(g); return g; };

/* ================= animation engine ================= */
let now = 0; const tasks = new Set(), tickers = new Set();
const ease = { out: k => 1 - (1 - k) ** 3, io: k => k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2, lin: k => k, back: k => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; }, bounce: k => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + .75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + .9375; return n * (k -= 2.625 / d) * k + .984375; } };
const anim = (dur, fn, e = ease.out) => new Promise(res => tasks.add({ t0: -1, dur, fn, e, res }));
const tweenV = (v, to, dur, e) => { const f = v.clone(); return anim(dur, k => v.lerpVectors(f, to, k), e); };
function arc(obj, to, h = 1.2, dur = .55) { const f = obj.position.clone(); return anim(dur, k => { obj.position.lerpVectors(f, to, k); obj.position.y += Math.sin(k * Math.PI) * h; }, ease.io); }
function popIn(o, dur = .4) { const s = o.userData.s || 1; o.scale.setScalar(.001); return anim(dur, k => o.scale.setScalar(Math.max(.001, s * k)), ease.back); }

/* ================= textures ================= */
const tcache = new Map();
function rr(x, c, y, w, h, r) { x.beginPath(); x.moveTo(c + r, y); x.arcTo(c + w, y, c + w, y + h, r); x.arcTo(c + w, y + h, c, y + h, r); x.arcTo(c, y + h, c, y, r); x.arcTo(c, y, c + w, y, r); x.closePath(); }
function tex(key, w, h, draw) { if (tcache.has(key)) return tcache.get(key); const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; tcache.set(key, t); return t; }
const FONT = s => `700 ${s}px Fredoka, system-ui, sans-serif`;
const numTex = (n, fg = INK) => tex('n' + n + fg, 256, 256, (x, w, h) => { const t = String(n); x.fillStyle = fg; x.font = FONT(t.length > 3 ? 92 : t.length > 2 ? 120 : 170); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, w / 2, h / 2 + 10); });
const pillTex = (t, bg = '#fff') => tex('p' + t + bg, 320, 200, (x, w, h) => { rr(x, 12, 12, w - 24, h - 24, 70); x.fillStyle = bg; x.fill(); x.lineWidth = 14; x.strokeStyle = INK; x.stroke(); x.fillStyle = INK; x.font = FONT(t.length > 4 ? 76 : t.length > 3 ? 92 : 120); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, w / 2, h / 2 + 8); });
function starPath(x, cx, cy, r) { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .47 : r; x.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a)); } x.closePath(); }
const markerTex = (key, st, locked, next) => tex(`m${key}${st}${locked}${next}`, 360, 300, (x, w) => {
  x.fillStyle = 'rgba(59,47,74,.25)'; x.beginPath(); x.ellipse(w / 2, 150, 118, 112, 0, 0, 7); x.fill();
  x.beginPath(); x.arc(w / 2, 136, 110, 0, 7); x.fillStyle = locked ? '#E6E1EA' : next ? '#FFD966' : '#9BE29B'; x.fill(); x.lineWidth = 16; x.strokeStyle = INK; x.stroke();
  x.fillStyle = locked ? '#9A8FA8' : INK; x.font = FONT(key.length > 3 ? 70 : 84); x.textAlign = 'center'; x.textBaseline = 'middle';
  if (locked) { x.fillStyle = '#fff'; rr(x, w / 2 - 44, 128, 88, 72, 14); x.fill(); x.lineWidth = 12; x.stroke(); x.beginPath(); x.arc(w / 2, 128, 28, Math.PI, 0); x.stroke(); } else x.fillText(key, w / 2, 142);
  for (let i = 0; i < 3; i++) { starPath(x, w / 2 - 76 + i * 76, 262, 30); x.fillStyle = i < st ? '#FFD966' : '#fff'; x.fill(); x.lineWidth = 8; x.strokeStyle = INK; x.stroke(); }
});
function sprite(t, h = .5, aspect) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); const a = aspect || t.image.width / t.image.height; s.scale.set(h * a, h, 1); s.renderOrder = 5; return s; }
const setSpriteTex = (s, t) => { s.material.map = t; s.material.needsUpdate = true; };

/* ================= sound ================= */
let ac = null, sfxOn = true, musicOn = true;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
const music = createMusic(audio);
function tone(f, d, type = 'sine', v = .18, at = 0, f2) { const a = audio(); if (!a || !sfxOn) return; const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .05); }
function noise(d = .4, v = .15, freq = 900, type = 'lowpass') { const a = audio(); if (!a || !sfxOn) return; const b = a.createBuffer(1, a.sampleRate * d, a.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2; const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = type; f.frequency.value = freq; g.gain.value = v; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(); }
const sfx = {
  tap() { tone(880, .08, 'sine', .12); }, hop() { tone(520, .09, 'sine', .07, 0, 760); }, drop() { tone(300, .14, 'triangle', .18); tone(480, .08, 'sine', .08, .04); },
  ok() { [523, 659, 784].forEach((f, i) => tone(f, .22, 'triangle', .2, i * .09)); }, no() { tone(420, .38, 'triangle', .16, 0, 240); }, star(i) { tone(700 + i * 180, .3, 'sine', .18); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', .18, i * .12)); }, hint() { tone(1320, .5, 'sine', .07); tone(1760, .5, 'sine', .05, .08); },
  splash() { noise(.5, .22, 1200); }, creak() { tone(160, .6, 'sawtooth', .05, 0, 110); }, pop() { tone(700, .1, 'sine', .15, 0, 1300); }, grow() { tone(300, .5, 'sine', .12, 0, 900); },
  ding() { [1568, 2093].forEach((f, i) => tone(f, 1.2, 'sine', .14, i * .02)); tone(784, 1.4, 'triangle', .06); },
  baa() { const a = audio(); if (!a || !sfxOn) return; tone(380, .5, 'sawtooth', .04, 0, 330); tone(390, .5, 'triangle', .05, 0, 340); },
  boom() { noise(.9, .35, 300); [0, .1, .2].forEach(t => tone(1200 + Math.random() * 900, .5, 'sine', .04, t + .1)); },
  fanfare() { [523, 659, 784, 1047, 0, 784, 1047, 1319].forEach((f, i) => f && tone(f, i === 7 ? .9 : .22, 'triangle', .2, i * .14)); }
};
function speak(t, lang) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = lang; u.rate = .9; speechSynthesis.speak(u); } catch (e) {} }

/* ================= game data ================= */
const KEYS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];
const NAMES = [['Apple Baskets', '一籃一籃的蘋果'], ['Plant an Orchard', '種一片果園'], ['Balance Bridge', '翹翹板橋'], ['Secret Lock', '花園的密碼鎖'], ['Treasure Stones', '寶藏踏腳石'],
  ['Bunny Picnic', '兔子野餐會'], ['Harbor Boats', '港口小船'], ['Pie Party', '派對切派'], ['Clock Tower', '大鐘塔'], ['Sheep Pen', '綿羊圍欄']];
const WORLDS = [
  { id: 1, en: 'Orchard Island', zh: '乘法果園島', color: '#9BE29B' },
  { id: 2, en: 'Fraction Bay', zh: '分數海灣', color: '#8FD3FE', soon: true },
  { id: 3, en: 'Clock Mountain', zh: '時鐘山', color: '#FFD45E', soon: true },
  { id: 4, en: 'Shape Temple', zh: '圖形神殿', color: '#B9A2FF', soon: true }
];
let game = SAVE.newGame();
const done = i => (game.stars[KEYS[i]] || 0) > 0, unlocked = i => i === 0 || done(i - 1), gems = () => KEYS.filter((k, i) => done(i)).length;
const totalStars = () => KEYS.reduce((s, k) => s + (game.stars[k] || 0), 0);

/* ================= world ================= */
const decor = [];
const addDecor = (o, c, r) => { decor.push({ o, c, r }); return o; };
function island(cx, cz, r, grass = '#9BE29B') {
  const g = grp([cx, 0, cz]);
  mesh(new THREE.CylinderGeometry(r + .45, r + .85, .9, 64), '#F7E3B0', [0, -.3, 0], 1, [0, 0, 0], g);
  mesh(new THREE.CylinderGeometry(r, r + .05, .3, 64), grass, [0, .15, 0], 1, [0, 0, 0], g);
  mesh(new THREE.TorusGeometry(r, .15, 10, 72), grass, [0, .15, 0], 1, [Math.PI / 2, 0, 0], g);
  const foam = mesh(new THREE.TorusGeometry(r + .95, .16, 8, 72), WHITE, [0, -.22, 0], [1, 1, .35], [Math.PI / 2, 0, 0], g); foam.castShadow = false;
  tickers.add(t => { const s = 1 + Math.sin(t * 1.3 + cx) * .012; foam.scale.set(s, s, .35); });
  for (let i = 0; i < Math.round(r * 1.6); i++) { const a = srnd() * 6.28; ball(srnd() < .5 ? '#D9CFC0' : '#E8DFD2', [Math.cos(a) * (r + .55), -.05, Math.sin(a) * (r + .55)], [.18 + srnd() * .12, .12, .16], g); }
  return g;
}
mesh(new THREE.CircleGeometry(120, 64), M('#5CC0EC'), [0, -.25, 0], 1, [-Math.PI / 2, 0, 0], world, true).castShadow = false;
const ISL = { main: [-5, 0, 7.4], a: [9.6, 0, 4.4], rock: [9.6, -11.6, 1.35], b: [9.6, 10.8, 3.8] };
island(...ISL.main); island(...ISL.a); island(ISL.rock[0], ISL.rock[1], ISL.rock[2], '#C7E8A8'); island(...ISL.b, '#A8E6A0');
const inIsland = (x, z, pad = .4) => Object.values(ISL).some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r - pad);
function tree(x, z, s = 1, apples = true, par = world, dec = true) {
  const g = grp([x, G, z], par); g.scale.setScalar(s);
  mesh(new THREE.CylinderGeometry(.12, .19, 1, 16), '#9C6A47', [0, .5, 0], 1, [0, 0, 0], g);
  const gr = ['#5FC26B', '#6ACD75', '#55B862']; [[0, 1.45, 0, .62], [-.42, 1.2, .12, .44], [.42, 1.22, -.05, .46], [.05, 1.85, -.05, .4], [0, 1.25, .4, .38]].forEach(([a, b, c, d], i) => ball(gr[i % 3], [a, b, c], d, g));
  if (apples) for (let i = 0; i < 5; i++) { const a = srnd() * 6.28, h = 1.15 + srnd() * .6; const ap = grp([Math.cos(a) * .56, h, Math.sin(a) * .56], g); ball('#FF6464', [0, 0, 0], .1, ap); mesh(SPH, WHITE, [-.03, .04, .06], .02, [0, 0, 0], ap); }
  if (dec) addDecor(g, V(x, G + 1.3 * s, z), 1.1 * s); return g;
}
function flower(x, z) { const g = grp([x, G, z]); mesh(CYL, '#5FC26B', [0, .12, 0], [.018, .24, .018], [0, 0, 0], g, true); const c = pick(['#FF8FB1', '#FFD966', '#ffffff', '#B9A2FF', '#FF9F6B']); for (let i = 0; i < 5; i++) { const a = i * 1.256; ball(c, [Math.cos(a) * .065, .26, Math.sin(a) * .065], [.05, .03, .05], g, true); } ball('#FFD966', [0, .27, 0], .035, g, true); addDecor(g, V(x, G + .2, z), .25); }
function mushroom(x, z, s = 1) { const g = grp([x, G, z]); g.scale.setScalar(s); mesh(CYL, '#FFF2DE', [0, .1, 0], [.06, .2, .06], [0, 0, 0], g); ball('#FF7A7A', [0, .22, 0], [.16, .1, .16], g); for (let i = 0; i < 4; i++) { const a = i * 1.57 + .3; ball('#ffffff', [Math.cos(a) * .1, .28, Math.sin(a) * .1], .025, g, true); } addDecor(g, V(x, G + .2, z), .3 * s); }
function bush(x, z, s) { const b = ball('#7BD389', [x, G, z], [s * 1.4, s * .8, s * 1.2]); addDecor(b, V(x, G + s * .4, z), s * 1.4); }
[[-11, -1.5, 1.1], [-7.5, -6, 1], [-1, -5.3, .9], [-2.5, 4.6, 1], [-6.5, 5.6, .8], [.5, 3.2, .75], [12.6, 2.6, .8], [12.2, -2.6, .7], [-12, 2, .7], [7.2, 12.8, .7], [12.4, 12.6, .75]].forEach(([x, z, s]) => tree(x, z, s));
for (let i = 0; i < 60; i++) { const a = srnd() * 6.28, r = 1.2 + srnd() * 5.9, x = -5 + Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x + 4.2) < 2.6 && Math.abs(z + 3.4) < 2.6) continue; if (x > -11 && x < -7 && z > 0 && z < 4) continue; flower(x, z); }
for (let i = 0; i < 14; i++) { const a = srnd() * 6.28, r = 1 + srnd() * 3; const x = 9.6 + Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x - 10.6) < 1.5 && Math.abs(z - 1.4) < 1.3) continue; if (Math.abs(x - 7) < .5) continue; flower(x, z); }
for (let i = 0; i < 10; i++) { const a = srnd() * 6.28, r = 2.4 + srnd() * 1.1; flower(9.6 + Math.cos(a) * r, 10.8 + Math.sin(a) * r); }
[[-3, 5.2], [-8.8, -3.6], [1, -4.4], [-6.2, 3.8], [12.3, -1.2], [12.6, 8.6]].forEach(([x, z]) => mushroom(x, z, 1.2));
[[-3, 5.4, .5], [-9.5, -3.5, .6], [.8, -4.2, .45], [-11.5, 4, .5], [6.8, 8.6, .4]].forEach(a => bush(...a));
const clouds = []; for (let i = 0; i < 8; i++) { const g = grp([-50 + i * 14, 12 + srnd() * 4, -26 + srnd() * 40]); for (let k = 0; k < 4; k++) { const m = ball('#ffffff', [k * 1.1 - 1.6, Math.sin(k * 1.7) * .35, srnd() * .6], [1 + srnd() * .6, .8 + srnd() * .4, .9], g); m.castShadow = false; } clouds.push(g); }
tickers.add((t, dt) => clouds.forEach(c => { c.position.x += dt * .5; if (c.position.x > 60) c.position.x = -60; }));

/* ================= Pip ================= */
function makePip() {
  const BR = '#B5794E', DK = '#8E5A38', CR = '#FBE3C6', CR2 = '#FFF2DE', PK = '#FF9BB5';
  const root = new THREE.Group(), body = grp([0, 0, 0], root);
  const legs = [-1, 1].map(s => { const l = grp([s * .17, .16, .02], body); ball(DK, [0, -.08, .06], [.14, .09, .19], l); for (const t of [-1, 0, 1]) ball('#F2B8A0', [t * .05, -.09, .23], [.025, .02, .02], l, true); return l; });
  ball(BR, [0, .38, 0], [.36, .38, .33], body); ball(CR, [0, .36, .17], [.25, .27, .19], body);
  const tail = grp([0, .22, -.25], body); mesh(new THREE.CapsuleGeometry(.12, .34, 8, 16), DK, [0, .06, -.18], [1.15, 1, .7], [-1.15, 0, 0], tail); ball(DK, [0, .26, -.36], [.15, .13, .1], tail);
  const bp = grp([0, .46, -.3], body); mesh(rbox(.44, .44, .22, .1), '#FFD45E', [0, 0, 0], 1, [0, 0, 0], bp); mesh(rbox(.46, .2, .24, .09), '#FFB84D', [0, .14, .01], 1, [0, 0, 0], bp); mesh(rbox(.26, .14, .06, .05), '#FFB84D', [0, -.1, -.12], 1, [0, 0, 0], bp); ball('#FF7F7F', [0, .08, -.13], .035, bp, true);
  for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(.17, .028, 8, 20, Math.PI * 1.1), '#FFB84D', [s * .18, .5, -.07], 1, [0, Math.PI / 2, -.3], body);
  const arms = [-1, 1].map(s => { const a = grp([s * .3, .56, .02], body); mesh(new THREE.CapsuleGeometry(.08, .22, 6, 12), BR, [0, -.15, 0], 1, [0, 0, 0], a); ball(DK, [0, -.3, .01], [.095, .09, .095], a); return a; });
  mesh(new THREE.TorusGeometry(.25, .085, 16, 40), '#FF8A65', [0, .7, 0], [1, 1, .85], [Math.PI / 2 + .08, 0, 0], body); mesh(new THREE.TorusGeometry(.25, .03, 8, 40), '#FFE3D6', [0, .7, 0], [1.02, 1.02, .87], [Math.PI / 2 + .08, 0, 0], body, true);
  ball('#FF8A65', [.13, .66, .22], [.08, .07, .07], body); mesh(rbox(.13, .26, .06, .03), '#FF8A65', [.18, .52, .25], 1, [.25, 0, -.25], body);
  const head = grp([0, 1.12, 0], body);
  ball(BR, [0, 0, 0], [.56, .5, .5], head); ball(CR, [0, -.1, .2], [.43, .33, .32], head); ball(CR2, [0, -.17, .36], [.2, .13, .13], head);
  for (const s of [-1, 1]) { ball(BR, [s * .46, .2, -.06], [.12, .12, .09], head); ball('#F2B8A0', [s * .47, .2, -.01], [.065, .065, .04], head, true); }
  for (const k of [-1, 0, 1]) ball(BR, [k * .07, .5, .05], [.07, .09, .07], head);
  mesh(SPH, EYE, [0, -.1, .49], [.085, .06, .055], [0, 0, 0], head); mesh(SPH, WHITE, [.025, -.08, .535], .016, [0, 0, 0], head);
  for (const s of [-1, 1]) ball(PK, [s * .3, -.11, .4], [.085, .055, .03], head, true);
  const eyesOpen = grp([0, 0, 0], head), eyesHappy = grp([0, 0, 0], head);
  for (const s of [-1, 1]) {
    mesh(SPH, EYE, [s * .19, .02, .45], [.085, .11, .06], [0, 0, 0], eyesOpen); mesh(SPH, WHITE, [s * .19 + .03, .07, .505], .032, [0, 0, 0], eyesOpen); mesh(SPH, WHITE, [s * .19 - .03, -.03, .505], .014, [0, 0, 0], eyesOpen);
    mesh(new THREE.TorusGeometry(.065, .02, 8, 20, Math.PI), EYE, [s * .19, .02, .47], 1, [-.15, s * .18, 0], eyesHappy);
    mesh(new THREE.CapsuleGeometry(.014, .07, 4, 8), DK, [s * .2, .17, .46], 1, [0, 0, s * 1.45], head, true);
  }
  const mSmile = grp([0, 0, 0], head), mOpen = grp([0, 0, 0], head), mO = grp([0, 0, 0], head);
  for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(.035, .011, 6, 14, Math.PI), EYE, [s * .035, -.205, .5], 1, [0, 0, Math.PI], mSmile);
  mesh(SPH, new THREE.MeshBasicMaterial({ color: '#7A2E3B' }), [0, -.23, .47], [.07, .06, .04], [0, 0, 0], mOpen); mesh(SPH, new THREE.MeshBasicMaterial({ color: '#FF7F96' }), [0, -.255, .5], [.04, .022, .015], [0, 0, 0], mOpen);
  mesh(new THREE.TorusGeometry(.025, .01, 6, 14), EYE, [.03, -.22, .5], 1, [0, 0, 0], mO);
  for (const s of [-1, 1]) for (const dy of [-.12, -.18]) { const w = mesh(CYL, '#7A5A4A', [s * .37, dy, .37], [.006, .13, .006], [0, s * .4, s * (Math.PI / 2 + (dy + .15) * 2)], head, true); w.castShadow = false; }
  root.scale.setScalar(.95);
  return { root, body, head, legs, arms, eyesOpen, eyesHappy, mSmile, mOpen, mO, tail, mode: 'idle', phase: 0, mood: 'happy' };
}
const pip = makePip(); world.add(pip.root);
function setMouth(k) { pip.mSmile.visible = k === 'smile'; pip.mOpen.visible = k === 'open'; pip.mO.visible = k === 'o'; }
function setEyes(m) { pip.mood = m; pip.eyesOpen.scale.y = 1; pip.eyesOpen.visible = m !== 'happy'; pip.eyesHappy.visible = m === 'happy'; setMouth(m === 'open' ? 'o' : 'smile'); }
setEyes('happy');
tickers.add((t, dt) => {
  const P = pip;
  if (P.mode === 'walk') { P.phase += dt * 11; const s = Math.sin(P.phase); P.legs[0].rotation.x = s * .6; P.legs[1].rotation.x = -s * .6; P.arms[0].rotation.x = -s * .5; P.arms[1].rotation.x = s * .5; P.body.position.y = Math.abs(Math.cos(P.phase)) * .09; P.body.scale.set(1, 1, 1); }
  else if (P.mode === 'cheer' || P.mode === 'dance') { const w = P.mode === 'dance' ? 8 : 14; P.arms[0].rotation.z = -2.4 + Math.sin(t * w) * .35; P.arms[1].rotation.z = 2.4 - Math.sin(t * w) * .35; if (P.mode === 'dance') { P.body.rotation.z = Math.sin(t * 6) * .15; P.body.position.y = Math.abs(Math.sin(t * 6)) * .18; } }
  else {
    P.body.rotation.z *= .85; P.legs.forEach(l => l.rotation.x *= .8); P.arms[0].rotation.x *= .8; P.arms[1].rotation.x *= .8; const b = 1 + Math.sin(t * 3) * .025; P.body.scale.set(1 / Math.sqrt(b), b, 1 / Math.sqrt(b)); P.body.position.y *= .8;
    P.arms[1].rotation.z = P.mode === 'wave' ? 2.3 + Math.sin(t * 9) * .4 : P.arms[1].rotation.z * .85; P.arms[0].rotation.z *= .85;
  }
  P.tail.rotation.z = Math.sin(t * 4) * .25; P.head.rotation.z = P.mode === 'think' ? .22 + Math.sin(t * 2) * .05 : P.head.rotation.z * .9;
  if (Math.random() < .004 && P.mood !== 'happy') { P.eyesOpen.scale.y = .1; setTimeout(() => { P.eyesOpen.scale.y = 1; }, 120); }
});
function face(x, z) { const d = Math.atan2(x - pip.root.position.x, z - pip.root.position.z); const r = pip.root.rotation.y; const dd = ((d - r + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return anim(.25, k => pip.root.rotation.y = r + dd * k); }
async function walk(pts, speed = 2.4) { pip.mode = 'walk'; for (const p of pts) { const to = V(...p), from = pip.root.position.clone(); const d = from.distanceTo(to); if (d < .01) continue; await face(to.x, to.z); await anim(d / speed, k => pip.root.position.lerpVectors(from, to, k), ease.lin); } pip.mode = 'idle'; }
async function hop(to, h = .7) { const from = pip.root.position.clone(); pip.mode = 'idle'; await anim(.12, k => pip.body.scale.set(1 + .15 * k, 1 - .2 * k, 1 + .15 * k)); sfx.hop(); await anim(.42, k => { pip.root.position.lerpVectors(from, to, k); pip.root.position.y += Math.sin(k * Math.PI) * h; const s = 1 - .15 * Math.sin(k * Math.PI); pip.body.scale.set(s, 1 / s, s); }, ease.lin); await anim(.14, k => pip.body.scale.set(1 + .15 * (1 - k), 1 - .2 * (1 - k), 1 + .15 * (1 - k))); }
async function cheer() { setEyes('happy'); setMouth('open'); pip.mode = 'cheer'; const y0 = pip.root.position.y, r0 = pip.root.rotation.y; for (let i = 0; i < 2; i++) await anim(.45, k => { pip.root.position.y = y0 + Math.sin(k * Math.PI) * .6; pip.root.rotation.y = r0 + k * Math.PI * 2; }, ease.io); pip.root.position.y = y0; pip.mode = 'idle'; setMouth('smile'); }
async function sad() { pip.mode = 'think'; setEyes('open'); await anim(.5, k => pip.head.rotation.y = Math.sin(k * Math.PI * 4) * .35); pip.head.rotation.y = 0; setTimeout(() => { if (pip.mode === 'think') { pip.mode = 'idle'; setEyes('happy'); } }, 1400); }

/* Bean the hint sprout */
const bean = grp(); bean.scale.setScalar(1.25);
ball('#9BE29B', [0, 0, 0], [.2, .24, .18], bean); ball('#C9F2C9', [0, -.05, .1], [.12, .13, .09], bean, true);
for (const s of [-1, 1]) { mesh(SPH, EYE, [s * .075, .04, .16], [.035, .045, .025], [0, 0, 0], bean); mesh(SPH, WHITE, [s * .075 + .012, .06, .18], .012, [0, 0, 0], bean); ball('#FF9BB5', [s * .13, -.02, .13], [.04, .025, .015], bean, true); ball('#ffffff', [s * .24, .06, -.04], [.14, .07, .04], bean).rotation.z = s * .5; }
mesh(new THREE.TorusGeometry(.03, .008, 6, 14, Math.PI), EYE, [0, -.03, .175], 1, [0, 0, Math.PI], bean);
mesh(CYL, '#5FC26B', [0, .3, 0], [.018, .14, .018], [0, 0, 0], bean); ball('#7BD389', [-.09, .38, 0], [.11, .04, .065], bean).rotation.z = .45; ball('#9BE29B', [.09, .38, 0], [.11, .04, .065], bean).rotation.z = -.45;
{ const qb = grp([.2, -.2, .12], bean); mesh(rbox(.16, .16, .16, .04), '#FFD45E', [0, 0, 0], 1, [0, 0, 0], qb); const f = new THREE.Mesh(new THREE.PlaneGeometry(.13, .13), new THREE.MeshBasicMaterial({ map: numTex('?'), transparent: true })); f.position.z = .082; qb.add(f); }
let beanFlip = 0;
tickers.add((t, dt) => { const p = pip.root.position, ry = pip.root.rotation.y; const target = V(p.x + .85 * Math.cos(ry), p.y + 1.85 + Math.sin(t * 2.4) * .08, p.z - .85 * Math.sin(ry)); bean.position.lerp(target, Math.min(1, dt * 4)); bean.lookAt(camera.position.x, bean.position.y, camera.position.z); if (beanFlip > 0) { beanFlip -= dt; bean.rotateZ(dt * 14); } });
bean.userData.onTap = () => hintPress();

/* ================= station props ================= */
const PATH = [[-9.8, G, 4.6], [-10.5, G, 3.6], [-8, G, .2], [-4.2, G, -.3], [.6, G, 0], [1.7, .52, 0], [5.9, .52, 0], [6.0, G, -2.3], [7.9, G, 0], [9.6, G, -3.7],
  [9.4, G, .2], [8.4, G, 2.1], [10.6, G, -.5], [13.0, G, -.6], [9.6, G, 3.4], [9.6, .55, 4.1], [9.6, .55, 7.3], [9.2, G, 8.4], [10.6, G, 9.3], [11.0, G, 12.6]];
const STAND = [1, 3, 4, 7, 9, 11, 13, 17, 18, 19];
const CAMS = [{ look: [-8.8, 1, 2], off: [2, 4.2, 7.6] }, { look: [-4.2, .3, -3.3], off: [0, 7.8, 6.2] }, { look: [3.8, .8, 0], off: [0, 3.2, 8.4] }, { look: [6.9, .95, .1], off: [-6.4, 3.4, 3.0] }, { look: [9.6, .3, -7.6], off: [7.8, 6.6, 2.4] },
  { look: [10.4, .4, 1.1], off: [-1.0, 4.6, 6.2] }, { look: [16.2, .5, -.4], off: [-.6, 4.4, 7.6] }, { look: [7.9, .85, 9.6], off: [.6, 4.0, 3.8] }, { look: [11.9, 1.7, 10.2], off: [-1.2, .9, 5.8] }, { look: [9.0, .3, 12.5], off: [0, 6.4, 4.8] }];
const FACE = [[-8.6, 2.6], [-4.2, -3.4], [3.8, 0], [6.8, 0], [9.6, -6], [10.6, 1.4], [16, -.6], [7.9, 9.6], [11.9, 10.2], [9.0, 12.6]];
const MARK = [[-8.4, 3.9, 2.6], [-4.2, 2.1, -3.4], [3.8, 2.4, 0], [7, 3.1, 0], [9.6, 2.2, -7.6], [10.6, 2.2, 1.4], [16.4, 2.2, -.6], [7.9, 2.6, 9.6], [11.9, 4.6, 10.2], [9.0, 2.2, 12.6]];
const MAPCAM = { look: [3.2, 0, 1.4], off: [0, 35, 27] };
const mapLook = () => [MAPCAM.look[0] + pan.x, 0, MAPCAM.look[2] + pan.z];
const dyn = KEYS.map(() => grp());
function clearDyn(i) { if (dyn[i].userData.cleanup) { dyn[i].userData.cleanup(); dyn[i].userData.cleanup = null; } dyn[i].traverse(o => { if (o.userData.onTap) tappables.delete(o); }); dyn[i].clear(); }

// S1 big apple tree
tree(-9.3, .6, 1.35, false, world, false);
// S2 soil plot
mesh(rbox(4.6, .22, 4.6, .1), '#B07A4F', [-4.2, G + .05, -3.4]); mesh(rbox(4.3, .1, 4.3, .05), '#8E5D3B', [-4.2, G + .14, -3.4]);
// S3 seesaw bridge
const plank = grp([3.8, .45, 0]);
mesh(rbox(4.5, .14, 1.05, .05), '#E3A872', [0, 0, 0], 1, [0, 0, 0], plank); for (let i = -2; i <= 2; i++) mesh(rbox(.06, .15, 1.07, .02), '#C98E5E', [i * .9, 0, 0], 1, [0, 0, 0], plank);
for (const z of [-.35, .35]) mesh(new THREE.CylinderGeometry(.16, .24, 1.2, 16), '#C98E5E', [3.8, -.2, z]); mesh(new THREE.CylinderGeometry(.09, .09, .9, 16), '#FFD966', [3.8, .45, 0], 1, [Math.PI / 2, 0, 0]);
// S4 gate
const gate = grp([7, G, 0]);
for (const z of [-2.9, -2.2, -1.5, 1.5, 2.2, 2.9, -1.22, 1.22]) mesh(rbox(.16, 1.3, .16, .05), '#C98E5E', [0, .65, z], 1, [0, 0, 0], gate);
for (const s of [-1, 1]) for (const y of [.45, .95]) mesh(rbox(.08, .1, 1.7, .03), '#E3A872', [0, y, s * 2.2], 1, [0, 0, 0], gate);
mesh(rbox(.2, .2, 2.7, .06), '#C98E5E', [0, 1.75, 0], 1, [0, 0, 0], gate); for (const z of [-1.22, 1.22]) mesh(rbox(.16, .6, .16, .05), '#C98E5E', [0, 1.5, z], 1, [0, 0, 0], gate);
const doors = [1, -1].map(s => { const h = grp([0, 0, s * 1.15], gate); mesh(rbox(.12, 1.25, 1.08, .05), '#E3A872', [0, .72, -s * .56], 1, [0, 0, 0], h); for (const y of [.35, 1.1]) mesh(rbox(.16, .12, 1.04, .03), '#C98E5E', [0, y, -s * .56], 1, [0, 0, 0], h); return h; });
const lock = grp([-.16, .86, 0], gate);
mesh(rbox(.24, .78, .95, .08), '#FFD966', [0, 0, 0], 1, [0, 0, 0], lock); const shackle = mesh(new THREE.TorusGeometry(.22, .05, 8, 20, Math.PI), '#C9CBD6', [0, .38, 0], 1, [0, Math.PI / 2, 0], lock);
// Tens wheel on the LEFT as seen by the player (camera looks along +x, so left is −z)
const wheels = [-.2, .2].map(z => { const w = grp([-.14, -.04, z], lock); mesh(new THREE.CylinderGeometry(.17, .17, .08, 24), '#ffffff', [0, 0, 0], 1, [0, 0, Math.PI / 2], w); const f = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: numTex(0), transparent: true })); f.position.x = -.045; f.rotation.y = -Math.PI / 2; w.add(f); w.userData.face = f; return w; });
{ const lt = sprite(pillTex('Tens'), .16); lt.position.set(-.2, -.36, -.2); lock.add(lt); const lo = sprite(pillTex('Ones'), .16); lo.position.set(-.2, -.36, .2); lock.add(lo); }
// S5 stones + chest
const stones = []; for (let i = 0; i < 7; i++) { const g = grp([9.6 + Math.sin(i * 1.3) * .35, .02, -5.0 - i * .82]); mesh(new THREE.CylinderGeometry(.36, .42, .4, 20), '#D8D2C8', [0, -.12, 0], 1, [0, 0, 0], g); const lab = sprite(numTex(''), .42, 1); lab.position.y = .48; g.add(lab); g.userData.lab = lab; stones.push(g); }
const chest = grp([9.6, G, -11.7]); mesh(rbox(.9, .5, .6, .08), '#C98E5E', [0, .25, 0], 1, [0, 0, 0], chest);
const lid = grp([0, .5, -.3], chest); mesh(rbox(.94, .22, .64, .08), '#E3A872', [0, .08, .3], 1, [0, 0, 0], lid); mesh(rbox(.16, .2, .08, .03), '#FFD966', [0, 0, .62], 1, [0, 0, 0], lid);
const gemGeo = new THREE.OctahedronGeometry(.22, 0), GEMM = M('#FF8FB1', { emissive: '#ff5f8f', emissiveIntensity: .25 });
const gem3 = mesh(gemGeo, GEMM, [0, .3, 0], [1, 1.3, 1], [0, 0, 0], chest); gem3.visible = false;
// S6 bunny picnic
const checker = tex('checker', 256, 256, (x, w) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#FF8A8A' : '#FFF4EC'; x.fillRect(i * 32, j * 32, 32, 32); } });
const blanket = mesh(rbox(2.4, .04, 2.0, .02), new THREE.MeshToonMaterial({ map: checker, gradientMap: GRAD }), [10.6, G + .02, 1.4]);
function makeBunny(color = '#ffffff') {
  const g = new THREE.Group(); ball(color, [0, .22, 0], [.2, .22, .18], g); ball('#FFF2F5', [0, .2, .1], [.12, .14, .1], g, true); ball(color, [0, .52, .02], [.19, .17, .17], g);
  for (const s of [-1, 1]) { const e = grp([s * .07, .64, 0], g); e.rotation.z = -s * .15; mesh(new THREE.CapsuleGeometry(.045, .2, 4, 10), color, [0, .14, 0], 1, [0, 0, 0], e); mesh(new THREE.CapsuleGeometry(.022, .16, 4, 8), '#FFB3C6', [0, .14, .03], 1, [0, 0, 0], e, true); }
  for (const s of [-1, 1]) { mesh(SPH, EYE, [s * .07, .55, .15], [.028, .036, .02], [0, 0, 0], g); mesh(SPH, WHITE, [s * .07 + .01, .565, .165], .009, [0, 0, 0], g); ball('#FF9BB5', [s * .11, .49, .13], [.03, .02, .01], g, true); }
  ball('#FF8FA8', [0, .5, .17], [.025, .02, .015], g, true); ball('#ffffff', [0, .18, -.2], .07, g);
  return g;
}
const defBunnies = grp(); [[10.0, .55], [10.9, .5], [11.6, 1.1]].forEach(([x, z], i) => { const b = makeBunny(['#ffffff', '#F3E3D3', '#E8E8F0'][i]); b.position.set(x, G, z); b.lookAt(10.6, G, 1.5); defBunnies.add(b); });
const picnicBasket = grp([10.6, G + .04, 1.4]); { const prof = []; for (let k = 0; k <= 8; k++) { const t = k / 8; prof.push(new THREE.Vector2(.16 + .1 * Math.sin(t * 1.4), t * .22)); } mesh(new THREE.LatheGeometry(prof, 20), new THREE.MeshToonMaterial({ color: '#C98E5E', gradientMap: GRAD, side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], picnicBasket); mesh(new THREE.TorusGeometry(.26, .03, 6, 20), '#9C6A47', [0, .22, 0], 1, [Math.PI / 2, 0, 0], picnicBasket); }
// S7 dock + boat
const dock = grp([16.2, 0, -.6]);
mesh(rbox(5.2, .12, 1.0, .03), '#E3A872', [0, .36, 0], 1, [0, 0, 0], dock); for (let i = 0; i < 6; i++) for (const z of [-.42, .42]) mesh(new THREE.CylinderGeometry(.07, .07, .9, 10), '#9C6A47', [-2.4 + i * .96, -.05, z], 1, [0, 0, 0], dock);
const lineMarks = grp([0, .43, .2], dock);
const boat = grp([16.2, -.1, .9]);
mesh(rbox(1.1, .34, .6, .14), '#FF8A65', [0, .12, 0], 1, [0, 0, 0], boat); mesh(rbox(1.12, .08, .62, .04), '#ffffff', [0, .22, 0], 1, [0, 0, 0], boat);
mesh(rbox(.42, .38, .38, .05), '#FFD45E', [0, .48, 0], 1, [0, 0, 0], boat); mesh(CYL, '#9C6A47', [.38, .6, 0], [.025, .9, .025], [0, 0, 0], boat); mesh(new THREE.ConeGeometry(.2, .32, 3), '#8FD3FE', [.5, .84, 0], [1, 1, .3], [0, 0, -Math.PI / 2], boat);
const boatLab = sprite(numTex(''), .55, 1); boatLab.position.set(0, 1.0, 0); boat.add(boatLab);
tickers.add(t => { boat.position.y = -.1 + Math.sin(t * 2) * .04; boat.rotation.z = Math.sin(t * 1.6) * .04; });
// bridge to the south island
const bridge2 = grp([9.6, .45, 5.7]); mesh(rbox(1.05, .14, 4.2, .05), '#E3A872', [0, 0, 0], 1, [0, 0, 0], bridge2); for (let i = -2; i <= 2; i++) mesh(rbox(1.07, .15, .06, .02), '#C98E5E', [0, 0, i * .8], 1, [0, 0, 0], bridge2);
for (const z of [-1.2, 1.2]) for (const x of [-.45, .45]) mesh(new THREE.CylinderGeometry(.09, .12, 1.1, 12), '#C98E5E', [x, -.3, z], 1, [0, 0, 0], bridge2);
for (const x of [-.5, .5]) mesh(rbox(.06, .06, 4.2, .02), '#C98E5E', [x, .45, 0], 1, [0, 0, 0], bridge2);
for (const x of [-.5, .5]) for (let i = -2; i <= 2; i++) mesh(rbox(.06, .45, .06, .02), '#C98E5E', [x, .22, i * 1.0], 1, [0, 0, 0], bridge2);
// S8 picnic table + pie
const table = grp([7.9, G, 9.6]); mesh(new THREE.CylinderGeometry(.95, .95, .09, 32), '#FFFFFF', [0, .72, 0], 1, [0, 0, 0], table); mesh(new THREE.CylinderGeometry(.08, .12, .7, 12), '#C98E5E', [0, .36, 0], 1, [0, 0, 0], table); mesh(new THREE.CylinderGeometry(.4, .45, .06, 20), '#C98E5E', [0, .03, 0], 1, [0, 0, 0], table);
mesh(new THREE.TorusGeometry(.95, .025, 6, 40), '#FF8A8A', [0, .77, 0], 1, [Math.PI / 2, 0, 0], table);
function makePie(b, par) {
  const g = grp([0, .8, 0], par), R = .62, wedges = [];
  for (let i = 0; i < b; i++) {
    const t0 = i / b * Math.PI * 2, dt = Math.PI * 2 / b, mid = t0 + dt / 2; const w = grp([Math.sin(mid) * .025, 0, Math.cos(mid) * .025], g);
    mesh(new THREE.CylinderGeometry(R, R, .14, Math.max(6, Math.round(48 / b)), 1, false, t0, dt), '#E8B06A', [0, .07, 0], 1, [0, 0, 0], w);
    const top = mesh(new THREE.CylinderGeometry(R * .9, R * .9, .02, Math.max(6, Math.round(48 / b)), 1, false, t0 + .02, dt - .04), new THREE.MeshToonMaterial({ color: '#FFE9B8', gradientMap: GRAD }), [0, .15, 0], 1, [0, 0, 0], w, true);
    w.userData = { top, on: false, mid }; wedges.push(w);
  }
  return { g, wedges };
}
const defPie = makePie(6, table);
// S9 clock tower
const tower = grp([11.9, G, 10.2]);
mesh(rbox(1.3, 2.4, 1.1, .1), '#FFD8A8', [0, 1.2, 0], 1, [0, 0, 0], tower); mesh(new THREE.ConeGeometry(1.0, .95, 4), '#FF8A65', [0, 2.85, 0], 1, [0, Math.PI / 4, 0], tower);
mesh(rbox(.46, .7, .08, .2), '#C98E5E', [0, .35, .54], 1, [0, 0, 0], tower); ball('#FFD45E', [.13, .38, .6], .03, tower);
const bell = grp([0, 3.32, 0], tower); mesh(new THREE.CylinderGeometry(.06, .16, .2, 14), '#FFD45E', [0, -.1, 0], 1, [0, 0, 0], bell); ball('#FFB84D', [0, -.22, 0], .04, bell);
mesh(new THREE.TorusGeometry(.5, .05, 8, 40), '#FFD45E', [0, 1.65, .56], 1, [0, 0, 0], tower);
const clockTex = tex('clockface', 512, 512, (x, w) => {
  x.fillStyle = '#FFFDF6'; x.beginPath(); x.arc(256, 256, 250, 0, 7); x.fill();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = i % 5 ? 222 : 206; x.strokeStyle = INK; x.lineWidth = i % 5 ? 4 : 9; x.beginPath(); x.moveTo(256 + Math.sin(a) * r1, 256 - Math.cos(a) * r1); x.lineTo(256 + Math.sin(a) * 238, 256 - Math.cos(a) * 238); x.stroke(); }
  x.fillStyle = INK; x.font = FONT(58); x.textAlign = 'center'; x.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; x.fillText(i, 256 + Math.sin(a) * 166, 262 - Math.cos(a) * 166); }
});
mesh(new THREE.CircleGeometry(.48, 40), new THREE.MeshBasicMaterial({ map: clockTex }), [0, 1.65, .565], 1, [0, 0, 0], tower, true);
const hands = grp([0, 1.65, .59], tower);
const hourH = grp([0, 0, .005], hands); mesh(rbox(.07, .26, .02, .01), INK, [0, .11, 0], 1, [0, 0, 0], hourH, true);
const minH = grp([0, 0, .02], hands); mesh(rbox(.045, .4, .02, .01), '#FF6B6B', [0, .18, 0], 1, [0, 0, 0], minH, true);
ball('#FFD45E', [0, 0, .03], .04, hands, true);
let clockHM = [12, 0];
function setClock(h, m, dur = .35) { const fromH = hourH.rotation.z, fromM = minH.rotation.z; const toM = -m / 60 * Math.PI * 2, toH = -(((h % 12) + m / 60) / 12) * Math.PI * 2; const dm = ((toM - fromM + Math.PI * 3) % (Math.PI * 2)) - Math.PI, dh = ((toH - fromH + Math.PI * 3) % (Math.PI * 2)) - Math.PI; clockHM = [h, m]; return anim(dur, k => { minH.rotation.z = fromM + dm * k; hourH.rotation.z = fromH + dh * k; }); }
setClock(10, 10, .01);
// S10 sheep pen field
const PEN = { cx: 9.0, cz: 12.6, u: .34, n: 8 };
const gridTex = tex('grid', 512, 512, (x, w) => { x.fillStyle = '#C9A57A'; x.fillRect(0, 0, w, w); x.strokeStyle = 'rgba(59,47,74,.55)'; x.lineWidth = 4; for (let i = 0; i <= 8; i++) { const p = i * 64; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, w); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(w, p); x.stroke(); } });
mesh(rbox(3.0, .08, 3.0, .03), '#B07A4F', [PEN.cx, G + .02, PEN.cz]);
mesh(new THREE.PlaneGeometry(PEN.u * 8, PEN.u * 8), new THREE.MeshToonMaterial({ map: gridTex, gradientMap: GRAD }), [PEN.cx, G + .065, PEN.cz], 1, [-Math.PI / 2, 0, 0], world, true);
function makeSheep() {
  const g = new THREE.Group();
  [[0, .32, 0, .26], [-.16, .34, .08, .16], [.16, .34, .08, .16], [-.16, .34, -.1, .16], [.16, .34, -.1, .16], [0, .48, 0, .18]].forEach(([x, y, z, r]) => ball('#FFFFFF', [x, y, z], r, g));
  ball('#5B4B5A', [0, .38, .26], [.12, .13, .11], g); for (const s of [-1, 1]) { ball('#5B4B5A', [s * .12, .42, .22], [.06, .03, .04], g); mesh(SPH, WHITE, [s * .045, .41, .35], .02, [0, 0, 0], g); mesh(SPH, EYE, [s * .045, .41, .365], .011, [0, 0, 0], g); ball('#FF9BB5', [s * .07, .35, .34], [.025, .015, .01], g, true); }
  ball('#FFFFFF', [0, .5, .24], .07, g); for (const [x, z] of [[-.12, .1], [.12, .1], [-.12, -.1], [.12, -.1]]) mesh(CYL, '#5B4B5A', [x, .08, z], [.03, .16, .03], [0, 0, 0], g);
  return g;
}
const defSheep = grp(); [[6.6, 11.4], [6.9, 12.3], [6.4, 10.5]].forEach(([x, z]) => { const s = makeSheep(); s.position.set(x, G, z); s.rotation.y = srnd() * 6; defSheep.add(s); });
// map markers & earned gems
const markers = MARK.map((p, i) => { const s = sprite(markerTex(KEYS[i], 0, true, false), 2.3); s.position.set(...p); world.add(s); s.userData.onTap = () => goStation(i); return s; });
const gemMarks = MARK.map(p => { const m = mesh(gemGeo, GEMM, [p[0], p[1] - 1.75, p[2]], [1.1, 1.4, 1.1]); m.visible = false; return m; });
tickers.add(t => { gemMarks.forEach((m, i) => { m.rotation.y = t * 1.5 + i; m.position.y = MARK[i][1] - 1.75 + Math.sin(t * 2 + i) * .06; }); markers.forEach((m, i) => { m.position.y = MARK[i][1] + (m.userData.next ? Math.abs(Math.sin(t * 3)) * .3 : 0); }); });

/* ================= camera rig + occlusion ================= */
const cam = { pos: V(0, 30, 24), look: V(2.5, 0, 0), orbit: false };
const portrait = () => innerWidth / innerHeight < 1;
function camFor(look, off) { const a = innerWidth / innerHeight, f = a < 1 ? 1 + (1 - a) * (off === MAPCAM.off ? 1.6 : 1.25) : 1; return [V(...look), V(look[0] + off[0] * f, look[1] + off[1] * f, look[2] + off[2] * f)]; }
async function fly(look, off, dur = 1.4) { const [l, p] = camFor(look, off); cam.orbit = false; const l0 = cam.look.clone(), p0 = cam.pos.clone(); await anim(dur, k => { cam.look.lerpVectors(l0, l, k); cam.pos.lerpVectors(p0, p, k); }, ease.io); }
const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().add(ab.multiplyScalar(t))); };
function hideOccluders(i) {
  const [look, pos] = camFor(CAMS[i].look, CAMS[i].off), pp = V(...PATH[STAND[i]]).add(V(0, .8, 0));
  for (const d of decor) d.o.visible = !(segDist(d.c, pos, look) < d.r + .25 || segDist(d.c, pos, pp) < d.r + .2 || d.c.distanceTo(pos) < d.r + 1);
  defBunnies.visible = i !== 5; defSheep.visible = i !== 9; defPie.g.visible = i !== 7;
}
function showAllDecor() { decor.forEach(d => d.o.visible = true); defBunnies.visible = defSheep.visible = defPie.g.visible = true; }
let vOff = 0;
function layout() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  const top = ($('#card').hidden ? $('.bar') : $('#card')).getBoundingClientRect().bottom, bot = $('#panel').hidden ? h : $('#panel').getBoundingClientRect().top - 60;
  vOff = Math.round(((h - bot) - top) / 2); camera.setViewOffset(w, h, 0, vOff, w, h); camera.updateProjectionMatrix();
}
addEventListener('resize', () => { layout(); if (scr === 'map') fly(mapLook(), MAPCAM.off, .01); else if (scr === 'level') fly(CAMS[L.i].look, CAMS[L.i].off, .01); });

/* ================= tapping ================= */
const tappables = new Set(markers); tappables.add(bean);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
let last = null; const pan = V(0, 0, 0);
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; last = [e.clientX, e.clientY]; audio(); });
canvas.addEventListener('pointermove', e => {
  if (!down || scr !== 'map' || busy) return; const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
  if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 12) return;
  const s = cam.pos.distanceTo(cam.look) / innerHeight * 1.1, d = V(-dx * s, 0, -dy * s);
  const nx = Math.max(-11, Math.min(11, pan.x + d.x)), nz = Math.max(-11, Math.min(11, pan.z + d.z)); d.set(nx - pan.x, 0, nz - pan.z); pan.add(d); cam.look.add(d); cam.pos.add(d);
});
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 12) return; down = null;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const vis = o => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const hits = ray.intersectObjects([...tappables].filter(vis), true);
  for (const h of hits) { let o = h.object; while (o && !o.userData.onTap) o = o.parent; if (o) { o.userData.onTap(); return; } }
});

/* ================= UI helpers ================= */
const svgStar = on => `<svg viewBox="0 0 40 40"><polygon points="20,3 25,14.5 37.5,15.5 28,24 31,36.5 20,30 9,36.5 12,24 2.5,15.5 15,14.5" fill="${on ? '#FFD966' : '#fff'}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/></svg>`;
const svgGem = on => `<svg viewBox="0 0 30 30"><path d="M8 4h14l6 8-13 15L2 12z" fill="${on ? '#FF8FB1' : '#E6E1EA'}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
function setBar(en, zh, st) { $('#pill').innerHTML = `<b>${en}</b><span class="zh">${zh}</span>`; $('#barStars').innerHTML = st == null ? '' : [0, 1, 2].map(i => svgStar(i < st)).join(''); }
let scr = 'title', L = null, busy = false, pipAt = 0;
function prompt(en, zh) { if (!L || L.dead || scr !== 'level') return; L.pEn = en.replace(/<[^>]+>/g, ''); L.pZh = zh; $('#prompt').innerHTML = `<span class="en">${en}</span><span class="zh">${zh}</span>`; $('#card').hidden = false; layout(); }
function ctl(html) { if (scr !== 'level') return; $('#ctl').innerHTML = html; $('#panel').hidden = false; $('#bubble').hidden = true; requestAnimationFrame(layout); }
function hints(list) { if (!L || L.dead) return; L.hints = list; L.hi = 0; }
let bubT; function bubble(en, zh, ms = 6000) { const b = $('#bubble'); b.innerHTML = `${en}<span class="zh">${zh}</span>`; b.hidden = false; clearTimeout(bubT); bubT = setTimeout(() => b.hidden = true, ms); }
function hintPress() { if (scr !== 'level' || !L.hints.length) return; sfx.hint(); beanFlip = .45; const h = L.hints[Math.min(L.hi, L.hints.length - 1)]; if (L.hi < L.hints.length) { L.hi++; L.hintsUsed++; } bubble(h[0], h[1]); }
$('#hintBtn').onclick = hintPress;
function oops(el, en, zh) { if (!L || L.dead) return; L.mistakes++; sfx.no(); sad(); if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); } if (en) bubble(en, zh); }
const COLS = ['#FFD966', '#9BE29B', '#8FD3FE', '#FF9F6B', '#FF8FB1', '#B9A2FF'];
function options(vals, correct, onRight, onWrong, extra = '') {
  if (scr !== 'level') return;
  ctl(`${extra}<div class="row" id="opts">${shuffle(vals.slice()).map(v => `<button class="tile${String(v).length > 2 ? ' wide' : ''}" style="background:${pick(COLS)}" data-v="${v}">${v}</button>`).join('')}</div>`);
  document.querySelectorAll('#opts .tile').forEach(t => t.onclick = () => { if (busy) return; audio(); const v = +t.dataset.v; if (v === correct) { sfx.ok(); onRight(t); } else { oops(t); onWrong && onWrong(v); } });
}
const near = (c, n, lo = 1) => { const s = new Set([c]); let k = 1, g = 0; while (s.size < n && g++ < 200) { const d = pick([-1, 1]) * k; if (c + d >= lo) s.add(c + d); if (rnd(0, 1)) k++; if (k > 5) k = 1; } return [...s]; };
function modal(h, cls = '') { $('#mcard').className = 'mcard ' + cls; $('#mcard').innerHTML = h; $('#modal').hidden = false; }
const closeModal = () => $('#modal').hidden = true;
function toast(t) { const d = $('#toast'); d.textContent = t; d.hidden = false; clearTimeout(d._t); d._t = setTimeout(() => d.hidden = true, 2200); }
$('#sfxBtn').onclick = e => { sfxOn = !sfxOn; e.currentTarget.classList.toggle('off', !sfxOn); sfx.tap(); };
$('#musicBtn').onclick = e => { musicOn = !musicOn; e.currentTarget.classList.toggle('off', !musicOn); audio(); music.setOn(musicOn); };
$('#sayEn').onclick = () => L && speak(L.pEn, 'en-US'); $('#sayZh').onclick = () => L && speak(L.pZh, 'zh-TW');
$('#homeBtn').onclick = () => { if (busy) return; sfx.tap(); try { speechSynthesis.cancel(); } catch (e) {} closeModal(); if (scr === 'level') showMap(); else if (scr === 'map') showTitle(); };
$('#saveBtn').onclick = () => { if (busy) return; sfx.tap(); saveDialog(); };
$('#worldBtn').onclick = () => { if (busy) return; sfx.tap(); worldsDialog(); };
document.addEventListener('pointerdown', () => { audio(); if (musicOn && !music.mood) music.play(scr === 'title' ? 'title' : 'map'); }, { once: true });

/* ================= save / load dialogs ================= */
function syncPos() { game.pos = pipAt; }
function autosave() { syncPos(); SAVE.autoSave(game); }
function saveDialog() {
  syncPos(); const def = game.name || SAVE.defaultName();
  modal(`<h2>Save game<span class="zh">儲存遊戲</span></h2>
    <label class="lbl" for="saveName">Save name 存檔名稱</label><input class="code" id="saveName" maxlength="40" value="${esc(def)}">
    <button class="btn green" id="doSave">Save ✓<span class="zh">存檔</span></button>
    <div class="codewrap"><div class="small">To play on another phone, iPad or computer, use this save code:<span class="zh">要在別的手機、iPad 或電腦接著玩，請記下存檔碼：</span></div>
    <div class="codebox" id="code">${SAVE.encode(game, KEYS)}</div><button class="btn white sm" id="copy">Copy code<span class="zh">複製存檔碼</span></button></div>
    <button class="btn white sm" id="cl">Close<span class="zh">關閉</span></button><div id="cmsg" class="small"></div>`);
  const inp = $('#saveName'); inp.addEventListener('focus', () => inp.select());
  $('#doSave').onclick = () => { const ok = SAVE.saveSlot(game, inp.value || def); sfx.ok(); $('#cmsg').textContent = ok ? `Saved as “${game.name}”! 已存檔！` : 'This browser cannot save here — please use the save code. 這個瀏覽器無法存檔，請用存檔碼。'; };
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText($('#code').textContent); $('#cmsg').textContent = 'Copied! 已複製'; } catch (e) { $('#cmsg').textContent = 'Please write the code down. 請把存檔碼抄下來。'; } };
  $('#cl').onclick = closeModal;
}
function fmtDate(t) { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function loadDialog() {
  const slots = SAVE.listSlots();
  const rows = slots.length ? slots.map(s => { const st = KEYS.reduce((a, k) => a + ((s.stars || {})[k] || 0), 0), gm = KEYS.filter(k => (s.stars || {})[k]).length;
    return `<div class="slot"><button class="slotmain" data-id="${s.id}"><b>${esc(s.name)}</b><span class="meta">${svgGem(true)} ${gm}/10 · ★ ${st}/30 · ${fmtDate(s.updated)}</span></button><button class="del" data-del="${s.id}" aria-label="Delete">✕</button></div>`; }).join('')
    : `<div class="small">No saves on this device yet.<span class="zh">這台裝置還沒有存檔。</span></div>`;
  modal(`<h2>Load game<span class="zh">讀取存檔</span></h2><div class="slots">${rows}</div>
    <div class="codewrap"><div class="small">Have a save code from another device?<span class="zh">有別台裝置的存檔碼嗎？</span></div>
    <div class="row nowrap"><input class="code" id="ci" placeholder="XXXX-XXXX" maxlength="9" autocapitalize="characters" aria-label="Save code"><button class="btn green sm" id="loadCode">Load<span class="zh">讀取</span></button></div></div>
    <button class="btn white sm" id="cl">Back<span class="zh">返回</span></button><div id="cmsg" class="small"></div>`);
  document.querySelectorAll('.slotmain').forEach(b => b.onclick = () => { const g = SAVE.loadSlot(b.dataset.id); if (!g) return; game = g; sfx.ok(); closeModal(); startGame(true); });
  document.querySelectorAll('.del').forEach(b => b.onclick = () => { if (b.dataset.sure) { SAVE.deleteSlot(b.dataset.del); sfx.tap(); loadDialog(); } else { b.dataset.sure = 1; b.textContent = 'Delete?'; b.classList.add('sure'); } });
  $('#loadCode').onclick = () => { const g = SAVE.decode($('#ci').value, KEYS); if (!g) { sfx.no(); $('#cmsg').textContent = 'Code not found — check the letters. 存檔碼不正確，請再檢查。'; return; } g.name = 'Imported 匯入的存檔'; game = g; SAVE.saveSlot(game, 'Imported ' + fmtDate(Date.now())); sfx.ok(); closeModal(); startGame(true); };
  $('#cl').onclick = closeModal;
}
function worldsDialog() {
  modal(`<h2>Worlds<span class="zh">世界</span></h2><div class="worlds">${WORLDS.map(w => `<div class="world ${w.soon ? 'soon' : ''}" style="--wc:${w.color}"><b>${w.en}</b><span class="zh">${w.zh}</span><span class="meta">${w.soon ? 'Coming soon · 敬請期待' : `${svgGem(true)} ${gems()}/10 · ★ ${totalStars()}/30`}</span></div>`).join('')}</div>
    <div class="small">More worlds are on the way!<span class="zh">更多世界即將開放！</span></div><button class="btn white sm" id="cl">Close<span class="zh">關閉</span></button>`);
  $('#cl').onclick = closeModal;
}

/* ================= screens ================= */
function resetWorld() {
  KEYS.forEach((k, i) => clearDyn(i)); showAllDecor();
  plank.rotation.z = done(2) ? 0 : .12; doors[0].rotation.y = done(3) ? -1.45 : 0; doors[1].rotation.y = done(3) ? 1.45 : 0; lock.visible = !done(3); lock.position.set(-.16, .86, 0); lock.rotation.set(0, 0, 0);
  stones.forEach((s, i) => { s.position.y = done(4) || i < 5 ? .02 : -.7; s.userData.lab.visible = false; }); lid.rotation.x = done(4) ? -1.9 : 0; gem3.visible = false;
  bridge2.visible = true; boatLab.visible = false; boat.position.x = 16.2; lineMarks.clear();
  defPie.wedges.forEach(w => { w.userData.top.material.color.set('#FFE9B8'); });
  const nextI = KEYS.findIndex((k, i) => unlocked(i) && !done(i));
  markers.forEach((m, i) => { setSpriteTex(m, markerTex(KEYS[i], game.stars[KEYS[i]] || 0, !unlocked(i), i === nextI)); m.userData.next = i === nextI; m.visible = true; });
  gemMarks.forEach((g, i) => g.visible = done(i));
}
function uiMode(m) { $('#title').hidden = m !== 'title'; $('.bar').style.visibility = m === 'title' ? 'hidden' : 'visible'; $('#mapTools').hidden = m !== 'map'; if (m !== 'level') { $('#card').hidden = true; $('#panel').hidden = true; } $('#finale').hidden = m !== 'finale'; }
function showTitle() {
  scr = 'title'; if (L) L.dead = true; uiMode('title'); resetWorld(); markers.forEach(m => m.visible = false); gemMarks.forEach(g => g.visible = false);
  pip.root.position.set(...PATH[0]); pip.root.rotation.y = .5; pip.mode = 'wave'; setEyes('happy'); cam.orbit = true; layout();
  $('#loadBtn').querySelector('.badge').textContent = SAVE.listSlots().length || '';
  if (musicOn && music.mood) music.play('title');
}
function startGame(loaded) {
  if (!loaded) game = SAVE.newGame();
  const last = [...KEYS.keys()].reverse().find(i => done(i));
  pipAt = loaded && game.pos >= 0 && game.pos < PATH.length ? game.pos : (last == null ? 0 : STAND[last]);
  showMap(true);
  if (loaded) toast(`Welcome back! 歡迎回來 ${game.name || ''}`);
}
function showMap(keepPos) {
  scr = 'map'; if (L) L.dead = true; uiMode('map'); setBar(WORLDS[0].en, WORLDS[0].zh, null); resetWorld();
  $('#mapInfo').innerHTML = `<span class="gems">${KEYS.map((k, i) => svgGem(done(i))).join('')}</span><span class="cnt">${gems()}/10</span>`;
  if (!keepPos) { const last = [...KEYS.keys()].reverse().find(i => done(i)); pipAt = last == null ? 0 : STAND[last]; }
  pip.root.position.set(...PATH[pipAt]); pip.mode = 'idle'; setEyes('happy'); autosave();
  if (musicOn) music.play('map');
  const p = PATH[pipAt]; pan.set(portrait() ? Math.max(-11, Math.min(11, p[0] - MAPCAM.look[0])) : 0, 0, portrait() ? Math.max(-11, Math.min(11, (p[2] - MAPCAM.look[2]) * .6)) : 0);
  layout(); fly(mapLook(), MAPCAM.off, 1.2).then(() => face(cam.pos.x, cam.pos.z));
  if (portrait() && !showMap.tipped) { showMap.tipped = 1; setTimeout(() => scr === 'map' && toast('Drag to look around 用手指拖曳看看整座島'), 1500); }
}
async function goStation(i) {
  if (scr !== 'map' || busy) return;
  if (!unlocked(i)) { sfx.no(); toast('Finish the flag before it first! 先完成前一關喔！'); return; }
  busy = true; sfx.tap(); $('#mapTools').hidden = true; markers.forEach(m => m.visible = false); gemMarks.forEach(g => g.visible = false);
  const tgt = STAND[i], idx = []; if (tgt >= pipAt) for (let k = pipAt + 1; k <= tgt; k++) idx.push(k); else for (let k = pipAt - 1; k >= tgt; k--) idx.push(k);
  scr = 'walking'; const c = CAMS[i]; const fp = fly(c.look, c.off, 1.6 + idx.length * .25);
  setTimeout(() => hideOccluders(i), 300);
  await walk(idx.map(k => PATH[k]), 3); pipAt = tgt; await Promise.all([face(...FACE[i]), fp]); busy = false; startLevel(i);
}
function startLevel(i) { scr = 'level'; L = { i, key: KEYS[i], hintsUsed: 0, mistakes: 0, hints: [], hi: 0 }; setBar(`${KEYS[i]} ${NAMES[i][0]}`, NAMES[i][1], null); clearDyn(i); hideOccluders(i); if (musicOn) music.play('level'); LV[i](); }
async function finish() {
  if (!L || L.dead || scr !== 'level') return;
  const pen = L.hintsUsed + L.mistakes, st = pen === 0 ? 3 : pen <= 2 ? 2 : 1, first = !done(L.i); game.stars[L.key] = Math.max(game.stars[L.key] || 0, st); autosave();
  setBar(`${L.key} ${NAMES[L.i][0]}`, NAMES[L.i][1], st); $('#panel').hidden = true; layout(); sfx.win(); await cheer();
  if (L.i === KEYS.length - 1 && gems() === KEYS.length) return finale(st);
  const nx = L.i + 1;
  modal(`<h2>Great job!<span class="zh">太棒了！</span></h2><div class="bigstars">${[0, 1, 2].map(() => svgStar(false)).join('')}</div>
   <div class="gemline">${first ? '+1 ' : ''}${svgGem(true)} ${gems()}/10</div>
   <div class="row">${nx < KEYS.length ? `<button class="btn green" id="nx">Next ▶<span class="zh">下一關</span></button>` : ''}<button class="btn white" id="mp">Map<span class="zh">地圖</span></button><button class="btn white" id="rp">Again<span class="zh">再玩一次</span></button></div>`);
  confetti($('#mcard'), 30);
  const ss = document.querySelectorAll('.bigstars svg'); for (let j = 0; j < st; j++) setTimeout(() => { ss[j].outerHTML = svgStar(true); sfx.star(j); }, 300 + j * 320);
  if (nx < KEYS.length) $('#nx').onclick = () => { closeModal(); showMap(true); setTimeout(() => goStation(nx), 1300); };
  $('#mp').onclick = () => { closeModal(); showMap(true); };
  $('#rp').onclick = () => { closeModal(); const i = L.i; resetWorld(); markers.forEach(m => m.visible = false); gemMarks.forEach(g => g.visible = false); if (i === 2) plank.rotation.z = .12; if (i === 3) { doors.forEach(d => d.rotation.y = 0); lock.visible = true; } if (i === 4) { pipAt = STAND[4]; pip.root.position.set(...PATH[pipAt]); face(...FACE[4]); } startLevel(i); };
}
function confetti(box, n) { for (let k = 0; k < n; k++) { const d = document.createElement('i'); d.className = 'confetti'; d.style.left = rnd(0, 100) + '%'; d.style.background = pick(COLS); d.style.animationDelay = Math.random() * .8 + 's'; d.style.animationDuration = (1.6 + Math.random()) + 's'; box.appendChild(d); } }

/* ================= grand finale ================= */
const fx = grp();
function firework(x, y, z, color) {
  const n = 90, pos = new Float32Array(n * 3), vel = []; for (let i = 0; i < n; i++) { pos.set([x, y, z], i * 3); const u = Math.random() * 2 - 1, a = Math.random() * 6.28, s = 4 + Math.random() * 2.5; vel.push(V(Math.sqrt(1 - u * u) * Math.cos(a) * s, u * s, Math.sqrt(1 - u * u) * Math.sin(a) * s)); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: .45, transparent: true, depthWrite: false, map: tex('spark', 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(.35, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }) });
  const pts = new THREE.Points(geo, mat); fx.add(pts); sfx.boom(); let life = 0;
  const tk = (t, dt) => { life += dt; const p = geo.attributes.position; for (let i = 0; i < n; i++) { vel[i].y -= 5 * dt; vel[i].multiplyScalar(.985); p.setXYZ(i, p.getX(i) + vel[i].x * dt, p.getY(i) + vel[i].y * dt, p.getZ(i) + vel[i].z * dt); } p.needsUpdate = true; mat.opacity = Math.max(0, 1 - life / 2.2); if (life > 2.3) { tickers.delete(tk); fx.remove(pts); geo.dispose(); mat.dispose(); } };
  tickers.add(tk);
}
async function finale(st) {
  scr = 'finale'; busy = true; closeModal(); uiMode('finale'); $('.bar').style.visibility = 'hidden'; $('#finale').hidden = true;
  if (musicOn) music.play('finale'); sfx.fanfare(); showAllDecor(); clearDyn(9);
  pip.root.position.set(3.0, G + .5, 0); pip.root.rotation.y = 0; plank.rotation.z = 0;
  await fly([3, 2.5, 0], portrait() ? [0, 16, 20] : [0, 18, 24], 2.2);
  // rainbow
  const rb = grp([3, -.4, -3]); ['#FF6B6B', '#FF9F43', '#FFD93D', '#6BCB77', '#4D96FF', '#9B72FF'].forEach((c, i) => mesh(new THREE.TorusGeometry(10 - i * .45, .24, 10, 80, Math.PI), c, [0, 0, 0], 1, [0, 0, 0], rb));
  rb.scale.setScalar(.001); anim(1.6, k => rb.scale.setScalar(Math.max(.001, k)), ease.back);
  // gems fly to a crown above Pip
  const crown = []; gemMarks.forEach((g, i) => { const m = mesh(gemGeo, GEMM, [MARK[i][0], MARK[i][1] - 1.75, MARK[i][2]], [1.1, 1.4, 1.1], [0, 0, 0], fx); crown.push(m); });
  crown.forEach((m, i) => { const a = i / crown.length * Math.PI * 2; setTimeout(() => arc(m, V(3 + Math.cos(a) * 2.2, 4.2, Math.sin(a) * 2.2), 4, 1.4), i * 120); });
  const spin = (t) => crown.forEach((m, i) => { m.rotation.y = t * 3; }); tickers.add(spin);
  pip.mode = 'dance'; setEyes('happy'); setMouth('open');
  const friends = grp([3, G + .5, 0], fx); [[-1.5, .4, makeBunny()], [1.5, .4, makeBunny('#F3E3D3')], [-2.6, -.2, makeSheep()], [2.6, -.2, makeSheep()]].forEach(([x, z, o]) => { o.position.set(x, 0, z); friends.add(o); popIn(o); });
  const fr = t => friends.children.forEach((o, i) => { o.position.y = Math.abs(Math.sin(t * 6 + i)) * .3; o.rotation.y = Math.sin(t * 2 + i) * .5; }); tickers.add(fr);
  let fw = setInterval(() => firework(3 + rnd(-10, 10), rnd(7, 11), rnd(-8, 2), pick(['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF8FB1', '#B9A2FF', '#ffffff'])), 650);
  await wait(1800);
  $('#finale').innerHTML = `<div class="fcard"><div class="medal">${svgStar(true)}</div><h1>Hooray${game.name ? ', ' + esc(game.name.split('·')[0].trim()) : ''}!<span class="zh">太厲害了！</span></h1>
    <p class="big">You restored <b>Orchard Island</b>!<span class="zh">你把乘法果園島全部修好了！</span></p>
    <div class="badge">🏅 Orchard Island Champion<span class="zh">果園島小冠軍</span></div>
    <div class="gemline">${KEYS.map(() => svgGem(true)).join('')}<span>★ ${totalStars()}/30</span></div>
    <button class="btn green" id="fin">Back to title ▶<span class="zh">回到主畫面</span></button></div>`;
  $('#finale').hidden = false; confetti($('#finale'), 80); sfx.fanfare();
  const end = async () => { if (scr !== 'finale') return; clearInterval(fw); tickers.delete(spin); tickers.delete(fr); fx.clear(); world.remove(rb); pip.mode = 'idle'; setMouth('smile'); busy = false; $('#finale').hidden = true; showTitle(); };
  $('#fin').onclick = end; setTimeout(end, 20000);
}

/* ================= 3D helpers for levels ================= */
function block(n, color) { const g = new THREE.Group(); mesh(rbox(.5, .5, .5, .1), color, [0, 0, 0], 1, [0, 0, 0], g); for (const [p, r] of [[[0, 0, .255], [0, 0, 0]], [[0, .255, 0], [-Math.PI / 2, 0, 0]]]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), new THREE.MeshBasicMaterial({ map: numTex(n), transparent: true })); f.position.set(...p); f.rotation.set(...r); g.add(f); } return g; }
function appleObj() { const a = new THREE.Group(); ball('#FF6B6B', [0, 0, 0], .12, a); mesh(CYL, '#7A4A2A', [0, .12, 0], [.015, .07, .015], [0, 0, 0], a, true); mesh(SPH, WHITE, [-.04, .05, .07], .025, [0, 0, 0], a); return a; }
const tapOn = (o, fn) => { o.userData.onTap = fn; tappables.add(o); return o; };

/* ================= levels ================= */
const LV = [
/* 1-1 Apple Baskets (multiplication as equal groups) */
() => {
  const g = rnd(2, 4), n = rnd(2, 5), N = g * n + 3, D = dyn[0];
  const fc = V(-9.3, G + 1.45 * 1.35, .6); const spots = []; const cols = 6; for (let k = 0; k < N; k++) { const c = k % cols, r = Math.floor(k / cols); const x = (c - (cols - 1) / 2) * .32, y = (r - 1.2) * .32; spots.push(V(fc.x + x, fc.y + y, fc.z + Math.sqrt(Math.max(.05, .95 - x * x - y * y)) * .95)); }
  const baskets = []; for (let b = 0; b < g; b++) {
    const bg = grp([-8.6 + (b - (g - 1) / 2) * 1.05, G, 2.7], D); const prof = []; for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push(new THREE.Vector2(.22 + .18 * Math.sin(t * 1.4), t * .42)); }
    mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshToonMaterial({ color: '#C98E5E', gradientMap: GRAD, side: THREE.DoubleSide }), [0, 0, 0], 1, [0, 0, 0], bg); mesh(new THREE.TorusGeometry(.39, .05, 8, 24), '#9C6A47', [0, .42, 0], 1, [Math.PI / 2, 0, 0], bg);
    const lab = sprite(pillTex('0'), .36); lab.position.y = 1.05; bg.add(lab); bg.userData = { apples: [], lab }; tapOn(bg, () => addTo(bg)); popIn(bg); baskets.push(bg);
  }
  const apples = spots.map(p => { const a = appleObj(); a.position.copy(p); D.add(a); a.userData = { home: p, in: null }; tapOn(a, () => { if (a.userData.in) takeOut(a); else if (baskets[0]) addTo(baskets.find(b => b.userData.apples.length < n) || baskets[0]); }); popIn(a); return a; });
  const slot = k => V((k % 2 - .5) * .2, .18 + Math.floor(k / 4) * .17, (Math.floor(k / 2) % 2 - .5) * .2);
  const relabel = b => setSpriteTex(b.userData.lab, pillTex(String(b.userData.apples.length), b.userData.apples.length === n ? '#9BE29B' : '#fff'));
  let moving = 0;
  async function addTo(b) { if (L.p2) return; const a = apples.slice().reverse().find(x => !x.userData.in && !x.userData.mv); if (!a) { bubble('No apples left on the tree!', '樹上沒有蘋果了！', 2500); return; }
    a.userData.mv = 1; moving++; sfx.pop(); b.userData.apples.push(a); a.userData.in = b; relabel(b); const k = b.userData.apples.length - 1; await arc(a, b.position.clone().add(slot(k)), 1.3); sfx.drop(); a.userData.mv = 0; moving--;
    anim(.2, q => b.scale.set(1 + .12 * Math.sin(q * Math.PI), 1 - .1 * Math.sin(q * Math.PI), 1 + .12 * Math.sin(q * Math.PI))); check(); }
  async function takeOut(a) { if (L.p2 || a.userData.mv) return; const b = a.userData.in; b.userData.apples.splice(b.userData.apples.indexOf(a), 1); a.userData.in = null; relabel(b); sfx.tap(); a.userData.mv = 1; b.userData.apples.forEach((x, k) => tweenV(x.position, b.position.clone().add(slot(k)), .25)); await arc(a, a.userData.home, .8, .5); a.userData.mv = 0; check(); }
  function check() { const c = baskets.map(b => b.userData.apples.length); if (c.some(x => x > n)) bubble(`Too many in one basket! Only ${n}.`, `有一籃太多囉！每籃只要 ${n} 顆。`, 3000); if (!moving && c.every(x => x === n) && !L.p2) { L.p2 = 1; sfx.ok(); setTimeout(p2, 500); } }
  prompt(`Grandpa Turtle needs <b>${g}</b> baskets with <b>${n}</b> apples in each. Tap a basket to drop an apple in!`, `龜爺爺要 ${g} 籃，每籃 ${n} 顆蘋果。點籃子放蘋果，點籃子裡的蘋果可以拿出來。`);
  hints([[`Every basket needs the same number: ${n} apples.`, `每一籃都要一樣多：${n} 顆。`], [`Look at the number above each basket.`, `看看每個籃子上面的數字。`], [`Tap an apple inside a basket to take it out.`, `點籃子裡的蘋果可以拿出來。`]]);
  ctl(`<div class="row hint-line">Tap the baskets in the picture<span class="zh">點畫面上的籃子</span></div>`);
  function p2() {
    prompt(`How many apples are in the baskets <b>in all</b>?`, `籃子裡總共有幾顆蘋果？`);
    hints([[`Add them up: ${Array(g).fill(n).join(' + ')}`, `把每籃加起來：${Array(g).fill(n).join(' + ')}`], [`${g} groups of ${n} is ${g} × ${n}.`, `${g} 籃、每籃 ${n} 顆，就是 ${g} × ${n}。`]]);
    const c = g * n, vs = [...new Set([c, g + n, c + n, c - n].filter(v => v > 0))]; while (vs.length < 4) vs.push(c + vs.length + 1);
    options(vs, c, async () => { busy = true; for (const b of baskets) { anim(.4, q => b.position.y = G + Math.sin(q * Math.PI) * .4); await wait(120); } await wait(400); busy = false; finish(); }, () => bubble(`Count again: ${Array(g).fill(n).join(' + ')}`, `再數一次：${Array(g).fill(n).join(' + ')}`));
  }
},
/* 1-2 Plant an Orchard (arrays, commutative property) */
() => {
  const tgt = pick([12, 16, 18, 20, 24]), found = [], D = dyn[1]; let r = 1, c = 1, trees = null;
  const trunk = new THREE.CylinderGeometry(.035, .05, .2, 6);
  function build() { if (trees) D.remove(trees); trees = grp([-4.2, G + .2, -3.4], D); const sp = Math.min(.36, 4 / Math.max(r, c)), s = sp / .36;
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { const t = grp([(j - (c - 1) / 2) * sp, 0, (i - (r - 1) / 2) * sp], trees); t.scale.setScalar(s); mesh(trunk, '#9C6A47', [0, .1, 0], 1, [0, 0, 0], t, true); ball('#5FC26B', [0, .26, 0], .13, t); }
    trees.userData.s = 1; popIn(trees, .35); }
  prompt(`Plant exactly <b>${tgt}</b> trees in neat rows. Find <b>3</b> different ways!`, `剛好種 ${tgt} 棵樹，排成整齊的行和列。找出 3 種排法！`);
  hints([[`Try 2 rows. How many trees in each row?`, `試試 2 行，每一行要幾棵？`], [`If 3 × 4 works, does 4 × 3 work too?`, `如果 3 × 4 可以，那 4 × 3 呢？`], [`One long row works too: 1 × ${tgt}!`, `排成一長行也可以：1 × ${tgt}！`]]);
  ctl(`<div class="chips" id="chips"></div><div class="row"><div class="stepper"><span>Rows<span class="zh">行</span></span><button id="rm">−</button><span class="v" id="rv">1</span><button id="rp">+</button></div>
   <div class="stepper"><span>In each row<span class="zh">每行幾棵</span></span><button id="cm">−</button><span class="v" id="cv">1</span><button id="cp">+</button></div></div>
   <div class="row"><span class="eq" id="eq">1 × 1 = 1</span><button class="btn green" id="plant">Plant!<span class="zh">種下去</span></button></div>`);
  const ui = () => { $('#rv').textContent = r; $('#cv').textContent = c; $('#eq').textContent = `${r} × ${c} = ${r * c}`; $('#chips').innerHTML = [0, 1, 2].map(j => found[j] ? `<span class="chip">${found[j][0]} × ${found[j][1]}</span>` : `<span class="chip empty">? × ?</span>`).join(''); };
  const step = (k, d) => () => { if (busy) return; sfx.tap(); if (k === 'r') r = Math.min(12, Math.max(1, r + d)); else c = Math.min(24, Math.max(1, c + d)); ui(); build(); };
  $('#rm').onclick = step('r', -1); $('#rp').onclick = step('r', 1); $('#cm').onclick = step('c', -1); $('#cp').onclick = step('c', 1);
  $('#plant').onclick = async () => { if (busy) return; audio();
    if (r * c !== tgt) { const t = trees; anim(.5, k => t.rotation.y = Math.sin(k * Math.PI * 4) * .08); return oops($('#plant'), `That makes ${r * c} trees. We need ${tgt}.`, `這樣是 ${r * c} 棵，我們要 ${tgt} 棵。`); }
    if (found.some(f => f[0] === r && f[1] === c)) { sfx.no(); return bubble(`You found that one already!`, `這個找過了，換一種！`, 3000); }
    const flip = found.some(f => f[0] === c && f[1] === r); found.push([r, c]); ui(); busy = true; sfx.grow(); const t = trees;
    await anim(.7, k => t.children.forEach(x => { const s = x.scale.x / (x.userData.g || 1); x.userData.g = 1 + .6 * k; x.scale.setScalar(s * x.userData.g); }), ease.back);
    sfx.ok(); if (flip) bubble(`Same trees, turned sideways! ${c} × ${r} = ${r} × ${c}`, `一樣多的樹，只是轉個方向！${c} × ${r} = ${r} × ${c}`, 4500); busy = false; if (found.length === 3) { await wait(600); finish(); } };
  ui(); build();
},
/* 1-3 Balance Bridge (unknown factor) */
() => {
  const all = []; for (let a = 2; a <= 9; a++) for (let b = a; b <= 9; b++) for (let c = 2; c <= 9; c++) { const P = a * b; if (P % c === 0) { const d = P / c; if (d >= 2 && d <= 10 && c !== a && c !== b) all.push([a, b, c, d]); } }
  const rounds = shuffle(all).slice(0, 3); let round = 0, items = []; const D = new THREE.Group(); plank.add(D); dyn[2].userData.cleanup = () => plank.remove(D);
  const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.5, .5, .5)), new THREE.LineBasicMaterial({ color: '#ffffff' })); ghost.position.set(1.65, .33, 0); D.add(ghost);
  plank.rotation.z = .12;
  prompt(`The bridge is a seesaw! Make it level so Pip can cross. Tap a number tile.`, `這座橋是一個翹翹板！讓它平衡，皮皮才能過橋。點一個數字磚。`);
  async function go() {
    items.forEach(o => D.remove(o)); items = []; const [a, b, c, d] = rounds[round], P = a * b;
    const put = (o, x) => { o.position.set(x, .33, 0); D.add(o); items.push(o); o.userData.s = 1; popIn(o); };
    put(block(a, '#FF8FB1'), -1.95); put(block(b, '#8FD3FE'), -1.05); put(block(c, '#FFD966'), .75);
    for (const x of [-1.5, 1.2]) { const s = sprite(numTex('×'), .42, 1); s.position.set(x, .38, .3); D.add(s); items.push(s); }
    ghost.visible = true;
    hints([[`First, how heavy is the left side? ${a} × ${b} = ?`, `先算左邊有多重：${a} × ${b} = ?`], [`The right side must be ${P} too: ${c} × ? = ${P}`, `右邊也要是 ${P}：${c} × ? = ${P}`], [`Count by ${c}s: ${Array.from({ length: Math.min(d, 10) }, (_, k) => c * (k + 1)).join(', ')}`, `用 ${c} 來數：${Array.from({ length: Math.min(d, 10) }, (_, k) => c * (k + 1)).join('、')}`]]);
    const vals = near(d, 4, 1).filter(v => v <= 12); while (vals.length < 4) { const v = rnd(1, 10); if (!vals.includes(v)) vals.push(v); }
    ctl(`<div class="roundline">Round ${round + 1} / 3<span class="zh">第 ${round + 1} 回合</span></div><div class="row" id="opts">${shuffle(vals).map(v => `<button class="tile" style="background:${pick(COLS)}" data-v="${v}">${v}</button>`).join('')}</div>`);
    document.querySelectorAll('#opts .tile').forEach(t => t.onclick = async () => {
      if (busy) return; busy = true; audio(); const v = +t.dataset.v; const bl = block(v, t.style.background || '#B9A2FF'); bl.position.set(1.65, 3, 0); D.add(bl); ghost.visible = false;
      await anim(.5, k => bl.position.y = 3 - (3 - .33) * k, ease.bounce); sfx.drop();
      if (v === d) { sfx.creak(); await anim(.8, k => plank.rotation.z = .12 * (1 - k), ease.back); sfx.ok(); t.style.visibility = 'hidden'; items.push(bl); bubble(`${a} × ${b} = ${P} and ${c} × ${d} = ${P}. Level!`, `${a} × ${b} = ${P}，${c} × ${d} = ${P}，平衡了！`, 3000);
        await wait(1300); round++; if (round < 3) { await anim(.3, k => plank.rotation.z = .12 * k); busy = false; go(); } else { items.forEach(o => anim(.3, k => o.scale.setScalar(1 - k * .999))); await wait(350); await walk([PATH[5], PATH[6], PATH[7]], 2.2); pipAt = 7; busy = false; finish(); } }
      else { const heavy = c * v > P; await anim(.5, k => plank.rotation.z = .12 + ((heavy ? -.2 : .24) - .12) * k, ease.back); oops(t, `${c} × ${v} = ${c * v}. ${heavy ? 'Too heavy!' : 'Too light!'}`, `${c} × ${v} = ${c * v}，${heavy ? '太重了！' : '太輕了！'}`);
        await wait(500); const f = bl.position.clone(); await anim(.5, k => { bl.position.set(f.x + k * 1.2, f.y + Math.sin(k * Math.PI) * 1.2 - k * .6, f.z); bl.scale.setScalar(1 - k * .99); }); D.remove(bl); sfx.splash(); ghost.visible = true; const z0 = plank.rotation.z; await anim(.5, k => plank.rotation.z = z0 + (.12 - z0) * k); busy = false; }
    });
  }
  go();
},
/* 1-4 Secret Lock (multiples + logic) */
() => {
  let A, B, lo, ans; for (let t = 0; t < 500; t++) { A = rnd(2, 9); B = rnd(2, 9); if (A === B || A % B === 0 || B % A === 0) continue; lo = rnd(1, 8) * 10; const m = []; for (let x = lo + 1; x < lo + 10; x++) if (x % A === 0 && x % B === 0) m.push(x); if (m.length === 1) { ans = m[0]; break; } } if (!ans) { A = 6; B = 4; lo = 20; ans = 24; }
  doors.forEach(d => d.rotation.y = 0); lock.visible = true; lock.position.set(-.16, .86, 0); lock.rotation.set(0, 0, 0); const d = [0, 0]; wheels.forEach(w => { w.userData.face.material.map = numTex(0); w.userData.face.material.needsUpdate = true; w.rotation.x = 0; });
  const clues = [[x => x % A === 0, `I am a multiple of ${A}.`, `我是 ${A} 的倍數。`], [x => x % B === 0, `I am also a multiple of ${B}.`, `我也是 ${B} 的倍數。`], [x => x > lo && x < lo + 10, `I am bigger than ${lo} and smaller than ${lo + 10}.`, `我比 ${lo} 大，比 ${lo + 10} 小。`]];
  prompt(`The garden gate has a secret lock. Read the clues and spin the wheels!`, `花園大門有密碼鎖。讀線索，轉動密碼輪！`);
  const mult = k => Array.from({ length: Math.min(12, Math.floor(99 / k)) }, (_, i) => k * (i + 1)).join(', ');
  hints([[`List multiples of ${A}: ${mult(A)}`, `列出 ${A} 的倍數：${mult(A)}`], [`Which of those are multiples of ${B} too?`, `哪些也是 ${B} 的倍數？`], [`Only look between ${lo} and ${lo + 10}.`, `只看 ${lo} 到 ${lo + 10} 之間。`]]);
  ctl(`<div class="clues">${clues.map((c, i) => `<div class="clue" id="cl${i}"><span class="mk">${i + 1}</span><span>${c[1]}<span class="zh">${c[2]}</span></span></div>`).join('')}</div>
   <div class="row"><div class="wheelbtns">${['Tens<span class="zh">十位</span>', 'Ones<span class="zh">個位</span>'].map((t, i) => `<div class="wb"><button data-w="${i}" data-d="1" aria-label="up">▲</button><span class="digit" id="dg${i}">0</span><span class="wl">${t}</span><button data-w="${i}" data-d="-1" aria-label="down">▼</button></div>`).join('')}</div><button class="btn" id="open">Open!<span class="zh">開鎖</span></button></div>`);
  document.querySelectorAll('.wb button').forEach(b => b.onclick = () => { const w = +b.dataset.w, dd = +b.dataset.d; d[w] = (d[w] + dd + 10) % 10; $('#dg' + w).textContent = d[w]; sfx.tap(); const wh = wheels[w], r0 = wh.rotation.x; let sw = false; anim(.3, k => { wh.rotation.x = r0 + dd * k * Math.PI * 2; if (k > .5 && !sw) { sw = true; wh.userData.face.material.map = numTex(d[w]); wh.userData.face.material.needsUpdate = true; } }); });
  $('#open').onclick = async () => {
    if (busy) return; audio(); const x = d[0] * 10 + d[1]; let bad = 0; clues.forEach((c, i) => { const ok = c[0](x); if (!ok) bad++; const e = $('#cl' + i); e.className = 'clue ' + (ok ? 'ok' : 'no'); e.querySelector('.mk').textContent = ok ? '✓' : '✗'; });
    if (bad) { const p = lock.position.z; anim(.45, k => lock.position.z = p + Math.sin(k * Math.PI * 6) * .06); return oops($('#open'), `${x} doesn’t fit the red clue${bad > 1 ? 's' : ''}. Try again!`, `${x} 不符合紅色的線索，再試試！`); }
    busy = true; sfx.ok(); bubble(`${ans} fits every clue!`, `${ans} 符合所有線索！`, 3000); await anim(.25, k => shackle.position.y = .38 + .15 * k); sfx.pop();
    const p0 = lock.position.clone(); await anim(.7, k => { lock.position.set(p0.x - k * .8, p0.y + Math.sin(k * Math.PI) * 1.2 - k * .9, p0.z); lock.rotation.z = k * 4; }, ease.lin); lock.visible = false; shackle.position.y = .38;
    sfx.creak(); await anim(1, k => { doors[0].rotation.y = -1.45 * k; doors[1].rotation.y = 1.45 * k; }, ease.back); await walk([PATH[8]], 2.2); await face(cam.pos.x, cam.pos.z); pipAt = 8; busy = false; finish();
  };
},
/* 1-5 Treasure Stones (patterns, skip counting) */
() => {
  const s = rnd(3, 9); lid.rotation.x = 0; gem3.visible = false;
  const label = (i, v) => { const l = stones[i].userData.lab; setSpriteTex(l, numTex(v)); l.visible = true; };
  stones.forEach((st, i) => { st.position.y = i < 5 && i !== 3 ? .02 : -.7; label(i, i < 5 && i !== 3 ? s * (i + 1) : '?'); st.userData.lab.position.y = st.position.y < 0 ? 1.1 : .48; });
  const rise = async i => { sfx.splash(); await anim(.6, k => { stones[i].position.y = -.7 + .72 * k; }, ease.back); label(i, s * (i + 1)); stones[i].userData.lab.position.y = .48; };
  prompt(`The stepping stones go up by the same amount each time. Which number is missing?`, `踏腳石每次增加一樣多。缺的是哪個數？`);
  hints([[`How much bigger is each stone than the one before?`, `每一顆石頭比前一顆多多少？`], [`Count by ${s}s: ${s}, ${2 * s}, ${3 * s}, …`, `用 ${s} 來數：${s}、${2 * s}、${3 * s}……`]]);
  options(near(4 * s, 4, 1), 4 * s, async () => { busy = true; await rise(3); await wait(400); busy = false; p2(); }, v => bubble(`From ${3 * s} to ${v} is +${v - 3 * s}, but the others go up by ${s}.`, `從 ${3 * s} 到 ${v} 是加 ${v - 3 * s}，但其他都是加 ${s}。`));
  function p2() {
    prompt(`The treasure chest opens with the <b>7th</b> stone’s number. What is it?`, `寶箱密碼是「第 7 顆」石頭的數字。是多少？`);
    hints([[`Keep going: 6th stone, then 7th stone.`, `繼續數：第 6 顆、第 7 顆。`], [`7 stones of ${s} is 7 × ${s}.`, `7 個 ${s}，就是 7 × ${s}。`]]);
    options([...new Set([7 * s, 6 * s, 8 * s, 7 * s + 1])], 7 * s, async () => {
      busy = true; $('#panel').hidden = true; layout(); await rise(5); await rise(6);
      for (let i = 0; i < 7; i++) { const p = stones[i].position; await hop(V(p.x, p.y + .08, p.z), .6); } await hop(V(9.6, G, -10.85), .6); await face(9.6, -11.7);
      sfx.creak(); await anim(.8, k => lid.rotation.x = -1.9 * k, ease.back); gem3.visible = true; gem3.position.y = .3; sfx.win(); await anim(1, k => { gem3.position.y = .3 + 1.2 * k; gem3.rotation.y = k * 8; });
      pipAt = 9; busy = false; finish();
    }, v => bubble(`${v} is not the 7th stone. Keep counting by ${s}s!`, `${v} 不是第 7 顆，繼續用 ${s} 數數看！`));
  }
},
/* 1-6 Bunny Picnic (division as fair sharing) */
() => {
  const k = rnd(2, 5), q = rnd(2, 5), N = k * q, D = dyn[5], C = V(10.6, G, 1.4);
  const bunnies = [], plates = [];
  for (let i = 0; i < k; i++) {
    const a = -Math.PI + .25 + (Math.PI - .5) * (k === 1 ? .5 : i / (k - 1)); const bx = C.x + Math.cos(a) * 1.3, bz = C.z + Math.sin(a) * 1.05;
    const b = makeBunny(['#ffffff', '#F3E3D3', '#E8E8F0', '#FFE8D6', '#F0F0FF'][i]); b.position.set(bx, G, bz); b.lookAt(C.x, G, C.z); D.add(b); b.userData.s = 1; popIn(b);
    const pl = grp([C.x + Math.cos(a) * .82, G + .05, C.z + Math.sin(a) * .66], D); mesh(new THREE.CylinderGeometry(.22, .18, .04, 20), '#FFFFFF', [0, 0, 0], 1, [0, 0, 0], pl); pl.userData = { apples: [] };
    const lab = sprite(pillTex('0'), .32); lab.position.set(bx, G + 1.15, bz); D.add(lab); pl.userData.lab = lab; pl.userData.bunny = b;
    tapOn(b, () => give(pl)); tapOn(pl, () => give(pl)); bunnies.push(b); plates.push(pl);
  }
  const pile = []; for (let i = 0; i < N; i++) { const a = appleObj(); const ang = i * 2.4, r = .06 + .02 * i; a.position.set(C.x + Math.cos(ang) * Math.min(.16, r), G + .2 + Math.floor(i / 6) * .14, C.z + Math.sin(ang) * Math.min(.16, r)); a.userData = { home: a.position.clone(), on: null }; D.add(a); tapOn(a, () => { if (a.userData.on) back(a); }); popIn(a); pile.push(a); }
  const spot = (pl, j) => pl.position.clone().add(V((j % 3 - 1) * .11, .1 + Math.floor(j / 3) * .14, (Math.floor(j / 3) % 2 ? .05 : -.03)));
  const relabel = pl => setSpriteTex(pl.userData.lab, pillTex(String(pl.userData.apples.length)));
  let moving = 0;
  async function give(pl) { if (L.p2) return; const a = pile.slice().reverse().find(x => !x.userData.on && !x.userData.mv); if (!a) { bubble('No apples left in the basket!', '籃子裡沒有蘋果了！', 2500); return; }
    a.userData.mv = 1; moving++; a.userData.on = pl; pl.userData.apples.push(a); relabel(pl); sfx.pop(); await arc(a, spot(pl, pl.userData.apples.length - 1), .9, .5); sfx.drop(); a.userData.mv = 0; moving--;
    const b = pl.userData.bunny; anim(.35, t => b.position.y = G + Math.sin(t * Math.PI) * .25); check(); }
  async function back(a) { if (L.p2 || a.userData.mv) return; const pl = a.userData.on; pl.userData.apples.splice(pl.userData.apples.indexOf(a), 1); a.userData.on = null; relabel(pl); sfx.tap(); pl.userData.apples.forEach((x, j) => tweenV(x.position, spot(pl, j), .25)); a.userData.mv = 1; await arc(a, a.userData.home, .7, .45); a.userData.mv = 0; check(); }
  function check() { const c = plates.map(p => p.userData.apples.length), left = pile.filter(a => !a.userData.on).length;
    if (!moving && left === 0) { if (c.every(x => x === c[0])) { if (!L.p2) { L.p2 = 1; sfx.ok(); bunnies.forEach((b, i) => setTimeout(() => anim(.4, t => b.position.y = G + Math.sin(t * Math.PI) * .35), i * 100)); setTimeout(p2, 700); } } else { L.mistakes++; sfx.no(); bubble('Not fair yet! Some bunnies have more.', '還不公平喔！有的兔子比較多。', 3500); } } }
  prompt(`Share <b>${N}</b> apples <b>fairly</b> with the ${k} bunnies. Tap a bunny to give it an apple!`, `把 ${N} 顆蘋果「公平地」分給 ${k} 隻兔子。點兔子給牠一顆蘋果！`);
  hints([[`Give one apple to each bunny, then go around again.`, `每隻兔子先給一顆，再輪一圈。`], [`Every bunny must get the same number.`, `每隻兔子要拿到一樣多。`], [`Tap an apple on a plate to take it back.`, `點盤子上的蘋果可以拿回來。`]]);
  ctl(`<div class="row hint-line">Tap the bunnies in the picture<span class="zh">點畫面上的兔子</span></div>`);
  function p2() {
    prompt(`Each bunny got the same. <b>${N} ÷ ${k} = ?</b>`, `每隻兔子都一樣多。${N} ÷ ${k} = ?`);
    hints([[`Count the apples on one plate.`, `數一數一個盤子上有幾顆。`], [`${k} × ? = ${N}`, `${k} × ? = ${N}`]]);
    options([...new Set([q, q + 1, Math.max(1, q - 1), k, N - k].filter(v => v > 0))].slice(0, 4), q, async () => { busy = true; for (const b of bunnies) { anim(.5, t => { b.rotation.y += .25; b.position.y = G + Math.sin(t * Math.PI) * .4; }); await wait(90); } await wait(600); busy = false; finish(); }, () => bubble(`${N} apples shared by ${k} bunnies…`, `${N} 顆蘋果分給 ${k} 隻兔子……`));
  }
},
/* 1-7 Harbor Boats (rounding to nearest 10 and 100) */
() => {
  const rounds = [(() => { let n; do n = rnd(12, 98); while (n % 10 === 0); return { n, step: 10 }; })(), (() => { let n; do n = rnd(12, 98); while (n % 10 === 0 || n % 10 === 5); return { n, step: 10 }; })(), (() => { let n; do n = rnd(11, 98) * 10; while (n % 100 === 0); return { n, step: 100 }; })()];
  let r = 0; const x0 = -1.9, x1 = 1.9; // dock-local x of the two posts
  boatLab.visible = true;
  function drawLine(lo, hi, unit) {
    lineMarks.clear(); const count = Math.round((hi - lo) / unit);
    for (let i = 0; i <= count; i++) { const x = x0 + (x1 - x0) * i / count, big = i === 0 || i === count, mid = i * 2 === count; mesh(rbox(.04, .02, big ? .5 : mid ? .36 : .22, .01), INK, [x, 0, 0], 1, [0, 0, 0], lineMarks, true); }
    mesh(rbox(x1 - x0, .015, .03, .005), INK, [0, 0, 0], 1, [0, 0, 0], lineMarks, true);
    for (const [x, v] of [[x0, lo], [x1, hi]]) { mesh(new THREE.CylinderGeometry(.08, .08, .8, 12), '#9C6A47', [x, .35, -.32], 1, [0, 0, 0], lineMarks); const s = sprite(pillTex(String(v), '#FFD45E'), .44); s.position.set(x, 1.05, -.32); lineMarks.add(s); }
    const ms = sprite(pillTex(String((lo + hi) / 2)), .3); ms.position.set(0, .45, -.25); lineMarks.add(ms);
  }
  async function go() {
    const { n, step } = rounds[r], lo = Math.floor(n / step) * step, hi = lo + step, ans = (n - lo) * 2 >= step ? hi : lo;
    drawLine(lo, hi, step / 10); setSpriteTex(boatLab, pillTex(String(n), '#fff'));
    const bx = 16.2 + x0 + (x1 - x0) * (n - lo) / step; await anim(.9, k => boat.position.x = boat.position.x + (bx - boat.position.x) * k, ease.io);
    prompt(`Boat <b>${n}</b> must tie up at the nearest ${step === 10 ? 'ten' : 'hundred'}. Round ${n} to the nearest ${step}!`, `${n} 號船要停在最近的${step === 10 ? '整十' : '整百'}。把 ${n} 四捨五入到${step === 10 ? '十位' : '百位'}！`);
    hints([[`Is ${n} closer to ${lo} or to ${hi}?`, `${n} 比較靠近 ${lo} 還是 ${hi}？`], [`The middle is ${(lo + hi) / 2}. ${n >= (lo + hi) / 2 ? 'Is it past the middle?' : 'Is it before the middle?'}`, `中間是 ${(lo + hi) / 2}。`], [`5 or more rounds up. Less than 5 rounds down.`, `5 以上進位，5 以下捨去。`]]);
    const vals = [lo, hi, lo - step > 0 ? lo - step : hi + 2 * step, hi + step];
    options(vals, ans, async () => { busy = true; await anim(1, k => boat.position.x = bx + (16.2 + (ans === lo ? x0 : x1) - bx) * k, ease.io); sfx.ding(); bubble(`${n} rounds to ${ans}!`, `${n} 四捨五入是 ${ans}！`, 2500); await wait(1200); r++; busy = false; if (r < 3) go(); else { boatLab.visible = false; finish(); } },
      v => bubble(v === lo || v === hi ? `Count the steps: ${n} to ${lo} is ${n - lo}, ${n} to ${hi} is ${hi - n}.` : `${v} isn’t a post on this dock.`, v === lo || v === hi ? `算算距離：${n} 到 ${lo} 是 ${n - lo}，到 ${hi} 是 ${hi - n}。` : `${v} 不在這個碼頭上。`),
      `<div class="roundline">Boat ${r + 1} / 3<span class="zh">第 ${r + 1} 艘船</span></div>`);
  }
  go(); dyn[6].userData.cleanup = () => { lineMarks.clear(); boatLab.visible = false; };
},
/* 1-8 Pie Party (unit fractions, a/b of a whole) */
() => {
  const pool = shuffle([[1, 2], [2, 3], [3, 4], [5, 6], [3, 8], [1, 4], [4, 6], [5, 8], [2, 6], [7, 8]]); const rounds = []; for (const p of pool) if (!rounds.some(r => r[1] === p[1]) && rounds.length < 3) rounds.push(p);
  let r = 0, pie = null; const D = dyn[7];
  function go() {
    if (pie) table.remove(pie.g); const [a, b] = rounds[r]; pie = makePie(b, table); pie.g.userData.s = 1; popIn(pie.g); dyn[7].userData.cleanup = () => { if (pie) table.remove(pie.g); };
    pie.wedges.forEach(w => tapOn(w, () => { if (busy) return; w.userData.on = !w.userData.on; sfx.pop(); w.userData.top.material.color.set(w.userData.on ? '#FF5C7A' : '#FFE9B8');
      if (w.userData.on) { const s = ball('#FF4D6D', [Math.sin(w.userData.mid) * .36, .19, Math.cos(w.userData.mid) * .36], [.07, .06, .07], w); s.name = 'berry'; ball('#5FC26B', [0, .06, 0], [.05, .02, .05], s, true); } else { const s = w.getObjectByName('berry'); if (s) w.remove(s); }
      $('#cnt').textContent = pie.wedges.filter(x => x.userData.on).length; }));
    prompt(`Put strawberries on <b>${a}/${b}</b> of the pie! Tap the pieces.`, `在派的 ${a}/${b} 放上草莓！點派的小塊。`);
    hints([[`The pie has ${b} equal pieces. Each piece is 1/${b}.`, `這個派切成 ${b} 等份，每一塊是 1/${b}。`], [`${a}/${b} means ${a} of the ${b} pieces.`, `${a}/${b} 就是 ${b} 塊裡的 ${a} 塊。`]]);
    ctl(`<div class="roundline">Pie ${r + 1} / 3<span class="zh">第 ${r + 1} 個派</span></div><div class="row"><span class="frac"><span>${a}</span><span>${b}</span></span><span class="eq">🍓 <span id="cnt">0</span></span><button class="btn green" id="doneP">Done!<span class="zh">完成</span></button></div>`);
    $('#doneP').onclick = async () => { if (busy) return; const c = pie.wedges.filter(x => x.userData.on).length;
      if (c !== a) return oops($('#doneP'), `You covered ${c} piece${c === 1 ? '' : 's'}. ${a}/${b} means ${a} pieces.`, `你放了 ${c} 塊。${a}/${b} 是 ${a} 塊喔。`);
      busy = true; sfx.ok(); for (const w of pie.wedges) { anim(.35, t => w.position.y = Math.sin(t * Math.PI) * .12); await wait(60); } bubble(`${a}/${b} of the pie — yum!`, `派的 ${a}/${b}，好好吃！`, 2500); await wait(1200); r++; busy = false; if (r < 3) go(); else finish(); };
  }
  go();
},
/* 1-9 Clock Tower (time to the minute, elapsed time) */
() => {
  const r5 = () => [rnd(1, 12), rnd(0, 11) * 5]; const t1 = r5(), t2 = r5(); const st = [rnd(1, 10), pick([0, 15, 30, 45, 10, 20])], add = pick([15, 20, 30, 45]);
  let em = st[1] + add, eh = st[0] + Math.floor(em / 60); em %= 60; eh = ((eh - 1) % 12) + 1;
  const fmt = (h, m) => `${h}:${String(m).padStart(2, '0')}`;
  const rounds = [{ h: t1[0], m: t1[1], en: `Set the clock to <b>${fmt(...t1)}</b>.`, zh: `把時鐘轉到 ${fmt(...t1)}。` }, { h: t2[0], m: t2[1], en: `Set the clock to <b>${fmt(...t2)}</b>.`, zh: `把時鐘轉到 ${fmt(...t2)}。` },
    { h: eh, m: em, en: `The picnic starts at <b>${fmt(...st)}</b> and lasts <b>${add} minutes</b>. Show when it ends!`, zh: `野餐從 ${fmt(...st)} 開始，玩 ${add} 分鐘。轉到結束的時間！` }];
  let r = 0, H = 12, Mi = 0;
  function go() {
    const R = rounds[r]; H = 12; Mi = 0; setClock(12, 0, .4);
    prompt(R.en, R.zh);
    hints([[`The short hand shows the hour. The long red hand shows minutes.`, `短針指小時，紅色長針指分鐘。`], [`Each number on the clock is 5 minutes for the long hand.`, `長針走一個數字是 5 分鐘。`], r === 2 ? [`${fmt(...st)} plus ${add} minutes. Count by 5s!`, `${fmt(...st)} 再加 ${add} 分鐘，用 5 分鐘一跳來數！`] : [`${R.m} minutes: the long hand points at ${R.m / 5 || 12}.`, `${R.m} 分：長針指在 ${R.m / 5 || 12}。`]]);
    ctl(`<div class="roundline">Bell ${r + 1} / 3<span class="zh">第 ${r + 1} 次敲鐘</span></div><div class="row"><div class="stepper"><span>Hour<span class="zh">時</span></span><button id="hm">−</button><button id="hp">+</button></div>
      <div class="stepper"><span>Minute<span class="zh">分</span></span><button id="m5">−5</button><button id="m1">−1</button><button id="p1">+1</button><button id="p5">+5</button></div></div><button class="btn green" id="ring">Ring the bell!<span class="zh">敲鐘</span></button>`);
    const upd = () => { sfx.tap(); setClock(H, Mi, .25); };
    $('#hm').onclick = () => { H = (H + 10) % 12 + 1; upd(); }; $('#hp').onclick = () => { H = H % 12 + 1; upd(); };
    const addM = d => { Mi += d; while (Mi < 0) { Mi += 60; H = (H + 10) % 12 + 1; } while (Mi >= 60) { Mi -= 60; H = H % 12 + 1; } upd(); };
    $('#m5').onclick = () => addM(-5); $('#m1').onclick = () => addM(-1); $('#p1').onclick = () => addM(1); $('#p5').onclick = () => addM(5);
    $('#ring').onclick = async () => { if (busy) return; audio();
      if (H !== R.h || Mi !== R.m) return oops($('#ring'), `Your clock says ${fmt(H, Mi)}. Look at both hands again!`, `你的時鐘是 ${fmt(H, Mi)}，再看看兩根指針！`);
      busy = true; sfx.ding(); await anim(1.2, k => bell.rotation.z = Math.sin(k * Math.PI * 6) * .5 * (1 - k)); bubble(`Ding dong! It's ${fmt(R.h, R.m)}.`, `噹噹！現在是 ${fmt(R.h, R.m)}。`, 2500); await wait(700); r++; busy = false; if (r < 3) go(); else finish(); };
  }
  go(); dyn[8].userData.cleanup = () => setClock(10, 10, .3);
},
/* 1-10 Sheep Pen (area & perimeter) */
() => {
  const opts = []; for (let w = 2; w <= 6; w++) for (let l = w + 1; l <= 8; l++) if (w * l <= 32) opts.push([w, l]); const [tw, tl] = pick(opts), A = tw * tl, P = 2 * (tw + tl);
  let w = 1, l = 1; const D = dyn[9]; let pen = null; const ox = PEN.cx - PEN.u * 4, oz = PEN.cz - PEN.u * 4, u = PEN.u;
  const sheep = []; for (let i = 0; i < 3; i++) { const s = makeSheep(); s.position.set(6.5 + (i % 2) * .4, G, 10.6 + i * .8); s.rotation.y = 1.4; D.add(s); sheep.push(s); s.userData.s = 1; popIn(s); }
  function build() { if (pen) D.remove(pen); pen = grp([ox, G + .07, oz], D);
    mesh(new THREE.PlaneGeometry(w * u, l * u), new THREE.MeshToonMaterial({ color: '#B8F0A8', gradientMap: GRAD, transparent: true, opacity: .85 }), [w * u / 2, .01, l * u / 2], 1, [-Math.PI / 2, 0, 0], pen, true);
    const post = (x, z) => mesh(new THREE.CylinderGeometry(.03, .03, .32, 8), '#9C6A47', [x, .16, z], 1, [0, 0, 0], pen, true);
    const rail = (x, z, len, rot) => { for (const y of [.12, .26]) mesh(rbox(len, .035, .035, .01), '#E3A872', [x, y, z], 1, [0, rot, 0], pen, true); };
    for (let i = 0; i <= w; i++) { post(i * u, 0); post(i * u, l * u); } for (let j = 1; j < l; j++) { post(0, j * u); post(w * u, j * u); }
    rail(w * u / 2, 0, w * u, 0); rail(w * u / 2, l * u, w * u, 0); rail(0, l * u / 2, l * u, Math.PI / 2); rail(w * u, l * u / 2, l * u, Math.PI / 2);
  }
  prompt(`Build a sheep pen with <b>area ${A}</b> square units and <b>perimeter ${P}</b> units.`, `圍一個綿羊圍欄：面積 ${A} 平方單位，周長 ${P} 單位。`);
  hints([[`Area = how many squares inside (width × length).`, `面積 = 裡面有幾個方格（寬 × 長）。`], [`Perimeter = all the way around: width + length + width + length.`, `周長 = 繞一圈：寬 + 長 + 寬 + 長。`], [`Find two numbers that multiply to ${A} and add up to ${P / 2}.`, `找兩個數：相乘是 ${A}，相加是 ${P / 2}。`]]);
  ctl(`<div class="row"><div class="stepper"><span>Width<span class="zh">寬</span></span><button id="wm">−</button><span class="v" id="wv">1</span><button id="wp">+</button></div>
    <div class="stepper"><span>Length<span class="zh">長</span></span><button id="lm">−</button><span class="v" id="lv">1</span><button id="lp">+</button></div></div><button class="btn green" id="doneS">Let the sheep in!<span class="zh">讓綿羊進來</span></button>`);
  const ui = () => { $('#wv').textContent = w; $('#lv').textContent = l; build(); };
  const st = (k, d) => () => { if (busy) return; sfx.tap(); if (k === 'w') w = Math.min(8, Math.max(1, w + d)); else l = Math.min(8, Math.max(1, l + d)); ui(); };
  $('#wm').onclick = st('w', -1); $('#wp').onclick = st('w', 1); $('#lm').onclick = st('l', -1); $('#lp').onclick = st('l', 1);
  $('#doneS').onclick = async () => { if (busy) return; audio(); const a = w * l, p = 2 * (w + l);
    if (a !== A || p !== P) return oops($('#doneS'), `Your pen: area ${a}, perimeter ${p}. We need area ${A}, perimeter ${P}.`, `你的圍欄：面積 ${a}、周長 ${p}。目標：面積 ${A}、周長 ${P}。`);
    busy = true; sfx.ok(); for (let i = 0; i < sheep.length; i++) { sfx.baa(); await arc(sheep[i], V(ox + (w * u) * (.25 + .25 * i), G + .07, oz + l * u * (.3 + .2 * (i % 2))), 1.0, .6); }
    bubble(`${w} × ${l} = ${A} squares, and ${w} + ${l} + ${w} + ${l} = ${P}. Cozy sheep!`, `${w} × ${l} = ${A} 格，${w} + ${l} + ${w} + ${l} = ${P}。綿羊好開心！`, 3500); await wait(1500); busy = false; finish(); };
  ui();
}
];

/* ================= title buttons ================= */
$('#newBtn').onclick = () => { sfx.tap(); audio(); startGame(false); };
$('#loadBtn').onclick = () => { sfx.tap(); audio(); loadDialog(); };

/* ================= main loop ================= */
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(.05, clock.getDelta()); now += dt;
  for (const t of tasks) { if (t.t0 < 0) t.t0 = now; const k = Math.min(1, (now - t.t0) / t.dur); t.fn(t.e(k)); if (k >= 1) { tasks.delete(t); t.res(); } }
  for (const f of tickers) f(now, dt);
  if (cam.orbit) { const a = now * .12; const c = V(-9.6, 1.1, 4.4); const f = portrait() ? 1.6 : 1; cam.look.copy(c); cam.pos.set(c.x + Math.sin(a + .6) * 6 * f, c.y + 1.8 * f, c.z + Math.cos(a + .6) * 6 * f); }
  camera.position.copy(cam.pos); camera.lookAt(cam.look); renderer.render(scene, camera); requestAnimationFrame(frame);
}
window.__dbg = { at: i => { pipAt = STAND[i]; pip.root.position.set(...PATH[pipAt]); }, go: i => goStation(i), map: () => showMap(), home: () => showTitle(), saveDlg: () => saveDialog(), loadDlg: () => loadDialog(), worlds: () => worldsDialog(), get scr() { return scr; }, get busy() { return busy; }, setStars: s => { game.stars = s; }, finish: () => finish(), finale: () => finale(3), get game() { return game; } };
layout(); $('#loading').remove(); showTitle(); frame();
