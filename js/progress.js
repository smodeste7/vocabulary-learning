// progress.js — État utilisateur local (localStorage), source unique de la progression.
// C'est exactement cet objet qui est synchronisé sur Google Drive.
// Clé distincte de l'app alphabet : les deux apps cohabitent sans collision.

const KEY = 'darija-vocab-progress';
export const SCHEMA_VERSION = 1;

function freshState() {
  return {
    version: SCHEMA_VERSION,
    srs: {},          // { [wordId]: { box, nextReview, history:[{t,ok}] } }
    gamification: {
      xp: 0,
      streak: 0,
      bestStreak: 0,
      lastActivity: null,   // 'YYYY-MM-DD'
      badges: [],           // identifiants de badges débloqués
    },
    bosses: {},         // { [themeId]: { beaten, bestScore, lastScore, attempts } }
    stats: {
      cardsReviewed: 0,
      quizPlayed: 0,
      perfectQuizzes: 0,
      bossWins: 0,
      quizTypesUsed: [],  // ['A','B','C','D']
    },
    settings: { difficultyMax: 3 }, // filtre global flashcards : 1, 2 ou 3 (tout)
    meta: { lastSync: null, lastSyncTs: null },
  };
}

let state = freshState();
const listeners = new Set();

// ── Persistance locale ──
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('progress: lecture localStorage impossible, réinitialisation', e);
    state = freshState();
  }
  return state;
}

// Écrit SANS notifier (écritures internes de sync : évite une boucle de sync).
export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('progress: écriture localStorage impossible', e);
  }
}

// Écrit ET notifie : tout changement initié par l'utilisateur passe par ici
// (c'est ce qui déclenche la sync Drive auto + le rafraîchissement des badges).
export function save() {
  persist();
  listeners.forEach(fn => fn(state));
}

// Migration douce : complète les champs manquants sans rien perdre.
export function migrate(s) {
  const base = freshState();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base,
    ...s,
    srs: s.srs || {},
    gamification: { ...base.gamification, ...(s.gamification || {}), badges: (s.gamification && s.gamification.badges) || [] },
    bosses: s.bosses || {},
    stats: { ...base.stats, ...(s.stats || {}), quizTypesUsed: (s.stats && s.stats.quizTypesUsed) || [] },
    settings: { ...base.settings, ...(s.settings || {}) },
    meta: { ...base.meta, ...(s.meta || {}) },
    version: SCHEMA_VERSION,
  };
}

export function getState() { return state; }
export function setState(next) { state = migrate(next); persist(); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ── SRS : accès brut (l'algo vit dans srs.js) ──
export function srsFor(id) { return state.srs[id] || null; }
export function setSrs(id, entry) { state.srs[id] = entry; }
export function hasSeen(id) { return !!state.srs[id]; }

// Maîtrise d'un mot : 'new' | 'learning' | 'mastered' (boîte 4+).
export function mastery(id) {
  const e = state.srs[id];
  if (!e) return 'new';
  return e.box >= 4 ? 'mastered' : 'learning';
}
export function boxOf(id) { const e = state.srs[id]; return e ? e.box : 0; }

// ── % de maîtrise d'un thème (mots en boîte 4+ / total) ──
export function themeMasteryPercent(words) {
  if (!words.length) return 0;
  const mastered = words.filter(w => boxOf(w.id) >= 4).length;
  return Math.round((mastered / words.length) * 100);
}

// Part des mots du thème vus au moins une fois (sert au déblocage du boss : ≥ 80 %).
export function themeSeenPercent(words) {
  if (!words.length) return 0;
  const seen = words.filter(w => hasSeen(w.id)).length;
  return Math.round((seen / words.length) * 100);
}

// ── Gamification : XP & badges ──
export function addXp(n) { state.gamification.xp += n; }
export function xp() { return state.gamification.xp; }
export function badges() { return state.gamification.badges; }
export function hasBadge(id) { return state.gamification.badges.includes(id); }
export function addBadge(id) {
  if (!hasBadge(id)) { state.gamification.badges.push(id); return true; }
  return false;
}

// ── Stats ──
export function bumpStat(key, by = 1) { state.stats[key] = (state.stats[key] || 0) + by; }
export function markQuizType(type) {
  if (!state.stats.quizTypesUsed.includes(type)) state.stats.quizTypesUsed.push(type);
}
export function stats() { return state.stats; }

// ── Bosses ──
export function bossOf(themeId) {
  return state.bosses[themeId] || { beaten: false, bestScore: 0, lastScore: 0, attempts: 0 };
}
export function recordBoss(themeId, score, total, won) {
  const b = bossOf(themeId);
  b.attempts += 1;
  b.lastScore = score;
  b.bestScore = Math.max(b.bestScore || 0, score);
  if (won) b.beaten = true;
  state.bosses[themeId] = b;
}

// ── Réglages ──
export function settings() { return state.settings; }
export function setDifficultyMax(n) { state.settings.difficultyMax = n; save(); }

// ── Streak quotidien ──
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

// À appeler à chaque activité d'apprentissage. Renvoie true si un NOUVEAU jour
// vient d'être comptabilisé (pour créditer le +5 XP de streak une seule fois/jour).
export function touchStreak() {
  const g = state.gamification;
  const today = todayKey();
  if (g.lastActivity === today) return false;
  if (!g.lastActivity) g.streak = 1;
  else g.streak = daysBetween(g.lastActivity, today) === 1 ? g.streak + 1 : 1;
  g.lastActivity = today;
  g.bestStreak = Math.max(g.bestStreak || 0, g.streak);
  return true;
}

// Streak « vivant » : 0 si la dernière activité date d'avant-hier ou plus.
export function streakDisplay() {
  const g = state.gamification;
  if (!g.lastActivity) return 0;
  return daysBetween(g.lastActivity, todayKey()) <= 1 ? g.streak : 0;
}
export function bestStreak() { return state.gamification.bestStreak || 0; }

// ── Réinitialisations ──
export function reset() { state = freshState(); save(); }

// Réinitialise un seul thème : efface SRS de ses mots + son boss. Ne touche pas à l'XP.
export function resetTheme(words) {
  words.forEach(w => { delete state.srs[w.id]; });
  // Le boss du thème est retrouvé via son id sur le premier mot.
  if (words[0]) delete state.bosses[words[0].theme];
  save();
}
