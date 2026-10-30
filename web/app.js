// UI, data and the export/import loop. Geometry lives in scene.js.
import { createScene } from './scene.js?v=__BUILD__';
import { createPlan, PROP_TYPES, OPENING_TYPES } from './plan.js?v=__BUILD__';

const PHOTO_DIR = '../photos/raw/';
const THUMB_DIR = '../photos/thumbs/';
const LS_VERSIONS = 'house.versions';       // versions imported in the browser, keyed by version id
const LS_COMMENTS = 'house.comments';       // { [versionId]: { [sectionId|'general']: Comment[] } }
const LS_ASSIGN = 'house.assignments';
const LS_WORKING = 'house.working';        // { [versionId]: sections[] } — edits made in the plan editor      // { photos: {file: [sectionId]}, spots: {file: spot}, notes: {file: text} }

const state = {
  versions: [], current: null, base: null, photos: [],
  comments: loadJSON(LS_COMMENTS, {}),
  assign: loadJSON(LS_ASSIGN, { photos: {}, spots: {}, notes: {} }),
  working: loadJSON(LS_WORKING, {}),
  planOn: false,
  selected: null,
  toggles: { wire: false, roofs: true, labels: true, markers: true },
  placing: null, // { file, step: 'pos'|'look', spot }
  compare: { on: false, index: 0, mode: 'side', opacity: 0.5 },
  onboardIndex: 0,
};
function loadJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage failed', e); } }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const $ = (id) => document.getElementById(id);

const viewport = $('viewport');
const view = createScene($('canvas'), $('stage'));
const PHOTO_FOV = 85;   // vertical FOV of a 13 mm-equivalent (iPhone 0.5×) lens on a 4:3 frame
const DEFAULT_FOV = 45;

// ---------------------------------------------------------------------------
// Versions. "base" is the stored version; "current" is base with the browser's
// photo assignments / spots / notes applied on top.
// ---------------------------------------------------------------------------
async function loadVersions() {
  const files = await (await fetch('data/versions/index.json')).json();
  const fromRepo = await Promise.all(files.map(f => fetch('data/versions/' + f).then(r => r.json())));
  const fromBrowser = Object.values(loadJSON(LS_VERSIONS, {}));
  const all = [...fromRepo];
  for (const v of fromBrowser) if (!all.some(x => x.version === v.version)) all.push({ ...v, _local: true });
  all.sort((a, b) => versionNum(a.version) - versionNum(b.version));
  state.versions = all;
  state.photos = await (await fetch('data/photos.json')).json();
}
function versionNum(v) { return parseFloat(String(v).replace(/^v/i, '')) || 0; }

function applyAssignments(base) {
  const v = JSON.parse(JSON.stringify(base));
  if (state.working[base.version]) v.sections = JSON.parse(JSON.stringify(state.working[base.version]));
  v.photoSpots = { ...(v.photoSpots || {}), ...state.assign.spots };
  v.photoNotes = { ...(v.photoNotes || {}), ...state.assign.notes };
  for (const [file, ids] of Object.entries(state.assign.photos)) {
    for (const s of v.sections) {
      const has = (s.photos || []).includes(file), want = ids.includes(s.id);
      if (want && !has) (s.photos ||= []).push(file);
      if (!want && has) s.photos = s.photos.filter(p => p !== file);
    }
  }
  return v;
}
function setVersion(id) {
  state.base = state.versions.find(v => v.version === id) || state.versions.at(-1);
  state.current = applyAssignments(state.base);
  const sel = $('version-select');
  sel.innerHTML = state.versions.map(v => `<option value="${v.version}" ${v.version === state.base.version ? 'selected' : ''}>${v.version}${v._local ? ' (browser only)' : ''}</option>`).join('');
  $('version-label').textContent = state.base.version + (state.working[state.base.version] ? ' · edited' : '');
  document.querySelector('[data-click=btn-plan]').classList.toggle('edited', !!state.working[state.base.version]);
  view.build(state.current);
  view.applyToggles(state.toggles);
  renderList(); renderGeneralComments(); renderVersionsMenu();
  if (state.selected && sectionById(state.selected)) selectSection(state.selected); else closeDetail();
}
function refreshCurrent() { state.current = applyAssignments(state.base); view.build(state.current); view.applyToggles(state.toggles); view.highlight(state.selected); refreshAll(); if (state.planOn) plan.render(); }
function sectionById(id) { return state.current.sections.find(s => s.id === id); }
function sectionsForPhoto(file) { return state.current.sections.filter(s => (s.photos || []).includes(file)).map(s => s.id); }

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
function commentsFor(sectionId) { const v = state.comments[state.base.version] ||= {}; return v[sectionId] ||= []; }
function addComment(sectionId, text) { commentsFor(sectionId).push({ id: Date.now().toString(36), text, created: new Date().toISOString(), done: false }); saveJSON(LS_COMMENTS, state.comments); }
function updateComment(sectionId, id, patch) {
  const list = commentsFor(sectionId); const i = list.findIndex(c => c.id === id); if (i < 0) return;
  if (patch === null) list.splice(i, 1); else Object.assign(list[i], patch);
  saveJSON(LS_COMMENTS, state.comments);
}
function renderComments(container, sectionId) {
  const list = commentsFor(sectionId);
  container.innerHTML = '';
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
function refreshAll() { renderList(); renderGeneralComments(); if (state.selected) renderDetail(sectionById(state.selected)); }
function renderGeneralComments() { renderComments($('general-comment-list'), 'general'); }
$('general-comment-form').onsubmit = e => { e.preventDefault(); const ta = e.target.querySelector('textarea'); if (ta.value.trim()) { addComment('general', ta.value.trim()); ta.value = ''; refreshAll(); } };

// ---------------------------------------------------------------------------
// Sidebar list
// ---------------------------------------------------------------------------
function renderList() {
  const q = $('filter').value.trim().toLowerCase();
  const root = $('section-list'); root.innerHTML = '';
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
      el.innerHTML = `<span class="swatch" style="background:${s.colors?.wall || s.colors?.floor || s.colors?.water || s.colors?.ground || '#888'}"></span><span>${esc(s.name.replace(' (unconfirmed)', ''))}</span>` +
        `<span class="badge">${(s.photos || []).length}📷</span>` + (n ? `<span class="badge comments">${n}</span>` : '') + (s.confirmed === false ? '<span class="badge unconfirmed">?</span>' : '');
      el.onclick = () => selectSection(s.id, true);
      root.appendChild(el);
    }
  }
}
$('filter').oninput = renderList;

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
function selectSection(id, fly = false) {
  const s = sectionById(id); if (!s) return;
  state.selected = id;
  view.highlight(id); renderList(); renderDetail(s);
  $('detail').classList.remove('hidden');
  if (state.planOn) { plan.select(id); return; }
  if (fly) view.flyTo(s);
  view.resize();
}
function closeDetail() { state.selected = null; view.highlight(null); $('detail').classList.add('hidden'); renderList(); view.resize(); }
$('detail-close').onclick = closeDetail;

