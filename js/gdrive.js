// gdrive.js — Synchronisation de la progression via Google Drive (appDataFolder).
// Pattern IDENTIQUE à l'app Alphabet Darija du même développeur : init GIS par polling,
// token caché en localStorage, reconnexion silencieuse, détection de conflit
// (modifiedTime) et FUSION SANS PERTE.
//
// Scope appdata : le fichier vit dans un dossier caché dédié à l'app, invisible dans
// le Drive de l'utilisateur. Fichier distinct de l'app alphabet → aucune collision.

import * as progress from './progress.js';
import { toast } from './ui.js';
import { refresh } from './app.js';

// Client ID réutilisé (même développeur, mêmes origines autorisées : localhost + github.io).
const CLIENT_ID = '365799344100-hnqhj2r0q8bpmbmg4a7tbb9022g45no3.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const DRIVE_FILE = 'darija-vocab-progress.json';

// Clés localStorage préfixées `dv_` (distinctes de `ad_` de l'app alphabet).
const K_TOKEN = 'dv_gd_token';
const K_FILE = 'dv_gd_file_id';
const K_HINT = 'dv_gd_login_hint';

let tokenClient = null;
let driveToken = null;
let driveFileId = null;
let lastDriveModified = null;

export function isConnected() { return !!driveToken; }

async function fetchT(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── Init GIS (polling : la lib charge en async/defer) ──
export function init() {
  let tries = 0;
  const MAX = 33; // ~10 s
  const check = () => {
    if (window.google && window.google.accounts) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: async (resp) => {
          if (resp.error) { toast('Connexion refusée', 'error'); return; }
          driveToken = resp.access_token;
          localStorage.setItem(K_TOKEN, resp.access_token);
          try {
            const info = await fetchT(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${resp.access_token}`);
            const u = await info.json();
            if (u.email) localStorage.setItem(K_HINT, u.email);
          } catch (e) {}
          await loadProgress();
          toast('✓ Connecté à Google Drive', 'success');
          refresh();
        },
        error_callback: () => { /* popup fermée : on reste en local */ },
      });
      trySilentReconnect();
    } else if (tries++ < MAX) {
      setTimeout(check, 300);
    }
  };
  check();
}

async function trySilentReconnect() {
  const cached = localStorage.getItem(K_TOKEN);
  if (!cached) return;
  try {
    const resp = await fetchT(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${cached}`);
    if (resp.ok) {
      driveToken = cached;
      await loadProgress();
      refresh();
      return;
    }
  } catch (e) {}
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_FILE);
}

// ── Connexion / déconnexion ──
export function signIn() {
  if (!tokenClient) { toast('API Google non disponible', 'error'); return; }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut() {
  if (driveToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(driveToken);
  }
  driveToken = null;
  driveFileId = null;
  lastDriveModified = null;
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_FILE);
  localStorage.removeItem(K_HINT);
  toast('Déconnecté', 'info');
}

// ── Fichier dans appDataFolder (cherche ou crée, avec cache d'id) ──
async function getOrCreateFile() {
  if (driveFileId) return driveFileId;
  const cached = localStorage.getItem(K_FILE);
  if (cached) { driveFileId = cached; return driveFileId; }

  const search = await fetchT(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_FILE}'&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${driveToken}` } }
  );
  if (!search.ok) throw new Error('search ' + search.status);
  const d = await search.json();

  if (d.files && d.files.length) {
    driveFileId = d.files[0].id;
  } else {
    const create = await fetchT('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FILE, parents: ['appDataFolder'] }),
    });
    if (!create.ok) throw new Error('create ' + create.status);
    driveFileId = (await create.json()).id;
  }
  localStorage.setItem(K_FILE, driveFileId);
  return driveFileId;
}

