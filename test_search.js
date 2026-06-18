// Test du moteur de recherche contre les vraies données.
global.window = {};
require("./app/perks-data.js");
const DATA = global.window.DBD_DATA;

const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
DATA.perks.forEach((p) => {
  const charNames = p.character ? [p.character.fr, p.character.en] : ["générale", "general"];
  const effLabels = p.effects.flatMap((e) => [DATA.status[e].fr, DATA.status[e].en, e]);
  const catLabels = p.categories.flatMap((c) => [DATA.categories[c].fr, DATA.categories[c].en, c]);
  p._idx = {
    name: fold(p.name.fr + " " + p.name.en),
    char: fold(charNames.join(" ") + " " + (p.role || "")),
    eff: fold(effLabels.join(" ")),
    cat: fold(catLabels.join(" ")),
    text: fold(p.descText.fr + " " + p.descText.en),
  };
});
const WEIGHTS = { name: 12, eff: 9, char: 7, cat: 5, text: 3 };
function score(perk, terms) {
  let total = 0, matched = 0;
  for (const term of terms) {
    let best = 0;
    for (const f in WEIGHTS) {
      const pos = perk._idx[f].indexOf(term);
      if (pos === -1) continue;
      let w = WEIGHTS[f];
      if (pos === 0 || perk._idx[f][pos - 1] === " ") w += 2;
      if (f === "name" && pos === 0) w += 6;
      if (w > best) best = w;
    }
    if (best > 0) { matched++; total += best; }
  }
  return { matched, score: total };
}
function search(q, lang = "fr") {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  const strict = [], partial = [];
  for (const p of DATA.perks) {
    const { matched, score: s } = score(p, terms);
    if (matched === terms.length) strict.push({ p, s, matched });
    else if (matched > 0) partial.push({ p, s, matched });
  }
  const out = strict.length ? strict : partial;
  out.sort((a, b) => b.matched - a.matched || b.s - a.s);
  return out.slice(0, 6).map((r) =>
    `${r.p.name[lang]} [${r.p.character ? r.p.character[lang] : "Générale"}] (m${r.matched}/${terms.length} s${r.s})`);
}

const cases = [
  ["épuisé", "fr"],
  ["exhausted", "en"],
  ["celerite", "fr"],          // accent-insensible -> Célérité (Haste)
  ["aura générateur", "fr"],
  ["nurse", "fr"],             // perks de The Nurse
  ["se soigner plus vite", "fr"],
  ["indétectable", "fr"],
  ["totem maudit", "fr"],
  ["bloque les fenetres", "fr"],
  ["sprint", "en"],
];
console.log(`Données : ${DATA.perks.length} perks, ${DATA.characters.length} persos\n`);
for (const [q, lang] of cases) {
  console.log(`🔎 "${q}" (${lang})`);
  const r = search(q, lang);
  r.forEach((x) => console.log("   • " + x));
  if (!r.length) console.log("   (aucun résultat)");
  console.log();
}