function renderDetail(s) {
  const body = $('detail-body'); const b = s.box;
  const list = (arr) => arr?.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="muted">—</div>';
  const notes = (s.photos || []).map(p => state.current.photoNotes?.[p]).filter(Boolean);
  body.innerHTML = `
    <h2>${esc(s.name)}</h2>
    <div class="meta">${esc(s.group || '')} · ${s.kind} · ${s.confirmed === false ? '<span style="color:var(--warn)">unconfirmed — not photographed inside</span>' : 'confirmed from photos'}</div>
    <div class="meta">Footprint ~${b.w} × ${b.d} m (est.) at x ${b.x}, z ${b.z}${s.wallHeight ? ` · height ${s.wallHeight} m` : ''}${s.roof ? ` · roof ${s.roof.type}` : ''}</div>
    <h3>Description</h3><p>${esc(s.description || '')}</p>
    ${s.materials ? `<h3>Materials</h3>${list(s.materials)}` : ''}
    ${s.furniture ? `<h3>Furniture</h3>${list(s.furniture)}` : ''}
    ${s.planting ? `<h3>Planting</h3>${list(s.planting)}` : ''}
    ${s.openings?.length ? `<h3>Openings</h3>${list(s.openings.map(o => `${o.side} wall: ${o.type} ${o.from}–${o.to} m`))}` : ''}
    ${s.changes ? `<h3>Changes in this version</h3><p>${esc(s.changes)}</p>` : ''}
    ${notes.length ? `<h3>Photo notes</h3>${list(notes)}` : ''}
    <h3>Photos (${s.photos?.length || 0})</h3>
    <div class="thumbs">${(s.photos || []).map(p => `<img loading="lazy" src="${THUMB_DIR}${p}" data-file="${p}" alt="${esc(p)}" title="${esc(p)}">`).join('')}</div>
    <h3>Notes</h3>
    <div class="comment-list" id="section-comments"></div>
    <form class="comment-form" id="section-comment-form"><textarea rows="2" placeholder="Add a note"></textarea><button>Add</button></form>`;
  renderComments(body.querySelector('#section-comments'), s.id);
  body.querySelector('#section-comment-form').onsubmit = e => { e.preventDefault(); const ta = e.target.querySelector('textarea'); if (ta.value.trim()) { addComment(s.id, ta.value.trim()); refreshAll(); } };
  body.querySelectorAll('.thumbs img').forEach(img => img.onclick = () => openLightbox(img.dataset.file));
}

// ---------------------------------------------------------------------------
// Lightbox + modal
// ---------------------------------------------------------------------------
const lightbox = $('lightbox');
let lightboxFile = null;
function openLightbox(file) {
  lightboxFile = file;
  lightbox.querySelector('img').src = PHOTO_DIR + file;
  const secs = sectionsForPhoto(file).map(id => sectionById(id)?.name).filter(Boolean);
  lightbox.querySelector('.caption').textContent = `${file}${secs.length ? ' · ' + secs.join(', ') : ' · not assigned to a section yet'}`;
  $('lb-view').disabled = !state.current.photoSpots?.[file];
  lightbox.classList.remove('hidden');
}
$('lb-close').onclick = () => lightbox.classList.add('hidden');
lightbox.querySelector('img').onclick = () => lightbox.classList.add('hidden');
$('lb-view').onclick = () => { const spot = state.current.photoSpots?.[lightboxFile]; if (spot) { view.photoView(spot); lightbox.classList.add('hidden'); } };
$('lb-assign').onclick = () => { lightbox.classList.add('hidden'); openOnboarding(state.photos.indexOf(lightboxFile)); };
$('lb-compare').onclick = () => { lightbox.classList.add('hidden'); enterCompare(state.photos.indexOf(lightboxFile)); };

const modal = $('modal');
function openModal(title, html) { $('modal-title').textContent = title; $('modal-body').innerHTML = html; modal.classList.remove('hidden'); }
$('modal-close').onclick = () => modal.classList.add('hidden');
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

// ---------------------------------------------------------------------------
// Picking in the 3D view (section click, camera-marker click, spot placing)
// ---------------------------------------------------------------------------
const canvas = $('canvas');
let downPos = null;
canvas.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (view.isWalking()) return;
  if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 4) return;
  if (state.placing) return placeStep(e);
  const hit = view.pick(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.photo) return openLightbox(hit.photo);
  const best = hit.sectionIds.sort((a, b) => area(a) - area(b))[0];
  selectSection(best);
});
function area(id) { const s = sectionById(id); return s ? s.box.w * s.box.d : 1e9; }
function placeStep(e) {
  const p = view.groundPoint(e.clientX, e.clientY); if (!p) return;
  const pl = state.placing;
  if (pl.step === 'pos') {
    pl.spot = { x: +p.x.toFixed(1), y: 1.5, z: +p.z.toFixed(1) };
    pl.step = 'look';
    $('place-banner').textContent = `Camera placed at x ${pl.spot.x}, z ${pl.spot.z}. Now click the spot the photo is looking AT.`;
  } else {
    Object.assign(pl.spot, { lookX: +p.x.toFixed(1), lookY: 1.4, lookZ: +p.z.toFixed(1) });
    state.assign.spots[pl.file] = pl.spot; saveJSON(LS_ASSIGN, state.assign);
    state.placing = null; $('place-banner').classList.add('hidden');
    state.current.photoSpots[pl.file] = pl.spot; view.buildMarkers(state.current);
    $('onboard').classList.remove('hidden'); renderOnboarding();
  }
}

