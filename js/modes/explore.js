// explore.js — Mode « manuel » : consultation libre d'un thème.
// Routes : #explore/:theme (liste) et #explore/:theme?w=:wordId (fiche détaillée).

import * as data from '../data.js';
import * as progress from '../progress.js';
import { el, mount, header, playWord, registerBadge, toast } from '../ui.js';

// Filtres mémorisés le temps de la navigation (réinitialisés au changement de thème).
let filters = { q: '', diff: 0, reg: 'all', unmastered: false };
let filtersTheme = null;

export function renderExplore(ctx) {
  const themeId = ctx.param;
  const t = data.theme(themeId);
  if (!t) { location.hash = '#themes'; return; }
  if (filtersTheme !== themeId) { filters = { q: '', diff: 0, reg: 'all', unmastered: false }; filtersTheme = themeId; }

  if (ctx.query.w) return renderSheet(themeId, ctx.query.w);
  renderList(t);
}

function renderList(t) {
  const all = data.wordsOf(t.id);

  const search = el('input', {
    class: 'search', type: 'search', placeholder: '🔍 Rechercher…', value: filters.q,
    oninput: (e) => { filters.q = e.target.value; refreshRows(); },
  });

  const diffChips = el('div', { class: 'chips' },
    [['Tous', 0], ['• 1', 1], ['•• 2', 2], ['••• 3', 3]].map(([lbl, v]) =>
      chip(lbl, filters.diff === v, () => { filters.diff = v; renderList(t); })));

  const regChips = el('div', { class: 'chips' },
    [['Tous', 'all'], ['courant', 'courant'], ['familier', 'familier'], ['formel', 'formel'], ['argot', 'argot']].map(([lbl, v]) =>
      chip(lbl, filters.reg === v, () => { filters.reg = v; renderList(t); })));

  const unmasteredChip = chip('Non maîtrisés', filters.unmastered, () => { filters.unmastered = !filters.unmastered; renderList(t); });

  const list = el('div', { class: 'word-list', id: 'word-list' });

  function rowsFor() {
    return all.filter(matches).map(row);
  }
  function refreshRows() {
    const node = document.getElementById('word-list');
    if (!node) return;
    node.innerHTML = '';
    const rows = rowsFor();
    if (!rows.length) node.appendChild(el('p', { class: 'empty', text: 'Aucun mot ne correspond.' }));
    else rows.forEach(r => node.appendChild(r));
  }
  list.append(...(rowsFor().length ? rowsFor() : [el('p', { class: 'empty', text: 'Aucun mot ne correspond.' })]));

  mount(
    header(t.label, `${all.length} mots · ${progress.themeMasteryPercent(all)}% maîtrisé`, `#theme/${t.id}`),
    el('div', { class: 'filters' }, [
      search,
      diffChips,
      regChips,
      unmasteredChip,
    ]),
    list,
  );
}

function matches(w) {
  if (filters.diff && (w.difficulty || 1) !== filters.diff) return false;
  if (filters.reg !== 'all' && (w.register || 'courant') !== filters.reg) return false;
  if (filters.unmastered && progress.mastery(w.id) === 'mastered') return false;
  const q = filters.q.trim().toLowerCase();
  if (q) {
    const hay = `${w.word_ar} ${w.word_arabizi} ${w.word_fr} ${w.transliteration}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function row(w) {
  const m = progress.mastery(w.id);
  return el('button', {
    class: `word-row m-${m}`,
    onclick: () => { location.hash = `#explore/${w.theme}?w=${w.id}`; },
  }, [
    el('span', { class: 'dot' }),
    el('div', { class: 'word-main' }, [
      el('span', { class: 'ar', text: w.word_ar }),
      el('span', { class: 'arabizi', text: w.word_arabizi }),
    ]),
    el('span', { class: 'word-fr', text: w.word_fr }),
  ]);
}

function chip(label, active, onclick) {
  return el('button', { class: 'chip' + (active ? ' active' : ''), onclick }, label);
}

// ── Fiche détaillée d'un mot ──
function renderSheet(themeId, wordId) {
  const w = data.word(wordId);
  if (!w) { location.hash = `#explore/${themeId}`; return; }
  const list = data.wordsOf(themeId);
  const idx = list.findIndex(x => x.id === wordId);
  const prev = list[(idx - 1 + list.length) % list.length];
  const next = list[(idx + 1) % list.length];

  const examples = (w.examples || []).map(ex => el('div', { class: 'example' }, [
    el('div', { class: 'ex-top' }, [
      el('span', { class: 'ar', text: ex.sentence_ar }),
      el('button', { class: 'mini-audio', 'aria-label': 'Écouter la phrase', onclick: () => playWord(ex.audio_file, ex.sentence_ar) }, '🔊'),
    ]),
    el('p', { class: 'arabizi', text: ex.sentence_arabizi }),
    el('p', { class: 'ex-fr', text: ex.sentence_fr }),
  ]));

  mount(
    el('div', { class: 'sheet' }, [
      el('a', { href: `#explore/${themeId}`, class: 'back-link', text: '← Tous les mots' }),
      el('div', { class: 'big ar', text: w.word_ar }),
      el('button', { class: 'btn audio-btn', onclick: () => playWord(w.audio_file, w.word_ar) }, '🔊 Écouter'),
      el('p', { class: 'arabizi', text: w.word_arabizi }),
      el('p', { class: 'phon', text: w.transliteration }),
      el('h2', { class: 'sheet-fr', text: w.word_fr }),
      el('div', { class: 'sheet-tags' }, [
        registerBadge(w.register),
        el('span', { class: 'diff-badge', text: '•'.repeat(w.difficulty || 1) + ' niveau ' + (w.difficulty || 1) }),
      ]),
      w.notes ? el('div', { class: 'notes', html: '💡 ' + escapeHtml(w.notes) }) : null,
      examples.length ? el('h3', { class: 'ex-title', text: 'Exemples' }) : null,
      ...examples,
      el('div', { class: 'sheet-nav' }, [
        el('button', { class: 'btn', onclick: () => { location.hash = `#explore/${themeId}?w=${prev.id}`; } }, '← Précédent'),
        el('button', { class: 'btn', onclick: () => { location.hash = `#explore/${themeId}?w=${next.id}`; } }, 'Suivant →'),
      ]),
    ])
  );
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
