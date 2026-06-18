#!/usr/bin/env bash
# Lance l'app sur un petit serveur local puis affiche l'URL.
set -e
cd "$(dirname "$0")/app"
PORT="${1:-8137}"
echo "▶ DBD Perk Finder : http://localhost:$PORT"
echo "  (Ctrl+C pour arrêter)"
python3 -m http.server "$PORT"
