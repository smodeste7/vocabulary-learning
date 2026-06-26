// app.js — Initialisation, routeur hash, écrans Accueil / Thèmes / Hub thème / Réglages.

import * as data from './data.js';
import * as progress from './progress.js';
import * as srs from './srs.js';
import * as gamification from './gamification.js';
import * as gdrive from './gdrive.js';
import { el, mount, header, toast } from './ui.js';

import { renderExplore } from './modes/explore.js';
import { renderFlashcard } from './modes/flashcard.js';
import { renderQuiz } from './modes/quiz.js';
import { renderBoss } from './modes/boss.js';

const ROUTES = {
  home: renderHome,
  themes: renderThemes,
  theme: renderThemeHub,
  explore: renderExplore,
  flashcard: renderFlashcard,
  quiz: renderQuiz,
  boss: renderBoss,
  settings: renderSettings,
};

// ── Démarrage ──
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  progress.load();
  try {
    await data.loadAll();
  } catch (e) {
    mount(el('div', { class: 'fatal' }, [
      el('h1', { text: 'Erreur' }),
      el('p', { text: e.message }),
      el('p', { class: 'muted', text: 'Lance un serveur local (pas file://).' }),
    ]));
    return;
  }

  // Sync auto (debounce) à chaque changement d'état si Drive est connecté.
  let syncTimer = null;
  progress.onChange(() => {
    updateBadge();
    if (!gdrive.isConnected()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => gdrive.saveProgress(), 1500);
  });

  gdrive.init(); // non bloquant

  window.addEventListener('hashchange', route);
  updateBadge();
  route();
}

// ── Routeur ──
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || 'home';
  const [path, queryStr = ''] = raw.split('?');
  const parts = path.split('/');
  const query = {};
  queryStr.split('&').forEach(kv => {
    if (!kv) return;
    const [k, v] = kv.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { name: parts[0] || 'home', param: parts[1] ? decodeURIComponent(parts[1]) : null, query };
}

function route() {
  const ctx = parseHash();
  const render = ROUTES[ctx.name] || renderHome;
  setActiveTab(ctx.name);
  document.getElementById('watermark').style.display = ctx.name === 'home' ? '' : 'none';
  render(ctx);
}

function setActiveTab(name) {
  const tabFor = { home: 'home', themes: 'themes', theme: 'themes', explore: 'themes', quiz: 'themes', boss: 'themes', flashcard: 'flashcard', settings: 'settings' };
  const active = tabFor[name] || 'home';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === active));
}

// Badge « à réviser » (total multi-thèmes) sur l'onglet Réviser.
function updateBadge() {
  const n = srs.dueCount(data.allWords());
  const badge = document.getElementById('due-badge');
  if (!badge) return;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
}

// ── Accueil / Tableau de bord ──
function renderHome() {
  const words = data.allWords();
  const lvl = gamification.levelInfo();
  const streak = progress.streakDisplay();
  const due = srs.dueCount(words);

  // Filigrane : mot du jour (stable sur la journée).
  const daily = words[dayOfYear() % words.length];
  document.getElementById('watermark').textContent = daily.word_ar;

  mount(
    el('div', { class: 'home' }, [
      el('header', { class: 'home-head' }, [
        el('p', { class: 'eyebrow', text: 'Darija Vocabulaire' }),
        el('h1', { html: `Mot du jour&nbsp;: <span class="ar">${daily.word_ar}</span>` }),
        el('p', { class: 'daily-name', text: `${daily.word_arabizi} — ${daily.word_fr}` }),
      ]),

      // Carte niveau + XP
      el('div', { class: 'level-card' }, [
        el('div', { class: 'level-top' }, [
          el('span', { class: 'level-name', text: `Niv. ${lvl.level} · ${lvl.name}` }),
          el('span', { class: 'level-xp', text: lvl.max ? `${lvl.xp} XP` : `${lvl.xp} / ${lvl.nextXp} XP` }),
        ]),
        el('div', { class: 'xpbar' }, [el('div', { class: 'xpbar-fill', style: `width:${lvl.pct}%` })]),
        el('p', { class: 'level-sub muted small', text: lvl.sub }),
      ]),

      // Stats clés
      el('div', { class: 'stats' }, [
        stat('🔥 ' + streak, streak > 1 ? 'jours' : 'jour'),
        stat(String(due), 'à réviser'),
        stat(String(progress.badges().length), 'badges'),
      ]),

      el('a', { href: '#flashcard/all', class: 'btn primary cta', text: due ? `⇄ Réviser maintenant (${due})` : '⇄ Réviser maintenant' }),

      ...themeSections(),

      el('a', { href: '#settings', class: 'settings-link', text: '⚙︎ Réglages & synchronisation' }),
    ])
  );
}

// Sections de thèmes groupées par catégorie (parcours pédagogique), réutilisées
// sur l'accueil et l'écran Thèmes.
function themeSections() {
  return data.themesByCategory().map(g =>
    el('section', { class: 'cat-section' }, [
      el('h2', { class: 'cat-title' }, [
        el('span', { class: 'cat-ico', 'aria-hidden': 'true', text: g.icon }),
        el('span', { text: g.label }),
      ]),
      el('div', { class: 'theme-grid' }, g.themes.map(themeCard)),
    ]));
}

function stat(big, small) {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-big', text: big }),
    el('span', { class: 'stat-small', text: small }),
  ]);
}

// ── Grille des thèmes ──
function renderThemes() {
  mount(
    header('Thèmes', `${data.themes().length} thèmes · ${data.allWords().length} mots`),
    ...themeSections(),
  );
}

