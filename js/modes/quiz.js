// quiz.js — 4 variantes. A: Arabe→FR · B: FR→Arabe · C: Écoute→FR · D: Phrase à trous.
// 10 questions, feedback immédiat, leurres plausibles (même thème en priorité).
// Param de route : un id de thème. Sous-route : ?type=A|B|C|D.

import * as data from '../data.js';
import * as srs from '../srs.js';
import * as progress from '../progress.js';
import * as gamification from '../gamification.js';
import { el, mount, header, playWord, buzz, toast } from '../ui.js';

const N = 10;

export function renderQuiz(ctx) {
  const themeId = ctx.param;
  const t = data.theme(themeId);
  if (!t) { location.hash = '#themes'; return; }

  const type = ctx.query.type;
  if (type && ['A', 'B', 'C', 'D'].includes(type)) return runQuiz(t, type);

  const card = (ty, title, sub) => el('a', { href: `#quiz/${t.id}?type=${ty}`, class: 'mode-card' }, [
    el('span', { class: 'mode-ico', text: ty }),
    el('div', { class: 'mode-meta' }, [el('h3', { text: title }), el('p', { text: sub })]),
  ]);

  mount(
    header(t.label, 'Choisis un type de quiz', `#theme/${t.id}`),
    el('div', { class: 'quiz-type' }, [
      card('A', 'Arabe → Français', 'On montre le mot, trouve la traduction'),
      card('B', 'Français → Arabe', 'On donne la traduction, trouve le mot'),
      card('C', 'Écoute → Français', 'Écoute le mot, trouve la traduction'),
      card('D', 'Phrase à trous', 'Complète la phrase avec le bon mot'),
    ])
  );
}

