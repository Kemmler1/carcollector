import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const PHOTO_DIR = '../photos/raw/';
const THUMB_DIR = '../photos/thumbs/';
const LS_VERSIONS = 'house.versions';   // versions imported in the browser, keyed by version id
const LS_COMMENTS = 'house.comments';   // { [versionId]: { [sectionId|'general']: Comment[] } }

const state = {
  versions: [],        // ordered list of version objects
  current: null,       // current version object
  comments: loadJSON(LS_COMMENTS, {}),
  selected: null,
  wire: false,
  showRoofs: true,
  showLabels: true,
};

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage failed', e); }
}

// ---------------------------------------------------------------------------
// Three.js setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
viewport.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc9e8);
scene.fog = new THREE.Fog(0x9fc9e8, 90, 220);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.target.set(0, 0, 8);

const sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
sun.position.set(-45, 22, -35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 });
scene.add(sun, new THREE.HemisphereLight(0xbfe3ff, 0x8a7a55, 0.45));

const modelGroup = new THREE.Group();
scene.add(modelGroup);
const pickables = [];     // meshes that select a section on click
const roofMeshes = [];
const labelObjects = [];
const sectionObjects = {}; // id -> Group

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function resetView() {
  camera.position.set(-30, 14, -32);
  controls.target.set(0, 1, 6);
}
function topView() {
  camera.position.set(0, 70, 8.01);
  controls.target.set(0, 0, 8);
}

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
})();

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}
function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Roof geometries (built in local space, centred on x/z, base at y = 0)
// ---------------------------------------------------------------------------
function hipRoofGeometry(w, d, h, overhang = 0.6) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  // ridge runs along the longer axis
  const alongX = w >= d;
  const ridgeHalf = Math.max(0, (alongX ? W - D : D - W));
  const r1 = alongX ? [-ridgeHalf, h, 0] : [0, h, -ridgeHalf];
  const r2 = alongX ? [ridgeHalf, h, 0] : [0, h, ridgeHalf];
  const c = [[-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D]];
  const tris = alongX
    ? [[c[0], c[1], r2], [c[0], r2, r1], [c[2], c[3], r1], [c[2], r1, r2], [c[1], c[2], r2], [c[3], c[0], r1]]
    : [[c[1], c[2], r2], [c[1], r2, r1], [c[3], c[0], r1], [c[3], r1, r2], [c[2], c[3], r2], [c[0], c[1], r1]];
  const pos = [];
  tris.forEach(t => [t[0], t[2], t[1]].forEach(v => pos.push(...v))); // CCW seen from above
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function gableRoofGeometry(w, d, h, overhang = 0.6) {
  // ridge along x
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const shape = new THREE.Shape([new THREE.Vector2(-D, 0), new THREE.Vector2(D, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: W * 2, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-W, 0, 0);
  g.computeVertexNormals();
  return g;
}
function pyramidRoofGeometry(w, d, h, overhang = 0.8) {
  const g = new THREE.ConeGeometry(1, h, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.scale((w / 2 + overhang) * Math.SQRT2, 1, (d / 2 + overhang) * Math.SQRT2);
  g.translate(0, h / 2, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
const WALL_T = 0.2;
const TIMBER = '#5a3a24';

function addRoof(group, sec, cx, cz, baseY) {
  if (!sec.roof || sec.roof.type === 'none' || sec.roof.type === 'flat') return;
  const { w, d } = sec.box;
  const h = sec.roof.height || 1.6;
  let geo;
  if (sec.roof.type === 'gable') geo = gableRoofGeometry(w, d, h);
  else if (sec.roof.type === 'thatch') geo = pyramidRoofGeometry(w, d, h);
  else geo = hipRoofGeometry(w, d, h);
  const color = sec.colors?.roof || '#b9bcbf';
  const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, flatShading: true, roughness: sec.roof.type === 'thatch' ? 1 : 0.55 }));
  m.position.set(cx, baseY, cz);
  m.castShadow = m.receiveShadow = true;
  m.userData.sectionId = sec.id;
  group.add(m);
  roofMeshes.push(m);
  pickables.push(m);
  // fascia / ply soffit line
  const fascia = box(w + 1.2, 0.15, d + 1.2, mat('#3b2a1c'), cx, baseY - 0.05, cz);
  fascia.userData.sectionId = sec.id;
  group.add(fascia);
  roofMeshes.push(fascia);
}

function buildRoom(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const H = sec.wallHeight || 2.7;
  const wallMat = mat(sec.colors?.wall || '#ece6d6');
  const floor = box(w, 0.1, d, mat(sec.colors?.floor || '#8d8578'), cx, 0.05, cz);
  floor.userData.sectionId = sec.id;
  g.add(floor); pickables.push(floor);
  const open = new Set(sec.openSides || []);
  // walls: sea (z=min), land (z=max), left (x=min), right (x=max). Open sides get a line of posts.
  const walls = [
    ['sea', w, WALL_T, cx, z + WALL_T / 2],
    ['land', w, WALL_T, cx, z + d - WALL_T / 2],
    ['left', WALL_T, d, x + WALL_T / 2, cz],
    ['right', WALL_T, d, x + w - WALL_T / 2, cz],
  ];
  for (const [side, ww, dd, px, pz] of walls) {
    if (open.has(side)) {
      const len = side === 'sea' || side === 'land' ? w : d;
      const n = Math.max(2, Math.round(len / 2.5));
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (len / n) * i;
        const post = box(0.22, H, 0.22, mat(TIMBER), side === 'sea' || side === 'land' ? cx + t : px, H / 2, side === 'sea' || side === 'land' ? pz : cz + t);
        post.userData.sectionId = sec.id;
        g.add(post);
      }
      const beam = box(side === 'sea' || side === 'land' ? w : 0.3, 0.35, side === 'sea' || side === 'land' ? 0.3 : d, mat(TIMBER), px, H - 0.17, pz);
      g.add(beam);
    } else {
      const wall = box(ww, H, dd, wallMat, px, H / 2, pz);
      wall.userData.sectionId = sec.id;
      g.add(wall); pickables.push(wall);
    }
  }
  addRoof(g, sec, cx, cz, H);
  return g;
}

function buildZone(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const m = box(w - 0.3, 0.14, d - 0.3, mat(sec.colors?.floor || '#999', { transparent: true, opacity: 0.85 }), x + w / 2, 0.11, z + d / 2);
  m.userData.sectionId = sec.id;
  g.add(m); pickables.push(m);
  return g;
}

function pergolaOver(g, sec, x, z, w, d, H) {
  const timber = mat(sec.colors?.timber || TIMBER);
  const lining = mat(sec.colors?.lining || '#c98f4e', { side: THREE.DoubleSide });
  // lining slab (ceiling boards) and the beam grid under it
  const slab = box(w, 0.06, d, lining, x + w / 2, H + 0.3, z + d / 2);
  slab.userData.sectionId = sec.id;
  g.add(slab); roofMeshes.push(slab); pickables.push(slab);
  const alongX = w >= d; // rafters run across the short dimension
  const span = alongX ? w : d;
  const n = Math.max(1, Math.round(span / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = (span / n) * i;
    const r = alongX
      ? box(0.1, 0.25, d + 0.6, timber, x + t, H + 0.15, z + d / 2)
      : box(w + 0.6, 0.25, 0.1, timber, x + w / 2, H + 0.15, z + t);
    g.add(r); roofMeshes.push(r);
  }
  // edge beams
  g.add(box(w, 0.3, 0.25, timber, x + w / 2, H - 0.05, z + 0.12));
  g.add(box(w, 0.3, 0.25, timber, x + w / 2, H - 0.05, z + d - 0.12));
}

function buildPergola(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const H = sec.wallHeight || 3.2;
  const timber = mat(sec.colors?.timber || TIMBER);
  const floor = box(w, 0.1, d, mat(sec.colors?.floor || '#8d8578'), x + w / 2, 0.05, z + d / 2);
  floor.userData.sectionId = sec.id;
  g.add(floor); pickables.push(floor);
  if (sec.hole) {
    // courtyard ring: four strips of pergola around the hole, posts at the inner corners
    const h = sec.hole;
    pergolaOver(g, sec, x, z, w, h.z - z, H);                               // seaward strip
    pergolaOver(g, sec, x, h.z + h.d, w, z + d - (h.z + h.d), H);           // landward strip
    pergolaOver(g, sec, x, h.z, h.x - x, h.d, H);                           // left strip
    pergolaOver(g, sec, h.x + h.w, h.z, x + w - (h.x + h.w), h.d, H);       // right strip
    const corners = [[h.x, h.z], [h.x + h.w, h.z], [h.x, h.z + h.d], [h.x + h.w, h.z + h.d]];
    const midsZ = [h.z + h.d / 2];
    corners.forEach(([px, pz]) => g.add(box(0.22, H, 0.22, timber, px, H / 2, pz)));
    midsZ.forEach(pz => { g.add(box(0.22, H, 0.22, timber, h.x, H / 2, pz)); g.add(box(0.22, H, 0.22, timber, h.x + h.w, H / 2, pz)); });
  } else {
    pergolaOver(g, sec, x, z, w, d, H);
    // posts along the long outer edge (away from the house), every ~3 m
    const alongX = w >= d;
    const len = alongX ? w : d;
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = (len / n) * i;
      // outer edge: for the pavilion it's the seaward edge (z min); for side verandahs the outer x edge
      let px, pz;
      if (alongX) { px = x + t; pz = z + 0.15; }
      else { px = x + w / 2 < 0 ? x + 0.15 : x + w - 0.15; pz = z + t; }
      const p = box(0.22, H, 0.22, timber, px, H / 2, pz);
      p.userData.sectionId = sec.id;
      g.add(p);
    }
  }
  return g;
}

function buildPorch(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const H = sec.wallHeight || 3.4;
  const floor = box(w, 0.35, d, mat(sec.colors?.floor || '#8d8578'), cx, 0.17, cz);
  floor.userData.sectionId = sec.id;
  g.add(floor); pickables.push(floor);
  [[x + 0.5, z + 0.6], [x + w - 0.5, z + 0.6], [x + 0.5, z + d - 0.6], [x + w - 0.5, z + d - 0.6]].forEach(([px, pz]) => {
    g.add(box(0.7, 1.0, 0.7, mat('#e6dfcc'), px, 0.5, pz));           // rendered plinth
    g.add(box(0.22, H - 1, 0.22, mat(TIMBER), px, 1 + (H - 1) / 2, pz)); // post
  });
  const lining = box(w + 1, 0.06, d + 1, mat('#c98f4e', { side: THREE.DoubleSide }), cx, H, cz);
  g.add(lining); roofMeshes.push(lining);
  const roof = new THREE.Mesh(gableRoofGeometry(d, w, sec.roof?.height || 1.6, 0.5), mat(sec.colors?.roof || '#b9bcbf', { side: THREE.DoubleSide, roughness: 0.6 }));
  roof.rotation.y = Math.PI / 2; // ridge runs landward (along z)
  roof.position.set(cx, H, cz);
  roof.castShadow = true; roof.userData.sectionId = sec.id;
  g.add(roof); roofMeshes.push(roof); pickables.push(roof);
  return g;
}

function buildPool(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const depth = sec.depth || 1.5;
  const water = mat(sec.colors?.water || '#1f3fc4', { roughness: 0.15, metalness: 0.1 });
  const pool = box(w, depth, d, water, x + w / 2, -depth / 2 + 0.2, z + d / 2);
  pool.userData.sectionId = sec.id;
  g.add(pool); pickables.push(pool);
  const coping = mat(sec.colors?.coping || '#e6dfcc');
  g.add(box(w + 0.6, 0.12, 0.3, coping, x + w / 2, 0.17, z + d + 0.15));  // landward coping
  g.add(box(0.3, 0.12, d + 0.6, coping, x - 0.15, 0.17, z + d / 2));
  g.add(box(0.3, 0.12, d + 0.6, coping, x + w + 0.15, 0.17, z + d / 2));
  g.add(box(w + 0.6, 0.1, 0.2, water, x + w / 2, 0.1, z - 0.1));          // wet edge weir
  if (sec.spa) {
    const s = sec.spa;
    const spa = box(s.w, 1.0, s.d, water, s.x + s.w / 2, -0.3, s.z + s.d / 2);
    spa.userData.sectionId = sec.id;
    g.add(spa); pickables.push(spa);
  }
  return g;
}

function buildBure(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const H = sec.wallHeight || 2.4;
  const floor = box(w, 0.25, d, mat(sec.colors?.floor || '#d9cfb8'), cx, 0.12, cz);
  floor.userData.sectionId = sec.id;
  g.add(floor); pickables.push(floor);
  const post = mat(sec.colors?.timber || '#8a6a48');
  [[x + 0.4, z + 0.4], [x + w - 0.4, z + 0.4], [x + 0.4, z + d - 0.4], [x + w - 0.4, z + d - 0.4]].forEach(([px, pz]) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, H, 10), post);
    p.position.set(px, H / 2 + 0.25, pz); p.castShadow = true; g.add(p);
  });
  const bench = mat(sec.colors?.bench || '#eee9dc');
  g.add(box(w - 0.6, 0.45, 0.5, bench, cx, 0.47, z + 0.45));               // seaward bench
  g.add(box(0.5, 0.45, d - 0.6, bench, x + w - 0.45, 0.47, cz));           // side bench
  g.add(box(w / 2 - 0.6, 0.25, d / 2, mat('#4a3526'), x + w * 0.72, 0.37, z + d * 0.7)); // daybed
  const roof = new THREE.Mesh(pyramidRoofGeometry(w, d, sec.roof?.height || 2.4), mat(sec.colors?.roof || '#a08a5c', { side: THREE.DoubleSide, roughness: 1 }));
  roof.position.set(cx, H + 0.25, cz); roof.castShadow = true; roof.userData.sectionId = sec.id;
  g.add(roof); roofMeshes.push(roof); pickables.push(roof);
  return g;
}

