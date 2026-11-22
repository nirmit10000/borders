// Collapsible map panels (decisions P1 and P2, 22 Nov 2026).
//   Every floating panel (the top bar, Layers, tools, base maps, the status bar) folds to a slim tab with its
//   title; one click on the tab restores it. Folds are remembered per viewer (localStorage).
//   "Clean map" (key H, or the tool button) hides every panel, the side panel included, and one button (or H
//   again) brings them all back. On the phone the top bar starts folded to a one-line chip with the current choice.
import { esc } from '../scales.js';
import { lensOf } from '../lens.js';

const KEY = 'borders.folds';
const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
let CTX = null;
let folds = {};

const TITLES = {
  lensbar: () => barSummary(),
  tools: () => 'Tools',
  bases: () => 'Base map',
  statusbar: () => 'Scale',
};
const FOLD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const OPEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** One line for the folded top bar: which map, which level, and what the map is coloured by. */
function barSummary() {
  const { S, VMETA, VERS, cfg } = CTX;
  const st = S.get();
  const ver = st.compare ? `${VMETA[VERS[0]].label} | ${VMETA[VERS[VERS.length - 1]].label}` : st.ver === 'both' ? 'Both maps' : VMETA[st.ver]?.label || '';
  const lv = cfg.boundaries.levels[st.level]?.label || '';
  const l = lensOf(st);
  const what = l.none ? '' : ` · ${l.label} ${l.mode === 'change' ? `${l.from}–${l.year}` : l.year}`;
  return `${ver} · ${lv}${what}`;
}

function load() {
  try { folds = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { folds = {}; }
  // the phone starts with the top bar folded to its chip (P2), unless the viewer has chosen otherwise
  if (isMobile() && folds.lensbar_m == null) folds.lensbar_m = true;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(folds)); } catch { /* private mode */ } }
// the phone and the desktop keep separate memories for the top bar (it is much bigger on a phone)
const fkey = (id) => (id === 'lensbar' && isMobile() ? 'lensbar_m' : id);

/** The tab (shown when folded) and the fold button (shown when open) inside a panel; re-added if a render wiped them. */
export function foldControls(id) {
  const t = TITLES[id] ? TITLES[id]() : id;
  return `<button class="fold-btn" data-fold="${id}" title="Fold this panel (H hides all)" aria-label="Fold this panel">${FOLD_SVG}</button>`
    + `<button class="ftab" data-unfold="${id}" title="Show this panel" aria-label="Show ${esc(t)}"><span>${esc(t)}</span>${OPEN_SVG}</button>`;
}

function ensure(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!el.querySelector(`:scope > [data-fold="${id}"]`)) el.insertAdjacentHTML('beforeend', foldControls(id));
  return el;
}

function apply(id) {
  const el = ensure(id);
  if (!el) return;
  const on = !!folds[fkey(id)];
  el.classList.toggle('folded', on);
  const tab = el.querySelector(`:scope > [data-unfold="${id}"] span`);
  if (tab && TITLES[id]) tab.textContent = TITLES[id]();
}

export function setFold(id, on) {
  folds[fkey(id)] = !!on;
  save();
  apply(id);
}

export function refreshFolds() { if (CTX) Object.keys(TITLES).forEach(apply); }

// ---- clean map -------------------------------------------------------------------------------------
function setClean(on) {
  const app = document.getElementById('app');
  if (app.classList.contains('clean') === !!on) return;
  app.classList.toggle('clean', !!on);
  document.getElementById('cleanExit').hidden = !on;
  document.querySelectorAll('[data-tool="clean"]').forEach((b) => b.classList.toggle('on', !!on));
  if (on) document.getElementById('tip').hidden = true;
  // the desktop map widens when the side panel goes: let MapLibre re-measure
  setTimeout(() => CTX.act.resize?.(), 320);
}
export const toggleClean = () => setClean(!document.getElementById('app').classList.contains('clean'));

export function initFolds(ctx) {
  CTX = ctx;
  load();
  const stage = document.getElementById('stage');
  stage.insertAdjacentHTML('beforeend', '<button class="clean-exit" id="cleanExit" hidden title="Show every panel again (H)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>Show panels</span></button>');
  document.getElementById('cleanExit').onclick = () => setClean(false);

  stage.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fold]');
    if (f) { e.stopPropagation(); setFold(f.dataset.fold, true); return; }
    const u = e.target.closest('[data-unfold]');
    if (u) { e.stopPropagation(); setFold(u.dataset.unfold, false); }
  }, true);

  // Layers keeps its own header as its tab; remember whether it is open (desktop only: the phone opens it on demand)
  const lens = document.getElementById('lens');
  if (!isMobile() && folds.lens) { lens.classList.add('closed'); document.getElementById('lensToggle').setAttribute('aria-expanded', 'false'); }
  new MutationObserver(() => { if (!isMobile()) { folds.lens = lens.classList.contains('closed'); save(); } }).observe(lens, { attributes: true, attributeFilter: ['class'] });

  // panels whose content is re-rendered get their fold controls back afterwards
  for (const id of ['bases', 'lensbar']) {
    const el = document.getElementById(id);
    if (el) new MutationObserver(() => { if (!el.querySelector(`:scope > [data-fold="${id}"]`)) apply(id); }).observe(el, { childList: true });
  }
  ctx.S.on(null, () => { if (folds[fkey('lensbar')]) apply('lensbar'); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'h' && e.key !== 'H') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    toggleClean();
  });
  ctx.act.clean = toggleClean;
  refreshFolds();
}
