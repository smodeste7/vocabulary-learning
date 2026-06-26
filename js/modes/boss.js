// boss.js — Boss de fin de thème : gauntlet de 15 questions mêlant les 4 formats.
// Débloqué quand ≥ 80 % des mots du thème ont été vus. Victoire à 12/15 ou plus.
// Aucune erreur n'arrête la partie : on va au bout, puis on liste les mots ratés.

import * as data from '../data.js';
import * as srs from '../srs.js';
import * as progress from '../progress.js';
import * as gamification from '../gamification.js';
import { el, mount, header, playWord, buzz, toast } from '../ui.js';

const N = 15;
const WIN = 12;
const UNLOCK_PCT = 80;

export function renderBoss(ctx) {
  const t = data.theme(ctx.param);
  if (!t) { location.hash = '#themes'; return; }
  const words = data.wordsOf(t.id);
  const seenPct = progress.themeSeenPercent(words);

  if (seenPct < UNLOCK_PCT) {
    mount(
      header(t.label, 'Boss verrouillé', `#theme/${t.id}`),
      el('div', { class: 'empty' }, [
        el('p', { class: 'big-emoji', text: '🔒' }),
        el('p', { text: `Vu ${seenPct}% des mots — il en faut ${UNLOCK_PCT}% pour défier le boss.` }),
        el('p', { class: 'muted', text: 'Passe par les flashcards pour découvrir les mots restants.' }),
        el('a', { href: `#flashcard/${t.id}`, class: 'btn primary', text: 'Réviser ce thème' }),
      ])
    );
    return;
  }

  if (ctx.query.go === '1') return runBoss(t, words);

  const b = progress.bossOf(t.id);
  mount(
    header(t.label, 'Boss de fin de thème', `#theme/${t.id}`),
    el('div', { class: 'boss-intro' }, [
      el('p', { class: 'big-emoji', text: b.beaten ? '👑' : '⚔️' }),
      el('p', { text: `${N} questions, tous formats mêlés. Atteins ${WIN}/${N} pour vaincre le boss.` }),
      b.beaten ? el('p', { class: 'pos', text: `✓ Déjà vaincu — meilleur score ${b.bestScore}/${N}` })
               : (b.attempts ? el('p', { class: 'muted', text: `Dernier essai : ${b.lastScore}/${N} · ${b.attempts} tentative(s)` }) : null),
      el('a', { href: `#boss/${t.id}?go=1`, class: 'btn primary', text: b.beaten ? 'Réaffronter le boss' : 'Lancer le combat' }),
    ])
  );
}

