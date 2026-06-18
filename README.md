# DBD Perk Finder 🔪

Une petite app web pour retrouver **n'importe quelle compétence de Dead by Daylight**
(survivants **et** tueurs) — même quand on a oublié son nom.

On tape ce dont on se souvient (un effet, un personnage, un bout de description, des
mots-clés…) et le moteur de recherche remonte les compétences correspondantes, en
**français ou en anglais**.

### ▶️ **[Ouvrir l'app en ligne](https://blumor.github.io/dbd-perk-finder/)**

![FR / EN](https://img.shields.io/badge/langues-FR%20%2F%20EN-c0392b)

## Fonctionnalités

- **315 compétences** (survivants, tueurs, et compétences générales), avec la
  **description officielle** du jeu, valeurs chiffrées incluses.
- Chaque compétence est rattachée à **son personnage** (ou marquée « Générale »).
- **Recherche multi-critères** insensible aux accents et **bilingue** :
  - par **nom** (« adrénaline », « sprint burst »…) ;
  - par **personnage** (« nurse », « le clown »…) ;
  - par **effet de statut** (« épuisé », « célérité », « indétectable »…) ;
  - par **mots-clés / description** (« voir l'aura du générateur », « se soigner plus vite »…) ;
  - par **objets / entités** concernés (« totem », « crochet », « coffre »…).
  - Recherche en **langage naturel** : si aucune compétence ne contient *tous* les
    mots, on bascule automatiquement sur les meilleures correspondances partielles.
- **Filtres** : rôle (survivant / tueur), personnage, effets de statut, catégories.
- Clic sur le personnage ou un tag d'une carte → filtre instantané.
- Bascule **FR / EN** mémorisée, thème sombre façon DBD.

## Lancer l'app

Aucune dépendance, aucun build. Deux options :

```bash
./start.sh            # puis ouvrir http://localhost:8137
# ou
python3 -m http.server 8137 --directory app
```

> Les données étant embarquées dans `app/perks-data.js`, on peut aussi simplement
> ouvrir `app/index.html` dans un navigateur (les polices Google Fonts demandent une
> connexion, mais tout le reste marche hors-ligne).

## Mettre à jour les données (après une MAJ du jeu)

Les données proviennent des fichiers du jeu via l'API communautaire
[dbd.tricky.lol](https://dbd.tricky.lol). Pour régénérer :

```bash
python3 build_data.py --download   # retélécharge EN + FR puis reconstruit
python3 build_data.py              # reconstruit depuis les .json déjà présents
```

Cela régénère `app/perks-data.js` et `app/data/perks.json`.

## Tester le moteur de recherche

```bash
node test_search.js
```

## Structure

```
build_data.py        Récupère/normalise les données, résout les placeholders, écrit les fichiers
perks_*.json         Données brutes EN/FR (perks + personnages) — source du build
test_search.js       Test du moteur de recherche contre les vraies données
app/
  index.html         Page
  styles.css         Thème
  app.js             Moteur de recherche + filtres + i18n + rendu
  perks-data.js      Données générées (variable globale window.DBD_DATA)
  data/perks.json    Mêmes données en JSON pur
```

---

Projet non officiel, à but personnel. Dead by Daylight et ses contenus appartiennent à
Behaviour Interactive. Données via dbd.tricky.lol.
