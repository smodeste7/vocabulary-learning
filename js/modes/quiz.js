// quiz.js — 4 variantes. A: Arabe→FR · B: FR→Arabe · C: Écoute→(FR|arabizi|arabe) · D: Phrase à trous (arabizi|arabe).
// 10 questions, feedback immédiat, leurres plausibles (même thème en priorité).
// Routes : #quiz/:theme · sous-route ?type=A|B|C|D (&level=… pour C et D).

import * as data from '../data.js';
import * as srs from '../srs.js';
import * as progress from '../progress.js';
import * as gamification from '../gamification.js';
import { el, mount, header, playWord, buzz, toast } from '../ui.js';

const N = 10;

// Niveaux de réponse (script) pour les quiz C et D.
const C_LEVELS = { fr: 'Français', arabizi: 'Arabizi', ar: 'Arabe' };
const D_LEVELS = { arabizi: 'Arabizi', ar: 'Arabe' };

export function renderQuiz(ctx) {
  const t = data.theme(ctx.param);
  if (!t) { location.hash = '#themes'; return; }

  const type = ctx.query.type;
  if (type && ['A', 'B', 'C', 'D'].includes(type)) {
    const level = ctx.query.level || (type === 'C' ? 'fr' : type === 'D' ? 'ar' : null);
    return runQuiz(t, type, level);
  }

  const card = (href, ico, title, sub) => el('a', { href, class: 'mode-card' }, [
    el('span', { class: 'mode-ico', text: ico }),
    el('div', { class: 'mode-meta' }, [el('h3', { text: title }), el('p', { text: sub })]),
  ]);

  mount(
    header(t.label, 'Choisis un type de quiz', `#theme/${t.id}`),
    el('div', { class: 'quiz-type' }, [
      card(`#quiz/${t.id}?type=A`, 'A', 'Arabe → Français', 'On montre le mot, trouve la traduction'),
      card(`#quiz/${t.id}?type=B`, 'B', 'Français → Arabe', 'On donne la traduction, trouve le mot'),

      el('p', { class: 'quiz-group-label', text: '🔊 Écoute → … (Quiz C)' }),
      card(`#quiz/${t.id}?type=C&level=fr`, 'C', 'Écoute → Français', 'Niveau 1 · réponses en français'),
      card(`#quiz/${t.id}?type=C&level=arabizi`, 'C', 'Écoute → Arabizi', 'Niveau 2 · réponses en arabizi'),
      card(`#quiz/${t.id}?type=C&level=ar`, 'C', 'Écoute → Arabe', 'Niveau 3 · réponses en arabe'),

      el('p', { class: 'quiz-group-label', text: '✍️ Phrase à trous (Quiz D)' }),
      card(`#quiz/${t.id}?type=D&level=arabizi`, 'D', 'Phrase à trous · Arabizi', 'Phrase et choix en arabizi'),
      card(`#quiz/${t.id}?type=D&level=ar`, 'D', 'Phrase à trous · Arabe', 'Phrase et choix en arabe'),
    ])
  );
}

