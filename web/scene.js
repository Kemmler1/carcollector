// 3D scene: builds the house from a version's sections. Everything here is geometry;
// app.js owns the UI and data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const TIMBER = '#5a3a24';
const HONEY = '#c98f4e';
const WALL_T = 0.2;

// ---------------------------------------------------------------------------
// Procedural textures (canvas) — cheap detail that reads at model scale
// ---------------------------------------------------------------------------
const texCache = new Map();
function canvasTexture(name, w, h, draw, repeat = [1, 1]) {
  const key = name + repeat.join(',');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t); return t;
}
const TEX = {
  corrugated: (rep) => canvasTexture('corr', 64, 8, (g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = '#a7adb2'; g.fillRect(x, 0, 4, h); g.fillStyle = '#8e959b'; g.fillRect(x + 4, 0, 4, h); } }, rep),
  louvre: (rep) => canvasTexture('louvre', 8, 64, (g, w, h) => { for (let y = 0; y < h; y += 8) { g.fillStyle = '#b8742f'; g.fillRect(0, y, w, 5); g.fillStyle = '#3a2314'; g.fillRect(0, y + 5, w, 3); } }, rep),
  mosaic: (rep) => canvasTexture('mosaic', 64, 64, (g, w, h) => { g.fillStyle = '#1736b8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4f6fe0'; for (let i = 0; i <= w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, rep),
  thatch: (rep) => canvasTexture('thatch', 64, 64, (g, w, h) => { g.fillStyle = '#9c8656'; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.strokeStyle = Math.random() < 0.5 ? '#7d6a40' : '#b59c68'; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y + 6 + Math.random() * 6); g.stroke(); } }, rep),
  boards: (rep) => canvasTexture('boards', 64, 64, (g, w, h) => { for (let y = 0; y < h; y += 8) { g.fillStyle = y % 16 ? '#c48a48' : '#b67d3f'; g.fillRect(0, y, w, 7); g.fillStyle = '#7a5027'; g.fillRect(0, y + 7, w, 1); } }, rep),
  tile: (rep) => canvasTexture('tile', 64, 64, (g, w, h) => { g.fillStyle = '#8d8578'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6f685d'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, rep),
  weave: (rep) => canvasTexture('weave', 32, 32, (g, w, h) => { g.fillStyle = '#d9c28e'; g.fillRect(0, 0, w, h); g.fillStyle = '#b89a62'; for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) if ((x + y) % 16 === 0) g.fillRect(x, y, 8, 8); }, rep),
  grass: (rep) => canvasTexture('grass', 64, 64, (g, w, h) => { g.fillStyle = '#b3a26e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? '#9c8d5a' : '#c3b47f'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, rep),
  leaf: (rep) => canvasTexture('leaf', 64, 64, (g, w, h) => { g.fillStyle = '#9fd33f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = ['#7fb52c', '#b8e35a', '#8cc43a', '#6a9c25'][i % 4]; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 1.5, 4, Math.random() * 3, 0, 7); g.fill(); } }, rep),
  sand: (rep) => canvasTexture('sand', 64, 64, (g, w, h) => { g.fillStyle = '#d6c7a0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 200; i++) { g.fillStyle = Math.random() < 0.5 ? '#c9b98f' : '#e0d3b0'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, rep),
};

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts, (k, v) => v && v.isTexture ? v.uuid : v);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }));
  return matCache.get(key);
}
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  return m;
}
function tag(obj, id) { obj.traverse(o => { if (o.isMesh) o.userData.sectionId = id; }); return obj; }

