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

// ── Audio gracieux ──
// On tente d'abord le MP3. S'il manque (ou n'a jamais été téléchargé), on bascule
// SILENCIEUSEMENT sur la synthèse vocale du navigateur (Web Speech API, voix arabe).
// L'audio est un enrichissement : jamais une erreur bloquante, jamais un prérequis.
export function playWord(audioFile, arabicText) {
  const player = document.getElementById('player');
  if (audioFile) {
    player.src = audioFile;
    player.play().catch(() => speak(arabicText));
  } else {
    speak(arabicText);
  }
}

// Synthèse vocale locale, repli quand aucun MP3 n'est disponible.
export function speak(text) {
  if (!text || !('speechSynthesis' in window)) {
    toast('🔇 Audio non disponible', 'info');
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar';            // voix arabe si présente sur l'appareil
    u.rate = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const ar = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ar'));
    if (ar) u.voice = ar;
    window.speechSynthesis.speak(u);
  } catch (e) {
    toast('🔇 Audio non disponible', 'info');
  }
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