function themeCard(t) {
  const words = data.wordsOf(t.id);
  const pct = progress.themeMasteryPercent(words);
  const due = srs.dueCount(words);
  const beaten = progress.bossOf(t.id).beaten;
  return el('a', { href: `#theme/${t.id}`, class: 'theme-card' }, [
    el('span', { class: 'theme-ico', text: t.icon }),
    beaten ? el('span', { class: 'theme-crown', title: 'Boss vaincu', text: '👑' }) : null,
    due ? el('span', { class: 'theme-due', text: String(due) }) : null,
    el('h3', { text: t.label }),
    el('p', { class: 'theme-count muted small', text: `${words.length} mots · ${pct}%` }),
    el('div', { class: 'mini-bar' }, [el('div', { class: 'mini-bar-fill', style: `width:${pct}%` })]),
  ]);
}

// ── Hub d'un thème : 4 modes + badges ──
function renderThemeHub(ctx) {
  const t = data.theme(ctx.param);
  if (!t) { location.hash = '#themes'; return; }
  const words = data.wordsOf(t.id);
  const pct = progress.themeMasteryPercent(words);
  const seenPct = progress.themeSeenPercent(words);
  const bossLocked = seenPct < 80 && !progress.bossOf(t.id).beaten;
  const due = srs.dueCount(words);

  const modeCard = (href, icon, title, sub, locked) =>
    el(locked ? 'div' : 'a', { href: locked ? null : href, class: 'mode-card' + (locked ? ' locked' : '') }, [
      el('span', { class: 'mode-ico', text: locked ? '🔒' : icon }),
      el('div', { class: 'mode-meta' }, [el('h3', { text: title }), el('p', { text: sub })]),
    ]);

  const themeBadges = gamification.themeBadgeDefs(t.id).map(def =>
    el('span', { class: 'badge-chip' + (progress.hasBadge(def.id) ? ' got' : ''), title: def.label, text: def.icon }));

  mount(
    header(t.label, `${words.length} mots · ${pct}% maîtrisé`, '#themes'),
    el('div', { class: 'badge-row' }, themeBadges),
    el('div', { class: 'modes' }, [
      modeCard(`#explore/${t.id}`, '📖', 'Explorer', 'Consulter les fiches (le manuel)'),
      modeCard(`#flashcard/${t.id}`, '⇄', 'Flashcards', due ? `${due} mots à réviser` : 'Révision espacée (SRS)'),
      modeCard(`#quiz/${t.id}`, '?', 'Quiz', '4 types de questions'),
      modeCard(`#boss/${t.id}`, '⚔️', 'Boss', bossLocked ? `Vu ${seenPct}% — débloqué à 80%` : 'Défi final du thème', bossLocked),
    ]),
    el('button', {
      class: 'btn danger', onclick: () => {
        if (confirm(`Réinitialiser la progression du thème « ${t.label} » ?`)) {
          progress.resetTheme(words);
          toast('Thème réinitialisé', 'info');
          renderThemeHub(ctx);
        }
      },
    }, 'Réinitialiser ce thème'),
  );
}

// ── Réglages ──
function renderSettings() {
  const s = progress.getState();
  const connected = gdrive.isConnected();

  const driveBtn = connected
    ? el('button', { class: 'btn danger', onclick: () => { gdrive.signOut(); renderSettings(); } }, 'Déconnecter Google Drive')
    : el('button', { class: 'btn primary', onclick: () => gdrive.signIn() }, 'Connecter Google Drive');

  const syncNow = el('button', {
    class: 'btn', disabled: connected ? null : 'true',
    onclick: async () => { await gdrive.saveProgress(); renderSettings(); },
  }, '↻ Synchroniser maintenant');

  const diff = progress.settings().difficultyMax || 3;
  const diffChips = el('div', { class: 'chips' },
    [['Niveau 1', 1], ['Niveau 1+2', 2], ['Tout', 3]].map(([lbl, v]) =>
      el('button', { class: 'chip' + (diff === v ? ' active' : ''), onclick: () => { progress.setDifficultyMax(v); renderSettings(); } }, lbl)));

  mount(
    header('Réglages', 'Sauvegarde & options'),
    el('section', { class: 'settings' }, [
      el('div', { class: 'card' }, [
        el('h3', { text: 'Google Drive' }),
        el('p', { class: 'muted', text: connected ? 'Connecté — ta progression est sauvegardée entre appareils.' : 'Connecte-toi pour synchroniser iPhone ↔ Mac.' }),
        el('p', { class: 'muted small', text: s.meta.lastSync ? 'Dernière sync : ' + s.meta.lastSync : 'Jamais synchronisé.' }),
        driveBtn,
        connected ? syncNow : null,
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Difficulté des flashcards' }),
        el('p', { class: 'muted', text: 'Limite les mots proposés en révision à un niveau maximum.' }),
        diffChips,
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Données locales' }),
        el('p', { class: 'muted', text: 'Efface toute la progression (XP, SRS, badges, bosses) sur cet appareil.' }),
        el('button', {
          class: 'btn danger',
          onclick: () => {
            if (confirm('Effacer TOUTE la progression ?') && confirm('Es-tu vraiment sûr ? Cette action est irréversible.')) {
              progress.reset();
              toast('Progression réinitialisée', 'info');
              renderSettings();
            }
          },
        }, 'Tout réinitialiser'),
      ]),
      el('a', { href: '#home', class: 'btn ghost', text: '← Retour' }),
    ])
  );
}

function dayOfYear() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

// Exposé pour le module Drive (rafraîchir après une sync entrante).
export function refresh() { route(); updateBadge(); }

init();