// ---------------------------------------------------------------------------
// Roof geometries (local space, centred on x/z, base at y = 0)
// ---------------------------------------------------------------------------
function hipRoofGeometry(w, d, h, overhang = 0.6) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const alongX = w >= d;
  const ridgeHalf = Math.max(0, alongX ? W - D : D - W);
  const r1 = alongX ? [-ridgeHalf, h, 0] : [0, h, -ridgeHalf];
  const r2 = alongX ? [ridgeHalf, h, 0] : [0, h, ridgeHalf];
  const c = [[-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D]];
  const tris = alongX
    ? [[c[0], c[1], r2], [c[0], r2, r1], [c[2], c[3], r1], [c[2], r1, r2], [c[1], c[2], r2], [c[3], c[0], r1]]
    : [[c[1], c[2], r2], [c[1], r2, r1], [c[3], c[0], r1], [c[3], r1, r2], [c[2], c[3], r2], [c[0], c[1], r1]];
  const pos = [], uv = [];
  tris.forEach(t => [t[0], t[2], t[1]].forEach(v => { pos.push(...v); uv.push((v[0] + W) / 2, (v[2] + D) / 2); }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function gableRoofGeometry(w, d, h, overhang = 0.6) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const shape = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: W * 2, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-W, 0, 0); g.computeVertexNormals();
  return g;
}
function pyramidRoofGeometry(w, d, h, overhang = 0.8) {
  const g = new THREE.ConeGeometry(1, h, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.scale((w / 2 + overhang) * Math.SQRT2, 1, (d / 2 + overhang) * Math.SQRT2);
  g.translate(0, h / 2, 0);
  return g;
}

function addRoof(ctx, group, sec, cx, cz, baseY) {
  if (!sec.roof || sec.roof.type === 'none' || sec.roof.type === 'flat') return;
  if (sec.roof.under) return; // this room sits under another section's roof (roofBox)
  // roofBox: one roof spanning several rooms (a whole wing), drawn by the first room in it
  const rb = sec.roofBox || sec.box;
  const { w, d } = rb;
  if (sec.roofBox) { cx = rb.x + rb.w / 2; cz = rb.z + rb.d / 2; }
  const h = sec.roof.height || 1.6;
  const type = sec.roof.type;
  const geo = type === 'gable' ? gableRoofGeometry(w, d, h) : type === 'thatch' ? pyramidRoofGeometry(w, d, h) : hipRoofGeometry(w, d, h);
  const material = type === 'thatch'
    ? mat('#ffffff', { map: TEX.thatch([w / 2, d / 2]), side: THREE.DoubleSide, roughness: 1 })
    : mat(sec.colors?.roof || '#9ea4a9', { map: TEX.corrugated([w * 2, 1]), side: THREE.DoubleSide, flatShading: true, roughness: 0.5, metalness: 0.15 });
  const m = new THREE.Mesh(geo, material);
  m.position.set(cx, baseY, cz); m.castShadow = m.receiveShadow = true;
  group.add(m); ctx.roofs.push(m);
  // soffit + fascia
  const soffit = box(w + 1.2, 0.12, d + 1.2, mat(type === 'thatch' ? '#8a7448' : '#d9cfb8'), cx, baseY - 0.06, cz);
  const fascia = type === 'thatch' ? null : box(w + 1.2, 0.22, d + 1.2, mat('#3b2a1c'), cx, baseY + 0.05, cz);
  group.add(soffit); ctx.roofs.push(soffit);
  if (fascia) { fascia.scale.set(1, 1, 1); group.add(fascia); ctx.roofs.push(fascia); }
  tag(group, sec.id);
}

// ---------------------------------------------------------------------------
// Walls with openings. Built in local coords: u along the wall, y up, wall sits on v = 0.
// opening: { type: 'bifold'|'door'|'screen'|'louvre'|'window', from, to, sill?, head? }
// ---------------------------------------------------------------------------
function wallWithOpenings(len, H, openings, wallMat, id) {
  const g = new THREE.Group();
  const segs = [{ from: 0, to: len }];
  const ops = [...(openings || [])].sort((a, b) => a.from - b.from);
  const louvreMat = mat('#ffffff', { map: TEX.louvre([1, 6]), roughness: 0.7 });
  const frame = mat('#2e1d12');
  let cursor = 0;
  const addSolid = (a, b) => { if (b - a > 0.02) g.add(box(b - a, H, WALL_T, wallMat, (a + b) / 2, H / 2, 0)); };
  for (const o of ops) {
    const from = Math.max(cursor, o.from), to = Math.min(len, o.to);
    addSolid(cursor, from);
    const w = to - from, cx = (from + to) / 2;
    if (o.type === 'louvre' || o.type === 'window') {
      const sill = o.sill ?? 0.9, head = o.head ?? 2.1;
      g.add(box(w, sill, WALL_T, wallMat, cx, sill / 2, 0));
      g.add(box(w, H - head, WALL_T, wallMat, cx, head + (H - head) / 2, 0));
      g.add(box(w, head - sill, 0.08, frame, cx, (sill + head) / 2, 0));
      const panels = Math.max(1, Math.round(w / 0.9));
      for (let i = 0; i < panels; i++) g.add(box(w / panels - 0.08, head - sill - 0.1, 0.05, louvreMat, from + (i + 0.5) * w / panels, (sill + head) / 2, 0));
    } else if (o.type === 'bifold') {
      // header, then stacks of folded leaves at each end
      const head = o.head ?? 2.2;
      g.add(box(w, H - head, WALL_T, wallMat, cx, head + (H - head) / 2, 0));
      g.add(box(w, 0.18, 0.26, mat(TIMBER), cx, head + 0.09, 0));
      g.add(box(0.06, head, 0.3, mat('#3b2a1c'), from + 0.03, head / 2, 0));
      g.add(box(0.06, head, 0.3, mat('#3b2a1c'), to - 0.03, head / 2, 0));
      const leaves = Math.min(4, Math.max(2, Math.round(w / 1.2)));
      for (let i = 0; i < leaves; i++) {
        g.add(box(0.05, head - 0.05, 0.5, louvreMat, from + 0.12 + i * 0.07, head / 2, 0.3 + (i % 2) * 0.02));
        g.add(box(0.05, head - 0.05, 0.5, louvreMat, to - 0.12 - i * 0.07, head / 2, 0.3 + (i % 2) * 0.02));
      }
    } else { // door / screen: an opening with a frame and a leaf standing open
      const head = o.head ?? 2.1;
      g.add(box(w, H - head, WALL_T, wallMat, cx, head + (H - head) / 2, 0));
      g.add(box(w, head, 0.1, frame, cx, head / 2, 0));
      g.add(box(w - 0.1, head - 0.1, 0.06, o.type === 'screen' ? mat('#8a6a48', { map: TEX.weave([2, 4]) }) : mat(HONEY), from + (w - 0.1) / 2, head / 2, 0.06).rotateY(-0.9));
    }
    cursor = to;
  }
  addSolid(cursor, len);
  return tag(g, id);
}

function placeWall(wall, side, b) {
  const { x, z, w, d } = b;
  if (side === 'sea') { wall.position.set(x, 0, z + WALL_T / 2); }
  else if (side === 'land') { wall.position.set(x + w, 0, z + d - WALL_T / 2); wall.rotation.y = Math.PI; }
  else if (side === 'left') { wall.position.set(x + WALL_T / 2, 0, z + d); wall.rotation.y = Math.PI / 2; }
  else { wall.position.set(x + w - WALL_T / 2, 0, z); wall.rotation.y = -Math.PI / 2; }
  return wall;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
function buildRoom(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const H = sec.wallHeight || 2.7;
  const wallMat = mat(sec.colors?.wall || '#ece6d6');
  const floor = box(w, 0.1, d, mat('#ffffff', { map: TEX.tile([w / 0.6, d / 0.6]), color: sec.colors?.floor || '#8d8578' }), cx, 0.05, cz);
  g.add(floor);
  const open = new Set(sec.openSides || []);
  const byside = {}; for (const o of sec.openings || []) (byside[o.side] ||= []).push(o);
  for (const side of ['sea', 'land', 'left', 'right']) {
    const len = side === 'sea' || side === 'land' ? w : d;
    let ops = byside[side] || [];
    if (open.has(side) && !ops.length) ops = [{ type: 'bifold', from: 0.3, to: len - 0.3 }];
    g.add(placeWall(wallWithOpenings(len, H, ops, wallMat, sec.id), side, sec.box));
  }
  // exposed trusses under a hip/gable roof so roofs-off still shows the structure
  if (sec.roof && sec.roof.type !== 'flat' && (sec.roof.height || 0) >= 1.6) {
    const n = Math.max(2, Math.round((w >= d ? w : d) / 2.5));
    const rh = sec.roof.height * 0.85;
    for (let i = 1; i < n; i++) {
      const t = (w >= d ? w : d) * i / n;
      const truss = new THREE.Group();
      const span = w >= d ? d : w;
      truss.add(box(span, 0.18, 0.12, mat(TIMBER), 0, H + 0.1, 0));
      truss.add(box(0.12, rh, 0.12, mat(TIMBER), 0, H + rh / 2, 0));
      const rafter = Math.hypot(span / 2, rh);
      [-1, 1].forEach(s => { const r = box(rafter, 0.14, 0.12, mat(TIMBER), s * span / 4, H + rh / 2, 0); r.rotation.z = -s * Math.atan2(rh, span / 2); truss.add(r); });
      if (w >= d) truss.position.set(x + t, 0, cz); else { truss.position.set(cx, 0, z + t); truss.rotation.y = Math.PI / 2; }
      g.add(truss); ctx.roofs.push(truss);
    }
  }
  addRoof(ctx, g, sec, cx, cz, H);
  addProps(g, sec);
  return tag(g, sec.id);
}

function buildZone(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const m = box(w - 0.3, 0.02, d - 0.3, mat(sec.colors?.floor || '#999', { transparent: true, opacity: 0.35 }), x + w / 2, 0.115, z + d / 2);
  g.add(m);
  addProps(g, sec);
  return tag(g, sec.id);
}

// stepped rafter tail: three notches cut from the underside of the end
function rafter(len, timber) {
  const g = new THREE.Group();
  g.add(box(len, 0.28, 0.1, timber, 0, 0, 0));
  g.add(box(0.25, 0.2, 0.1, timber, len / 2 + 0.12, 0.04, 0));
  g.add(box(0.25, 0.12, 0.1, timber, len / 2 + 0.37, 0.08, 0));
  g.add(box(0.2, 0.06, 0.1, timber, len / 2 + 0.6, 0.11, 0));
  return g;
}
function pergolaOver(ctx, g, sec, x, z, w, d, H, tailSide) {
  const timber = mat(sec.colors?.timber || TIMBER);
  const lining = mat('#ffffff', { map: TEX.boards([w / 0.6, d / 0.6]), side: THREE.DoubleSide, roughness: 0.8 });
  const slab = box(w, 0.05, d, lining, x + w / 2, H + 0.3, z + d / 2);
  g.add(slab); ctx.roofs.push(slab);
  const membrane = box(w, 0.03, d, mat('#e9e8e2', { roughness: 0.95 }), x + w / 2, H + 0.34, z + d / 2); // white flat roof seen in the aerials
  g.add(membrane); ctx.roofs.push(membrane);
  const alongX = w >= d; // rafters span the short dimension
  const span = alongX ? d : w, run = alongX ? w : d;
  const n = Math.max(1, Math.round(run / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = (run / n) * i;
    const r = rafter(span, timber);
    r.position.y = H + 0.15;
    if (alongX) { r.rotation.y = tailSide === 'land' ? Math.PI / 2 : -Math.PI / 2; r.position.set(x + t, H + 0.15, z + d / 2); }
    else { r.rotation.y = tailSide === 'right' ? 0 : Math.PI; r.position.set(x + w / 2, H + 0.15, z + t); }
    g.add(r); ctx.roofs.push(r);
  }
  g.add(box(w, 0.32, 0.28, timber, x + w / 2, H - 0.05, z + 0.14));
  g.add(box(w, 0.32, 0.28, timber, x + w / 2, H - 0.05, z + d - 0.14));
  g.add(box(0.28, 0.32, d, timber, x + 0.14, H - 0.05, z + d / 2));
  g.add(box(0.28, 0.32, d, timber, x + w - 0.14, H - 0.05, z + d / 2));
}

function buildPergola(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const H = sec.wallHeight || 3.2;
  const timber = mat(sec.colors?.timber || TIMBER);
  const floor = box(w, 0.1, d, mat('#ffffff', { map: TEX.tile([w / 0.6, d / 0.6]), color: sec.colors?.floor || '#8d8578' }), x + w / 2, 0.05, z + d / 2);
  g.add(floor);
  const post = (px, pz) => g.add(box(0.22, H, 0.22, timber, px, H / 2, pz));
  if (sec.hole) {
    const h = sec.hole;
    pergolaOver(ctx, g, sec, x, z, w, h.z - z, H, 'sea');
    pergolaOver(ctx, g, sec, x, h.z + h.d, w, z + d - (h.z + h.d), H, 'land');
    pergolaOver(ctx, g, sec, x, h.z, h.x - x, h.d, H, 'left');
    pergolaOver(ctx, g, sec, h.x + h.w, h.z, x + w - (h.x + h.w), h.d, H, 'right');
    for (const [px, pz] of [[h.x, h.z], [h.x + h.w, h.z], [h.x, h.z + h.d], [h.x + h.w, h.z + h.d], [h.x, h.z + h.d / 2], [h.x + h.w, h.z + h.d / 2]]) post(px, pz);
  } else {
    const alongX = w >= d;
    const outer = alongX ? 'sea' : (x + w / 2 < 0 ? 'left' : 'right');
    pergolaOver(ctx, g, sec, x, z, w, d, H, outer);
    const len = alongX ? w : d, n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = (len / n) * i;
      if (alongX) post(x + t, z + 0.15); else post(outer === 'left' ? x + 0.15 : x + w - 0.15, z + t);
    }
  }
  addProps(g, sec);
  return tag(g, sec.id);
}

function buildPorch(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const H = sec.wallHeight || 3.4;
  g.add(box(w, 0.35, d, mat('#ffffff', { map: TEX.tile([w / 0.6, d / 0.6]), color: sec.colors?.floor || '#8d8578' }), cx, 0.17, cz));
  for (let i = 0; i < 3; i++) g.add(box(w - 1.5, 0.12, 0.35, mat('#e6dfcc'), cx, 0.41 - i * 0.12, z - 0.17 - i * 0.35)); // steps toward the hall
  [[x + 0.5, z + 0.6], [x + w - 0.5, z + 0.6], [x + 0.5, z + d - 0.6], [x + w - 0.5, z + d - 0.6]].forEach(([px, pz]) => {
    g.add(box(0.7, 1.0, 0.7, mat('#e6dfcc'), px, 0.5, pz));
    g.add(box(0.22, H - 1, 0.22, mat(TIMBER), px, 1 + (H - 1) / 2, pz));
  });
  const lining = box(w + 1, 0.05, d + 1, mat('#ffffff', { map: TEX.boards([w, d]), side: THREE.DoubleSide }), cx, H, cz);
  g.add(lining); ctx.roofs.push(lining);
  const rh = sec.roof?.height || 1.6;
  for (const pz of [z + 0.6, z + d - 0.6]) { // two king-post trusses
    const t = new THREE.Group();
    t.add(box(w + 0.6, 0.2, 0.14, mat(TIMBER), 0, H + 0.1, 0));
    t.add(box(0.14, rh, 0.14, mat(TIMBER), 0, H + rh / 2, 0));
    t.position.set(cx, 0, pz); g.add(t); ctx.roofs.push(t);
  }
  const roof = new THREE.Mesh(gableRoofGeometry(d, w, rh, 0.5), mat(sec.colors?.roof || '#9ea4a9', { map: TEX.corrugated([d * 2, 1]), side: THREE.DoubleSide, flatShading: true, roughness: 0.5 }));
  roof.rotation.y = Math.PI / 2; roof.position.set(cx, H, cz); roof.castShadow = true;
  g.add(roof); ctx.roofs.push(roof);
  return tag(g, sec.id);
}

function buildPool(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const depth = sec.depth || 1.5;
  const water = mat('#ffffff', { map: TEX.mosaic([w, d]), color: '#2f55e0', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 });
  g.add(box(w, depth, d, water, x + w / 2, -depth / 2 + 0.2, z + d / 2));
  const coping = mat(sec.colors?.coping || '#e6dfcc');
  g.add(box(w + 0.6, 0.12, 0.3, coping, x + w / 2, 0.17, z + d + 0.15));
  g.add(box(0.3, 0.12, d + 0.6, coping, x - 0.15, 0.17, z + d / 2));
  g.add(box(0.3, 0.12, d + 0.6, coping, x + w + 0.15, 0.17, z + d / 2));
  g.add(box(w + 0.6, 0.1, 0.2, water, x + w / 2, 0.1, z - 0.1));       // wet edge
  g.add(box(w + 0.6, 0.3, 0.5, mat('#cfc6ae'), x + w / 2, -0.2, z - 0.45)); // trough
  if (sec.spa) { const s = sec.spa; g.add(box(s.w, 1.0, s.d, water, s.x + s.w / 2, -0.3, s.z + s.d / 2)); }
  return tag(g, sec.id);
}

function buildBure(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const H = sec.wallHeight || 2.4;
  g.add(box(w, 0.25, d, mat('#ffffff', { map: TEX.tile([w / 0.6, d / 0.6]), color: sec.colors?.floor || '#d9cfb8' }), cx, 0.12, cz));
  const post = mat(sec.colors?.timber || '#8a6a48');
  [[x + 0.4, z + 0.4], [x + w - 0.4, z + 0.4], [x + 0.4, z + d - 0.4], [x + w - 0.4, z + d - 0.4]].forEach(([px, pz]) => g.add(cyl(0.12, 0.14, H, post, px, H / 2 + 0.25, pz)));
  const bench = mat(sec.colors?.bench || '#eee9dc');
  g.add(box(w - 0.6, 0.45, 0.5, bench, cx, 0.47, z + 0.45));
  g.add(box(0.5, 0.45, d - 0.6, bench, x + w - 0.45, 0.47, cz));
  g.add(box(w / 2 - 0.6, 0.25, d / 2, mat('#4a3526'), x + w * 0.72, 0.37, z + d * 0.7));
  const ceiling = new THREE.Mesh(pyramidRoofGeometry(w, d, (sec.roof?.height || 2.4) * 0.8, 0.1), mat('#ffffff', { map: TEX.weave([8, 8]), side: THREE.DoubleSide }));
  ceiling.position.set(cx, H + 0.25, cz); g.add(ceiling); ctx.roofs.push(ceiling);
  const roof = new THREE.Mesh(pyramidRoofGeometry(w, d, sec.roof?.height || 2.4), mat('#ffffff', { map: TEX.thatch([4, 4]), side: THREE.DoubleSide, roughness: 1 }));
  roof.position.set(cx, H + 0.3, cz); roof.castShadow = true; g.add(roof); ctx.roofs.push(roof);
  return tag(g, sec.id);
}

function buildGarden(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  g.add(box(w, 0.06, d, mat('#ffffff', { map: TEX.sand([w / 2, d / 2]) }), cx, 0.03, cz));
  // a dense block of tall shrubs on a ~0.65 m grid, leaving a sandy strip along the walkway edges
  const color = sec.colors?.hedge || '#a4d43c';
  for (let gx = x + 0.9; gx < x + w - 0.6; gx += 0.65) for (let gz = z + 0.9; gz < z + d - 0.6; gz += 0.65) {
    const jx = Math.sin(gx * 9.1 + gz * 3.7) * 0.15, jz = Math.cos(gx * 4.3 + gz * 8.9) * 0.15;
    if ((gx - x) > 2.6 && (gx - x) < 3.8 && (gz - z) > 3 && (gz - z) < 5.6) continue; // gap for the palms and bikes
    g.add(tallShrub(gx + jx, gz + jz, 1.7 + Math.abs(Math.sin(gx * 3 + gz)) * 0.6, color));
  }
  g.add(broadLeaf(x + 1.2, z + 1.2, 2.0));
  for (const b of sec.props?.filter(p => p.type === 'bicycle') || []) {}
  for (const t of sec.trees || [{ x: cx - 0.6, z: cz - 1, h: 7 }, { x: cx + 0.8, z: cz + 0.5, h: 8 }, { x: cx - 0.2, z: cz + 2.2, h: 7.5 }]) g.add(palm(t.x, t.z, t.h, 0.5));
  return tag(g, sec.id);
}

export function palm(px, pz, h = 7, lean = 0.18, seed = px * 3.1 + pz * 1.7) {
  const g = new THREE.Group();
  const rnd = (k) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const dir = rnd(1) * Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(px + Math.cos(dir) * lean * h * t * t, h * t, pz + Math.sin(dir) * lean * h * t * t)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.14, 7, false), mat('#a39477', { roughness: 1 }));
  trunk.castShadow = true; g.add(trunk);
  const top = pts[6];
  const frondMat = mat('#4d8f3a', { side: THREE.DoubleSide, roughness: 1 });
  const nF = 9;
  for (let i = 0; i < nF; i++) {
    const a = (i / nF) * Math.PI * 2 + rnd(2) * 0.5;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4, 1, 4), frondMat);
    const pos = frond.geometry.attributes.position; // taper and droop
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); const t = (y + 1.2) / 2.4; pos.setX(k, pos.getX(k) * (1 - t * 0.8)); pos.setZ(k, -t * t * 1.1); }
    frond.geometry.computeVertexNormals();
    frond.position.set(top.x, top.y, top.z);
    frond.rotation.set(-Math.PI / 2 + 0.55 + rnd(3 + i) * 0.3, 0, 0);
    frond.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
    frond.translateY(1.1);
    frond.castShadow = true;
    g.add(frond);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), mat('#7fa544'));
  nuts.position.set(top.x, top.y - 0.2, top.z); g.add(nuts);
  return g;
}
function shrub(px, pz, r = 0.8, color = '#5e8a3a') {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), mat(color, { roughness: 1 }));
  m.position.set(px, r * 0.8, pz); m.scale.y = 0.8; m.castShadow = true; return m;
}

