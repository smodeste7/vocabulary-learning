# Darija Vocabulaire — PWA

Application mobile-first d'apprentissage du **vocabulaire en Darija marocain**.
Suite naturelle de l'app *Alphabet Darija* (même stack, même philosophie, déploiement
indépendant, même Google Drive pour la progression).

**Philosophie : minimalisme fonctionnel.** HTML + JS natif, zéro framework, zéro bundler,
100 % statique et offline-capable. Conçue pour durer — un manuel de vocabulaire pour la vie.

---

## Démarrer en local

Un serveur HTTP est indispensable (le Service Worker ne marche pas en `file://`) :

```bash
cd arabic-vocabulary
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

---

## Structure

```
arabic-vocabulary/
├── index.html              # shell + tabbar + routeur
├── manifest.json
├── service-worker.js       # Cache First statique, SWR thèmes, audio gracieux
├── css/style.css           # mobile-first, mode sombre, palette ambre/nuit
├── js/
│   ├── app.js              # init, routeur hash, Accueil / Thèmes / Hub / Réglages
│   ├── data.js             # chargement des JSON thématiques, distracteurs
│   ├── progress.js         # état localStorage (SRS + gamification + bosses), migration
│   ├── srs.js              # Leitner 5 boîtes
│   ├── gamification.js     # XP, niveaux (titres Darija), badges, streaks
│   ├── ui.js               # helpers DOM, audio gracieux (MP3 → Web Speech API), toast
│   ├── gdrive.js           # sync Google Drive (appDataFolder, fusion sans perte)
│   └── modes/
│       ├── explore.js      # le « manuel » : liste + fiche + filtres + recherche
│       ├── flashcard.js    # révision SRS swipeable
│       ├── quiz.js         # 4 variantes (Arabe→FR, FR→Arabe, Écoute→FR, phrase à trous)
│       └── boss.js         # gauntlet 15 questions, victoire à 12/15
├── data/
│   ├── themes.json         # index des thèmes (word_count calculé au runtime)
│   └── themes/*.json       # un fichier par thème
├── audio/                  # MP3 (optionnels) — voir scripts/
├── icons/                  # icônes PWA (placeholder généré)
└── scripts/
    ├── generate-icons.py   # icônes placeholder (stdlib pur)
    ├── download-audio.sh   # Forvo (si clé API)
    └── generate-audio-tts.py  # fallback Google Cloud TTS
```

### Routes (hash-based)

`#home` · `#themes` · `#theme/:id` · `#explore/:id` (+`?w=wordId`) ·
`#flashcard/:id` (ou `#flashcard/all`) · `#quiz/:id` (+`?type=A|B|C|D`) ·
`#boss/:id` · `#settings`

---

## Ajouter du contenu

Le code n'a **jamais** besoin d'être modifié pour enrichir le vocabulaire.

### Ajouter des mots à un thème existant

1. Ouvrir `data/themes/{theme}.json`
2. Ajouter une entrée en respectant le schéma (voir ci-dessous). L'`id` doit être
   **unique et stable** : ne jamais le modifier une fois créé.
3. `word_count` dans `themes.json` est recalculé automatiquement au runtime.
4. Committer & déployer — les mots apparaissent immédiatement.

### Créer un nouveau thème

1. Créer `data/themes/{nouveau}.json` avec le schéma.
2. Ajouter une entrée dans `data/themes.json` :
   ```json
   { "id": "nouveau", "label": "Mon thème", "icon": "🎒",
     "description": "…", "word_count": 0, "color_accent": "#e8a838" }
   ```
3. (Optionnel) placer les MP3 dans `audio/{nouveau}/`.
4. Incrémenter `CACHE` dans `service-worker.js` pour forcer la mise à jour du cache.

### Schéma d'un mot

```json
{
  "id": "sal_001",                     // {prefixe}_{3 chiffres}, stable
  "word_ar": "سلام",                   // écriture arabe
  "word_arabizi": "salam",             // Arabizi (3=ع 7=ح 9=ق 5=خ)
  "word_fr": "Bonjour / Salut",        // traduction(s)
  "transliteration": "salâm",          // phonétique latine
  "register": "courant",               // courant | familier | formel | argot
  "difficulty": 1,                      // 1 (débutant) | 2 | 3 (avancé)
  "audio_file": "audio/salutations/salam.mp3",
  "examples": [
    { "sentence_ar": "…", "sentence_arabizi": "…", "sentence_fr": "…", "audio_file": null }
  ],
  "notes": "remarque contextuelle (peut être vide)"
}
```

---

## Audio (optionnel)

L'app fonctionne **entièrement sans audio**. Le bouton 🔊 tente le MP3 ; s'il est absent,
il bascule **silencieusement** sur la synthèse vocale du navigateur (Web Speech API, voix arabe).

Pour ajouter de vrais MP3 :

```bash
# 1) Prononciations humaines via Forvo (clé API freemium)
export FORVO_KEY="ta_cle"
bash scripts/download-audio.sh

# 2) Compléter les manquants via Google Cloud TTS
export GOOGLE_APPLICATION_CREDENTIALS=/chemin/service-account.json
pip install google-cloud-texttospeech
python3 scripts/generate-audio-tts.py
```

Les MP3 vont dans `audio/{theme}/{nom}.mp3`, alignés sur le champ `audio_file` des JSON.

---

## Gamification

- **XP** : flashcard correcte +2, quiz +10 base + 2/bonne réponse, boss vaincu +50,
  bonus de streak +5/jour (une fois par jour).
- **Niveaux** : titres en Darija — Moustafid → Tolba → Mfaker → 3arif → **Moul Darija** (niv. 30).
- **Badges** par thème (🌱 Découverte, 🌟 Apprentissage, 👑 Maîtrise) et globaux
  (🔥 Acharnement 7 j, ⚡ Quiz Master, 🎭 Polymorphe).
- **SRS Leitner** 5 boîtes : bonne réponse → +1 boîte ; erreur → retour boîte 1.
- **Boss** débloqué à 80 % des mots vus ; victoire à 12/15.

---

## Synchronisation Google Drive

Même pattern que l'app *Alphabet Darija* : OAuth via Google Identity Services, scope
`drive.appdata` (dossier caché, invisible dans le Drive de l'utilisateur), fusion **sans
perte** entre appareils. Fichier distinct : `darija-vocab-progress.json`.

- Connexion / déconnexion dans **Réglages**.
- Sync automatique en fin de session (débounce) + sync manuelle.
- Mode offline gracieux : `localStorage` seul, aucune erreur bloquante.

### Configurer ton propre OAuth Client ID

Le `CLIENT_ID` par défaut (dans `js/gdrive.js`) est partagé avec l'app alphabet du même
développeur. Pour ton propre déploiement :

1. [Google Cloud Console](https://console.cloud.google.com/) → Identifiants →
   *Créer un ID client OAuth* (type *Application Web*).
2. Origines JavaScript autorisées : `http://localhost:8080` **et** `https://{user}.github.io`.
3. Remplacer `CLIENT_ID` dans `js/gdrive.js`.
4. Activer l'API Google Drive dans le projet.

---

## Déploiement GitHub Pages

```bash
git init && git add . && git commit -m "Darija Vocabulaire v1"
git branch -M main
git remote add origin https://github.com/{user}/darija-vocab.git
git push -u origin main
```

Puis *Settings → Pages → Branch: main / root*. L'app est servie en HTTPS
(`https://{user}.github.io/darija-vocab/`) → PWA installable, Service Worker actif.

Les chemins sont **relatifs** : l'app fonctionne sous un sous-dossier de repo sans réglage.

---

*Stack : HTML + JS natif · PWA · GitHub Pages · Google Drive sync*
*Philosophie : minimalisme fonctionnel — chaque ligne se justifie.*