function buildGarden(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const cx = x + w / 2, cz = z + d / 2;
  const ground = box(w, 0.06, d, mat(sec.colors?.ground || '#d8c9a6'), cx, 0.03, cz);
  ground.userData.sectionId = sec.id;
  g.add(ground); pickables.push(ground);
  const hedge = box(w - 1.6, 1.8, d - 1.6, mat(sec.colors?.hedge || '#9ccc3c', { roughness: 1 }), cx, 0.9, cz);
  g.add(hedge);
  for (const [px, pz] of [[cx - 0.6, cz - 1], [cx + 0.8, cz + 0.5], [cx - 0.2, cz + 2.2]]) g.add(palm(px, pz, 7 + Math.random() * 2, sec.colors?.palm));
  return g;
}

function palm(px, pz, h, leafColor = '#4f8a3a') {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 8), mat('#9a8a6a'));
  trunk.position.set(px, h / 2, pz); trunk.castShadow = true; g.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), mat(leafColor, { roughness: 1 }));
  crown.scale.y = 0.45; crown.position.set(px, h, pz); crown.castShadow = true; g.add(crown);
  return g;
}

function buildGround(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const m = box(w, 0.04, d, mat(sec.colors?.ground || '#b9a874', { roughness: 1 }), x + w / 2, -0.02, z + d / 2);
  m.userData.sectionId = sec.id; m.receiveShadow = true;
  g.add(m); pickables.push(m);
  if (sec.id === 'lawn-seaward') {
    // bank and a scatter of palms along the seaward edge
    g.add(box(w, 4, 2, mat('#5e7a3a', { roughness: 1 }), x + w / 2, -2, z + 1));
    for (let i = 0; i < 9; i++) g.add(palm(x + 4 + i * (w - 8) / 8, z + 2.5 + (i % 2) * 2, 6 + (i % 3) * 1.5));
  }
  if (sec.id === 'forecourt') {
    for (let i = 0; i < 12; i++) g.add(palm(x + 3 + (i * 5.1) % (w - 6), z + d - 3 - (i % 4) * 2.5, 6 + (i % 3) * 1.5));
    for (let i = 0; i < 6; i++) { g.add(palm(x + 2 + i * 1.7, 10 + i * 2.5, 6 + (i % 3))); g.add(palm(x + w - 2 - i * 1.7, 10 + i * 2.5, 6 + (i % 2))); }
  }
  return g;
}

