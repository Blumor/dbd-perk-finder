#!/usr/bin/env python3
"""
Construit les données bilingues (FR/EN) des compétences de Dead by Daylight.

Source : API communautaire dbd.tricky.lol (données issues des fichiers du jeu BHVR).
  - https://dbd.tricky.lol/api/perks?locale=en
  - https://dbd.tricky.lol/api/perks?locale=fr
  - https://dbd.tricky.lol/api/characters?locale=en
  - https://dbd.tricky.lol/api/characters?locale=fr

Le script :
  - résout les placeholders {Tunable.X}, {Keyword.X}, {Input.X} dans les descriptions,
  - associe chaque compétence à son personnage (survivant / tueur) ou la marque « générale »,
  - extrait les effets de statut et catégories pour la recherche et les filtres,
  - écrit app/perks-data.js  (variable globale, fonctionne sans serveur)
       et app/data/perks.json (mêmes données, pratique pour d'autres usages).

Réexécuter pour mettre à jour les données après une MAJ du jeu :
    python3 build_data.py            # utilise les fichiers .json déjà téléchargés
    python3 build_data.py --download # retélécharge depuis l'API
"""
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

SOURCES = {
    "perks_en.json": "https://dbd.tricky.lol/api/perks?locale=en",
    "perks_fr.json": "https://dbd.tricky.lol/api/perks?locale=fr",
    "chars_en.json": "https://dbd.tricky.lol/api/characters?locale=en",
    "chars_fr.json": "https://dbd.tricky.lol/api/characters?locale=fr",
}

# --- Effets de statut : libellés officiels EN / FR -------------------------
# (les descriptions des deux langues utilisent les mêmes clés anglaises)
STATUS = {
    "Blindness":     {"en": "Blindness",     "fr": "Cécité"},
    "Broken":        {"en": "Broken",        "fr": "Brisé/e"},
    "Elusive":       {"en": "Elusive",       "fr": "Insaisissable"},
    "Endurance":     {"en": "Endurance",     "fr": "Endurance"},
    "Exhausted":     {"en": "Exhausted",     "fr": "Épuisé/e"},
    "Exposed":       {"en": "Exposed",       "fr": "Exposé/e"},
    "Haste":         {"en": "Haste",         "fr": "Célérité"},
    "Hemorrhage":    {"en": "Hemorrhage",    "fr": "Hémorragie"},
    "Hindered":      {"en": "Hindered",      "fr": "Gêné/e"},
    "Mangled":       {"en": "Mangled",       "fr": "Mutilé/e"},
    "Oblivious":     {"en": "Oblivious",     "fr": "Inconscience"},
    "Undetectable":  {"en": "Undetectable",  "fr": "Indétectable"},
}

# --- Boutons / inputs ------------------------------------------------------
INPUTS = {
    "ActivatableButton1": {"en": "Active Ability button",    "fr": "bouton de capacité active"},
    "ActivatableButton2": {"en": "Secondary Ability button", "fr": "bouton de capacité secondaire"},
    "UseItem":            {"en": "Use Item button",          "fr": "bouton Utiliser l'objet"},
}

# --- Catégories tricky.lol : libellés FR/EN pour les filtres ----------------
CATEGORIES = {
    "adaptation":  {"en": "Adaptation",   "fr": "Adaptation"},
    "tracking":    {"en": "Tracking",     "fr": "Pistage"},
    "trickery":    {"en": "Trickery",     "fr": "Ruse"},
    "perception":  {"en": "Perception",   "fr": "Perception"},
    "concealment": {"en": "Concealment",  "fr": "Dissimulation"},
    "obstruction": {"en": "Obstruction",  "fr": "Obstruction"},
    "navigation":  {"en": "Navigation",   "fr": "Navigation"},
    "strategy":    {"en": "Strategy",     "fr": "Stratégie"},
    "safeguard":   {"en": "Safeguard",    "fr": "Protection"},
    "hinderance":  {"en": "Hindrance",    "fr": "Entrave"},
    "support":     {"en": "Support",      "fr": "Soutien"},
    "cruelty":     {"en": "Cruelty",      "fr": "Cruauté"},
    "enhancement": {"en": "Enhancement",  "fr": "Amélioration"},
    "chasing":     {"en": "Chasing",      "fr": "Poursuite"},
}

TUNABLE_RE = re.compile(r"\{Tunable\.[^.}]+\.([^}]+)\}")
KEYWORD_RE = re.compile(r"\{Keyword\.([^}]+)\}")
INPUT_RE = re.compile(r"\{Input\.([^}]+)\}")
TAG_RE = re.compile(r"<[^>]+>")


