#!/usr/bin/env python3
"""generate-audio-tts.py — Fallback : génère les MP3 manquants via Google Cloud TTS.

Parcourt tous les thèmes (data/themes.json → data/themes/*.json) et, pour chaque mot
(et chaque phrase d'exemple dont audio_file est renseigné) dont le MP3 n'existe pas encore,
synthétise la prononciation arabe avec une voix arabe.

Prérequis :
  pip install google-cloud-texttospeech
  export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/service-account.json

Usage :
  python3 scripts/generate-audio-tts.py            # ne génère que les manquants
  python3 scripts/generate-audio-tts.py --force    # régénère tout
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEMES_INDEX = os.path.join(HERE, "data", "themes.json")
THEMES_DIR = os.path.join(HERE, "data", "themes")

VOICE = "ar-XA-Wavenet-A"   # alternative : ar-XA-Standard-A
LANG = "ar-XA"


def collect_items():
    """Renvoie [(audio_file_relpath, texte_arabe)] pour mots + exemples audio."""
    with open(THEMES_INDEX, encoding="utf-8") as f:
        themes = json.load(f)
    items = []
    for t in themes:
        path = os.path.join(THEMES_DIR, f"{t['id']}.json")
        if not os.path.exists(path):
            print(f"  ! thème introuvable : {t['id']}.json")
            continue
        with open(path, encoding="utf-8") as f:
            words = json.load(f)
        for w in words:
            if w.get("audio_file") and w.get("word_ar"):
                items.append((w["audio_file"], w["word_ar"]))
            for ex in w.get("examples", []) or []:
                if ex.get("audio_file") and ex.get("sentence_ar"):
                    items.append((ex["audio_file"], ex["sentence_ar"]))
    return items


def main():
    force = "--force" in sys.argv

    try:
        from google.cloud import texttospeech
    except ImportError:
        sys.exit("✗ Module manquant. Installe : pip install google-cloud-texttospeech")

    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        sys.exit("✗ Définis GOOGLE_APPLICATION_CREDENTIALS vers ton service-account.json")

    items = collect_items()
    client = texttospeech.TextToSpeechClient()
    voice = texttospeech.VoiceSelectionParams(language_code=LANG, name=VOICE)
    audio_cfg = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=0.85,  # un peu lent pour l'apprentissage
    )

    made = skipped = 0
    for rel, text in items:
        out = os.path.join(HERE, rel)
        if os.path.exists(out) and not force:
            skipped += 1
            continue
        resp = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text), voice=voice, audio_config=audio_cfg
        )
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(resp.audio_content)
        print(f"  ✓ {rel}")
        made += 1

    print("----------------------------------------")
    print(f"Générés : {made} · Déjà présents : {skipped} · Total ciblé : {len(items)}")


if __name__ == "__main__":
    main()