function buildWater(sec) {
  const g = new THREE.Group();
  const { x, z, w, d } = sec.box;
  const m = box(w, 0.04, d, mat(sec.colors?.water || '#5fc9d4', { roughness: 0.2 }), x + w / 2, -4, z + d / 2);
  m.userData.sectionId = sec.id;
  g.add(m); pickables.push(m);
  g.add(box(w, 0.04, 14, mat('#1d4e89', { roughness: 0.2 }), x + w / 2, -4.01, z + 7));
  return g;
}

const BUILDERS = { room: buildRoom, zone: buildZone, pergola: buildPergola, porch: buildPorch, pool: buildPool, bure: buildBure, garden: buildGarden, ground: buildGround, water: buildWater };

function buildScene(version) {
  modelGroup.clear();
  pickables.length = 0; roofMeshes.length = 0; labelObjects.length = 0;
  for (const k in sectionObjects) delete sectionObjects[k];
  for (const sec of version.sections) {
    const builder = BUILDERS[sec.kind] || buildZone;
    const g = builder(sec);
    g.userData.sectionId = sec.id;
    sectionObjects[sec.id] = g;
    modelGroup.add(g);
    if (sec.kind !== 'ground' && sec.kind !== 'water') {
      const el = document.createElement('div');
      el.className = 'label' + (sec.confirmed === false ? ' unconfirmed' : '');
      el.textContent = sec.name.replace(' (unconfirmed)', '');
      const label = new CSS2DObject(el);
      const h = (sec.wallHeight || 1) + (sec.roof?.height || 0) + 0.6;
      label.position.set(sec.box.x + sec.box.w / 2, sec.kind === 'zone' ? 0.6 : h, sec.box.z + sec.box.d / 2);
      g.add(label); labelObjects.push(label);
    }
  }
  applyToggles();
}