// Tall upright shrub (the courtyard planting): a few thin stems carrying a narrow column of
// small lime-green leaves, ~2 m high. Planted close together they read as a soft green block.
function tallShrub(px, pz, h = 2.0, color = '#a4d43c', seed = px * 7.3 + pz * 3.1) {
  const g = new THREE.Group();
  const rnd = (k) => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const stemMat = mat('#6b5a3a');
  for (let i = 0; i < 3; i++) {
    const st = cyl(0.015, 0.025, h * 0.6, stemMat, px + (rnd(i) - 0.5) * 0.25, h * 0.3, pz + (rnd(i + 5) - 0.5) * 0.25, 5);
    st.rotation.z = (rnd(i + 9) - 0.5) * 0.15; g.add(st);
  }
  const leafMat = mat(color, { map: TEX.leaf([1, 2]), roughness: 1 });
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2 + rnd(i + 20) * 0.08, 7, 7), leafMat);
    m.scale.set(0.8 + rnd(i + 60) * 0.4, 2.6 + rnd(i + 30) * 0.9, 0.8 + rnd(i + 70) * 0.4);
    m.rotation.y = rnd(i + 80) * 3;
    m.position.set(px + (rnd(i + 40) - 0.5) * 0.3, h * 0.62 + i * 0.15, pz + (rnd(i + 50) - 0.5) * 0.3);
    m.castShadow = true; g.add(m);
  }
  return g;
}
// Broad-leaf plant: a fan of large paddle leaves (the breadfruit-like shrub in the courtyard).
function broadLeaf(px, pz, h = 1.8) {
  const g = new THREE.Group();
  const leafMat = mat('#4f8f2f', { side: THREE.DoubleSide, roughness: 1 });
  g.add(cyl(0.03, 0.05, h * 0.5, mat('#6b5a3a'), px, h * 0.25, pz, 5));
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.9), leafMat);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(px, h * 0.5 + 0.3 + (i % 3) * 0.15, pz);
    leaf.rotation.set(-Math.PI / 2 + 0.9 + (i % 2) * 0.2, 0, 0);
    leaf.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
    leaf.translateY(0.45); leaf.castShadow = true; g.add(leaf);
  }
  return g;
}
// Croton: a low shrub with variegated red/yellow/green leaves (planter boxes, garden beds).
function croton(px, pz, h = 1.2) {
  const g = new THREE.Group();
  const cols = ['#b7522f', '#d9a63a', '#5e8a3a', '#8a3a2a'];
  g.add(cyl(0.02, 0.03, h * 0.5, mat('#6b5a3a'), px, h * 0.25, pz, 5));
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat(cols[i % 4], { roughness: 1 }));
    m.scale.set(0.8, 1.6, 0.5);
    m.position.set(px + Math.cos(i * 1.3) * 0.22, h * 0.5 + (i % 3) * 0.12, pz + Math.sin(i * 1.3) * 0.22);
    m.rotation.y = i * 1.3; m.castShadow = true; g.add(m);
  }
  return g;
}