function runQuiz(t, type, level) {
  const pool = data.wordsOf(t.id);
  let deck;
  if (type === 'D') {
    deck = pool
      .map(w => ({ w, ex: pickBlankable(w, level) }))
      .filter(x => x.ex)
      .sort(() => Math.random() - 0.5)
      .slice(0, N);
    if (deck.length === 0) {
      mount(
        quitBar(t),
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
      quitBar(t),
      el('div', { class: 'quiz-head' }, [
        el('span', { text: `Question ${i + 1}/${total}` }),
        el('span', { text: `Score : ${score}` }),
      ]),
      promptNode,
      el('div', { class: 'choices' }, choiceEls),
      feedback,
    );
  }

  function options(w) { return data.shuffle([w, ...data.distractors(w, 3)]); }

  // Rend une proposition selon le script demandé (fr / arabizi / ar).
  function choiceNode(o, script) {
    if (script === 'fr') return document.createTextNode(o.word_fr);
    if (script === 'arabizi') return document.createTextNode(o.word_arabizi);
    return el('span', { class: 'ar', text: o.word_ar });
  }

  function questionA(w) {
    shell(
      el('div', { class: 'quiz-prompt' }, [el('div', { class: 'ar', text: w.word_ar })]),
      options(w).map(o => ({ value: o.id, node: choiceNode(o, 'fr') })),
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
      options(w).map(o => ({ value: o.id, node: choiceNode(o, 'ar') })),
      (val) => val === w.id,
      (ok) => srs.grade(w.id, ok),
    );
  }

  // Quiz C : on joue l'audio, les propositions sont dans le script du niveau choisi.
  function questionC(w) {
    const prompt = el('div', { class: 'quiz-prompt' }, [
      el('span', { class: 'label', text: `Écoute et choisis · ${C_LEVELS[level] || 'Français'}` }),
      el('button', { class: 'btn audio-btn big-audio', onclick: () => playWord(w.audio_file, w.word_ar) }, '🔊 Réécouter'),
    ]);
    playWord(w.audio_file, w.word_ar);
    shell(
      prompt,
      options(w).map(o => ({ value: o.id, node: choiceNode(o, level) })),
      (val) => val === w.id,
      (ok) => srs.grade(w.id, ok),
    );
  }

  // Quiz D : phrase à trous dans le script du niveau ; choix dans le même script.
  function questionD(entry) {
    const { w, ex } = entry;
    const sentence = level === 'arabizi' ? ex.sentence_arabizi : ex.sentence_ar;
    const target = level === 'arabizi' ? w.word_arabizi : w.word_ar;
    const blanked = sentence.replace(new RegExp(escapeRe(target), 'i'), '____');
    shell(
      el('div', { class: 'quiz-prompt' }, [
        el('span', { class: 'label', text: ex.sentence_fr }),
        el('div', { class: level === 'arabizi' ? 'cloze cloze-latin' : 'cloze', text: blanked }),
      ]),
      options(w).map(o => ({ value: o.id, node: choiceNode(o, level) })),
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
    const replayHref = `#quiz/${t.id}?type=${type}${level ? `&level=${level}` : ''}`;
    mount(
      header(t.label, 'Quiz terminé', `#theme/${t.id}`),
      el('div', { class: 'recap' }, [
        el('p', { class: 'big-emoji', text: msg }),
        el('div', { class: 'recap-stats' }, [
          el('div', { class: 'recap-stat' }, [el('span', { class: 'stat-big', text: `${score}/${total}` }), el('span', { class: 'stat-small', text: 'bonnes' })]),
          el('div', { class: 'recap-stat' }, [el('span', { class: 'stat-big', text: `+${res.xpGained}` }), el('span', { class: 'stat-small', text: 'XP' })]),
        ]),
        el('a', { href: replayHref, class: 'btn primary', text: 'Rejouer' }),
        el('a', { href: `#quiz/${t.id}`, class: 'btn', text: 'Changer de quiz' }),
        el('a', { href: `#theme/${t.id}`, class: 'btn ghost', text: 'Retour au thème' }),
      ])
    );
  }

  next();
}

// Barre supérieure avec bouton Quitter (retour au hub du thème).
function quitBar(t) {
  return el('div', { class: 'quiz-topbar' }, [
    el('a', { href: `#theme/${t.id}`, class: 'quit-btn', 'aria-label': 'Quitter le quiz' }, '✕ Quitter'),
  ]);
}

// Exemple « trouable » : le mot apparaît tel quel dans la phrase, dans le script du niveau.
function pickBlankable(w, level) {
  const field = level === 'arabizi' ? 'sentence_arabizi' : 'sentence_ar';
  const target = level === 'arabizi' ? w.word_arabizi : w.word_ar;
  const exs = (w.examples || []).filter(e => e[field] && new RegExp(escapeRe(target), 'i').test(e[field]));
  return exs.length ? exs[Math.floor(Math.random() * exs.length)] : null;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
