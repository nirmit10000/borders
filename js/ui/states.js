// State picker: the "Maharashtra ▾" button in the side panel (always visible, also in the phone's collapsed
// sheet) opens this list of every state on the site, with a filter. Choosing one opens that state's page.
import { esc } from '../scales.js';

let CTX = null;
let dlg;
let list;
let filter;

export function initStates(ctx) {
  CTX = ctx;
  dlg = document.getElementById('stateDlg');
  list = document.getElementById('stateList');
  filter = document.getElementById('stateFilter');
  if (!dlg || ctx.cfg.states.length < 2) return;
  filter.addEventListener('input', render);
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const b = list.querySelector('button'); if (b) choose(b.dataset.code); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-code]'); if (b) choose(b.dataset.code); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-sd="close"]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) close(); });
  ctx.act.openStates = open;
}

function render() {
  const q = filter.value.trim().toLowerCase();
  const { cfg, STATE } = CTX;
  const rows = cfg.states.filter((s) => !q || s.name.toLowerCase().includes(q));
  list.innerHTML = rows.map((s) => {
    const maps = s.versions.map((v) => v.label).join(' v ');
    return `<button class="sd-row${s.code === STATE.code ? ' on' : ''}" data-code="${s.code}">
      <span class="sd-name">${esc(s.name)}${s.status === 'draft' ? ' <small>draft</small>' : ''}</span>
      <span class="sd-maps">${esc(maps)}</span>${s.code === STATE.code ? '<span class="sd-here">open</span>' : ''}</button>`;
  }).join('') || '<div class="sd-empty">No state matches</div>';
}

function open() {
  filter.value = '';
  render();
  dlg.hidden = false;
  // on a phone, don't pop the keyboard up over the list; on a desktop, type at once
  if (!window.matchMedia('(hover: none)').matches) filter.focus();
  list.querySelector('.on')?.scrollIntoView({ block: 'center' });
}

function close() { dlg.hidden = true; }

function choose(code) {
  close();
  if (code === CTX.STATE.code) { CTX.act.clearSelection(); return; }
  CTX.act.switchState(code);
}