function buildGround(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const isLawn = sec.id === 'lawn-seaward';
  g.add(box(w, 0.04, d, mat('#ffffff', { map: isLawn ? TEX.grass([w / 3, d / 3]) : TEX.sand([w / 3, d / 3]), roughness: 1 }), x + w / 2, -0.02, z + d / 2));
  const trees = sec.trees || [];
  for (const t of trees) g.add(t.type === 'shrub' ? shrub(t.x, t.z, t.r || 0.8, t.color) : t.type === 'tall-shrub' ? tallShrub(t.x, t.z, t.h || 2, t.color) : t.type === 'croton' ? croton(t.x, t.z) : t.type === 'broadleaf' ? broadLeaf(t.x, t.z) : palm(t.x, t.z, t.h || 7, t.lean ?? 0.18));
  if (isLawn) {
    g.add(box(w, 4, 2, mat('#5e7a3a', { roughness: 1 }), x + w / 2, -2, z + 1));
    for (let i = 0; i < 40; i++) {
      const sx = x + 1 + i * (w - 2) / 39, sz = z + 2 + (i % 3) * 0.6;
      g.add(shrub(sx, sz, 0.7 + (i % 2) * 0.3, i % 4 === 0 ? '#8fb84a' : '#4e7a34'));
      if (i % 3 === 0) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), mat('#f2d23c')); f.position.set(sx + 0.3, 1.1, sz - 0.4); g.add(f); }
    }
  }
  return tag(g, sec.id);
}