function runBoss(t, words) {
  // 15 questions : on cycle les formats A,B,C,D sur des mots tirés au hasard.
  const order = data.shuffle(words.slice());
  const specs = [];
  for (let k = 0; k < N; k++) {
    const w = order[k % order.length];
    let fmt = ['A', 'B', 'C', 'D'][k % 4];
    let ex = null;
    if (fmt === 'D') { ex = pickBlankable(w); if (!ex) fmt = 'A'; } // repli si non « trouable »
    specs.push({ w, fmt, ex });
  }

  let i = 0, score = 0;
  const missed = [];

  function shell(promptNode, choices, isCorrect, w) {
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
          missed.push(w);
        }
        if (ok) score++;
        srs.grade(w.id, ok);
        feedback.textContent = ok ? '✓ Correct' : '✗ Raté';
        feedback.className = 'feedback ' + (ok ? 'ok' : 'ko');
        setTimeout(() => { i++; next(); }, ok ? 600 : 1100);
      });
      choiceEls.push(btn);
    });
    mount(
      el('div', { class: 'quiz-head boss-head' }, [
        el('span', { text: `⚔️ ${i + 1}/${N}` }),
        el('span', { class: missed.length ? 'err' : '', text: `Score : ${score}` }),
      ]),
      promptNode,
      el('div', { class: 'choices' }, choiceEls),
      feedback,
    );
  }

  function options(w) { return data.shuffle([w, ...data.distractors(w, 3)]); }

  function ask(spec) {
    const { w, fmt, ex } = spec;
    if (fmt === 'A') {
      shell(el('div', { class: 'quiz-prompt' }, [el('div', { class: 'ar', text: w.word_ar })]),
        options(w).map(o => ({ value: o.id, node: document.createTextNode(o.word_fr) })), v => v === w.id, w);
    } else if (fmt === 'B') {
      shell(el('div', { class: 'quiz-prompt' }, [el('span', { class: 'label', text: 'Quel mot ?' }), el('div', { class: 'name', text: w.word_fr })]),
        options(w).map(o => ({ value: o.id, node: el('span', { class: 'ar', text: o.word_ar }) })), v => v === w.id, w);
    } else if (fmt === 'C') {
      const prompt = el('div', { class: 'quiz-prompt' }, [
        el('span', { class: 'label', text: 'Écoute et choisis la traduction' }),
        el('button', { class: 'btn audio-btn big-audio', onclick: () => playWord(w.audio_file, w.word_ar) }, '🔊 Réécouter'),
      ]);
      playWord(w.audio_file, w.word_ar);
      shell(prompt, options(w).map(o => ({ value: o.id, node: document.createTextNode(o.word_fr) })), v => v === w.id, w);
    } else {
      const blanked = ex.sentence_arabizi.replace(new RegExp(escapeRe(w.word_arabizi), 'i'), '____');
      shell(el('div', { class: 'quiz-prompt' }, [el('span', { class: 'label', text: ex.sentence_fr }), el('div', { class: 'cloze', text: blanked })]),
        options(w).map(o => ({ value: o.id, node: el('span', { class: 'ar', text: o.word_ar }) })), v => v === w.id, w);
    }
  }

  function next() {
    if (i >= N) return end();
    ask(specs[i]);
  }

  function end() {
    const won = score >= WIN;
    const res = gamification.recordBoss(t.id, score, N, won);
    if (res.newBadges.length) res.newBadges.forEach(b => toast(`${b.icon} Badge : ${b.label} !`, 'success'));

    if (won) {
      mount(
        header(t.label, 'Boss vaincu !', `#theme/${t.id}`),
        el('div', { class: 'recap victory' }, [
          el('p', { class: 'crown', text: '👑' }),
          el('h2', { text: 'Thème validé !' }),
          el('div', { class: 'recap-stats' }, [
            el('div', { class: 'recap-stat' }, [el('span', { class: 'stat-big', text: `${score}/${N}` }), el('span', { class: 'stat-small', text: 'score' })]),
            el('div', { class: 'recap-stat' }, [el('span', { class: 'stat-big', text: `+${res.xpGained}` }), el('span', { class: 'stat-small', text: 'XP' })]),
          ]),
          el('a', { href: '#themes', class: 'btn primary', text: 'Autres thèmes' }),
          el('a', { href: `#theme/${t.id}`, class: 'btn ghost', text: 'Retour au thème' }),
        ])
      );
    } else {
      const uniqMissed = [...new Map(missed.map(w => [w.id, w])).values()];
      mount(
        header(t.label, 'Boss pas encore vaincu', `#theme/${t.id}`),
        el('div', { class: 'recap' }, [
          el('p', { class: 'big-emoji', text: '💥' }),
          el('p', { text: `${score}/${N} — il faut ${WIN} pour vaincre le boss.` }),
          uniqMissed.length ? el('h3', { class: 'ex-title', text: 'Mots à revoir' }) : null,
          uniqMissed.length ? el('div', { class: 'missed-list' }, uniqMissed.map(w => el('div', { class: 'missed' }, [
            el('span', { class: 'ar', text: w.word_ar }),
            el('span', { class: 'word-fr', text: w.word_fr }),
          ]))) : null,
          el('a', { href: `#flashcard/${t.id}`, class: 'btn primary', text: 'Réviser puis réessayer' }),
          el('a', { href: `#boss/${t.id}?go=1`, class: 'btn', text: 'Réessayer maintenant' }),
        ])
      );
    }
  }

  next();
}

function pickBlankable(w) {
  const exs = (w.examples || []).filter(e => e.sentence_arabizi && new RegExp(escapeRe(w.word_arabizi), 'i').test(e.sentence_arabizi));
  return exs.length ? exs[Math.floor(Math.random() * exs.length)] : null;
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