// ── Sauvegarde locale → Drive (avec détection de conflit multi-appareils) ──
export async function saveProgress() {
  if (!driveToken) return;
  try {
    const fileId = await getOrCreateFile();

    try {
      const meta = await fetchT(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`,
        { headers: { Authorization: `Bearer ${driveToken}` } });
      if (meta.ok) {
        const md = await meta.json();
        if (lastDriveModified && md.modifiedTime && md.modifiedTime > lastDriveModified) {
          const r = await fetchT(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${driveToken}` } });
          if (r.ok) {
            const txt = await r.text();
            if (txt && txt.trim()) {
              progress.setState(mergeState(JSON.parse(txt), progress.getState()));
              toast('🔀 Données fusionnées (autre appareil)', 'info');
            }
          }
        }
      }
    } catch (e) {}

    const resp = await fetchT(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(progress.getState()) }
    );
    if (resp.status === 401 || resp.status === 403) { handleAuthLost(); return; }
    if (!resp.ok) throw new Error('upload ' + resp.status);

    stampSync();
    try {
      const after = await fetchT(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`,
        { headers: { Authorization: `Bearer ${driveToken}` } });
      if (after.ok) lastDriveModified = (await after.json()).modifiedTime || lastDriveModified;
    } catch (e) {}
  } catch (e) {
    toast('Erreur de synchronisation', 'error');
  }
}

// ── Drive → local (fusion à la connexion) ──
export async function loadProgress() {
  if (!driveToken) return;
  try {
    const fileId = await getOrCreateFile();
    const r = await fetchT(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${driveToken}` } });
    if (r.status === 401 || r.status === 403) { handleAuthLost(); return; }
    if (r.ok) {
      const txt = await r.text();
      if (txt && txt.trim()) {
        progress.setState(mergeState(JSON.parse(txt), progress.getState()));
      } else {
        await saveProgress(); // fichier vide (1ʳᵉ sync) : on y pousse l'état local
      }
    }
    try {
      const meta = await fetchT(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`,
        { headers: { Authorization: `Bearer ${driveToken}` } });
      if (meta.ok) lastDriveModified = (await meta.json()).modifiedTime || null;
    } catch (e) {}
  } catch (e) {
    toast('Erreur de chargement Drive', 'error');
  }
}

function handleAuthLost() {
  driveToken = null;
  localStorage.removeItem(K_TOKEN);
  toast('Session Google expirée', 'error');
}

function stampSync() {
  const now = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const s = progress.getState();
  s.meta.lastSync = now;
  s.meta.lastSyncTs = Date.now();
  progress.persist(); // écriture silencieuse : surtout pas save() (relancerait une sync)
}

// ── Fusion sans perte : on n'efface JAMAIS, on prend le meilleur des deux côtés. ──
function mergeState(remote, local) {
  remote = progress.migrate(JSON.parse(JSON.stringify(remote)));
  local = progress.migrate(JSON.parse(JSON.stringify(local)));
  const out = progress.migrate({});

  // SRS : union par mot ; on garde l'entrée la plus récemment travaillée.
  const ids = new Set([...Object.keys(remote.srs), ...Object.keys(local.srs)]);
  ids.forEach(id => {
    const a = remote.srs[id], b = local.srs[id];
    if (a && !b) out.srs[id] = a;
    else if (b && !a) out.srs[id] = b;
    else out.srs[id] = lastTouch(b) >= lastTouch(a) ? b : a;
  });

  // Gamification : XP & streaks au max, badges en union, activité la plus récente.
  out.gamification.xp = Math.max(remote.gamification.xp || 0, local.gamification.xp || 0);
  out.gamification.bestStreak = Math.max(remote.gamification.bestStreak || 0, local.gamification.bestStreak || 0);
  const la = local.gamification.lastActivity, ra = remote.gamification.lastActivity;
  if ((la || '') >= (ra || '')) { out.gamification.streak = local.gamification.streak; out.gamification.lastActivity = la; }
  else { out.gamification.streak = remote.gamification.streak; out.gamification.lastActivity = ra; }
  out.gamification.badges = [...new Set([...(remote.gamification.badges || []), ...(local.gamification.badges || [])])];

  // Bosses : union par thème ; vaincu si vaincu d'un côté, meilleurs scores au max.
  const themes = new Set([...Object.keys(remote.bosses), ...Object.keys(local.bosses)]);
  themes.forEach(t => {
    const a = remote.bosses[t] || {}, b = local.bosses[t] || {};
    out.bosses[t] = {
      beaten: !!(a.beaten || b.beaten),
      bestScore: Math.max(a.bestScore || 0, b.bestScore || 0),
      lastScore: (b.lastScore != null ? b.lastScore : a.lastScore) || 0,
      attempts: Math.max(a.attempts || 0, b.attempts || 0),
    };
  });

  // Stats : max de chaque compteur, union des types de quiz utilisés.
  for (const k of Object.keys(out.stats)) {
    if (k === 'quizTypesUsed') {
      out.stats[k] = [...new Set([...(remote.stats.quizTypesUsed || []), ...(local.stats.quizTypesUsed || [])])];
    } else {
      out.stats[k] = Math.max(remote.stats[k] || 0, local.stats[k] || 0);
    }
  }

  // Réglages & meta : on garde le local (pertinent pour cet appareil).
  out.settings = { ...remote.settings, ...local.settings };
  out.meta = { ...remote.meta, ...local.meta };
  return out;
}

function lastTouch(entry) {
  if (!entry) return 0;
  const h = entry.history || [];
  return h.length ? h[h.length - 1].t : 0;
}