function applyToggles() {
  roofMeshes.forEach(m => m.visible = state.showRoofs);
  labelObjects.forEach(l => l.visible = state.showLabels);
  modelGroup.traverse(o => {
    if (o.isMesh) {
      o.material.wireframe = state.wire;
    }
  });
  highlight(state.selected);
}

// selection highlight: emissive tint on the selected section's meshes
function highlight(id) {
  modelGroup.traverse(o => {
    if (!o.isMesh) return;
    if (o.material._cloned) { o.material = o.material._base; }
  });
  if (!id || !sectionObjects[id]) return;
  sectionObjects[id].traverse(o => {
    if (!o.isMesh) return;
    const base = o.material;
    const c = base.clone(); c.emissive = new THREE.Color(0xe0a458); c.emissiveIntensity = 0.35; c._cloned = true; c._base = base;
    o.material = c;
  });
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
let downPos = null;
canvas.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 4) return;
  const r = canvas.getBoundingClientRect();
  const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  const hits = raycaster.intersectObjects(pickables.filter(m => m.visible), false);
  // prefer the smallest (most specific) section among the first few hits, e.g. a zone over the great-room floor
  const first = hits.slice(0, 3).map(h => h.object.userData.sectionId).filter(Boolean);
  if (!first.length) return;
  const best = first.sort((a, b) => area(a) - area(b))[0];
  selectSection(best);
});
function area(id) { const s = sectionById(id); return s ? s.box.w * s.box.d : 1e9; }
function sectionById(id) { return state.current.sections.find(s => s.id === id); }

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------
async function loadVersions() {
  const files = await (await fetch('data/versions/index.json')).json();
  const fromRepo = await Promise.all(files.map(f => fetch('data/versions/' + f).then(r => r.json())));
  const fromBrowser = Object.values(loadJSON(LS_VERSIONS, {}));
  const all = [...fromRepo];
  for (const v of fromBrowser) if (!all.some(x => x.version === v.version)) all.push({ ...v, _local: true });
  all.sort((a, b) => versionNum(a.version) - versionNum(b.version));
  state.versions = all;
}
function versionNum(v) { return parseFloat(String(v).replace(/^v/i, '')) || 0; }

