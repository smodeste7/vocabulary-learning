#!/usr/bin/env bash
# download-audio.sh — Récupère les prononciations humaines depuis Forvo (si clé API).
#
# L'audio est un ENRICHISSEMENT : l'app marche sans. Ce script tente Forvo pour les mots ;
# ce qu'il ne trouve pas est listé à la fin pour le fallback TTS (generate-audio-tts.py).
#
# Prérequis :
#   - jq (parsing JSON)             : brew install jq
#   - une clé API Forvo (freemium)  : export FORVO_KEY="ta_cle"
#
# Usage : bash scripts/download-audio.sh
#
# Stratégie de sources (cf. cahier des charges, ordre de priorité) :
#   1. Forvo (humain, dialectal)        ← ce script, si FORVO_KEY
#   2. Wikimedia Commons / autres       ← manuel
#   3. Google Cloud TTS                 ← scripts/generate-audio-tts.py
#   4. Web Speech API (in-app)          ← repli silencieux dans l'app

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
THEMES_INDEX="$ROOT/data/themes.json"

command -v jq >/dev/null 2>&1 || { echo "✗ jq requis : brew install jq"; exit 1; }

if [ -z "${FORVO_KEY:-}" ]; then
  echo "ℹ Aucune FORVO_KEY définie. Liste des MP3 manquants (à générer via TTS) :"
  echo "----------------------------------------"
fi

LANG_CODE="ar"
ok=0; fail=0; skip=0; failed=()

# Parcourt chaque thème puis chaque mot.
for theme_id in $(jq -r '.[].id' "$THEMES_INDEX"); do
  file="$ROOT/data/themes/$theme_id.json"
  [ -f "$file" ] || { echo "  ! thème introuvable : $theme_id.json"; continue; }

  count=$(jq 'length' "$file")
  for i in $(seq 0 $((count - 1))); do
    word_ar=$(jq -r ".[$i].word_ar" "$file")
    rel=$(jq -r ".[$i].audio_file" "$file")
    [ "$rel" = "null" ] && continue
    out="$ROOT/$rel"

    if [ -s "$out" ]; then skip=$((skip+1)); continue; fi
    mkdir -p "$(dirname "$out")"

    if [ -z "${FORVO_KEY:-}" ]; then
      echo "  • $rel   ($word_ar)"
      continue
    fi

    # Forvo : on demande la liste des prononciations, on prend la 1ʳᵉ MP3.
    api="https://apifree.forvo.com/key/$FORVO_KEY/format/json/action/word-pronunciations/word/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$word_ar")/language/$LANG_CODE"
    mp3=$(curl -fsL --max-time 30 "$api" | jq -r '.items[0].pathmp3 // empty' 2>/dev/null)

    if [ -n "$mp3" ] && curl -fsL --max-time 30 "$mp3" -o "$out" && [ -s "$out" ]; then
      echo "  ✓ $rel   ($word_ar)"
      ok=$((ok+1))
    else
      rm -f "$out"
      echo "  ✗ $rel   (introuvable sur Forvo : $word_ar)"
      failed+=("$rel"); fail=$((fail+1))
    fi
  done
done

echo "----------------------------------------"
if [ -n "${FORVO_KEY:-}" ]; then
  echo "Réussis : $ok · Échecs : $fail · Déjà présents : $skip"
  if [ "$fail" -gt 0 ]; then
    echo ""
    echo "→ Complète les manquants via le fallback TTS :"
    echo "    python3 scripts/generate-audio-tts.py"
  fi
else
  echo "→ Pour télécharger automatiquement : export FORVO_KEY=... puis relance."
  echo "→ Ou génère tout via TTS : python3 scripts/generate-audio-tts.py"
fi
