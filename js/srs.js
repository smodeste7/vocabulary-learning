// srs.js — Répétition espacée, Leitner à 5 boîtes.
// Bonne réponse → +1 boîte ; mauvaise → retour boîte 1. Boîte 5 = maîtrisé.

import * as progress from './progress.js';

// Intervalle de révision (en jours) par boîte. Boîte 1 = chaque session (0 jour).
const INTERVAL_DAYS = { 1: 0, 2: 2, 3: 4, 4: 7, 5: 14 };
const MAX_BOX = 5;
const DAY_MS = 86400000;

function now() { return Date.now(); }

function freshEntry() { return { box: 1, nextReview: now(), history: [] }; }

// Enregistre une réponse pour un mot. `ok` = vrai si bien su.
// Renvoie l'entrée mise à jour. NE persiste PAS (le mode appelant groupe la sauvegarde).
export function grade(wordId, ok) {
  const e = progress.srsFor(wordId) || freshEntry();
  e.history = e.history || [];
  e.history.push({ t: now(), ok });
  if (e.history.length > 30) e.history = e.history.slice(-30);
  e.box = ok ? Math.min(e.box + 1, MAX_BOX) : 1;
  e.nextReview = now() + INTERVAL_DAYS[e.box] * DAY_MS;
  progress.setSrs(wordId, e);
  return e;
}

// Mots à réviser aujourd'hui parmi `words` : jamais vus OU nextReview dépassé.
export function dueToday(words) {
  const t = now();
  return words.filter(w => {
    const e = progress.srsFor(w.id);
    return !e || e.nextReview <= t;
  });
}

export function dueCount(words) { return dueToday(words).length; }

// File de session : mots dus, filtrés par difficulté (réglage global), boîtes basses
// d'abord, limitée à `max`.
export function buildSession(words, max = 15) {
  const maxDiff = progress.settings().difficultyMax || 3;
  const due = dueToday(words).filter(w => (w.difficulty || 1) <= maxDiff);
  due.sort((a, b) => boxOf(a.id) - boxOf(b.id));
  return due.slice(0, max);
}

export function boxOf(wordId) {
  const e = progress.srsFor(wordId);
  return e ? e.box : 1;
}

export { MAX_BOX, INTERVAL_DAYS };
