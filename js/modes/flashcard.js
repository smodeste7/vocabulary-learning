// flashcard.js — Révision SRS. Recto (mot arabe) → tap pour révéler → noter (✓/✗)
// par bouton ou swipe. Param de route : un id de thème, ou "all" (révision multi-thèmes).

import * as data from '../data.js';
import * as srs from '../srs.js';
import * as progress from '../progress.js';
import * as gamification from '../gamification.js';
import { el, mount, header, playWord, buzz, toast } from '../ui.js';

const SESSION_MAX = 15;

export function renderFlashcard(ctx) {
  const scope = ctx.param || 'all';
  const pool = scope === 'all' ? data.allWords() : data.wordsOf(scope);
  const t = scope === 'all' ? null : data.theme(scope);
  const backHref = t ? `#theme/${t.id}` : '#home';
  const title = t ? t.label : 'Révision du jour';

  const session = srs.buildSession(pool, SESSION_MAX);
  if (session.length === 0) {
    mount(
      header(title, 'Flashcards', backHref),
      el('div', { class: 'empty' }, [
        el('p', { class: 'big-emoji', text: '🎉' }),
        el('p', { text: 'Rien à réviser pour le moment !' }),
        el('p', { class: 'muted', text: 'Reviens plus tard, ou explore de nouveaux mots.' }),
        el('a', { href: backHref, class: 'btn primary', text: 'Retour' }),
      ])
    );
    return;
  }
  runSession(session, title, backHref);
}

function runSession(session, title, backHref) {
  let i = 0;
  let revealed = false;
  let known = 0;
  let xpTotal = 0;

  function done() {
    const newBadges = gamification.evaluateBadges();
    progress.save();
    if (newBadges.length) newBadges.forEach(b => toast(`${b.icon} Badge : ${b.label} !`, 'success'));

    mount(
      header(title, 'Session terminée', backHref),
      el('div', { class: 'recap' }, [
        el('p', { class: 'big-emoji', text: '✓' }),
        el('div', { class: 'recap-stats' }, [
          recapStat(`${known}/${session.length}`, 'su(s)'),
          recapStat(`+${xpTotal}`, 'XP'),
        ]),
        el('a', { href: '#home', class: 'btn primary', text: 'Accueil' }),
        el('button', { class: 'btn', onclick: () => renderFlashcard({ param: backHref.startsWith('#theme/') ? backHref.split('/')[1] : 'all', query: {} }) }, 'Nouvelle session'),
      ])
    );
  }

  function grade(ok) {
    if (!revealed) return;
    buzz(ok ? 12 : 30);
    srs.grade(session[i].id, ok);
    const r = gamification.recordReview(ok);
    xpTotal += r.xpGained;
    if (ok) known++;
    i++;
    revealed = false;
    if (i >= session.length) done();
    else draw();
  }

  function draw() {
    const w = session[i];
    const example = (w.examples && w.examples.length) ? w.examples[Math.floor(Math.random() * w.examples.length)] : null;
    const card = el('div', { class: 'fc-card' }, []);

    function renderFront() {
      card.innerHTML = '';
      card.append(
        el('div', { class: 'ar', text: w.word_ar }),
        el('p', { class: 'fc-hint', text: 'Touche pour révéler' }),
      );
    }
    function renderBack() {
      card.innerHTML = '';
      card.append(
        el('div', { class: 'ar small', text: w.word_ar }),
        el('div', { class: 'fc-reveal' }, [
          el('p', { class: 'arabizi', text: w.word_arabizi }),
          el('h2', { text: w.word_fr }),
          el('p', { class: 'phon', text: w.transliteration }),
        ]),
        el('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); playWord(w.audio_file, w.word_ar); } }, '🔊 Écouter'),
        example ? el('div', { class: 'fc-example' }, [
          el('div', { class: 'ex-top' }, [
            el('p', { class: 'ar', text: example.sentence_ar }),
            el('button', { class: 'mini-audio', 'aria-label': 'Écouter la phrase', onclick: (e) => { e.stopPropagation(); playWord(example.audio_file, example.sentence_ar); } }, '🔊'),
          ]),
          el('p', { class: 'ex-fr', text: example.sentence_fr }),
        ]) : null,
        el('p', { class: 'fc-hint', text: 'Swipe ← à revoir · → je savais' }),
      );
    }

    card.addEventListener('click', () => { if (!revealed) { revealed = true; renderBack(); } });
    attachSwipe(card, grade, () => revealed);
    renderFront();

    mount(
      el('p', { class: 'fc-progress', text: `${i + 1} / ${session.length}` }),
      card,
      el('div', { class: 'fc-actions' }, [
        el('button', { class: 'btn nope', onclick: () => grade(false) }, '✗ À revoir'),
        el('button', { class: 'btn know', onclick: () => grade(true) }, '✓ Je savais'),
      ]),
    );
  }

  draw();
}

function recapStat(big, small) {
  return el('div', { class: 'recap-stat' }, [
    el('span', { class: 'stat-big', text: big }),
    el('span', { class: 'stat-small', text: small }),
  ]);
}

// Swipe horizontal. Ne note qu'après révélation (isReady).
function attachSwipe(card, grade, isReady) {
  let startX = 0, startY = 0, dx = 0, dragging = false;
  card.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; dragging = true;
  }, { passive: true });
  card.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (isReady()) card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
  }, { passive: true });
  card.addEventListener('touchend', () => {
    dragging = false;
    card.style.transform = '';
    if (!isReady()) return;
    if (Math.abs(dx) > 80) grade(dx > 0);
  });
}