function buildWater(ctx, sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  g.add(box(w, 0.04, d, mat('#5fc9d4', { roughness: 0.15, metalness: 0.1 }), x + w / 2, -4, z + d / 2));
  g.add(box(w, 0.04, 14, mat('#1d4e89', { roughness: 0.15 }), x + w / 2, -4.01, z + 7));
  for (let i = 0; i < 20; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.3), mat('#3b4a46')); r.position.set(x + 5 + (i * 3.7) % (w - 10), -3.8, z + d - 4 - (i * 2.3) % 14); g.add(r); }
  return tag(g, sec.id);
}

// ---------------------------------------------------------------------------
// Props: small furniture/fixtures placed at section-relative (x, z) in metres
// ---------------------------------------------------------------------------
const PROPS = {
  sofa: () => { const g = new THREE.Group(); const leather = mat('#141414', { roughness: 0.5 }); g.add(box(2.1, 0.45, 0.9, leather, 0, 0.5, 0)); g.add(box(2.1, 0.5, 0.25, leather, 0, 0.95, -0.33)); [-0.9, 0.9].forEach(x => g.add(cyl(0.14, 0.14, 0.3, mat('#7a4e2c'), x, 0.15, 0))); return g; },
  armchair: () => { const g = new THREE.Group(); const leather = mat('#141414', { roughness: 0.5 }); g.add(box(0.9, 0.45, 0.9, leather, 0, 0.5, 0)); g.add(box(0.9, 0.5, 0.25, leather, 0, 0.95, -0.33)); [-0.35, 0.35].forEach(x => g.add(cyl(0.12, 0.12, 0.3, mat('#7a4e2c'), x, 0.15, 0))); return g; },
  'coffee-table': () => box(1.3, 0.4, 0.7, mat('#5a3a24'), 0, 0.2, 0),
  'dining-table': () => { const g = new THREE.Group(); g.add(box(2.2, 0.08, 1.0, mat('#3b2314'), 0, 0.74, 0)); [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]].forEach(([x, z]) => g.add(box(0.08, 0.7, 0.08, mat('#3b2314'), x, 0.35, z))); return g; },
  chair: () => { const g = new THREE.Group(); g.add(box(0.45, 0.05, 0.45, mat('#3b2314'), 0, 0.45, 0)); g.add(box(0.45, 0.45, 0.05, mat('#3b2314'), 0, 0.7, -0.2)); [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => g.add(box(0.04, 0.45, 0.04, mat('#3b2314'), x, 0.22, z))); return g; },
  island: () => { const g = new THREE.Group(); g.add(box(4, 0.9, 1.0, mat('#ffffff', { map: TEX.boards([6, 1.5]) }), 0, 0.45, 0)); g.add(box(4.2, 0.05, 1.2, mat('#d9c6a0'), 0, 0.93, 0)); g.add(box(4, 0.2, 0.3, mat('#d9c6a0'), 0, 1.05, -0.6)); return g; },
  'bar-stool': () => { const g = new THREE.Group(); g.add(box(0.35, 0.05, 0.35, mat('#3b2314'), 0, 0.72, 0)); g.add(box(0.05, 0.7, 0.05, mat('#3b2314'), 0, 0.35, 0)); return g; },
  bench: () => box(4, 0.9, 0.6, mat('#2a1b10'), 0, 0.45, 0),
  benchtop: () => box(4, 0.05, 0.65, mat('#d9c6a0'), 0, 0.92, 0),
  fridge: () => box(0.8, 1.8, 0.75, mat('#9ea4a8', { metalness: 0.6, roughness: 0.3 }), 0, 0.9, 0),
  pantry: () => box(1.2, 2.4, 0.6, mat('#2a1b10'), 0, 1.2, 0),
  desk: () => { const g = new THREE.Group(); g.add(box(1.3, 0.05, 0.6, mat('#6b4423'), 0, 0.75, 0)); g.add(box(0.4, 0.7, 0.55, mat('#6b4423'), 0.4, 0.37, 0)); return g; },
  bed: () => { const g = new THREE.Group(); g.add(box(1.9, 0.5, 2.1, mat('#f3f1ec'), 0, 0.35, 0)); g.add(box(1.9, 0.2, 2.1, mat('#2a1b10'), 0, 0.15, 0)); [[-0.9, -1], [0.9, -1], [-0.9, 1], [0.9, 1]].forEach(([x, z]) => g.add(box(0.08, 2.1, 0.08, mat('#1a1008'), x, 1.05, z))); g.add(box(1.9, 0.06, 2.1, mat('#1a1008'), 0, 2.1, 0)); return g; },
  'single-bed': () => { const g = new THREE.Group(); g.add(box(1.0, 0.45, 2.0, mat('#f3f1ec'), 0, 0.32, 0)); g.add(box(1.0, 0.2, 2.0, mat('#2a1b10'), 0, 0.12, 0)); return g; },
  wardrobe: () => box(1.4, 2.2, 0.6, mat('#c9a77a'), 0, 1.1, 0),
  chest: () => box(1.0, 0.5, 0.5, mat('#1a1a1a'), 0, 0.25, 0),
  'bean-bag': () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat('#a89f8d', { roughness: 1 })); m.scale.set(1, 0.6, 1.2); m.position.y = 0.33; m.castShadow = true; return m; },
  lounger: () => { const g = new THREE.Group(); g.add(box(0.7, 0.08, 1.9, mat('#f4f4f0'), 0, 0.35, 0)); const b = box(0.7, 0.6, 0.08, mat('#f4f4f0'), 0, 0.6, -0.9); b.rotation.x = 0.5; g.add(b); return g; },
  'rocking-chair': () => { const g = new THREE.Group(); g.add(box(0.6, 0.06, 0.6, mat('#4a2e1a'), 0, 0.45, 0)); g.add(box(0.6, 0.7, 0.06, mat('#4a2e1a'), 0, 0.8, -0.28)); return g; },
  bbq: () => { const g = new THREE.Group(); g.add(box(1.3, 0.9, 0.6, mat('#1e1e1e', { metalness: 0.4 }), 0, 0.45, 0)); g.add(box(1.3, 0.3, 0.6, mat('#b8bcc0', { metalness: 0.7, roughness: 0.3 }), 0, 1.05, 0)); return g; },
  pot: () => { const g = new THREE.Group(); g.add(cyl(0.35, 0.28, 0.6, mat('#141414', { roughness: 0.3 }), 0, 0.3, 0)); g.add(broadLeaf(0, 0, 1.4).translateY(0.5)); return g; },
  tv: () => box(1.4, 0.5, 0.45, mat('#2a1b10'), 0, 0.25, 0),
  planter: () => { const g = new THREE.Group(); g.add(box(3, 0.6, 0.8, mat('#e6dfcc'), 0, 0.3, 0)); g.add(croton(-0.9, 0, 1.3).translateY(0.5)); g.add(tallShrub(0.1, 0.1, 1.6, '#6e9a3a').translateY(0.5)); g.add(croton(1.0, -0.1, 1.1).translateY(0.5)); return g; },
  'ac-unit': () => box(0.8, 0.6, 0.3, mat('#dddddd'), 0, 0.35, 0),
  'gas-bottle': () => cyl(0.18, 0.18, 0.7, mat('#d9d9d9'), 0, 0.35, 0),
  bicycle: () => { const g = new THREE.Group(); [-0.45, 0.45].forEach(x => { const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 14), mat('#222')); w.position.set(x, 0.3, 0); w.rotation.y = Math.PI / 2; g.add(w); }); g.add(box(0.9, 0.04, 0.04, mat('#222'), 0, 0.55, 0)); return g; },
  'solar-hw': () => { const g = new THREE.Group(); g.add(box(2, 0.08, 1.2, mat('#223', { metalness: 0.5 })).translateY(0.1)); g.add(cyl(0.25, 0.25, 2.2, mat('#d0d0d0', { metalness: 0.6 }), 0, 0.5, -0.7).rotateZ(Math.PI / 2)); return g; },
  mask: () => box(0.3, 0.6, 0.1, mat('#3a2112'), 0, 1.6, 0),
};
function addProps(g, sec) {
  for (const p of sec.props || []) {
    const make = PROPS[p.type]; if (!make) continue;
    const obj = make();
    obj.position.x += sec.box.x + p.x; obj.position.z += sec.box.z + p.z; obj.position.y += p.y || 0;
    if (p.rot) obj.rotation.y = THREE.MathUtils.degToRad(p.rot);
    g.add(obj);
  }
}