function setVersion(id) {
  state.current = state.versions.find(v => v.version === id) || state.versions.at(-1);
  const sel = document.getElementById('version-select');
  sel.innerHTML = state.versions.map(v => `<option value="${v.version}" ${v.version === state.current.version ? 'selected' : ''}>${v.version}${v._local ? ' (browser only)' : ''}</option>`).join('');
  document.getElementById('version-summary').textContent = state.current.summary || '';
  buildScene(state.current);
  renderList();
  renderGeneralComments();
  if (state.selected && sectionById(state.selected)) selectSection(state.selected); else closeDetail();
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
function commentsFor(sectionId) {
  const v = state.comments[state.current.version] ||= {};
  return v[sectionId] ||= [];
}
function addComment(sectionId, text) {
  commentsFor(sectionId).push({ id: Date.now().toString(36), text, created: new Date().toISOString(), done: false });
  saveJSON(LS_COMMENTS, state.comments);
}
function updateComment(sectionId, id, patch) {
  const list = commentsFor(sectionId);
  const i = list.findIndex(c => c.id === id);
  if (i < 0) return;
  if (patch === null) list.splice(i, 1); else Object.assign(list[i], patch);
  saveJSON(LS_COMMENTS, state.comments);
}
function renderComments(container, sectionId) {
  const list = commentsFor(sectionId);
  container.innerHTML = list.length ? '' : '<div class="muted">No notes yet.</div>';
  for (const c of list) {
    const el = document.createElement('div');
    el.className = 'comment' + (c.done ? ' done' : '');
    el.innerHTML = `<div class="text"></div><div class="row"><span>${new Date(c.created).toLocaleString()}</span>
      <button data-act="done">${c.done ? 'Reopen' : 'Done'}</button><button data-act="del">Delete</button></div>`;
    el.querySelector('.text').textContent = c.text;
    el.querySelector('[data-act=done]').onclick = () => { updateComment(sectionId, c.id, { done: !c.done }); refreshAll(); };
    el.querySelector('[data-act=del]').onclick = () => { if (confirm('Delete this note?')) { updateComment(sectionId, c.id, null); refreshAll(); } };
    container.appendChild(el);
  }
}
function refreshAll() {
  renderList();
  renderGeneralComments();
  if (state.selected) renderDetail(sectionById(state.selected));
}
function renderGeneralComments() {
  renderComments(document.getElementById('general-comment-list'), 'general');
}
document.getElementById('general-comment-form').onsubmit = e => {
  e.preventDefault();
  const ta = e.target.querySelector('textarea');
  if (ta.value.trim()) { addComment('general', ta.value.trim()); ta.value = ''; refreshAll(); }
};

// ---------------------------------------------------------------------------
// Sidebar list
// ---------------------------------------------------------------------------
function renderList() {
  const q = document.getElementById('filter').value.trim().toLowerCase();
  const root = document.getElementById('section-list');
  root.innerHTML = '';
  const groups = {};
  for (const s of state.current.sections) {
    if (q && !(s.name + ' ' + s.group + ' ' + s.description).toLowerCase().includes(q)) continue;
    (groups[s.group || 'Other'] ||= []).push(s);
  }
  for (const [g, list] of Object.entries(groups)) {
    const h = document.createElement('div'); h.className = 'group'; h.textContent = g; root.appendChild(h);
    for (const s of list) {
      const n = commentsFor(s.id).filter(c => !c.done).length;
      const el = document.createElement('div');
      el.className = 'item' + (s.id === state.selected ? ' active' : '');
      el.innerHTML = `<span class="swatch" style="background:${s.colors?.wall || s.colors?.floor || s.colors?.water || s.colors?.ground || '#888'}"></span><span>${s.name.replace(' (unconfirmed)', '')}</span>` +
        (n ? `<span class="badge comments">${n}</span>` : '') + (s.confirmed === false ? '<span class="badge unconfirmed">?</span>' : '');
      el.onclick = () => selectSection(s.id, true);
      root.appendChild(el);
    }
  }
}
document.getElementById('filter').oninput = renderList;

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
function selectSection(id, fly = false) {
  state.selected = id;
  const s = sectionById(id);
  if (!s) return;
  highlight(id);
  renderList();
  renderDetail(s);
  document.getElementById('detail').classList.remove('hidden');
  if (fly) {
    const cx = s.box.x + s.box.w / 2, cz = s.box.z + s.box.d / 2;
    controls.target.set(cx, 1, cz);
    const dist = Math.max(14, Math.max(s.box.w, s.box.d) * 1.8);
    camera.position.set(cx - dist * 0.75, dist * 0.45, cz - dist * 0.75);
  }
  resize();
}
function closeDetail() {
  state.selected = null;
  highlight(null);
  document.getElementById('detail').classList.add('hidden');
  renderList();
  resize();
}
document.getElementById('detail-close').onclick = closeDetail;

function renderDetail(s) {
  const body = document.getElementById('detail-body');
  const b = s.box;
  const list = (arr) => arr?.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="muted">—</div>';
  body.innerHTML = `
    <h2>${esc(s.name)}</h2>
    <div class="meta">${esc(s.group || '')} · ${s.kind} · ${s.confirmed === false ? '<span style="color:var(--warn)">unconfirmed — not photographed inside</span>' : 'confirmed from photos'}</div>
    <div class="meta">Footprint ~${b.w} × ${b.d} m (est.) at x ${b.x}, z ${b.z}${s.wallHeight ? ` · height ${s.wallHeight} m` : ''}${s.roof ? ` · roof ${s.roof.type}` : ''}</div>
    <h3>Description</h3><p>${esc(s.description || '')}</p>
    ${s.materials ? `<h3>Materials</h3>${list(s.materials)}` : ''}
    ${s.furniture ? `<h3>Furniture & fittings</h3>${list(s.furniture)}` : ''}
    ${s.changes ? `<h3>Changes in this version</h3><p>${esc(s.changes)}</p>` : ''}
    <h3>Photos (${s.photos?.length || 0})</h3>
    <div class="thumbs">${(s.photos || []).map(p => `<img loading="lazy" src="${THUMB_DIR}${p}" data-full="${PHOTO_DIR}${p}" alt="${esc(p)}" title="${esc(p)}">`).join('')}</div>
    <h3>Notes — things to change or add</h3>
    <div class="comment-list" id="section-comments"></div>
    <form class="comment-form" id="section-comment-form"><textarea rows="3" placeholder="e.g. Make the pool 2 m longer; add an outdoor shower here"></textarea><button>Add note</button></form>`;
  renderComments(body.querySelector('#section-comments'), s.id);
  body.querySelector('#section-comment-form').onsubmit = e => {
    e.preventDefault();
    const ta = e.target.querySelector('textarea');
    if (ta.value.trim()) { addComment(s.id, ta.value.trim()); refreshAll(); }
  };
  body.querySelectorAll('.thumbs img').forEach(img => img.onclick = () => openLightbox(img.dataset.full, img.alt));
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Lightbox
const lightbox = document.getElementById('lightbox');
function openLightbox(src, caption) {
  lightbox.querySelector('img').src = src;
  lightbox.querySelector('.caption').textContent = caption;
  lightbox.classList.remove('hidden');
}
lightbox.onclick = () => lightbox.classList.add('hidden');

// Modal
const modal = document.getElementById('modal');
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  modal.classList.remove('hidden');
}
document.getElementById('modal-close').onclick = () => modal.classList.add('hidden');
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

// ---------------------------------------------------------------------------
// Export — one bundle for an image-generation model
// ---------------------------------------------------------------------------
async function buildExport() {
  const v = state.current;
  const allComments = state.comments[v.version] || {};
  let reference = '';
  try { reference = await (await fetch('../docs/house-reference.md')).text(); } catch { reference = '(house-reference.md not reachable — serve the site from the repo root)'; }

  const open = (id) => (allComments[id] || []).filter(c => !c.done);
  const lines = [];
  lines.push(`# House mock-up — export of ${v.version} (${new Date().toISOString().slice(0, 10)})`, '');
  lines.push('## How to use this document', '',
    'This is a complete description of a real beachfront house plus a list of requested changes. The goal is to produce (a) images of the house as it would look WITH the requested changes applied, and (b) an updated JSON model for the next version.', '',
    '1. Read the master description and the per-section details.',
    '2. Apply every item under **Requested changes**. Open items are requests; items marked [done] are already reflected.',
    '3. For images: keep every material, colour and proportion that is not changed. Use the `photos` listed per section as the ground truth for what exists today.',
    '4. When you return changes, reply with ONE JSON object in the exact schema given at the end, under a heading `## RETURN JSON`, so it can be imported as the next version.', '');

  lines.push('## Requested changes', '');
  const gen = open('general');
  if (gen.length) { lines.push('### Whole house'); gen.forEach(c => lines.push(`- ${c.text}`)); lines.push(''); }
  for (const s of v.sections) {
    const cs = open(s.id);
    if (cs.length) { lines.push(`### ${s.name} (\`${s.id}\`)`); cs.forEach(c => lines.push(`- ${c.text}`)); lines.push(''); }
  }
  if (!gen.length && !v.sections.some(s => open(s.id).length)) lines.push('_No open change requests. Reproduce the house as described._', '');

  lines.push('## Master description (from docs/house-reference.md)', '', reference, '');

  lines.push('## Sections in detail', '');
  for (const s of v.sections) {
    lines.push(`### ${s.name}  \`${s.id}\``);
    lines.push(`- Kind: ${s.kind} · Group: ${s.group} · ${s.confirmed === false ? 'UNCONFIRMED (not photographed inside; layout is a guess)' : 'confirmed from photos'}`);
    lines.push(`- Footprint (est.): ${s.box.w} × ${s.box.d} m, at x=${s.box.x}, z=${s.box.z}${s.wallHeight ? `; wall height ${s.wallHeight} m` : ''}${s.roof ? `; roof ${s.roof.type} ${s.roof.height} m` : ''}`);
    if (s.colors) lines.push(`- Colours: ${Object.entries(s.colors).map(([k, c]) => `${k} ${c}`).join(', ')}`);
    lines.push(`- ${s.description}`);
    if (s.materials?.length) lines.push(`- Materials: ${s.materials.join('; ')}`);
    if (s.furniture?.length) lines.push(`- Furniture: ${s.furniture.join('; ')}`);
    if (s.photos?.length) lines.push(`- Photos: ${s.photos.join(', ')}`);
    const done = (allComments[s.id] || []).filter(c => c.done);
    if (done.length) lines.push(`- Already applied: ${done.map(c => '[done] ' + c.text).join('; ')}`);
    lines.push('');
  }

  lines.push('## Coordinate system', '', v.axes || '', '');
  lines.push('## RETURN JSON schema', '',
    'Return one JSON object. Only include sections you changed or added; unchanged sections are carried over automatically. To remove a section set `"remove": true`.', '',
    '```json', JSON.stringify({
      version: nextVersionId(), basedOn: v.version, summary: 'One paragraph on what changed and why',
      sections: [{ id: 'existing-or-new-id', name: '…', kind: 'room|zone|pergola|porch|pool|bure|garden|ground|water', group: '…', confirmed: true,
        box: { x: 0, z: 0, w: 5, d: 5 }, wallHeight: 2.7, roof: { type: 'hip|gable|thatch|flat|none', height: 1.6 },
        colors: { wall: '#hex', floor: '#hex', roof: '#hex' }, description: '…', materials: ['…'], furniture: ['…'], photos: [],
        changes: 'What changed in this section and why' }],
      imagePrompts: [{ view: 'e.g. pool pavilion looking to the bure', prompt: 'the full prompt you used' }]
    }, null, 2), '```', '');
  lines.push('## Current model JSON (for reference)', '', '```json', JSON.stringify(v, null, 2), '```');
  return lines.join('\n');
}
function nextVersionId() { return 'v' + (Math.max(...state.versions.map(v => versionNum(v.version))) + 1); }

document.getElementById('btn-export').onclick = async () => {
  const text = await buildExport();
  openModal(`Export — ${state.current.version}`, `
    <div class="note">Copy this whole document into ChatGPT (or save it and attach it). It contains the master description, every section, all open notes, the photo filenames and the JSON schema to reply with. Attach the photos it names from <code>photos/raw/</code> for the sections you want generated.</div>
    <textarea id="export-text"></textarea>
    <div class="actions"><button class="primary" id="copy-export">Copy to clipboard</button><button id="dl-export">Download .md</button><span class="muted" id="export-size"></span></div>`);
  const ta = document.getElementById('export-text'); ta.value = text;
  document.getElementById('export-size').textContent = `${(text.length / 1024).toFixed(0)} KB`;
  document.getElementById('copy-export').onclick = () => { navigator.clipboard.writeText(text); document.getElementById('copy-export').textContent = 'Copied'; };
  document.getElementById('dl-export').onclick = () => download(`house-export-${state.current.version}.md`, text);
};
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name; a.click();
}

