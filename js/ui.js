// ui.js — Helpers d'interface partagés par tous les modes.
// Création DOM concise, audio gracieux (MP3 → Web Speech API), toast. Zéro logique métier.
// Pattern repris de l'app Alphabet Darija du même développeur.

// Crée un élément : el('div', {class:'x', onclick:fn}, [enfants|texte]).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// Vide puis remplit le conteneur de vue.
export function mount(...nodes) {
  const view = document.getElementById('view');
  view.innerHTML = '';
  nodes.forEach(n => n && view.appendChild(n));
  view.scrollTop = 0;
  return view;
}

let toastTimer = null;
// Toast léger non bloquant. type: 'info' | 'success' | 'error'.
export function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = type;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ── Audio ──
// On joue UNIQUEMENT le MP3 GHIZLANE. Pas de repli synthèse vocale (TTS robotique
// jugé mauvais) : si le fichier manque, on prévient discrètement, sans son parasite.
// Le 2ᵉ argument (texte arabe) est conservé pour compat' d'appel mais n'est plus utilisé.
export function playWord(audioFile) {
  const player = document.getElementById('player');
  if (!audioFile) { toast('🔇 Audio indisponible', 'info'); return; }
  player.src = audioFile;
  player.play().catch(() => toast('🔇 Audio indisponible', 'info'));
}

// En-tête de section réutilisable, avec titre + sous-titre + lien retour optionnel.
export function header(title, subtitle, backHref) {
  return el('header', { class: 'view-head' }, [
    backHref ? el('a', { href: backHref, class: 'back-link', text: '← Retour' }) : null,
    el('h1', { text: title }),
    subtitle ? el('p', { class: 'subtitle', text: subtitle }) : null,
  ]);
}

// Badge de registre coloré (courant / familier / formel / argot).
export function registerBadge(register) {
  return el('span', { class: 'reg reg-' + (register || 'courant'), text: register || 'courant' });
}

// Retour haptique léger si supporté (mobile).
export function buzz(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}