// ---------------------------------------------------------------------------
// Photo spot markers: a little camera at (x, z) pointing at (lookX, lookZ)
// ---------------------------------------------------------------------------
function cameraMarker(spot, file) {
  const g = new THREE.Group();
  const body = box(0.5, 0.35, 0.3, mat('#e0a458', { emissive: '#e0a458', emissiveIntensity: 0.3 }), 0, 0, 0);
  const lens = cyl(0.12, 0.12, 0.25, mat('#2a2a2a'), 0, 0, 0.25).rotateX(Math.PI / 2);
  g.add(body, lens);
  const dir = Math.atan2((spot.lookX ?? spot.x) - spot.x, (spot.lookZ ?? spot.z + 1) - spot.z);
  g.rotation.y = dir;
  g.position.set(spot.x, spot.y ?? 1.5, spot.z);
  g.add(cyl(0.02, 0.02, (spot.y ?? 1.5), mat('#e0a458'), 0, -(spot.y ?? 1.5) / 2, 0));
  g.traverse(o => { if (o.isMesh) { o.userData.photo = file; o.castShadow = false; } });
  return g;
}

// ---------------------------------------------------------------------------
// Scene object
// ---------------------------------------------------------------------------
export function createScene(canvas, stage) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const labelRenderer = new CSS2DRenderer();
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', pointerEvents: 'none' });
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc9e8);
  scene.fog = new THREE.Fog(0x9fc9e8, 100, 240);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2 - 0.02;

  const sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
  sun.position.set(-45, 30, -35); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 });
  scene.add(sun, new THREE.HemisphereLight(0xbfe3ff, 0x8a7a55, 0.9), new THREE.AmbientLight(0xfff4e0, 0.35));

  const modelGroup = new THREE.Group(); scene.add(modelGroup);
  const markerGroup = new THREE.Group(); scene.add(markerGroup);
  const ctx = { roofs: [], labels: [], sections: {} };
  const BUILDERS = { room: buildRoom, zone: buildZone, pergola: buildPergola, porch: buildPorch, pool: buildPool, bure: buildBure, garden: buildGarden, ground: buildGround, water: buildWater };

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  // first-person walkthrough: pointer lock to look, WASD / arrows to move, Shift to run, Q/E for height
  const walk = { on: false, keys: new Set(), speed: 2.5, eye: 1.6, controls: new PointerLockControls(camera, canvas), onExit: null };
  walk.controls.addEventListener('unlock', () => { if (walk.on) stopWalk(); });
  addEventListener('keydown', e => { if (walk.on) walk.keys.add(e.code); });
  addEventListener('keyup', e => walk.keys.delete(e.code));
  function startWalk(onExit) {
    controls.update();
    walk.on = true; walk.onExit = onExit; controls.enabled = false;
    camera.fov = 70; camera.updateProjectionMatrix();
    camera.position.y = walk.eye;
    walk.controls.lock();
  }
  function stopWalk() {
    walk.on = false; controls.enabled = true;
    if (walk.controls.isLocked) walk.controls.unlock();
    camera.fov = 45; camera.updateProjectionMatrix();
    // keep looking where we were
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    controls.target.copy(camera.position).addScaledVector(dir, 8);
    walk.onExit?.(); walk.onExit = null;
  }
  const clock = new THREE.Clock();
  (function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (walk.on) {
      const k = walk.keys, v = walk.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1) * dt;
      if (k.has('KeyW') || k.has('ArrowUp')) walk.controls.moveForward(v);
      if (k.has('KeyS') || k.has('ArrowDown')) walk.controls.moveForward(-v);
      if (k.has('KeyA') || k.has('ArrowLeft')) walk.controls.moveRight(-v);
      if (k.has('KeyD') || k.has('ArrowRight')) walk.controls.moveRight(v);
      if (k.has('KeyE')) camera.position.y += v;
      if (k.has('KeyQ')) camera.position.y -= v;
      camera.position.y = Math.max(0.4, camera.position.y);
    } else controls.update();
    renderer.render(scene, camera); labelRenderer.render(scene, camera);
  })();

  function build(version) {
    modelGroup.clear(); ctx.roofs.length = 0; ctx.labels.length = 0; for (const k in ctx.sections) delete ctx.sections[k];
    for (const sec of version.sections) {
      const g = (BUILDERS[sec.kind] || buildZone)(ctx, sec);
      ctx.sections[sec.id] = g; modelGroup.add(g);
      if (sec.kind !== 'ground' && sec.kind !== 'water') {
        const el = document.createElement('div');
        el.className = 'label' + (sec.confirmed === false ? ' unconfirmed' : '');
        el.textContent = sec.name.replace(' (unconfirmed)', '');
        const label = new CSS2DObject(el);
        label.position.set(sec.box.x + sec.box.w / 2, sec.kind === 'zone' ? 0.6 : (sec.wallHeight || 1) + (sec.roof?.height || 0) + 0.6, sec.box.z + sec.box.d / 2);
        g.add(label); ctx.labels.push(label);
      }
    }
    buildMarkers(version);
  }
  function buildMarkers(version) {
    markerGroup.clear();
    for (const [file, spot] of Object.entries(version.photoSpots || {})) if (spot && typeof spot.x === 'number') markerGroup.add(cameraMarker(spot, file));
  }
  let selectedMats = [];
  function highlight(id) {
    selectedMats.forEach(({ mesh, base }) => { mesh.material = base; }); selectedMats = [];
    if (!id || !ctx.sections[id]) return;
    ctx.sections[id].traverse(o => {
      if (!o.isMesh || o.userData.sectionId !== id) return;
      const base = o.material; const c = base.clone(); c.emissive = new THREE.Color(0xe0a458); c.emissiveIntensity = 0.35;
      o.material = c; selectedMats.push({ mesh: o, base });
    });
  }
  function applyToggles({ wire, roofs, labels, markers }) {
    ctx.roofs.forEach(m => m.visible = roofs);
    ctx.labels.forEach(l => l.visible = labels);
    markerGroup.visible = markers;
    modelGroup.traverse(o => { if (o.isMesh) o.material.wireframe = wire; });
  }
  const raycaster = new THREE.Raycaster();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const markerHit = markerGroup.visible ? raycaster.intersectObjects(markerGroup.children, true)[0] : null;
    if (markerHit) return { photo: markerHit.object.userData.photo };
    const hits = raycaster.intersectObjects(modelGroup.children, true).filter(h => h.object.visible && h.object.userData.sectionId);
    if (!hits.length) return null;
    return { sectionIds: hits.slice(0, 4).map(h => h.object.userData.sectionId), point: hits[0].point };
  }
  function groundPoint(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }
  function flyTo(sec) {
    const cx = sec.box.x + sec.box.w / 2, cz = sec.box.z + sec.box.d / 2;
    controls.target.set(cx, 1, cz);
    const dist = Math.max(14, Math.max(sec.box.w, sec.box.d) * 1.8);
    camera.position.set(cx - dist * 0.75, dist * 0.45, cz - dist * 0.75);
  }
  function resetView() { camera.position.set(-30, 14, -32); controls.target.set(0, 1, 6); }
  function topView() { camera.position.set(0, 70, 8.01); controls.target.set(0, 0, 8); }
  function setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); }
  function getView() {
    const p = camera.position, t = controls.target;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), lookX: +t.x.toFixed(2), lookY: +t.y.toFixed(2), lookZ: +t.z.toFixed(2) };
  }
  function photoView(spot) {
    camera.position.set(spot.x, spot.y ?? 1.5, spot.z);
    controls.target.set(spot.lookX ?? spot.x, spot.lookY ?? 1.4, spot.lookZ ?? spot.z + 1);
  }
  function snapshot(w = 1600, h = 1000, quality = 0.88) { // render at a fixed size and return a JPEG data URL
    const prev = { w: canvas.width, h: canvas.height, aspect: camera.aspect };
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/jpeg', quality);
    renderer.setSize(prev.w, prev.h, false); camera.aspect = prev.aspect; camera.updateProjectionMatrix();
    return url;
  }
  resize();
  return { snapshot, scene, camera, controls, build, buildMarkers, highlight, applyToggles, pick, groundPoint, flyTo, resetView, topView, photoView, setFov, getView, resize, startWalk, stopWalk, isWalking: () => walk.on };
}
