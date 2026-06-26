// gamification.js — XP, niveaux (titres en Darija), badges, streaks.
// Centralise les récompenses : les modes appellent record*() et reçoivent
// l'XP gagnée + les badges fraîchement débloqués (pour l'animation/toast).

import * as progress from './progress.js';
import * as data from './data.js';

// ── Barème XP ──
const XP = {
  flashcardOk: 2,
  flashcardKo: 0,
  quizBase: 10,
  quizPerCorrect: 2,   // bonus proportionnel au score
  bossWin: 50,
  streakDay: 5,        // crédité une seule fois par jour
};

// ── Titres de niveau (signature éditoriale en Darija) ──
// Chaque palier s'applique à partir de son niveau jusqu'au suivant.
const TITLES = [
  { lvl: 1,  name: 'Moustafid',  sub: 'débutant' },
  { lvl: 5,  name: 'Tolba',      sub: 'étudiant' },
  { lvl: 10, name: 'Mfaker',     sub: 'celui qui réfléchit' },
  { lvl: 20, name: '3arif',      sub: 'celui qui sait' },
  { lvl: 30, name: 'Moul Darija', sub: 'maître de la Darija' },
];
const MAX_LEVEL = 30;

// XP cumulée nécessaire pour ATTEINDRE le niveau n (courbe calibrée sur les
// jalons du cahier des charges : ~200 à L5, ~600 à L10, ~2000 à L20, ~5000 à L30).
function xpForLevel(n) {
  if (n <= 1) return 0;
  const k = n - 1;
  return Math.round(5.3 * k * k + 19 * k);
}

// Infos de niveau dérivées de l'XP : niveau, titre, progression vers le suivant.
export function levelInfo(totalXp = progress.xp()) {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xpForLevel(lvl + 1) <= totalXp) lvl++;
  const title = [...TITLES].reverse().find(t => t.lvl <= lvl) || TITLES[0];
  const cur = xpForLevel(lvl);
  const next = lvl >= MAX_LEVEL ? cur : xpForLevel(lvl + 1);
  const span = Math.max(1, next - cur);
  const pct = lvl >= MAX_LEVEL ? 100 : Math.round(((totalXp - cur) / span) * 100);
  return { level: lvl, name: title.name, sub: title.sub, xp: totalXp, nextXp: next, pct, max: lvl >= MAX_LEVEL };
}

// ── Récompenses ──
// Crédite le bonus de streak si c'est la première activité du jour. Renvoie l'XP du bonus.
function maybeStreakBonus() {
  if (progress.touchStreak()) { progress.addXp(XP.streakDay); return XP.streakDay; }
  return 0;
}

// Une carte de flashcard notée. Ne sauvegarde pas (le mode groupe la persistance).
export function recordReview(ok) {
  const before = levelInfo().level;
  const gain = (ok ? XP.flashcardOk : XP.flashcardKo) + maybeStreakBonus();
  progress.addXp(ok ? XP.flashcardOk : XP.flashcardKo);
  progress.bumpStat('cardsReviewed');
  return { xpGained: gain, leveledUp: levelInfo().level > before };
}

// Un quiz terminé (score/total, type A–D).
export function recordQuiz(score, total, type) {
  const before = levelInfo().level;
  const base = XP.quizBase + score * XP.quizPerCorrect;
  progress.addXp(base);
  progress.bumpStat('quizPlayed');
  progress.markQuizType(type);
  if (score === total) progress.bumpStat('perfectQuizzes');
  const gain = base + maybeStreakBonus();
  const newBadges = evaluateBadges();
  progress.save();
  return { xpGained: gain, newBadges, leveledUp: levelInfo().level > before };
}

// Un boss terminé.
export function recordBoss(themeId, score, total, won) {
  const before = levelInfo().level;
  progress.recordBoss(themeId, score, total, won);
  let gain = 0;
  if (won) { progress.addXp(XP.bossWin); gain += XP.bossWin; progress.bumpStat('bossWins'); }
  gain += maybeStreakBonus();
  const newBadges = evaluateBadges();
  progress.save();
  return { xpGained: gain, newBadges, leveledUp: levelInfo().level > before };
}

// ── Badges ──
// Définition des badges globaux. Les badges thématiques sont générés par thème.
const GLOBAL_BADGES = [
  { id: 'streak_7',    icon: '🔥', label: 'Acharnement', test: () => progress.bestStreak() >= 7 || progress.streakDisplay() >= 7 },
  { id: 'quiz_master', icon: '⚡', label: 'Quiz Master', test: () => progress.stats().perfectQuizzes >= 5 },
  { id: 'polymorphe',  icon: '🎭', label: 'Polymorphe',  test: () => (progress.stats().quizTypesUsed || []).length >= 4 },
];

export function themeBadgeDefs(themeId) {
  const words = data.wordsOf(themeId);
  return [
    { id: `discovery_${themeId}`, icon: '🌱', label: 'Découverte',   test: () => words.length > 0 && words.every(w => progress.hasSeen(w.id)) },
    { id: `learning_${themeId}`,  icon: '🌟', label: 'Apprentissage', test: () => words.length > 0 && words.every(w => progress.boxOf(w.id) >= 3) },
    { id: `mastery_${themeId}`,   icon: '👑', label: 'Maîtrise',      test: () => progress.bossOf(themeId).beaten },
  ];
}

// Toutes les définitions (globales + une série par thème).
function allBadgeDefs() {
  const defs = [...GLOBAL_BADGES];
  data.themes().forEach(t => defs.push(...themeBadgeDefs(t.id)));
  return defs;
}

// Évalue toutes les conditions et débloque les nouveaux badges. Renvoie les nouveaux
// (pour l'animation). N'appelle PAS save() (les record* le font).
export function evaluateBadges() {
  const unlocked = [];
  allBadgeDefs().forEach(def => {
    if (!progress.hasBadge(def.id) && def.test()) {
      progress.addBadge(def.id);
      unlocked.push(def);
    }
  });
  return unlocked;
}

// Métadonnées d'un badge par id (pour l'affichage dans les réglages / profil).
export function badgeMeta(id) {
  return allBadgeDefs().find(d => d.id === id) || { id, icon: '🏅', label: id };
}

export { TITLES, MAX_LEVEL };