// ---------------------------------------------------------------------------
// Onboarding: walk every photo, tick the parts it shows, add what it tells us,
// place the camera. Saved to the browser and merged into the current version.
// ---------------------------------------------------------------------------
$('btn-onboard').onclick = () => openOnboarding(firstUnassigned());
$('onboard-close').onclick = () => { $('onboard').classList.add('hidden'); view.resize(); };
function firstUnassigned() { const i = state.photos.findIndex(f => !sectionsForPhoto(f).length); return i < 0 ? 0 : i; }
function openOnboarding(index) {
  state.onboardIndex = Math.max(0, Math.min(state.photos.length - 1, index));
  $('detail').classList.add('hidden'); $('onboard').classList.remove('hidden'); renderOnboarding(); view.resize();
}
function renderOnboarding() {
  const file = state.photos[state.onboardIndex];
  const assigned = new Set(sectionsForPhoto(file));
  const done = state.photos.filter(f => sectionsForPhoto(f).length).length;
  const spot = state.current.photoSpots?.[file];
  const groups = {};
  for (const s of state.current.sections) (groups[s.group || 'Other'] ||= []).push(s);
  $('onboard-body').innerHTML = `
    <h2>Photos</h2>
    <div class="meta">${state.onboardIndex + 1} of ${state.photos.length} · ${done} assigned</div>
    <div class="progress"><div style="width:${(done / state.photos.length) * 100}%"></div></div>
    <img class="ob-photo" src="${THUMB_DIR}${file}" alt="${esc(file)}" title="Click to enlarge">
    <div class="meta">${esc(file)}</div>
    <h3>Shows</h3>
    <div class="ob-sections">${Object.entries(groups).map(([g, list]) => `<div class="ob-group">${esc(g)}</div>` + list.map(s =>
      `<label class="ob-check"><input type="checkbox" value="${s.id}" ${assigned.has(s.id) ? 'checked' : ''}> ${esc(s.name.replace(' (unconfirmed)', ''))}</label>`).join('')).join('')}</div>
    <h3>Notes</h3>
    <textarea id="ob-note" rows="3" placeholder="What this photo tells us">${esc(state.current.photoNotes?.[file] || '')}</textarea>
    <h3>Camera</h3>
    <div class="meta">${spot ? `Camera at x ${spot.x}, z ${spot.z}, looking toward x ${spot.lookX ?? '?'}, z ${spot.lookZ ?? '?'}` : 'No camera spot yet.'}</div>
    <div class="actions">
      <button id="ob-place">Place on Plan</button>
      <button id="ob-useview">Use Current View</button>
      ${spot ? '<button id="ob-look">Look</button>' : ''}
      <button id="ob-compare">Compare</button>
    </div>
    <div class="actions ob-nav">
      <button id="ob-prev" ${state.onboardIndex === 0 ? 'disabled' : ''}>Previous</button>
      <button id="ob-skip">Next Unassigned</button>
      <button id="ob-next" class="primary">${state.onboardIndex === state.photos.length - 1 ? 'Done' : 'Next'}</button>
    </div>
    <div class="actions"><button id="ob-download">Download ${esc(state.base.version)}.json</button><button id="ob-reset">Reset</button></div>`;
  const save = () => {
    state.assign.photos[file] = [...$('onboard-body').querySelectorAll('.ob-sections input:checked')].map(i => i.value);
    const note = $('ob-note').value.trim();
    if (note) state.assign.notes[file] = note; else delete state.assign.notes[file];
    saveJSON(LS_ASSIGN, state.assign);
  };
  $('onboard-body').querySelector('.ob-photo').onclick = () => openLightbox(file);
  $('onboard-body').querySelectorAll('.ob-sections input').forEach(i => i.onchange = save);
  $('ob-note').onchange = save;
  $('ob-prev').onclick = () => { save(); refreshCurrent(); openOnboarding(state.onboardIndex - 1); };
  $('ob-next').onclick = () => { save(); refreshCurrent(); if (state.onboardIndex === state.photos.length - 1) { $('onboard').classList.add('hidden'); view.resize(); } else openOnboarding(state.onboardIndex + 1); };
  $('ob-skip').onclick = () => { save(); refreshCurrent(); const next = state.photos.findIndex((f, i) => i > state.onboardIndex && !sectionsForPhoto(f).length); openOnboarding(next < 0 ? firstUnassigned() : next); };
  $('ob-place').onclick = () => {
    save();
    state.placing = { file, step: 'pos', spot: null };
    $('onboard').classList.add('hidden'); view.resize(); view.topView();
    const b = $('place-banner'); b.textContent = `Placing ${file}: click where the camera WAS (top view). Esc to cancel.`; b.classList.remove('hidden');
  };
  if ($('ob-look')) $('ob-look').onclick = () => view.photoView(spot);
  $('ob-useview').onclick = () => { save(); saveSpot(file, view.getView()); renderOnboarding(); };
  $('ob-compare').onclick = () => { save(); enterCompare(state.onboardIndex); };
  $('ob-download').onclick = () => { save(); refreshCurrent(); download(`${state.base.version}.json`, JSON.stringify(stripLocal(state.current), null, 2)); };
  $('ob-reset').onclick = () => { if (confirm('Clear the photo assignments, notes and camera spots saved in this browser?')) { state.assign = { photos: {}, spots: {}, notes: {} }; saveJSON(LS_ASSIGN, state.assign); refreshCurrent(); renderOnboarding(); } };
}
function stripLocal(v) { const c = { ...v }; delete c._local; return c; }