def download():
    for fname, url in SOURCES.items():
        print(f"  ↓ {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "dbd-perk-finder/1.0"})
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
        with open(os.path.join(HERE, fname), "wb") as f:
            f.write(data)


def load(fname):
    with open(os.path.join(HERE, fname), encoding="utf-8") as f:
        return json.load(f)


def fmt_number(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def resolve_tunable(perk, key_in_brace):
    """key_in_brace est la partie après le dernier point, ex. 'WindowVaultSpeed%'."""
    key = key_in_brace.lower()
    tun = perk.get("tunables") or {}
    if key in tun:
        vals = tun[key]
        if isinstance(vals, list) and vals:
            return fmt_number(vals[-1])  # palier 3 = valeur actuelle (paliers retirés en 6.1.0)
        return fmt_number(vals)
    return "?"


def canon_status(kw):
    kw = kw.strip()
    cap = kw[:1].upper() + kw[1:]
    return cap if cap in STATUS else None


def resolve(desc, perk, lang, html=True):
    """Remplace les placeholders. html=True conserve les balises et stylise les
    mots-clés ; html=False renvoie du texte brut (pour l'index de recherche)."""
    def tun_sub(m):
        return resolve_tunable(perk, m.group(1))

    def kw_sub(m):
        canon = canon_status(m.group(1))
        if not canon:
            label = m.group(1)
            return label
        label = STATUS[canon][lang]
        if html:
            return f'<span class="kw" data-kw="{canon.lower()}">{label}</span>'
        return label

    def in_sub(m):
        name = m.group(1)
        spec = INPUTS.get(name)
        label = spec[lang] if spec else name
        if html:
            return f'<span class="kbd">{label}</span>'
        return label

    out = TUNABLE_RE.sub(tun_sub, desc)
    out = KEYWORD_RE.sub(kw_sub, out)
    out = INPUT_RE.sub(in_sub, out)
    if not html:
        out = TAG_RE.sub(" ", out)
        out = re.sub(r"\s+", " ", out).strip()
    return out


def main():
    if "--download" in sys.argv:
        print("Téléchargement des données depuis dbd.tricky.lol ...")
        download()

    perks_en = load("perks_en.json")
    perks_fr = load("perks_fr.json")
    chars_en = load("chars_en.json")
    chars_fr = load("chars_fr.json")

    perks_out = []
    for key, pe in perks_en.items():
        pf = perks_fr.get(key, pe)

        # personnage
        cid = pe.get("character")
        if cid is None:
            character = None
        else:
            ce = chars_en.get(str(cid), {})
            cf = chars_fr.get(str(cid), {})
            character = {
                "id": cid,
                "en": ce.get("name", "?"),
                "fr": cf.get("name", ce.get("name", "?")),
            }

        # effets de statut (clés anglaises canoniques)
        effects = []
        for m in KEYWORD_RE.finditer(pe.get("description", "")):
            c = canon_status(m.group(1))
            if c and c not in effects:
                effects.append(c)

        cats = [c for c in (pe.get("categories") or []) if c in CATEGORIES]

        desc_html_en = resolve(pe.get("description", ""), pe, "en", html=True)
        desc_html_fr = resolve(pf.get("description", ""), pf, "fr", html=True)
        desc_text_en = resolve(pe.get("description", ""), pe, "en", html=False)
        desc_text_fr = resolve(pf.get("description", ""), pf, "fr", html=False)

        perks_out.append({
            "id": key,
            "role": pe.get("role"),
            "character": character,
            "categories": cats,
            "effects": effects,
            "name": {"en": pe.get("name", key), "fr": pf.get("name", pe.get("name", key))},
            "descHtml": {"en": desc_html_en, "fr": desc_html_fr},
            "descText": {"en": desc_text_en, "fr": desc_text_fr},
        })

    perks_out.sort(key=lambda p: p["name"]["en"].lower())

    # liste des personnages réellement porteurs de compétences (pour le filtre)
    used_ids = sorted({p["character"]["id"] for p in perks_out if p["character"]})
    characters_out = []
    for cid in used_ids:
        ce = chars_en.get(str(cid), {})
        cf = chars_fr.get(str(cid), {})
        characters_out.append({
            "id": cid,
            "role": ce.get("role"),
            "en": ce.get("name", "?"),
            "fr": cf.get("name", ce.get("name", "?")),
        })

    data = {
        "meta": {
            "source": "dbd.tricky.lol (données du jeu BHVR)",
            "perkCount": len(perks_out),
            "languages": ["fr", "en"],
        },
        "status": STATUS,
        "categories": CATEGORIES,
        "characters": characters_out,
        "perks": perks_out,
    }

    os.makedirs(os.path.join(HERE, "app", "data"), exist_ok=True)
    json_path = os.path.join(HERE, "app", "data", "perks.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    js_path = os.path.join(HERE, "app", "perks-data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("// Généré par build_data.py — ne pas éditer à la main.\n")
        f.write("window.DBD_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    n_surv = sum(1 for p in perks_out if p["role"] == "survivor")
    n_kill = sum(1 for p in perks_out if p["role"] == "killer")
    n_gen = sum(1 for p in perks_out if p["character"] is None)
    print(f"✓ {len(perks_out)} compétences  (survivants: {n_surv}, tueurs: {n_kill}, générales: {n_gen})")
    print(f"✓ {len(characters_out)} personnages porteurs de compétences")
    print(f"✓ écrit {os.path.relpath(json_path, HERE)} et {os.path.relpath(js_path, HERE)}")


if __name__ == "__main__":
    main()
