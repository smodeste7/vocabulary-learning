#!/usr/bin/env python3
"""generate-audio-elevenlabs.py — Génère les MP3 Darija via l'API ElevenLabs.

Parcourt tous les thèmes (data/themes.json → data/themes/*.json) et, pour chaque mot
dont le MP3 n'existe pas encore, synthétise la prononciation de l'écriture arabe
(`word_ar`) avec une voix Darija ElevenLabs. Les fichiers déjà présents sont sautés.

Zéro dépendance : uniquement la lib standard Python (urllib).

── Configuration (variables d'environnement) ──
  ELEVEN_API_KEY   ta clé API ElevenLabs            (obligatoire pour générer)
  ELEVEN_VOICE_ID  l'ID de la voix Darija à utiliser (obligatoire ; ex. GHIZLANE / Jawad)
                   ↳ doit être la MÊME que celle utilisée pour salam.mp3, pour rester cohérent.
  ELEVEN_MODEL     modèle (défaut: eleven_multilingual_v2)
  ELEVEN_STABILITY / ELEVEN_SIMILARITY  réglages de voix (défauts: 0.5 / 0.75)

── Usage ──
  python3 scripts/generate-audio-elevenlabs.py --dry-run        # liste, sans appeler l'API ni la clé
  python3 scripts/generate-audio-elevenlabs.py                  # génère les manquants
  python3 scripts/generate-audio-elevenlabs.py --theme famille  # un seul thème
  python3 scripts/generate-audio-elevenlabs.py --word sal_003   # un seul mot
  python3 scripts/generate-audio-elevenlabs.py --limit 5        # s'arrête après 5 (test)
  python3 scripts/generate-audio-elevenlabs.py --force          # régénère même si présent
  python3 scripts/generate-audio-elevenlabs.py --words-only     # mots seulement (pas les phrases)
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEMES_INDEX = os.path.join(HERE, "data", "themes.json")
THEMES_DIR = os.path.join(HERE, "data", "themes")

API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"
OUTPUT_FORMAT = "mp3_44100_128"   # MP3 44.1 kHz / 128 kbps
PAUSE_S = 0.6                      # politesse entre 2 appels (limites de concurrence)
MAX_RETRIES = 4                   # retries sur 429 / 5xx avec backoff


def collect_items(args):
    """Renvoie [(audio_file_relpath, texte_arabe, etiquette)] selon les filtres."""
    with open(THEMES_INDEX, encoding="utf-8") as f:
        themes = json.load(f)
    items = []
    for t in themes:
        if args.theme and t["id"] != args.theme:
            continue
        path = os.path.join(THEMES_DIR, f"{t['id']}.json")
        if not os.path.exists(path):
            print(f"  ! thème introuvable : {t['id']}.json")
            continue
        with open(path, encoding="utf-8") as f:
            words = json.load(f)
        for w in words:
            if args.word and w["id"] != args.word:
                continue
            if w.get("audio_file") and w.get("word_ar"):
                items.append((w["audio_file"], w["word_ar"], f'{w["id"]} · {w["word_arabizi"]}'))
            if not args.words_only:
                for n, ex in enumerate(w.get("examples", []) or []):
                    if ex.get("audio_file") and ex.get("sentence_ar"):
                        items.append((ex["audio_file"], ex["sentence_ar"], f'{w["id"]} ex{n + 1}'))
    return items


def synthesize(text, api_key, voice_id, model, stability, similarity):
    """Appelle ElevenLabs et renvoie les octets MP3. Lève une exception si échec."""
    url = f"{API_BASE}/{voice_id}?output_format={OUTPUT_FORMAT}"
    payload = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": stability, "similarity_boost": similarity},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("xi-api-key", api_key)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "audio/mpeg")

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                ctype = resp.headers.get("Content-Type", "")
                data = resp.read()
                if "audio" not in ctype:
                    raise RuntimeError(f"réponse inattendue ({ctype}) : {data[:200]!r}")
                if len(data) < 1000:
                    raise RuntimeError(f"audio suspect ({len(data)} octets)")
                return data
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            # 429 (rate limit) / 5xx : on retente avec backoff. Autres : on abandonne.
            if e.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES:
                wait = 2 ** attempt
                print(f"      ⏳ {e.code}, nouvel essai dans {wait}s…")
                time.sleep(wait)
                last_err = RuntimeError(f"HTTP {e.code}: {body[:200]}")
                continue
            raise RuntimeError(f"HTTP {e.code}: {body[:300]}")
        except urllib.error.URLError as e:
            last_err = RuntimeError(f"réseau: {e.reason}")
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)
                continue
            raise last_err
    raise last_err or RuntimeError("échec inconnu")


def main():
    p = argparse.ArgumentParser(description="Génère les MP3 Darija via ElevenLabs.")
    p.add_argument("--dry-run", action="store_true", help="liste seulement, sans appel API")
    p.add_argument("--force", action="store_true", help="régénère même si le MP3 existe")
    p.add_argument("--words-only", action="store_true", help="ne génère que les mots, pas les phrases d'exemple (par défaut : les deux)")
    p.add_argument("--theme", help="limiter à un thème (ex. famille)")
    p.add_argument("--word", help="limiter à un id de mot (ex. sal_003)")
    p.add_argument("--limit", type=int, default=0, help="s'arrêter après N générations (0 = tout)")
    args = p.parse_args()

    items = collect_items(args)

    # Partition présents / à générer.
    todo, present = [], []
    for rel, text, label in items:
        out = os.path.join(HERE, rel)
        (present if (os.path.exists(out) and not args.force) else todo).append((rel, text, label, out))

    print(f"Mots/phrases ciblés : {len(items)}  ·  déjà présents : {len(present)}  ·  à générer : {len(todo)}")

    if args.dry_run:
        print("\n--- À générer (dry-run) ---")
        for rel, text, label, _ in todo:
            print(f"  • {rel:42s}  {text}   [{label}]")
        if not todo:
            print("  (rien — tout est déjà présent)")
        return

    if not todo:
        print("✓ Rien à faire — tous les MP3 sont présents.")
        return

    api_key = os.environ.get("ELEVEN_API_KEY") or os.environ.get("ELEVEN_KEY")
    voice_id = os.environ.get("ELEVEN_VOICE_ID")
    if not api_key:
        sys.exit("✗ Définis ELEVEN_API_KEY (ElevenLabs → profil → API Keys).")
    if not voice_id:
        sys.exit("✗ Définis ELEVEN_VOICE_ID (la MÊME voix que pour salam.mp3 : Voices → Copy Voice ID).")

    model = os.environ.get("ELEVEN_MODEL", "eleven_multilingual_v2")
    stability = float(os.environ.get("ELEVEN_STABILITY", "0.5"))
    similarity = float(os.environ.get("ELEVEN_SIMILARITY", "0.75"))

    made = failed = 0
    failures = []
    # --limit borne le nombre de mots TRAITÉS (essais), pas seulement les succès :
    # un test reste un test même si l'API refuse (ex. 402 plan gratuit).
    batch = todo[:args.limit] if args.limit else todo
    for n, (rel, text, label, out) in enumerate(batch, 1):
        try:
            audio = synthesize(text, api_key, voice_id, model, stability, similarity)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "wb") as f:
                f.write(audio)
            made += 1
            print(f"  ✓ [{n}/{len(batch)}] {rel}   ({text})  {len(audio) // 1024} Ko")
        except Exception as e:
            failed += 1
            failures.append((rel, str(e)))
            print(f"  ✗ [{n}/{len(batch)}] {rel}   → {e}")
        time.sleep(PAUSE_S)

    print("-" * 44)
    print(f"Générés : {made}  ·  Échecs : {failed}")
    if failures:
        print("\nÉchecs (à relancer) :")
        for rel, err in failures:
            print(f"  - {rel} : {err}")


if __name__ == "__main__":
    main()
