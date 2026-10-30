// 2D floor-plan editor. SVG, metres, sea at the top (svg y = world z). Edits the same section
// objects the 3D model is built from: boxes (move / resize by handles), openings along walls,
// props (drag / rotate / add / delete). Grid snap. Undo. Calls onChange after every edit.

const PROP_SIZE = { // footprint w × d in metres for the plan symbol
  sofa: [2.1, 0.9], armchair: [0.9, 0.9], 'coffee-table': [1.3, 0.7], 'dining-table': [2.2, 1.0], chair: [0.45, 0.45],
  island: [4, 1.0], 'bar-stool': [0.35, 0.35], bench: [4, 0.6], benchtop: [4, 0.65], fridge: [0.8, 0.75], pantry: [1.2, 0.6],
  desk: [1.3, 0.6], bed: [1.9, 2.1], 'single-bed': [1.0, 2.0], wardrobe: [1.4, 0.6], chest: [1.0, 0.5], 'bean-bag': [1.1, 1.3],
  lounger: [0.7, 1.9], 'rocking-chair': [0.6, 0.6], bbq: [1.3, 0.6], pot: [0.7, 0.7], planter: [3, 0.8], 'ac-unit': [0.8, 0.3],
  'gas-bottle': [0.36, 0.36], bicycle: [1.0, 0.4], 'solar-hw': [2, 1.2], tv: [1.4, 0.45], mask: [0.3, 0.1],
};
const PROP_LABEL = { sofa: 'Sofa', armchair: 'Chair', 'coffee-table': 'Table', 'dining-table': 'Dining', chair: 'Ch', island: 'Island', 'bar-stool': 'St', bench: 'Bench', benchtop: 'Top', fridge: 'Fridge', pantry: 'Pantry', desk: 'Desk', bed: 'Bed', 'single-bed': 'Single', wardrobe: 'Robe', chest: 'Chest', 'bean-bag': 'Bean', lounger: 'Lounger', 'rocking-chair': 'Rock', bbq: 'BBQ', pot: 'Pot', planter: 'Planter', 'ac-unit': 'AC', 'gas-bottle': 'Gas', bicycle: 'Bike', 'solar-hw': 'Solar', tv: 'TV', mask: 'Mask' };
export const PROP_TYPES = Object.keys(PROP_SIZE);
export const OPENING_TYPES = ['bifold', 'door', 'screen', 'louvre', 'window'];
const KIND_FILL = { room: '#ffffff', zone: 'rgba(10,132,255,.10)', pergola: '#f1e2c8', porch: '#f1e2c8', pool: '#2f55e0', bure: '#e9dcb5', garden: '#d7ecb0', ground: '#efe7d2', water: '#bfe6ee' };

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };

export function createPlan(container, { getVersion, onChange, onSelect }) {
  const svg = el('svg', { class: 'plan-svg' }, container);
  const defs = el('defs', {}, svg);
  const world = el('g', {}, svg);
  const layers = { grid: el('g', {}, world), ground: el('g', {}, world), sections: el('g', {}, world), openings: el('g', {}, world), props: el('g', {}, world), handles: el('g', {}, world) };
  // grid patterns (minor 0.5 m, major 5 m) in world units
  const pMinor = el('pattern', { id: 'grid-minor', width: 0.5, height: 0.5, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M0.5 0 L0 0 0 0.5', fill: 'none', stroke: 'rgba(0,0,0,.07)', 'stroke-width': 0.02 }, pMinor);
  const pMajor = el('pattern', { id: 'grid-major', width: 5, height: 5, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { width: 5, height: 5, fill: 'url(#grid-minor)' }, pMajor);
  el('path', { d: 'M5 0 L0 0 0 5', fill: 'none', stroke: 'rgba(0,0,0,.16)', 'stroke-width': 0.03 }, pMajor);
  const gridRect = el('rect', { x: -60, y: -70, width: 120, height: 130, fill: 'url(#grid-major)' }, layers.grid);
  el('text', { x: 0, y: -24, 'font-size': 0.9, 'text-anchor': 'middle', fill: '#4a8db0', class: 'plan-text' }, layers.grid).textContent = 'SEA ↑';

  const state = { scale: 18, tx: 0, ty: 0, snap: 0.25, snapOn: true, selected: null, selProp: null, selOpening: null, tool: 'select', addType: null, undo: [], showGrid: true };
  function sections() { return getVersion().sections; }
  function sec(id) { return sections().find(s => s.id === id); }

  // ------------------------------------------------------------- view transform
  function applyTransform() { world.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.scale})`); updateHandleScale(); }
  function fit() {
    const r = container.getBoundingClientRect();
    state.scale = Math.min(r.width / 50, r.height / 52);
    state.tx = r.width / 2 - 0 * state.scale; state.ty = r.height / 2 - 6 * state.scale;
    applyTransform();
  }
  function toWorld(clientX, clientY) { const r = svg.getBoundingClientRect(); return { x: (clientX - r.left - state.tx) / state.scale, z: (clientY - r.top - state.ty) / state.scale }; }
  function snap(v) { return state.snapOn ? Math.round(v / state.snap) * state.snap : Math.round(v * 100) / 100; }
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015); const ns = Math.min(120, Math.max(4, state.scale * k));
    state.tx = mx - (mx - state.tx) * (ns / state.scale); state.ty = my - (my - state.ty) * (ns / state.scale); state.scale = ns;
    applyTransform();
  }, { passive: false });

  // ------------------------------------------------------------- rendering
  function render() {
    for (const k of ['ground', 'sections', 'openings', 'props', 'handles']) layers[k].replaceChildren();
    const list = [...sections()].sort((a, b) => order(a) - order(b));
    for (const s of list) {
      const b = s.box; const g = el('g', { 'data-section': s.id, class: 'plan-section kind-' + s.kind + (s.id === state.selected ? ' selected' : '') }, s.kind === 'ground' || s.kind === 'water' ? layers.ground : layers.sections);
      el('rect', { x: b.x, y: b.z, width: b.w, height: b.d, fill: KIND_FILL[s.kind] || '#eee', stroke: s.kind === 'room' ? '#1d1d1f' : s.kind === 'zone' ? '#0a84ff' : '#6e6e73', 'stroke-width': s.kind === 'room' ? 0.2 : 0.05, 'stroke-dasharray': s.kind === 'zone' ? '0.3 0.2' : s.confirmed === false ? '0.5 0.3' : '', 'vector-effect': 'non-scaling-stroke' }, g);
      if (s.hole) el('rect', { x: s.hole.x, y: s.hole.z, width: s.hole.w, height: s.hole.d, fill: '#d7ecb0', stroke: 'none' }, g);
      if (s.kind === 'pool' && s.spa) el('rect', { x: s.spa.x, y: s.spa.z, width: s.spa.w, height: s.spa.d, fill: '#2f55e0', stroke: '#e6dfcc', 'stroke-width': 0.08 }, g);
      const t = el('text', { x: b.x + b.w / 2, y: b.z + b.d / 2, 'font-size': Math.min(0.7, b.w / 8), 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'plan-text', fill: s.kind === 'pool' ? '#fff' : '#1d1d1f', 'pointer-events': 'none' }, g);
      t.textContent = s.name.replace(' (unconfirmed)', '').replace(' (mirror, unconfirmed)', '');
      if (s.kind === 'room') for (const o of s.openings || []) drawOpening(s, o);
      for (const [i, p] of (s.props || []).entries()) drawProp(s, p, i);
    }
    drawHandles();
  }
  function order(s) { return { water: 0, ground: 1, garden: 2, pergola: 3, porch: 3, zone: 6, pool: 4, bure: 4, room: 5 }[s.kind] ?? 5; }

  // wall side → segment start point and unit direction in world (matches scene.js placeWall)
  function wallFrame(b, side) {
    if (side === 'sea') return { x: b.x, z: b.z, dx: 1, dz: 0, nx: 0, nz: 1 };
    if (side === 'land') return { x: b.x + b.w, z: b.z + b.d, dx: -1, dz: 0, nx: 0, nz: -1 };
    if (side === 'left') return { x: b.x, z: b.z + b.d, dx: 0, dz: -1, nx: 1, nz: 0 };
    return { x: b.x + b.w, z: b.z, dx: 0, dz: 1, nx: -1, nz: 0 };
  }
  function drawOpening(s, o) {
    const f = wallFrame(s.box, o.side);
    const x1 = f.x + f.dx * o.from, z1 = f.z + f.dz * o.from, x2 = f.x + f.dx * o.to, z2 = f.z + f.dz * o.to;
    const idx = s.openings.indexOf(o);
    const g = el('g', { 'data-section': s.id, 'data-opening': idx, class: 'plan-opening' + (state.selOpening === idx && state.selected === s.id ? ' selected' : '') }, layers.openings);
    // white gap in the wall, then symbol
    el('line', { x1, y1: z1, x2, y2: z2, stroke: '#fff', 'stroke-width': 0.26 }, g);
    const col = o.type === 'bifold' ? '#b8742f' : o.type === 'louvre' || o.type === 'window' ? '#0a84ff' : '#6e6e73';
    if (o.type === 'louvre' || o.type === 'window') {
      el('line', { x1, y1: z1, x2, y2: z2, stroke: col, 'stroke-width': 0.06 }, g);
      el('line', { x1: x1 + f.nx * 0.08, y1: z1 + f.nz * 0.08, x2: x2 + f.nx * 0.08, y2: z2 + f.nz * 0.08, stroke: col, 'stroke-width': 0.04 }, g);
      el('line', { x1: x1 - f.nx * 0.08, y1: z1 - f.nz * 0.08, x2: x2 - f.nx * 0.08, y2: z2 - f.nz * 0.08, stroke: col, 'stroke-width': 0.04 }, g);
    } else if (o.type === 'bifold') {
      const n = Math.max(2, Math.round((o.to - o.from) / 0.5)); // zigzag of leaves
      let d = `M${x1} ${z1}`;
      for (let i = 1; i <= n; i++) { const t = o.from + (o.to - o.from) * i / n; const off = i % 2 ? 0.3 : 0; d += ` L${f.x + f.dx * t + f.nx * off} ${f.z + f.dz * t + f.nz * off}`; }
      el('path', { d, fill: 'none', stroke: col, 'stroke-width': 0.06 }, g);
    } else {
      const len = o.to - o.from; // door swing arc
      el('path', { d: `M${x1} ${z1} L${x1 + f.nx * len} ${z1 + f.nz * len} A${len} ${len} 0 0 ${(f.dx * f.nz - f.dz * f.nx) > 0 ? 1 : 0} ${x2} ${z2}`, fill: 'none', stroke: col, 'stroke-width': 0.04 }, g);
    }
    el('line', { x1, y1: z1, x2, y2: z2, stroke: 'transparent', 'stroke-width': 0.6, class: 'hit' }, g);
  }
  function drawProp(s, p, i) {
    const [w, d] = PROP_SIZE[p.type] || [0.6, 0.6];
    const cx = s.box.x + p.x, cz = s.box.z + p.z;
    const g = el('g', { 'data-section': s.id, 'data-prop': i, class: 'plan-prop' + (state.selected === s.id && state.selProp === i ? ' selected' : ''), transform: `translate(${cx} ${cz}) rotate(${-(p.rot || 0)})` }, layers.props);
    el('rect', { x: -w / 2, y: -d / 2, width: w, height: d, rx: 0.08, fill: 'rgba(255,255,255,.85)', stroke: '#1d1d1f', 'stroke-width': 0.04 }, g);
    if (p.type === 'bed' || p.type === 'single-bed') el('rect', { x: -w / 2 + 0.1, y: d / 2 - 0.55, width: w - 0.2, height: 0.4, fill: '#eee', stroke: '#1d1d1f', 'stroke-width': 0.02 }, g); // pillow end at +z (bed head against far wall)
    if (p.type === 'sofa' || p.type === 'armchair') el('rect', { x: -w / 2, y: -d / 2, width: w, height: 0.22, fill: '#1d1d1f' }, g); // back
    const t = el('text', { x: 0, y: 0.02, 'font-size': Math.min(0.32, w / 3), 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'plan-text', fill: '#1d1d1f', 'pointer-events': 'none' }, g);
    t.textContent = PROP_LABEL[p.type] || p.type;
  }
  const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
  function drawHandles() {
    const s = state.selected && sec(state.selected); if (!s) return;
    const b = s.box;
    for (const [name, fx, fz] of HANDLES) el('rect', { 'data-handle': name, class: 'plan-handle', x: b.x + b.w * fx, y: b.z + b.d * fz, width: 1, height: 1, fill: '#fff', stroke: '#0a84ff', 'stroke-width': 1 }, layers.handles);
    if (state.selOpening != null && s.openings?.[state.selOpening]) {
      const o = s.openings[state.selOpening], f = wallFrame(b, o.side);
      for (const [name, u] of [['ofrom', o.from], ['oto', o.to]]) el('circle', { 'data-handle': name, class: 'plan-handle', cx: f.x + f.dx * u, cy: f.z + f.dz * u, r: 1, fill: '#fff', stroke: '#b8742f', 'stroke-width': 1 }, layers.handles);
    }
    if (state.selProp != null && s.props?.[state.selProp]) {
      const p = s.props[state.selProp]; const [w] = PROP_SIZE[p.type] || [0.6];
      const a = -(p.rot || 0) * Math.PI / 180;
      el('circle', { 'data-handle': 'rot', class: 'plan-handle', cx: b.x + p.x + Math.cos(a) * (w / 2 + 0.35), cy: b.z + p.z + Math.sin(a) * (w / 2 + 0.35), r: 1, fill: '#0a84ff', stroke: '#fff', 'stroke-width': 1 }, layers.handles);
    }
    updateHandleScale();
  }
  function updateHandleScale() { // keep handles a constant screen size
    const hs = 8 / state.scale;
    layers.handles.querySelectorAll('rect').forEach(h => { h.setAttribute('width', hs); h.setAttribute('height', hs); h.setAttribute('transform', `translate(${-hs / 2} ${-hs / 2})`); h.setAttribute('stroke-width', 1.5 / state.scale); });
    layers.handles.querySelectorAll('circle').forEach(h => { h.setAttribute('r', hs * 0.6); h.setAttribute('stroke-width', 1.5 / state.scale); });
  }

  // ------------------------------------------------------------- editing
  function pushUndo() { state.undo.push(JSON.stringify(sections())); if (state.undo.length > 60) state.undo.shift(); }
  function undo() { const s = state.undo.pop(); if (!s) return; getVersion().sections = JSON.parse(s); render(); onChange(); }
  function select(id, prop = null, opening = null) { state.selected = id; state.selProp = prop; state.selOpening = opening; render(); onSelect?.(id); }
  function changed() { render(); onChange(); }

  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button === 1 || e.button === 2 || e.shiftKey && e.button === 0 && !e.target.closest('[data-handle]')) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: state.tx, ty: state.ty }; svg.setPointerCapture(e.pointerId); return; }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    if (state.tool === 'add-prop' && state.addType) { // place a prop in the section under the cursor
      const target = hitSection(w, 'any'); if (!target) return;
      pushUndo(); (target.props ||= []).push({ type: state.addType, x: +(snap(w.x) - target.box.x).toFixed(2), z: +(snap(w.z) - target.box.z).toFixed(2), rot: 0 });
      state.tool = 'select'; container.classList.remove('adding'); select(target.id, target.props.length - 1); onChange(); return;
    }
    if (state.tool === 'add-opening' && state.addType) {
      const hit = hitWall(w); if (!hit) return;
      pushUndo(); const o = { side: hit.side, type: state.addType, from: +Math.max(0, snap(hit.u) - 0.5).toFixed(2), to: +Math.min(hit.len, snap(hit.u) + 0.5).toFixed(2) };
      if (state.addType === 'louvre' || state.addType === 'window') Object.assign(o, { sill: 0.9, head: 2.1 });
      (hit.section.openings ||= []).push(o); state.tool = 'select'; container.classList.remove('adding'); select(hit.section.id, null, hit.section.openings.length - 1); onChange(); return;
    }
    if (state.tool === 'add-room') { drag = { kind: 'draw', x0: snap(w.x), z0: snap(w.z) }; svg.setPointerCapture(e.pointerId); return; }
    const h = e.target.closest('[data-handle]');
    const s = state.selected && sec(state.selected);
    if (h && s) { drag = { kind: 'handle', name: h.dataset.handle, start: w, box: { ...s.box }, opening: state.selOpening != null ? { ...s.openings[state.selOpening] } : null, prop: state.selProp != null ? { ...s.props[state.selProp] } : null }; pushUndo(); svg.setPointerCapture(e.pointerId); return; }
    const pg = e.target.closest('[data-prop]');
    if (pg) { const ps = sec(pg.dataset.section), i = +pg.dataset.prop; select(ps.id, i); drag = { kind: 'prop', start: w, prop: { ...ps.props[i] }, section: ps, i }; pushUndo(); svg.setPointerCapture(e.pointerId); return; }
    const og = e.target.closest('[data-opening]');
    if (og) { const os = sec(og.dataset.section), i = +og.dataset.opening; select(os.id, null, i); drag = { kind: 'opening', start: w, opening: { ...os.openings[i] }, section: os, i }; pushUndo(); svg.setPointerCapture(e.pointerId); return; }
    const sg = e.target.closest('[data-section]');
    if (sg) { const ss = sec(sg.dataset.section); select(ss.id); if (ss.kind !== 'ground' && ss.kind !== 'water') { drag = { kind: 'move', start: w, box: { ...ss.box }, hole: ss.hole ? { ...ss.hole } : null, spa: ss.spa ? { ...ss.spa } : null, section: ss }; pushUndo(); svg.setPointerCapture(e.pointerId); } return; }
    select(null);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.kind === 'pan') { state.tx = drag.tx + e.clientX - drag.sx; state.ty = drag.ty + e.clientY - drag.sy; applyTransform(); return; }
    const w = toWorld(e.clientX, e.clientY);
    const s = state.selected && sec(state.selected);
    if (drag.kind === 'draw') { layers.handles.replaceChildren(); el('rect', { x: Math.min(drag.x0, snap(w.x)), y: Math.min(drag.z0, snap(w.z)), width: Math.abs(snap(w.x) - drag.x0), height: Math.abs(snap(w.z) - drag.z0), fill: 'rgba(10,132,255,.15)', stroke: '#0a84ff', 'stroke-width': 0.05 }, layers.handles); return; }
    if (!s) return;
    const dx = snap(w.x - drag.start.x), dz = snap(w.z - drag.start.z);
    if (drag.kind === 'move') {
      s.box.x = +(drag.box.x + dx).toFixed(2); s.box.z = +(drag.box.z + dz).toFixed(2);
      if (drag.hole) { s.hole.x = +(drag.hole.x + dx).toFixed(2); s.hole.z = +(drag.hole.z + dz).toFixed(2); }
      if (drag.spa) { s.spa.x = +(drag.spa.x + dx).toFixed(2); s.spa.z = +(drag.spa.z + dz).toFixed(2); }
    } else if (drag.kind === 'handle') {
      const n = drag.name, b = drag.box;
      if (n === 'rot') { const p = s.props[state.selProp]; const a = Math.atan2(w.z - (s.box.z + p.z), w.x - (s.box.x + p.x)); p.rot = ((Math.round(-a * 180 / Math.PI / 15) * 15) % 360 + 360) % 360; }
      else if (n === 'ofrom' || n === 'oto') { const o = s.openings[state.selOpening]; const f = wallFrame(s.box, o.side); const u = snap((w.x - f.x) * f.dx + (w.z - f.z) * f.dz); const len = o.side === 'sea' || o.side === 'land' ? s.box.w : s.box.d; if (n === 'ofrom') o.from = +Math.max(0, Math.min(o.to - 0.3, u)).toFixed(2); else o.to = +Math.min(len, Math.max(o.from + 0.3, u)).toFixed(2); }
      else {
        let x = b.x, z = b.z, wd = b.w, d = b.d;
        if (n.includes('w')) { x = b.x + dx; wd = b.w - dx; } if (n.includes('e')) wd = b.w + dx;
        if (n.includes('n')) { z = b.z + dz; d = b.d - dz; } if (n.includes('s')) d = b.d + dz;
        if (wd >= 0.5 && d >= 0.5) Object.assign(s.box, { x: +x.toFixed(2), z: +z.toFixed(2), w: +wd.toFixed(2), d: +d.toFixed(2) });
      }
    } else if (drag.kind === 'prop') {
      const p = drag.section.props[drag.i]; p.x = +(drag.prop.x + dx).toFixed(2); p.z = +(drag.prop.z + dz).toFixed(2);
    } else if (drag.kind === 'opening') {
      const o = drag.section.openings[drag.i], f = wallFrame(drag.section.box, o.side);
      const du = snap((w.x - drag.start.x) * f.dx + (w.z - drag.start.z) * f.dz); const len = o.side === 'sea' || o.side === 'land' ? drag.section.box.w : drag.section.box.d; const L = drag.opening.to - drag.opening.from;
      let from = Math.max(0, Math.min(len - L, drag.opening.from + du)); o.from = +from.toFixed(2); o.to = +(from + L).toFixed(2);
    }
    render();
  });
  svg.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'pan') return;
    if (d.kind === 'draw') {
      const w = toWorld(e.clientX, e.clientY); const x = Math.min(d.x0, snap(w.x)), z = Math.min(d.z0, snap(w.z)), wd = Math.abs(snap(w.x) - d.x0), dd = Math.abs(snap(w.z) - d.z0);
      state.tool = 'select'; container.classList.remove('adding');
      if (wd < 0.5 || dd < 0.5) { render(); return; }
      const name = prompt('Name for the new room / area:', 'New room'); if (!name) { render(); return; }
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-3);
      pushUndo();
      sections().push({ id, name, kind: state.addType || 'room', group: 'New', confirmed: false, box: { x, z, w: wd, d: dd }, wallHeight: 2.7, roof: { type: 'hip', height: 1.6 }, colors: { wall: '#ece6d6', floor: '#8d8578', roof: '#9ea4a9' }, description: 'Added in the plan editor.', photos: [], openings: [], props: [] });
      select(id); onChange(); return;
    }
    onChange();
  });
  svg.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (!container.offsetParent || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
    const s = state.selected && sec(state.selected); if (!s) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); pushUndo();
      if (state.selProp != null) { s.props.splice(state.selProp, 1); state.selProp = null; }
      else if (state.selOpening != null) { s.openings.splice(state.selOpening, 1); state.selOpening = null; }
      else if (confirm(`Delete "${s.name}"?`)) { const i = sections().indexOf(s); sections().splice(i, 1); state.selected = null; }
      changed();
    }
    if (e.key === 'r' && state.selProp != null) { pushUndo(); const p = s.props[state.selProp]; p.rot = ((p.rot || 0) + (e.shiftKey ? -15 : 15) + 360) % 360; changed(); }
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && state.selProp != null) { e.preventDefault(); pushUndo(); const p = s.props[state.selProp]; s.props.push({ ...p, x: p.x + 0.5, z: p.z + 0.5 }); state.selProp = s.props.length - 1; changed(); }
    const step = e.shiftKey ? 1 : state.snap; let moved = false;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dz = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (dx || dz) {
      e.preventDefault(); pushUndo();
      if (state.selProp != null) { const p = s.props[state.selProp]; p.x = +(p.x + dx).toFixed(2); p.z = +(p.z + dz).toFixed(2); moved = true; }
      else if (s.kind !== 'ground' && s.kind !== 'water') { s.box.x = +(s.box.x + dx).toFixed(2); s.box.z = +(s.box.z + dz).toFixed(2); if (s.hole) { s.hole.x += dx; s.hole.z += dz; } if (s.spa) { s.spa.x += dx; s.spa.z += dz; } moved = true; }
      if (moved) changed();
    }
  });
  function hitSection(w, mode) {
    const cands = sections().filter(s => s.kind !== 'ground' && s.kind !== 'water' && w.x >= s.box.x && w.x <= s.box.x + s.box.w && w.z >= s.box.z && w.z <= s.box.z + s.box.d);
    return cands.sort((a, b) => a.box.w * a.box.d - b.box.w * b.box.d)[0] || null;
  }
  function hitWall(w) {
    let best = null;
    for (const s of sections()) {
      if (s.kind !== 'room') continue;
      for (const side of ['sea', 'land', 'left', 'right']) {
        const f = wallFrame(s.box, side), len = side === 'sea' || side === 'land' ? s.box.w : s.box.d;
        const u = (w.x - f.x) * f.dx + (w.z - f.z) * f.dz, dist = Math.abs((w.x - f.x) * f.nx + (w.z - f.z) * f.nz);
        if (u >= 0 && u <= len && dist < 0.5 && (!best || dist < best.dist)) best = { section: s, side, u, len, dist };
      }
    }
    return best;
  }

  // ------------------------------------------------------------- public API
  return {
    render, fit, select, undo,
    setSnap(v) { state.snap = v; }, setSnapOn(b) { state.snapOn = b; },
    setGrid(b) { state.showGrid = b; gridRect.style.display = b ? '' : 'none'; },
    startAddProp(type) { state.tool = 'add-prop'; state.addType = type; container.classList.add('adding'); },
    startAddOpening(type) { state.tool = 'add-opening'; state.addType = type; container.classList.add('adding'); },
    startAddRoom(kind) { state.tool = 'add-room'; state.addType = kind; container.classList.add('adding'); },
    cancelTool() { state.tool = 'select'; state.addType = null; container.classList.remove('adding'); },
    selected: () => state.selected, selectedProp: () => state.selProp, selectedOpening: () => state.selOpening,
    setPropType(type) { const s = sec(state.selected); if (s && state.selProp != null) { pushUndo(); s.props[state.selProp].type = type; changed(); } },
    setOpeningType(type) { const s = sec(state.selected); if (s && state.selOpening != null) { pushUndo(); s.openings[state.selOpening].type = type; changed(); } },
    setBox(patch) { const s = sec(state.selected); if (!s) return; pushUndo(); Object.assign(s.box, patch); changed(); },
    mirrorSelected() { // mirror the selected section about x = 0 as a new section
      const s = sec(state.selected); if (!s) return; pushUndo();
      const m = JSON.parse(JSON.stringify(s)); m.id = s.id + '-mirror-' + Date.now().toString(36).slice(-3); m.name = s.name.replace(/\(.*\)/, '').trim() + ' (mirror)'; m.confirmed = false;
      m.box.x = -(s.box.x + s.box.w); m.props = (s.props || []).map(p => ({ ...p, x: s.box.w - p.x, rot: ((360 - (p.rot || 0)) % 360) }));
      const flip = { left: 'right', right: 'left', sea: 'sea', land: 'land' };
      m.openings = (s.openings || []).map(o => { const len = o.side === 'sea' || o.side === 'land' ? s.box.w : s.box.d; return { ...o, side: flip[o.side], from: o.side === 'sea' || o.side === 'land' ? +(len - o.to).toFixed(2) : o.from, to: o.side === 'sea' || o.side === 'land' ? +(len - o.from).toFixed(2) : o.to }; });
      sections().push(m); select(m.id); onChange();
    },
  };
}