function runQuiz(t, type) {
  const pool = data.wordsOf(t.id);
  let deck;
  if (type === 'D') {
    // Seuls les mots dont l'arabizi apparaît dans un de leurs exemples conviennent.
    deck = pool
      .map(w => ({ w, ex: pickBlankable(w) }))
      .filter(x => x.ex)
      .sort(() => Math.random() - 0.5)
      .slice(0, N);
    if (deck.length === 0) {
      mount(
        header(t.label, 'Phrase à trous', `#quiz/${t.id}`),
        el('div', { class: 'empty' }, [
          el('p', { text: 'Ce thème n\'a pas encore assez de phrases d\'exemple pour ce quiz.' }),
          el('a', { href: `#quiz/${t.id}`, class: 'btn primary', text: 'Choisir un autre quiz' }),
        ])
      );
      return;
    }
  } else {
    deck = data.shuffle(pool.slice()).slice(0, N).map(w => ({ w }));
  }

  const total = deck.length;
  let i = 0, score = 0;

  function shell(promptNode, choices, isCorrect, onPick) {
    const feedback = el('div', { class: 'feedback' });
    const choiceEls = [];
    choices.forEach(c => {
      const btn = el('button', { class: 'choice' }, c.node);
      btn._value = c.value;
      btn.addEventListener('click', () => {
        choiceEls.forEach(b => b.setAttribute('disabled', 'true'));
        const ok = isCorrect(c.value);
        buzz(ok ? 12 : 30);
        btn.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) {
          const good = choiceEls.find(b => isCorrect(b._value));
          if (good) good.classList.add('correct');
        }
        if (ok) score++;
        onPick(ok);
        feedback.textContent = ok ? '✓ Correct' : '✗ Raté';
        feedback.className = 'feedback ' + (ok ? 'ok' : 'ko');
        setTimeout(() => { i++; next(); }, ok ? 700 : 1300);
      });
      choiceEls.push(btn);
    });
    mount(
      el('div', { class: 'quiz-head' }, [
        el('span', { text: `Question ${i + 1}/${total}` }),
        el('span', { text: `Score : ${score}` }),
      ]),
      promptNode,
      el('div', { class: 'choices' }, choiceEls),
      feedback,
    );
  }

  // 1 bonne réponse + 3 leurres plausibles, mélangés.
  function options(w) { return data.shuffle([w, ...data.distractors(w, 3)]); }

  function questionA(w) {
    shell(
      el('div', { class: 'quiz-prompt' }, [el('div', { class: 'ar', text: w.word_ar })]),
      options(w).map(o => ({ value: o.id, node: document.createTextNode(o.word_fr) })),
      (val) => val === w.id,
      (ok) => srs.grade(w.id, ok),
    );
  }

  function questionB(w) {
    shell(
      el('div', { class: 'quiz-prompt' }, [
        el('span', { class: 'label', text: 'Quel mot ?' }),
        el('div', { class: 'name', text: w.word_fr }),
      ]),
      options(w).map(o => ({ value: o.id, node: el('span', { class: 'ar', text: o.word_ar }) })),
      (val) => val === w.id,
      (ok) => srs.grade(w.id, ok),
    );
  }

  function questionC(w) {
    const prompt = el('div', { class: 'quiz-prompt' }, [
      el('span', { class: 'label', text: 'Écoute et choisis la traduction' }),
      el('button', { class: 'btn audio-btn big-audio', onclick: () => playWord(w.audio_file, w.word_ar) }, '🔊 Réécouter'),
    ]);
    playWord(w.audio_file, w.word_ar);
    shell(
      prompt,
      options(w).map(o => ({ value: o.id, node: document.createTextNode(o.word_fr) })),
      (val) => val === w.id,
      (ok) => srs.grade(w.id, ok),
    );
  }

  function questionD(entry) {
    const { w, ex } = entry;
    const blanked = ex.sentence_arabizi.replace(new RegExp(escapeRe(w.word_arabizi), 'i'), '____');
    shell(
      el('div', { class: 'quiz-prompt' }, [
        el('span', { class: 'label', text: ex.sentence_fr }),
        el('div', { class: 'cloze', text: blanked }),
      ]),
      options(w).map(o => ({ value: o.id, node: el('span', { class: 'ar', text: o.word_ar }) })),
      (val) => val === w.id,
      (ok) => srs.grade(w.id, ok),
    );
  }

  function next() {
    if (i >= total) return end();
    const entry = deck[i];
    if (type === 'A') questionA(entry.w);
    else if (type === 'B') questionB(entry.w);
    else if (type === 'C') questionC(entry.w);
    else questionD(entry);
  }

  function end() {
    const res = gamification.recordQuiz(score, total, type);
    if (res.newBadges.length) res.newBadges.forEach(b => toast(`${b.icon} Badge : ${b.label} !`, 'success'));
    const pct = Math.round((score / total) * 100);
    const msg = pct >= 80 ? '🏆 Excellent !' : pct >= 50 ? '👍 Pas mal !' : '💪 Continue !';
    mount(
      header(t.label, 'Quiz terminé', `#theme/${t.id}`),
      el('div', { class: 'recap' }, [
        el('p', { class: 'big-emoji', text: msg }),
        el('div', { class: 'recap-stats' }, [
          el('div', { class: 'recap-stat' }, [el('span', { class: 'stat-big', text: `${score}/${total}` }), el('span', { class: 'stat-small', text: 'bonnes' })]),
          el('div', { class: 'recap-stat' }, [el('span', { class: 'stat-big', text: `+${res.xpGained}` }), el('span', { class: 'stat-small', text: 'XP' })]),
        ]),
        el('button', { class: 'btn primary', onclick: () => runQuiz(t, type) }, 'Rejouer'),
        el('a', { href: `#quiz/${t.id}`, class: 'btn', text: 'Changer de quiz' }),
        el('a', { href: `#theme/${t.id}`, class: 'btn ghost', text: 'Retour au thème' }),
      ])
    );
  }

  next();
}

// Choisit un exemple où l'arabizi du mot apparaît tel quel (donc « trouable »).
function pickBlankable(w) {
  const exs = (w.examples || []).filter(e => e.sentence_arabizi && new RegExp(escapeRe(w.word_arabizi), 'i').test(e.sentence_arabizi));
  return exs.length ? exs[Math.floor(Math.random() * exs.length)] : null;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