// ---------------------------------------------------------------------------
// Compare: flick through photos next to (or over) the 3D view from the same spot
// ---------------------------------------------------------------------------
function saveSpot(file, spot) {
  state.assign.spots[file] = spot; saveJSON(LS_ASSIGN, state.assign);
  state.current.photoSpots ||= {}; state.current.photoSpots[file] = spot; view.buildMarkers(state.current);
}
function enterCompare(index) {
  if (state.planOn) exitPlan();
  const c = state.compare;
  c.on = true; c.index = Math.max(0, Math.min(state.photos.length - 1, index));
  $('detail').classList.add('hidden'); $('onboard').classList.add('hidden');
  viewport.classList.add('compare'); $('compare-bar').classList.remove('hidden');
  view.setFov(PHOTO_FOV); view.applyToggles({ ...state.toggles, labels: false, markers: false });
  renderCompare(true); seg('btn-compare');
}
function exitCompare() {
  state.compare.on = false;
  viewport.classList.remove('compare'); $('compare-bar').classList.add('hidden');
  $('compare-photo').classList.add('hidden'); $('overlay-photo').classList.add('hidden');
  view.setFov(DEFAULT_FOV); view.applyToggles(state.toggles); view.resize(); seg('btn-iso');
}
function renderCompare(goto) {
  const c = state.compare, file = state.photos[c.index];
  const spot = state.current.photoSpots?.[file];
  $('cmp-title').textContent = `${c.index + 1}/${state.photos.length} · ${file}`;
  $('compare-photo').classList.toggle('hidden', c.mode !== 'side');
  $('overlay-photo').classList.toggle('hidden', c.mode !== 'overlay');
  $('cmp-opacity-wrap').style.visibility = c.mode === 'overlay' ? 'visible' : 'hidden';
  $('cmp-mode-side').classList.toggle('active', c.mode === 'side');
  $('cmp-mode-overlay').classList.toggle('active', c.mode === 'overlay');
  $('compare-photo').querySelector('img').src = PHOTO_DIR + file;
  $('overlay-photo').src = PHOTO_DIR + file; $('overlay-photo').style.opacity = c.opacity;
  $('cmp-goto').disabled = !spot;
  const shows = sectionsForPhoto(file).map(id => state.current.sections.find(s => s.id === id)?.name || id);
  $('cmp-shows').textContent = shows.length ? 'Shows: ' + shows.join(', ') : 'Not assigned to a part yet';
  $('cmp-shows').classList.toggle('none', !shows.length);
  const note = $('cmp-note'); note.value = state.current.photoNotes?.[file] || ''; note.dataset.file = file; $('cmp-note-state').textContent = '';
  if (goto && spot) view.photoView(spot);
  view.resize();
}
// Per-photo comment (what it shows / where it was taken from), saved with the assignments and exported.
function savePhotoNote(file, text) {
  text = text.trim();
  if (text) state.assign.notes[file] = text; else delete state.assign.notes[file];
  saveJSON(LS_ASSIGN, state.assign);
  state.current.photoNotes ||= {}; if (text) state.current.photoNotes[file] = text; else delete state.current.photoNotes[file];
  if (state.selected) renderDetail(sectionById(state.selected));
}
let noteTimer = null;
$('cmp-note').oninput = e => {
  const file = e.target.dataset.file; if (!file) return;
  $('cmp-note-state').textContent = '…'; clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { savePhotoNote(file, e.target.value); $('cmp-note-state').textContent = 'Saved'; }, 400);
};
$('cmp-note').onblur = e => { const file = e.target.dataset.file; if (file) { clearTimeout(noteTimer); savePhotoNote(file, e.target.value); $('cmp-note-state').textContent = e.target.value.trim() ? 'Saved' : ''; } };
$('btn-compare').onclick = () => enterCompare(state.compare.index);
$('btn-walk').onclick = () => {
  if (view.isWalking()) return view.stopWalk();
  if (state.compare.on) exitCompare(); if (state.planOn) exitPlan();
  // start at the current camera if it is near the ground, else at the pool pavilion
  const p = view.camera.position; if (p.y > 6) { p.set(0, 1.6, -2.5); view.controls.target.set(0, 1.5, -10); }
  $('walk-banner').classList.remove('hidden'); document.querySelectorAll('[data-click=btn-walk]').forEach(b => b.classList.add('active'));
  seg('btn-walk');
  view.startWalk(() => { $('walk-banner').classList.add('hidden'); seg('btn-iso'); document.querySelectorAll('[data-click=btn-walk]').forEach(b => b.classList.remove('active')); });
};
$('cmp-close').onclick = exitCompare;
$('cmp-prev').onclick = () => { state.compare.index = (state.compare.index + state.photos.length - 1) % state.photos.length; renderCompare(true); };
$('cmp-next').onclick = () => { state.compare.index = (state.compare.index + 1) % state.photos.length; renderCompare(true); };
$('cmp-mode-side').onclick = () => { state.compare.mode = 'side'; renderCompare(false); };
$('cmp-mode-overlay').onclick = () => { state.compare.mode = 'overlay'; renderCompare(false); };
$('cmp-opacity').oninput = e => { state.compare.opacity = e.target.value / 100; $('cmp-opacity-val').textContent = e.target.value + '%'; $('overlay-photo').style.opacity = state.compare.opacity; };
$('cmp-goto').onclick = () => renderCompare(true);
$('cmp-save').onclick = () => { saveSpot(state.photos[state.compare.index], view.getView()); $('cmp-save').textContent = 'Saved'; setTimeout(() => $('cmp-save').textContent = 'Save Spot', 1200); renderCompare(false); };
$('cmp-assign').onclick = () => { const i = state.compare.index; exitCompare(); openOnboarding(i); };
addEventListener('keydown', e => {
  if (!state.compare.on || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') $('cmp-prev').click();
  if (e.key === 'ArrowRight') $('cmp-next').click();
  if (e.key === 'o') $('cmp-mode-overlay').click();
  if (e.key === 's') $('cmp-mode-side').click();
});

// ---------------------------------------------------------------------------
// Export — one bundle for an image-generation model
// ---------------------------------------------------------------------------
async function buildExport() {
  const v = state.current;
  const allComments = state.comments[state.base.version] || {};
  let reference = '';
  try { reference = await (await fetch('../docs/house-reference.md')).text(); } catch { reference = '(house-reference.md not reachable — serve the site from the repo root)'; }
  const open = (id) => (allComments[id] || []).filter(c => !c.done);
  const L = [];
  L.push(`# House mock-up — export of ${v.version} (${new Date().toISOString().slice(0, 10)})`, '');
  L.push('## How to use this document', '',
    'This is a complete description of a real beachfront house plus a list of requested changes. The goal is to produce (a) images of the house as it would look WITH the requested changes applied, and (b) an updated JSON model for the next version.', '',
    '1. Read the master description and the per-section details. `floorplan/floorplan.svg` is the plan (metres, sea at the top); `renders/` shows the current 3D model; `photos/by-part/<id>/` holds the real photos of each part, and `photos/INDEX.md` says where each was taken from.',
    '2. Apply every item under **Requested changes**. Open items are requests; items marked [done] are already reflected.',
    '3. For images: keep every material, colour and proportion that is not changed. The `photos` listed per section are the ground truth for what exists today; each photo also has a camera position in the coordinate system below and, where given, a note on what it shows.',
    '4. When you return changes, reply with ONE JSON object in the exact schema given at the end, under a heading `## RETURN JSON`, so it can be imported as the next version.', '');
  L.push('## Requested changes', '');
  const gen = open('general');
  if (gen.length) { L.push('### Whole house'); gen.forEach(c => L.push(`- ${c.text}`)); L.push(''); }
  for (const s of v.sections) { const cs = open(s.id); if (cs.length) { L.push(`### ${s.name} (\`${s.id}\`)`); cs.forEach(c => L.push(`- ${c.text}`)); L.push(''); } }
  if (!gen.length && !v.sections.some(s => open(s.id).length)) L.push('_No open change requests. Reproduce the house as described._', '');
  const noted = state.photos.filter(f => v.photoNotes?.[f]);
  if (noted.length) {
    L.push('## Photo comments', '', 'The owner\'s comments on individual photos: what each one really shows and where it was taken from. Where a comment contradicts the photo\'s current part assignment or camera position below, the comment is right: move the camera spot (return it under `photoSpots`), list the photo under the right section\'s `photos`, and correct the model to match what the photo shows.', '');
    for (const f of noted) {
      const sp = v.photoSpots?.[f]; const shows = sectionsForPhoto(f);
      L.push(`- **${f}** — ${v.photoNotes[f]}`);
      L.push(`  - currently: ${shows.length ? 'assigned to ' + shows.map(id => `\`${id}\``).join(', ') : 'not assigned to a part'}${sp ? `; camera at (${sp.x}, ${sp.z}) looking toward (${sp.lookX ?? '?'}, ${sp.lookZ ?? '?'})` : '; no camera spot'}`);
    }
    L.push('');
  }
  L.push('## Master description (from docs/house-reference.md)', '', reference, '');
  L.push('## Sections in detail', '');
  for (const s of v.sections) {
    L.push(`### ${s.name}  \`${s.id}\``);
    L.push(`- Kind: ${s.kind} · Group: ${s.group} · ${s.confirmed === false ? 'UNCONFIRMED (not photographed inside; layout is a guess)' : 'confirmed from photos'}`);
    L.push(`- Footprint (est.): ${s.box.w} × ${s.box.d} m, at x=${s.box.x}, z=${s.box.z}${s.wallHeight ? `; wall height ${s.wallHeight} m` : ''}${s.roof ? `; roof ${s.roof.type} ${s.roof.height} m` : ''}`);
    if (s.colors) L.push(`- Colours: ${Object.entries(s.colors).map(([k, c]) => `${k} ${c}`).join(', ')}`);
    L.push(`- ${s.description}`);
    if (s.materials?.length) L.push(`- Materials: ${s.materials.join('; ')}`);
    if (s.furniture?.length) L.push(`- Furniture: ${s.furniture.join('; ')}`);
    if (s.planting?.length) L.push(`- Planting: ${s.planting.join('; ')}`);
    if (s.openings?.length) L.push(`- Openings: ${s.openings.map(o => `${o.side} wall ${o.type} ${o.from}–${o.to} m`).join('; ')}`);
    if (s.props?.length) L.push(`- Modelled props: ${s.props.map(p => p.type).join(', ')}`);
    if (s.photos?.length) L.push(`- Photos: ${s.photos.join(', ')}`);
    const notes = (s.photos || []).map(p => v.photoNotes?.[p] ? `${p}: ${v.photoNotes[p]}` : null).filter(Boolean);
    if (notes.length) L.push(`- Photo notes: ${notes.join(' | ')}`);
    const done = (allComments[s.id] || []).filter(c => c.done);
    if (done.length) L.push(`- Already applied: ${done.map(c => '[done] ' + c.text).join('; ')}`);
    L.push('');
  }
  L.push('## Photo camera positions', '', 'Where each photo was taken from (x, z) and what it looks toward, in the coordinate system below. Camera height ~1.5 m.', '');
  for (const [f, sp] of Object.entries(v.photoSpots || {})) L.push(`- ${f}: from (${sp.x}, ${sp.z}) toward (${sp.lookX ?? '?'}, ${sp.lookZ ?? '?'})`);
  L.push('', '## Coordinate system', '', v.axes || '', '');
  L.push('## RETURN JSON schema', '',
    'Return one JSON object. Only include sections you changed or added; unchanged sections are carried over automatically. To remove a section set `"remove": true`. Props are small furniture items placed relative to the section box; openings are doors/windows along a wall side (`sea`, `land`, `left`, `right`) measured in metres from that wall\'s start.', '',
    '```json', JSON.stringify({
      version: nextVersionId(), basedOn: v.version, summary: 'One paragraph on what changed and why',
      sections: [{ id: 'existing-or-new-id', name: '…', kind: 'room|zone|pergola|porch|pool|bure|garden|ground|water', group: '…', confirmed: true,
        box: { x: 0, z: 0, w: 5, d: 5 }, wallHeight: 2.7, roof: { type: 'hip|gable|thatch|flat|none', height: 1.6 },
        colors: { wall: '#hex', floor: '#hex', roof: '#hex' }, description: '…', materials: ['…'], furniture: ['…'], photos: [],
        openings: [{ side: 'sea', type: 'bifold|door|screen|louvre|window', from: 0.5, to: 4.5 }],
        props: [{ type: 'sofa|armchair|coffee-table|dining-table|chair|island|bar-stool|bed|single-bed|wardrobe|chest|bean-bag|lounger|rocking-chair|bbq|pot|planter|desk|fridge|pantry|tv', x: 1, z: 1, rot: 0 }],
        changes: 'What changed in this section and why' }],
      photoSpots: { 'photo-file.jpg': { x: 0, y: 1.6, z: 0, lookX: 0, lookY: 1.4, lookZ: -5 } },
      imagePrompts: [{ view: 'e.g. pool pavilion looking to the bure', prompt: 'the full prompt you used' }]
    }, null, 2), '```', '',
    '`photoSpots` is optional: include only the photos whose camera position you corrected (see Photo comments).', '');
  L.push('## Current model JSON (for reference)', '', '```json', JSON.stringify(stripLocal(v), null, 2), '```');
  return L.join('\n');
}
function nextVersionId() { return 'v' + (Math.max(...state.versions.map(v => versionNum(v.version))) + 1); }
const RENDER_VIEWS = [
  ['from-the-sea', { x: -8, y: 3, z: -30, lookX: 0, lookY: 2, lookZ: 5 }],
  ['pool-pavilion-toward-bure', { x: -10, y: 1.6, z: -2, lookX: 10, lookY: 1.5, lookZ: -7 }],
  ['great-room-toward-sea', { x: -3.5, y: 1.6, z: 7.5, lookX: 2, lookY: 1.6, lookZ: -4 }],
  ['courtyard-from-entry', { x: 0, y: 1.6, z: 24, lookX: 0, lookY: 1.8, lookZ: 8 }],
  ['entry-porch', { x: 0, y: 1.6, z: 34, lookX: 0, lookY: 2.2, lookZ: 25 }],
  ['aerial', { x: -30, y: 24, z: -28, lookX: 0, lookY: 1, lookZ: 8 }],
];
// Minimal ZIP writer (store only — the payload is JPEGs, which don't compress). Fast, no deps.
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip() {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const dosTime = () => { const d = new Date(); return [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff]; };
  const u16 = (v) => [v & 0xff, (v >> 8) & 0xff], u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  return {
    file(name, data) {
      const bytes = typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
      const n = enc.encode(name); const crc = crc32(bytes); const [t, d] = dosTime();
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(t), ...u16(d), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(n.length), ...u16(0), ...n]);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(t), ...u16(d), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...n]));
      parts.push(local, bytes); offset += local.length + bytes.length;
    },
    blob() {
      const cdSize = central.reduce((a, c) => a + c.length, 0);
      const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
      return new Blob([...parts, ...central, end], { type: 'application/zip' });
    },
  };
}
const b64ToU8 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function buildPackage(onProgress) {
  const zip = makeZip();
  const v = state.current;
  const brief = await buildExport();
  zip.file('README.md', brief);
  zip.file(`model/${v.version}.json`, JSON.stringify(stripLocal(v), null, 2));
  zip.file('model/notes.json', JSON.stringify(state.comments[state.base.version] || {}, null, 2));
  for (const f of ['house-reference.md', 'photo-log.md', 'floor-plan-notes.md']) {
    try { zip.file('docs/' + f, await (await fetch('../docs/' + f)).text()); } catch {}
  }
  // floor plan
  onProgress('Drawing the floor plan…');
  const wasPlan = state.planOn; if (!wasPlan) { plan.render(); }
  const svgText = plan.toSVG();
  zip.file('floorplan/floorplan.svg', svgText);
  try { zip.file('floorplan/floorplan.png', b64ToU8(await svgToPng(svgText, 2400))); } catch (e) { console.warn('plan png failed', e); }
  // 3D renders
  onProgress('Rendering 3D views…');
  const savedCam = view.getView(); const savedToggles = { ...state.toggles };
  view.applyToggles({ ...state.toggles, labels: false, markers: false });
  for (const [name, spot] of RENDER_VIEWS) { view.photoView(spot); zip.file(`renders/${name}.jpg`, b64ToU8(view.snapshot().split(',')[1])); }
  view.applyToggles({ ...state.toggles, labels: false, markers: false, roofs: false }); view.topView();
  zip.file('renders/plan-roofs-off.jpg', b64ToU8(view.snapshot(1600, 1600).split(',')[1]));
  view.applyToggles(savedToggles); view.photoView(savedCam); view.setFov(state.compare.on ? PHOTO_FOV : DEFAULT_FOV);
  // photos, filed under every part they show
  const photoIndex = ['# Photos by part', '', 'Each photo is copied into the folder of every part it shows. `photos/all/` has every photo once.', ''];
  const blobs = {}; let fetched = 0;
  await Promise.all(state.photos.map(async f => {
    try { blobs[f] = new Uint8Array(await (await fetch(PHOTO_DIR + f)).arrayBuffer()); zip.file('photos/all/' + f, blobs[f]); } catch {}
    onProgress(`Packing photos… ${++fetched}/${state.photos.length}`);
  }));
  for (const s of v.sections) {
    if (!s.photos?.length) continue;
    photoIndex.push(`## ${s.name}  \`${s.id}\``);
    for (const f of s.photos) {
      if (blobs[f]) zip.file(`photos/by-part/${s.id}/${f}`, blobs[f]);
      const sp = v.photoSpots?.[f]; const note = v.photoNotes?.[f];
      photoIndex.push(`- ${f}${sp ? ` — camera at (${sp.x}, ${sp.z}) looking toward (${sp.lookX ?? '?'}, ${sp.lookZ ?? '?'})` : ''}${note ? ` — ${note}` : ''}`);
    }
    photoIndex.push('');
  }
  const unassigned = state.photos.filter(f => !sectionsForPhoto(f).length);
  if (unassigned.length) photoIndex.push('## Not assigned to a part', '', ...unassigned.map(f => `- ${f}`), '');
  zip.file('photos/INDEX.md', photoIndex.join('\n'));
  onProgress('Writing…');
  return zip.blob();
}
function svgToPng(svgText, width) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * img.height / img.width);
      const g = c.getContext('2d'); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = reject; img.src = url;
  });
}
$('btn-export').onclick = async () => {
  openModal(`Export — ${state.current.version}`, `
    <div class="note">One package with everything: the brief for the image model (README.md), the model JSON, notes, the floor plan (SVG + PNG), 3D renders, the reference docs, and every original photo filed under each part it shows.</div>
    <div class="export-tree"><pre>README.md                 brief: instructions, requested changes, every part in detail, photo camera positions, JSON schema to reply with
model/${state.current.version}.json             the model (edited layout included)
model/notes.json          your notes
floorplan/floorplan.svg   editable vector plan, metres
floorplan/floorplan.png   same, raster
renders/*.jpg             3D views: from the sea, pavilion, great room, courtyard, entry, aerial, plan with roofs off
docs/*.md                 house reference, photo log, floor-plan notes
photos/all/               all ${state.photos.length} originals
photos/by-part/&lt;part&gt;/   the same photos, copied under every part they show
photos/INDEX.md           photo → parts, camera positions, notes</pre></div>
    <div class="actions"><button class="primary" id="dl-package">Download Package (.zip)</button><button id="copy-brief">Copy Brief Only</button><span class="muted" id="export-status"></span></div>`);
  $('copy-brief').onclick = async () => { navigator.clipboard.writeText(await buildExport()); $('copy-brief').textContent = 'Copied'; };
  $('dl-package').onclick = async () => {
    const btn = $('dl-package'); btn.disabled = true;
    try {
      const blob = await buildPackage(msg => $('export-status').textContent = msg);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `house-${state.current.version}-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      $('export-status').textContent = `Done — ${(blob.size / 1048576).toFixed(1)} MB`;
    } catch (e) { $('export-status').textContent = 'Failed: ' + e.message; console.error(e); }
    btn.disabled = false;
  };
};
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); }

// ---------------------------------------------------------------------------
// Import — a JSON reply becomes the next version
// ---------------------------------------------------------------------------
$('btn-import').onclick = () => {
  openModal('Import a new version', `
    <div class="note">Paste the reply. Its JSON becomes the next version, based on <b>${state.current.version}</b>.</div>
    <textarea id="import-text" placeholder='{"version":"v2","basedOn":"v1","summary":"…","sections":[…]}'></textarea>
    <div class="actions"><button class="primary" id="do-import">Import</button><span class="muted" id="import-msg"></span></div>`);
  $('do-import').onclick = () => {
    try {
      const merged = mergeVersion(state.current, extractJSON($('import-text').value));
      const local = loadJSON(LS_VERSIONS, {}); local[merged.version] = merged; saveJSON(LS_VERSIONS, local);
      state.versions = state.versions.filter(v => v.version !== merged.version).concat([{ ...merged, _local: true }]).sort((a, b) => versionNum(a.version) - versionNum(b.version));
      download(`${merged.version}.json`, JSON.stringify(merged, null, 2));
      modal.classList.add('hidden'); setVersion(merged.version); showDiff(state.base);
    } catch (e) { $('import-msg').textContent = 'Could not import: ' + e.message; }
  };
};
function extractJSON(text) {
  const start = text.indexOf('{'); if (start < 0) throw new Error('no JSON object found');
  let depth = 0, inStr = false, escp = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (escp) escp = false; else if (ch === '\\') escp = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error('unbalanced JSON');
}
function mergeVersion(base, incoming) {
  if (!Array.isArray(incoming.sections)) throw new Error('"sections" array missing');
  const sections = base.sections.map(s => ({ ...s, changes: undefined }));
  for (const inc of incoming.sections) {
    if (!inc.id) throw new Error('a section has no id');
    const i = sections.findIndex(s => s.id === inc.id);
    if (inc.remove) { if (i >= 0) sections.splice(i, 1); continue; }
    if (i >= 0) sections[i] = { ...sections[i], ...inc, box: { ...sections[i].box, ...(inc.box || {}) }, colors: { ...sections[i].colors, ...(inc.colors || {}) } };
    else { if (!inc.box || !inc.kind || !inc.name) throw new Error(`new section "${inc.id}" needs name, kind and box`); sections.push({ confirmed: true, photos: [], group: 'New', ...inc }); }
  }
  return { version: incoming.version || nextVersionId(), basedOn: base.version, created: new Date().toISOString().slice(0, 10), summary: incoming.summary || '', units: base.units, axes: base.axes,
    photoSpots: { ...(base.photoSpots || {}), ...(incoming.photoSpots || {}) }, photoNotes: base.photoNotes, imagePrompts: incoming.imagePrompts || [], sections };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------
$('btn-diff').onclick = () => showDiff(state.base);
function showDiff(v) {
  const prev = state.versions.find(p => p.version === v.basedOn) || state.versions[state.versions.indexOf(v) - 1];
  if (!prev) return openModal(`Diff — ${v.version}`, '<div class="muted">This is the first version; nothing to compare against.</div>');
  const rows = [];
  const fields = ['name', 'kind', 'group', 'confirmed', 'box', 'wallHeight', 'roof', 'colors', 'description', 'materials', 'furniture', 'photos', 'openings', 'props'];
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
$('version-select').onchange = e => setVersion(e.target.value);
for (const k of ['wire', 'roofs', 'labels', 'markers']) $('toggle-' + k).onchange = e => { state.toggles[k] = e.target.checked; view.applyToggles(state.toggles); };
$('btn-top').onclick = () => { if (view.isWalking()) view.stopWalk(); if (state.compare.on) exitCompare(); if (state.planOn) exitPlan(); view.topView(); seg('btn-iso'); };
$('btn-iso').onclick = () => { if (view.isWalking()) view.stopWalk(); if (state.compare.on) exitCompare(); if (state.planOn) exitPlan(); view.resetView(); seg('btn-iso'); };
function seg(id) { document.querySelectorAll('#view-seg button').forEach(b => b.classList.toggle('active', b.dataset.click === id)); }
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  modal.classList.add('hidden'); lightbox.classList.add('hidden');
  if (state.compare.on && modal.classList.contains('hidden')) exitCompare();
  if (state.placing) { state.placing = null; $('place-banner').classList.add('hidden'); $('onboard').classList.remove('hidden'); renderOnboarding(); }
});

// ---------------------------------------------------------------------------
// 2D floor plan editor — edits state.current.sections; persisted as a working copy per version
// ---------------------------------------------------------------------------
let rebuildTimer = null;
const plan = createPlan($('plan'), {
  getVersion: () => state.current,
  onChange() {
    state.working[state.base.version] = JSON.parse(JSON.stringify(state.current.sections));
    saveJSON(LS_WORKING, state.working);
    $('version-label').textContent = state.base.version + ' · edited';
    document.querySelector('[data-click=btn-plan]').classList.add('edited');
    clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => { view.build(state.current); view.applyToggles(state.toggles); view.highlight(state.selected); renderList(); }, 150);
    renderPlanSelection();
  },
  onSelect(id) { state.selected = id; renderList(); renderPlanSelection(); if (id) { renderDetail(sectionById(id)); $('detail').classList.remove('hidden'); } else $('detail').classList.add('hidden'); },
});
function enterPlan() {
  if (view.isWalking()) view.stopWalk(); if (state.compare.on) exitCompare();
  state.planOn = true; $('plan').classList.remove('hidden'); $('stage-wrap').classList.add('hidden'); $('plan-bar').classList.remove('hidden'); $('hint').classList.add('hidden');
  plan.render(); plan.fit(); if (state.selected) plan.select(state.selected); seg('btn-plan');
}
function exitPlan() {
  state.planOn = false; $('plan').classList.add('hidden'); $('stage-wrap').classList.remove('hidden'); $('plan-bar').classList.add('hidden'); $('hint').classList.remove('hidden'); view.resize();
}
$('btn-plan').onclick = () => state.planOn ? ($('btn-iso').click()) : enterPlan();
$('btn-revert').onclick = () => { if (!state.working[state.base.version]) return; if (confirm(`Discard the plan edits made to ${state.base.version} in this browser?`)) { delete state.working[state.base.version]; saveJSON(LS_WORKING, state.working); refreshCurrent(); $('version-label').textContent = state.base.version; document.querySelector('[data-click=btn-plan]').classList.remove('edited'); } };
for (const t of PROP_TYPES) { const o = document.createElement('option'); o.value = t; o.textContent = t.replace('-', ' '); $('plan-prop-add').appendChild(o); }
for (const t of OPENING_TYPES) { const o = document.createElement('option'); o.value = t; o.textContent = t; $('plan-opening-add').appendChild(o); }
$('plan-prop-add').onchange = e => { if (e.target.value) { plan.startAddProp(e.target.value); $('plan-sel').textContent = `Click inside a room or area to place the ${e.target.value}`; } e.target.value = ''; };
$('plan-opening-add').onchange = e => { if (e.target.value) { plan.startAddOpening(e.target.value); $('plan-sel').textContent = `Click on a room wall to add the ${e.target.value}`; } e.target.value = ''; };
document.querySelectorAll('#plan-add button').forEach(b => b.onclick = () => { plan.startAddRoom(b.dataset.add); $('plan-sel').textContent = `Drag a rectangle to add a ${b.dataset.add}`; });
$('plan-snap').onchange = e => { const v = +e.target.value; plan.setSnapOn(v > 0); if (v > 0) plan.setSnap(v); };
$('plan-grid').onchange = e => plan.setGrid(e.target.checked);
$('plan-mirror').onclick = () => plan.mirrorSelected();
$('plan-undo').onclick = () => plan.undo();
$('plan-fit').onclick = () => plan.fit();
function renderPlanSelection() {
  const id = plan.selected(); const s = id && sectionById(id);
  const box = $('plan-sel');
  if (!s) { box.textContent = 'Nothing selected · drag to move · handles to resize · ⌫ delete · ⌘Z undo · shift-drag to pan · scroll to zoom'; return; }
  const pi = plan.selectedProp(), oi = plan.selectedOpening();
  if (pi != null && s.props?.[pi]) {
    const p = s.props[pi];
    box.innerHTML = `<b>${esc(s.name)}</b> › item <select id="ps-type">${PROP_TYPES.map(t => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}</select> at ${p.x}, ${p.z} · rot ${p.rot || 0}° <span class="muted">(R rotates · ⌘D duplicates)</span>`;
    box.querySelector('#ps-type').onchange = e => plan.setPropType(e.target.value); return;
  }
  if (oi != null && s.openings?.[oi]) {
    const o = s.openings[oi];
    box.innerHTML = `<b>${esc(s.name)}</b> › ${o.side} wall <select id="ps-otype">${OPENING_TYPES.map(t => `<option ${t === o.type ? 'selected' : ''}>${t}</option>`).join('')}</select> ${o.from}–${o.to} m`;
    box.querySelector('#ps-otype').onchange = e => plan.setOpeningType(e.target.value); return;
  }
  box.innerHTML = `<b>${esc(s.name)}</b> x <input id="ps-x" value="${s.box.x}"> z <input id="ps-z" value="${s.box.z}"> w <input id="ps-w" value="${s.box.w}"> d <input id="ps-d" value="${s.box.d}">`;
  for (const k of ['x', 'z', 'w', 'd']) box.querySelector('#ps-' + k).onchange = e => { const v = parseFloat(e.target.value); if (!isNaN(v)) plan.setBox({ [k]: v }); };
}

// ---------------------------------------------------------------------------
// Mac-style menu bar: menu items trigger the (hidden) controls by id
// ---------------------------------------------------------------------------
document.querySelectorAll('[data-click]').forEach(el => el.addEventListener('click', () => { closeMenus(); $(el.dataset.click).click(); }));
document.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => { const t = $(el.dataset.toggle); t.checked = !t.checked; t.dispatchEvent(new Event('change')); syncMenuChecks(); }));
function syncMenuChecks() { document.querySelectorAll('[data-toggle]').forEach(el => el.classList.toggle('checked', $(el.dataset.toggle).checked)); }
syncMenuChecks();
document.querySelectorAll('.menu-title').forEach(t => {
  t.addEventListener('click', e => { const open = t.parentElement.classList.contains('open'); closeMenus(); if (!open) t.parentElement.classList.add('open'); e.stopPropagation(); });
  t.addEventListener('mouseenter', () => { if (document.querySelector('.menu.open')) { closeMenus(); t.parentElement.classList.add('open'); } });
});
function closeMenus() { document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); }
addEventListener('click', closeMenus);
function renderVersionsMenu() {
  const m = $('versions-menu'); m.querySelectorAll('.ver').forEach(e => e.remove());
  for (const v of state.versions) { const b = document.createElement('button'); b.className = 'ver' + (v.version === state.base.version ? ' checked' : ''); b.textContent = `${v.version}${v._local ? ' (browser only)' : ''}`; b.onclick = () => { closeMenus(); setVersion(v.version); }; m.appendChild(b); }
}
$('btn-download').onclick = () => download(`${state.base.version}.json`, JSON.stringify(stripLocal(state.current), null, 2));
$('btn-help').onclick = () => openModal('Keyboard shortcuts', `<div class="shortcuts">
  <div><kbd>R</kbd> Reset view</div><div><kbd>T</kbd> Top / plan view</div><div><kbd>W</kbd> Walk through (then WASD, Shift, Q/E, Esc)</div>
  <div><kbd>P</kbd> Floor plan editor (⌫ delete, ⌘Z undo, R rotate item, arrows nudge)</div><div><kbd>C</kbd> Compare photos</div><div><kbd>A</kbd> Assign photos</div><div><kbd>←</kbd> <kbd>→</kbd> Previous / next photo in Compare</div>
  <div><kbd>O</kbd> / <kbd>S</kbd> Overlay / side-by-side in Compare</div><div><kbd>⌘E</kbd> Export</div><div><kbd>⌘I</kbd> Import version</div><div><kbd>Esc</kbd> Close / exit mode</div></div>`);
addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || view.isWalking()) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); $('btn-export').click(); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); $('btn-import').click(); }
  else if (e.metaKey || e.ctrlKey || e.altKey) return;
  else if (state.planOn && e.key !== 'p') return;
  else if (e.key === 'r') $('btn-iso').click(); else if (e.key === 't') $('btn-top').click(); else if (e.key === 'w') $('btn-walk').click(); else if (e.key === 'p') $('btn-plan').click();
  else if (e.key === 'c' && !state.compare.on) $('btn-compare').click(); else if (e.key === 'a') $('btn-onboard').click();
});

window.__house = { view, plan, state, selectSection, setVersion, openOnboarding, enterCompare, enterPlan };

// Warm the browser cache with every photo in the background, thumbnails first, a few at a
// time, so flicking through Compare is instant. Never blocks the UI.
function preloadPhotos() {
  const queue = [...state.photos.map(f => THUMB_DIR + f), ...state.photos.map(f => PHOTO_DIR + f)];
  let active = 0;
  const next = () => {
    while (active < 3 && queue.length) {
      const img = new Image(); active++;
      img.onload = img.onerror = () => { active--; next(); };
      img.src = queue.shift();
    }
  };
  ('requestIdleCallback' in window ? requestIdleCallback : setTimeout)(next);
}

(async function boot() {
  view.resetView();
  try { await loadVersions(); setVersion(state.versions.at(-1).version); preloadPhotos(); }
  catch (e) { $('hint').textContent = 'Serve the repository over HTTP to load the model. ' + e.message; console.error(e); }
})();