// ---------------------------------------------------------------------------
// Import — a JSON reply becomes the next version
// ---------------------------------------------------------------------------
document.getElementById('btn-import').onclick = () => {
  openModal('Import a new version', `
    <div class="note">Paste the JSON that came back (the block under <b>RETURN JSON</b>, or the whole reply — the first JSON object in it is used). Changed sections are merged over <b>${state.current.version}</b>; everything else carries over. The result is saved in this browser and offered as a file to commit into <code>web/data/versions/</code>.</div>
    <textarea id="import-text" placeholder='{"version":"v2","basedOn":"v1","summary":"…","sections":[…]}'></textarea>
    <div class="actions"><button class="primary" id="do-import">Import</button><span class="muted" id="import-msg"></span></div>`);
  document.getElementById('do-import').onclick = () => {
    const msg = document.getElementById('import-msg');
    try {
      const incoming = extractJSON(document.getElementById('import-text').value);
      const merged = mergeVersion(state.current, incoming);
      const local = loadJSON(LS_VERSIONS, {});
      local[merged.version] = merged;
      saveJSON(LS_VERSIONS, local);
      state.versions = state.versions.filter(v => v.version !== merged.version).concat([{ ...merged, _local: true }]).sort((a, b) => versionNum(a.version) - versionNum(b.version));
      download(`${merged.version}.json`, JSON.stringify(merged, null, 2));
      modal.classList.add('hidden');
      setVersion(merged.version);
      showDiff(merged);
    } catch (e) { msg.textContent = 'Could not import: ' + e.message; }
  };
};
function extractJSON(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object found');
  // walk to the matching brace so trailing prose is ignored
  let depth = 0, inStr = false, escp = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (escp) escp = false; else if (ch === '\\') escp = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error('unbalanced JSON');
}
function mergeVersion(base, incoming) {
  if (!incoming.sections || !Array.isArray(incoming.sections)) throw new Error('"sections" array missing');
  const version = incoming.version || nextVersionId();
  const sections = base.sections.map(s => ({ ...s, changes: undefined }));
  for (const inc of incoming.sections) {
    if (!inc.id) throw new Error('a section has no id');
    const i = sections.findIndex(s => s.id === inc.id);
    if (inc.remove) { if (i >= 0) sections.splice(i, 1); continue; }
    if (i >= 0) sections[i] = { ...sections[i], ...inc, box: { ...sections[i].box, ...(inc.box || {}) }, colors: { ...sections[i].colors, ...(inc.colors || {}) } };
    else {
      if (!inc.box || !inc.kind || !inc.name) throw new Error(`new section "${inc.id}" needs name, kind and box`);
      sections.push({ confirmed: true, photos: [], group: 'New', ...inc });
    }
  }
  return { version, basedOn: base.version, created: new Date().toISOString().slice(0, 10), summary: incoming.summary || '', units: base.units, axes: base.axes, imagePrompts: incoming.imagePrompts || [], sections };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------
document.getElementById('btn-diff').onclick = () => showDiff(state.current);
function showDiff(v) {
  const prev = state.versions.find(p => p.version === v.basedOn) || state.versions[state.versions.indexOf(v) - 1];
  if (!prev) return openModal(`Diff — ${v.version}`, '<div class="muted">This is the first version; nothing to compare against.</div>');
  const rows = [];
  const fields = ['name', 'kind', 'group', 'confirmed', 'box', 'wallHeight', 'roof', 'colors', 'description', 'materials', 'furniture', 'photos'];
  for (const s of v.sections) {
    const p = prev.sections.find(x => x.id === s.id);
    if (!p) { rows.push(`<div class="diff-row"><b>${esc(s.name)}</b> <span class="add">added</span>${s.changes ? `<div>${esc(s.changes)}</div>` : ''}</div>`); continue; }
    const changed = fields.filter(f => JSON.stringify(p[f]) !== JSON.stringify(s[f]));
    if (!changed.length) continue;
    rows.push(`<div class="diff-row"><b>${esc(s.name)}</b>${s.changes ? `<div>${esc(s.changes)}</div>` : ''}` +
      changed.map(f => `<div class="diff-field">${f}: <span class="del">${esc(JSON.stringify(p[f]))}</span> → <span class="add">${esc(JSON.stringify(s[f]))}</span></div>`).join('') + '</div>');
  }
  for (const p of prev.sections) if (!v.sections.some(s => s.id === p.id)) rows.push(`<div class="diff-row"><b>${esc(p.name)}</b> <span class="del">removed</span></div>`);
  const prompts = (v.imagePrompts || []).map(p => `<div class="diff-row"><b>${esc(p.view)}</b><div class="muted">${esc(p.prompt)}</div></div>`).join('');
  openModal(`Diff — ${v.version} vs ${prev.version}`, `<div class="note">${esc(v.summary || '')}</div>${rows.join('') || '<div class="muted">No section changes.</div>'}${prompts ? '<h3>Image prompts used</h3>' + prompts : ''}`);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
document.getElementById('version-select').onchange = e => setVersion(e.target.value);
document.getElementById('toggle-wire').onchange = e => { state.wire = e.target.checked; applyToggles(); };
document.getElementById('toggle-roofs').onchange = e => { state.showRoofs = e.target.checked; applyToggles(); };
document.getElementById('toggle-labels').onchange = e => { state.showLabels = e.target.checked; applyToggles(); };
document.getElementById('btn-top').onclick = topView;
document.getElementById('btn-iso').onclick = resetView;
addEventListener('keydown', e => { if (e.key === 'Escape') { modal.classList.add('hidden'); lightbox.classList.add('hidden'); } });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.__house = { camera, controls, state, selectSection, setVersion };
(async function boot() {
  resize();
  resetView();
  try {
    await loadVersions();
    setVersion(state.versions.at(-1).version);
  } catch (e) {
    document.getElementById('hint').textContent = 'Could not load data/versions — serve this folder over HTTP (see web/README.md). ' + e.message;
    console.error(e);
  }
})();
