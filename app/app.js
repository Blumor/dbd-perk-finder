/* DBD Perk Finder — moteur de recherche & UI */
(function () {
  "use strict";

  const DATA = window.DBD_DATA;
  if (!DATA) { document.body.innerHTML = "<p style='padding:2rem'>Données introuvables (perks-data.js).</p>"; return; }

  /* ----------------------------- i18n ----------------------------- */
  const I18N = {
    fr: {
      title: "Perk Finder",
      tagline: "Toutes les compétences de Dead by Daylight, en un coup d'œil.",
      searchPlaceholder: "Nom, personnage, effet, mots-clés…",
      searchHint: "Ex. « épuisé », « aura générateur », « Nurse », « se soigner plus vite »…",
      roleAll: "Tous", roleSurvivor: "Survivants", roleKiller: "Tueurs",
      sortRelevance: "Pertinence", sortAZ: "A → Z",
      effectsLabel: "Effets de statut", categoriesLabel: "Catégories",
      reset: "Réinitialiser", noResults: "Aucune compétence ne correspond à votre recherche.",
      footer: "Données issues des fichiers du jeu (via dbd.tricky.lol). Projet non affilié à Behaviour Interactive.",
      charAll: "Tous les personnages", general: "Générale", generalGroup: "Compétences générales",
      survivors: "Survivants", killers: "Tueurs", by: "par",
      resultsAll: (n) => `<b>${n}</b> compétences`,
      results: (n, t) => `<b>${n}</b> / ${t} compétences`,
    },
    en: {
      title: "Perk Finder",
      tagline: "Every Dead by Daylight perk, at a glance.",
      searchPlaceholder: "Name, character, effect, keywords…",
      searchHint: "e.g. “exhausted”, “generator aura”, “Nurse”, “heal faster”…",
      roleAll: "All", roleSurvivor: "Survivors", roleKiller: "Killers",
      sortRelevance: "Relevance", sortAZ: "A → Z",
      effectsLabel: "Status effects", categoriesLabel: "Categories",
      reset: "Reset", noResults: "No perk matches your search.",
      footer: "Data from the game files (via dbd.tricky.lol). Not affiliated with Behaviour Interactive.",
      charAll: "All characters", general: "General", generalGroup: "General perks",
      survivors: "Survivors", killers: "Killers", by: "by",
      resultsAll: (n) => `<b>${n}</b> perks`,
      results: (n, t) => `<b>${n}</b> / ${t} perks`,
    },
  };

  /* --------------------------- état global ------------------------ */
  const state = {
    lang: localStorage.getItem("dbd-lang") || "fr",
    query: "",
    role: "all",
    character: "all",       // "all" | "general" | <id>
    effects: new Set(),
    categories: new Set(),
    sort: "relevance",
  };

  /* --------------------------- utilitaires ------------------------ */
  const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const t = () => I18N[state.lang];

  // pré-calcul des champs de recherche (les deux langues, repliés sans accents)
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

  function scorePerk(perk, terms) {
    let total = 0, matched = 0;
    for (const term of terms) {
      let best = 0;
      for (const field in WEIGHTS) {
        const hay = perk._idx[field];
        const pos = hay.indexOf(term);
        if (pos === -1) continue;
        let w = WEIGHTS[field];
        // bonus si début de mot, et gros bonus si le nom commence par le terme
        if (pos === 0 || hay[pos - 1] === " ") w += 2;
        if (field === "name" && pos === 0) w += 6;
        if (w > best) best = w;
      }
      if (best > 0) { matched++; total += best; }
    }
    return { matched, score: total };
  }

  /* --------------------------- filtrage --------------------------- */
  function currentList() {
    const terms = fold(state.query).split(/\s+/).filter(Boolean);
    const strict = [], partial = [];
    for (const p of DATA.perks) {
      // rôle
      if (state.role !== "all" && p.role !== state.role) continue;
      // personnage
      if (state.character === "general") { if (p.character) continue; }
      else if (state.character !== "all") { if (!p.character || String(p.character.id) !== state.character) continue; }
      // effets (OR)
      if (state.effects.size && !p.effects.some((e) => state.effects.has(e))) continue;
      // catégories (OR)
      if (state.categories.size && !p.categories.some((c) => state.categories.has(c))) continue;
      // recherche texte
      if (!terms.length) { strict.push({ perk: p, score: 0, matched: 0 }); continue; }
      const { matched, score } = scorePerk(p, terms);
      if (matched === terms.length) strict.push({ perk: p, score, matched });
      else if (matched > 0) partial.push({ perk: p, score, matched });
      // sinon : aucun mot trouvé => exclu
    }

    // si rien ne contient TOUS les mots, on se rabat sur les correspondances partielles (OU)
    const out = strict.length || !terms.length ? strict : partial;

    const byName = (a, b) => a.perk.name[state.lang].localeCompare(b.perk.name[state.lang], state.lang);
    if (state.sort === "az" || !terms.length) out.sort(byName);
    else out.sort((a, b) => b.matched - a.matched || b.score - a.score || byName(a, b));
    return out;
  }

  /* --------------------------- rendu ------------------------------ */
  const $ = (sel) => document.querySelector(sel);
  const resultsEl = $("#results");
  const countEl = $("#results-count");
  const noResEl = $("#no-results");

  function highlight(text, terms) {
    if (!terms.length) return escapeHtml(text);
    const folded = fold(text);
    const ranges = [];
    for (const term of terms) {
      let from = 0, pos;
      while ((pos = folded.indexOf(term, from)) !== -1) { ranges.push([pos, pos + term.length]); from = pos + term.length; }
    }
    if (!ranges.length) return escapeHtml(text);
    ranges.sort((a, b) => a[0] - b[0]);
    let res = "", cursor = 0;
    for (const [s, e] of ranges) {
      if (s < cursor) continue;
      res += escapeHtml(text.slice(cursor, s)) + "<mark>" + escapeHtml(text.slice(s, e)) + "</mark>";
      cursor = e;
    }
    res += escapeHtml(text.slice(cursor));
    return res;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function ownerLabel(perk) {
    if (!perk.character) return { text: t().general, cls: "general" };
    return { text: perk.character[state.lang], cls: "" };
  }

  function renderCard(perk, terms) {
    const lang = state.lang;
    const owner = ownerLabel(perk);
    const altName = perk.name[lang === "fr" ? "en" : "fr"];
    const showAlt = altName && altName !== perk.name[lang];

    const effTags = perk.effects
      .map((e) => `<span class="tag effect" data-eff="${e}">${escapeHtml(DATA.status[e][lang])}</span>`)
      .join("");
    const catTags = perk.categories
      .map((c) => `<span class="tag" data-cat="${c}">${escapeHtml(DATA.categories[c][lang])}</span>`)
      .join("");

    const ownerData = perk.character ? `data-char="${perk.character.id}"` : `data-char="general"`;

    const card = document.createElement("article");
    card.className = "card " + (perk.role || "");
    card.innerHTML = `
      <div class="card-head">
        <h3 class="card-name">${highlight(perk.name[lang], terms)}</h3>
        ${showAlt ? `<span class="card-altname">${escapeHtml(altName)}</span>` : ""}
      </div>
      <button class="owner ${owner.cls}" ${ownerData}>
        <span class="role-dot"></span>${escapeHtml(owner.text)}
      </button>
      <div class="card-desc">${perk.descHtml[lang]}</div>
      <div class="card-foot">${effTags}${catTags}</div>
    `;
    return card;
  }

  function render() {
    const terms = fold(state.query).split(/\s+/).filter(Boolean);
    const list = currentList();

    resultsEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const { perk } of list) frag.appendChild(renderCard(perk, terms));
    resultsEl.appendChild(frag);

    noResEl.hidden = list.length !== 0;
    const total = DATA.perks.length;
    countEl.innerHTML = list.length === total ? t().resultsAll(total) : t().results(list.length, total);

    const filtersActive = state.query || state.role !== "all" || state.character !== "all" ||
      state.effects.size || state.categories.size;
    $("#reset").hidden = !filtersActive;
    $("#clear-search").hidden = !state.query;
  }

  /* --------------------------- construction UI -------------------- */
  function buildCharSelect() {
    const sel = $("#char-filter");
    const survs = DATA.characters.filter((c) => c.role === "survivor");
    const kills = DATA.characters.filter((c) => c.role === "killer");
    const opt = (v, label) => `<option value="${v}">${escapeHtml(label)}</option>`;
    const grp = (label, items) =>
      `<optgroup label="${escapeHtml(label)}">${items.map((c) => opt(c.id, c[state.lang])).join("")}</optgroup>`;
    sel.innerHTML =
      opt("all", t().charAll) +
      opt("general", t().generalGroup) +
      grp(t().survivors, survs) +
      grp(t().killers, kills);
    sel.value = state.character;
  }

  function buildChips() {
    const effEl = $("#effect-chips");
    effEl.innerHTML = Object.keys(DATA.status)
      .map((k) => `<button class="chip ${state.effects.has(k) ? "active" : ""}" data-eff="${k}"><span class="dot"></span>${escapeHtml(DATA.status[k][state.lang])}</button>`)
      .join("");
    const catEl = $("#cat-chips");
    catEl.innerHTML = Object.keys(DATA.categories)
      .map((k) => `<button class="chip ${state.categories.has(k) ? "active" : ""}" data-cat="${k}">${escapeHtml(DATA.categories[k][state.lang])}</button>`)
      .join("");
  }

  function applyI18nStatics() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (t()[k]) el.textContent = t()[k];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const k = el.getAttribute("data-i18n-ph");
      if (t()[k]) el.setAttribute("placeholder", t()[k]);
    });
    document.querySelectorAll(".lang-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.lang === state.lang));
    // options de tri
    document.querySelectorAll("#sort-filter option").forEach((o) => {
      const k = o.getAttribute("data-i18n");
      if (t()[k]) o.textContent = t()[k];
    });
  }

  function rebuildAll() {
    applyI18nStatics();
    buildCharSelect();
    buildChips();
    render();
  }

  /* --------------------------- événements ------------------------- */
  let searchTimer;
  $("#search").addEventListener("input", (e) => {
    state.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 80);
  });
  $("#clear-search").addEventListener("click", () => {
    state.query = ""; $("#search").value = ""; render(); $("#search").focus();
  });

  $("#role-filter").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-role]"); if (!btn) return;
    state.role = btn.dataset.role;
    document.querySelectorAll("#role-filter .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });

  $("#char-filter").addEventListener("change", (e) => { state.character = e.target.value; render(); });
  $("#sort-filter").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

  $("#effect-chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-eff]"); if (!c) return;
    const k = c.dataset.eff;
    state.effects.has(k) ? state.effects.delete(k) : state.effects.add(k);
    c.classList.toggle("active");
    render();
  });
  $("#cat-chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-cat]"); if (!c) return;
    const k = c.dataset.cat;
    state.categories.has(k) ? state.categories.delete(k) : state.categories.add(k);
    c.classList.toggle("active");
    render();
  });

  // clic sur le porteur d'une carte => filtre ce personnage
  resultsEl.addEventListener("click", (e) => {
    const owner = e.target.closest(".owner");
    if (owner) {
      state.character = owner.dataset.char;
      $("#char-filter").value = state.character;
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
      return;
    }
    const eff = e.target.closest(".tag.effect");
    if (eff) {
      const k = eff.dataset.eff;
      state.effects.add(k);
      $("#effects-details").open = true;
      buildChips();
      render();
      return;
    }
    const cat = e.target.closest(".tag[data-cat]");
    if (cat) {
      const k = cat.dataset.cat;
      state.categories.add(k);
      $("#cats-details").open = true;
      buildChips();
      render();
    }
  });

  $("#reset").addEventListener("click", () => {
    state.query = ""; $("#search").value = "";
    state.role = "all"; state.character = "all";
    state.effects.clear(); state.categories.clear();
    document.querySelectorAll("#role-filter .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.role === "all"));
    $("#char-filter").value = "all";
    buildChips();
    render();
  });

  document.querySelector(".lang-switch").addEventListener("click", (e) => {
    const btn = e.target.closest(".lang-btn"); if (!btn) return;
    state.lang = btn.dataset.lang;
    localStorage.setItem("dbd-lang", state.lang);
    rebuildAll();
  });

  /* --------------------------- init ------------------------------- */
  rebuildAll();
})();
