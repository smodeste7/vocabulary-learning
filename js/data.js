// data.js — Chargement et accès aux JSON thématiques (source unique de vérité).
// Index chargé une fois ; mots de chaque thème chargés et cachés en mémoire.
// word_count est calculé au runtime (jamais saisi à la main dans themes.json).

let THEMES = [];                 // index (themes.json), enrichi de word_count
const wordsByTheme = new Map();  // themeId -> [words]
const themeOfWord = new Map();   // wordId -> themeId
const wordById = new Map();      // wordId -> word

// Charge l'index des thèmes ET les mots de chaque thème (6 petits fichiers, en parallèle).
// Appeler une fois au démarrage avant tout rendu.
export async function loadAll() {
  if (THEMES.length) return THEMES;
  const res = await fetch('data/themes.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('themes.json introuvable (' + res.status + ')');
  THEMES = await res.json();

  await Promise.all(THEMES.map(async (t) => {
    const r = await fetch(`data/themes/${t.id}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${t.id}.json introuvable (${r.status})`);
    const words = await r.json();
    words.forEach(w => { w.theme = t.id; themeOfWord.set(w.id, t.id); wordById.set(w.id, w); });
    wordsByTheme.set(t.id, words);
    t.word_count = words.length; // calcul runtime
  }));

  return THEMES;
}

// ── Catégories (parcours pédagogique) ──
// Ordre d'apprentissage conseillé ; les thèmes y sont rattachés via leur champ `category`.
export const CATEGORIES = [
  { id: 'bases',       label: 'Les bases',       icon: '🌱' },
  { id: 'quotidien',   label: 'Vie quotidienne', icon: '🏠' },
  { id: 'ville',       label: 'Dans la ville',   icon: '🏙️' },
  { id: 'nature',      label: 'Nature & monde',  icon: '🌍' },
  { id: 'communiquer', label: 'Communiquer',     icon: '💬' },
];

// Thèmes groupés par catégorie (dans l'ordre CATEGORIES). Les thèmes sans catégorie
// connue sont regroupés en fin sous « Autres » — robuste à l'ajout de nouveaux thèmes.
export function themesByCategory() {
  const groups = CATEGORIES.map(c => ({ ...c, themes: THEMES.filter(t => t.category === c.id) }));
  const known = new Set(CATEGORIES.map(c => c.id));
  const orphans = THEMES.filter(t => !known.has(t.category));
  if (orphans.length) groups.push({ id: 'autres', label: 'Autres', icon: '📦', themes: orphans });
  return groups.filter(g => g.themes.length);
}

// ── Lecture ──
export function themes() { return THEMES; }
export function theme(id) { return THEMES.find(t => t.id === id) || null; }
export function wordsOf(themeId) { return wordsByTheme.get(themeId) || []; }
export function word(id) { return wordById.get(id) || null; }
export function themeIdOf(wordId) { return themeOfWord.get(wordId) || null; }

// Tous les mots, tous thèmes confondus (révision multi-thèmes, distracteurs globaux).
export function allWords() {
  const out = [];
  THEMES.forEach(t => out.push(...wordsOf(t.id)));
  return out;
}

// Tire `n` distracteurs plausibles pour un mot : mêmes thème d'abord (jamais triviaux),
// complétés au global si nécessaire. On évite les doublons de traduction.
export function distractors(targetWord, n) {
  const sameTheme = wordsOf(targetWord.theme).filter(w => w.id !== targetWord.id);
  const pool = shuffle(sameTheme.slice());
  const chosen = [];
  const usedFr = new Set([norm(targetWord.word_fr)]);
  for (const w of pool) {
    if (usedFr.has(norm(w.word_fr))) continue;
    chosen.push(w); usedFr.add(norm(w.word_fr));
    if (chosen.length >= n) return chosen;
  }
  // Complète au global si le thème ne suffit pas.
  const rest = shuffle(allWords().filter(w => w.id !== targetWord.id && w.theme !== targetWord.theme));
  for (const w of rest) {
    if (usedFr.has(norm(w.word_fr))) continue;
    chosen.push(w); usedFr.add(norm(w.word_fr));
    if (chosen.length >= n) break;
  }
  return chosen;
}

function norm(s) { return (s || '').trim().toLowerCase(); }

// Fisher-Yates en place.
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
