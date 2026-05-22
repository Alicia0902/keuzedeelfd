// =============================================
// API-adressen die gebruikt worden om data op te halen
// =============================================
const apiBase = "https://pokeapi.co/api/v2/pokemon/";
const typeApiBase = "https://pokeapi.co/api/v2/type/";
const speciesApiBase = "https://pokeapi.co/api/v2/pokemon-species/";

// =============================================
// Globale variabelen — worden gebruikt door de hele app
// =============================================
let currentPokemonId = 1;
let activeTypeFilter = "";
let activeSortOrder = "num-asc";
let activeFormFilter = "all";
let favorietenModus = false; // true = pijltjes navigeren alleen door favorieten

let allPokemonList = [];
let navigationList = [];
let latestLoadToken = 0;

const dataCache = new Map();
const nameCache = new Map();
const typeCache = new Map();
const weightCache = new Map();
const heightCache = new Map();

// =============================================
// HULPFUNCTIES
// =============================================

// Zet een naam zoals "bulbasaur" om naar "Bulbasaur", en "fire-spin" naar "Fire Spin"
function formatLabel(value = "") {
  return value
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Controleert of een Pokémon-naam eindigt op "-gmax" (Gigantamax-vorm)
function isGmaxName(name = "") {
  return name.toLowerCase().endsWith("-gmax");
}

// Controleert of een Pokémon past bij het actieve vormfilter
function matchFormFilter(name = "") {
  if (activeFormFilter === "gmax") return isGmaxName(name);
  if (activeFormFilter === "base") return !isGmaxName(name);
  return true;
}

// Haalt het ID-nummer op uit een PokéAPI-URL
function getIdFromPokemonUrl(url = "") {
  const m = url.match(/\/pokemon\/(\d+)\/?$/);
  return m ? Number(m[1]) : NaN;
}

// Geeft de beste beschikbare afbeelding terug voor een Pokémon
function getBestSprite(pokeData) {
  return (
    pokeData?.sprites?.other?.["official-artwork"]?.front_default ||
    pokeData?.sprites?.other?.home?.front_default ||
    pokeData?.sprites?.other?.showdown?.front_default ||
    pokeData?.sprites?.front_default ||
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokeData.id}.png`
  );
}

// Past de achtergrondkleur van de pagina aan op basis van het type
function applyPokemonTheme(primaryType = "") {
  if (!document.body) return;
  if (primaryType) document.body.setAttribute("data-type", primaryType);
  else document.body.removeAttribute("data-type");
}

// Past de kleur van de kaart aan op basis van het type
function applyCardTheme(primaryType = "") {
  const card = document.querySelector(".pokemon-card");
  if (!card) return;
  if (primaryType) card.setAttribute("data-type", primaryType);
  else card.removeAttribute("data-type");
}

// =============================================
// FAVORIETENMODUS BALK
// Toont een gele balk bovenaan als je in favorietenmodus zit
// =============================================

function updateFavorietenModusBalk() {
  let balk = document.getElementById("favorietenModusBalk");

  if (favorietenModus) {
    if (!balk) {
      balk = document.createElement("div");
      balk.id = "favorietenModusBalk";
      balk.style.cssText = `
        max-width: 1200px;
        margin: 0 auto 8px;
        padding: 10px 16px;
        background: #fef3c7;
        border: 1px solid #f59e0b;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 700;
        font-size: 14px;
      `;
      balk.innerHTML = `
        <span>❤️ Je bekijkt alleen je favoriete Pokémon</span>
        <button id="verlatenBtn" style="background:#fff; border:1px solid #d1d5db; border-radius:8px; padding:6px 12px; cursor:pointer; font-weight:700;">
          ✕ Verlaat favorietenmodus
        </button>
      `;

      const filterbalk = document.querySelector(".filterbalk");
      filterbalk?.parentNode.insertBefore(balk, filterbalk);

      // Knop om favorietenmodus te verlaten → terug naar alle Pokémon
      document.getElementById("verlatenBtn")?.addEventListener("click", () => {
        favorietenModus = false;
        localStorage.removeItem("favorietenModus");
        localStorage.removeItem("geselecteerdePokemon");
        updateFavorietenModusBalk();
        buildNavigation().then(() => {
          if (navigationList.length) loadPokemon(navigationList[0].id);
        });
      });
    }
  } else {
    balk?.remove();
  }
}

// =============================================
// FAVORIETEN — opgeslagen in localStorage
// =============================================

// Voegt een Pokémon toe aan of verwijdert hem uit de favorietenlijst
// Gebruikt emoji hartjes: 🤍 = niet favoriet, ❤️ = favoriet
function toggleFavorite(pokemonName) {
  let favorieten = JSON.parse(localStorage.getItem("favorieten")) || [];

  if (favorieten.includes(pokemonName)) {
    favorieten = favorieten.filter((f) => f !== pokemonName);
    document.getElementById("favoriteBtn").textContent = "🤍";
  } else {
    favorieten.push(pokemonName);
    document.getElementById("favoriteBtn").textContent = "❤️";
  }

  localStorage.setItem("favorieten", JSON.stringify(favorieten));
}

// Controleert of de huidige Pokémon al een favoriet is en past het hartje aan
function updateFavoriteBtn(pokemonName) {
  const favorieten = JSON.parse(localStorage.getItem("favorieten")) || [];
  const btn = document.getElementById("favoriteBtn");
  if (btn) btn.textContent = favorieten.includes(pokemonName) ? "❤️" : "🤍";
}

// =============================================
// DATA OPHALEN VIA DE API
// =============================================

// Haalt de data van één Pokémon op via naam of ID
// Gebruikt de cache zodat dezelfde Pokémon niet twee keer opgehaald wordt
async function fetchPokemonData(identifier) {
  const key = String(identifier);
  if (/^\d+$/.test(key) && dataCache.has(Number(key))) return dataCache.get(Number(key));

  const res = await fetch(`${apiBase}${identifier}`);
  if (!res.ok) throw new Error(`Pokemon niet gevonden: ${identifier}`);
  const data = await res.json();

  dataCache.set(data.id, data);
  nameCache.set(data.id, data.name || "");
  typeCache.set(data.id, data.types?.[0]?.type?.name || "");
  weightCache.set(data.id, data.weight ?? Infinity);
  heightCache.set(data.id, data.height ?? Infinity);

  return data;
}

// Haalt een lijst op van alle Pokémon voor de navigatie
async function loadAllPokemonList() {
  if (allPokemonList.length) return;

  const res = await fetch(`${apiBase}?limit=20000`);
  if (!res.ok) throw new Error("Kon volledige Pokemon lijst niet laden");
  const data = await res.json();

  allPokemonList = data.results
    .map((p) => {
      const id = getIdFromPokemonUrl(p.url);
      return Number.isFinite(id) ? { id, name: p.name } : null;
    })
    .filter(Boolean);

  allPokemonList.forEach((p) => nameCache.set(p.id, p.name));
}

// Haalt alle Pokémon op van een bepaald type
async function getTypeList(typeName) {
  const res = await fetch(`${typeApiBase}${typeName}`);
  if (!res.ok) throw new Error(`Type niet gevonden: ${typeName}`);
  const data = await res.json();

  return data.pokemon
    .map((entry) => {
      const id = getIdFromPokemonUrl(entry.pokemon.url);
      if (!Number.isFinite(id)) return null;
      return { id, name: entry.pokemon.name };
    })
    .filter(Boolean);
}

// Zorgt dat gewicht, hoogte en type beschikbaar zijn voor sortering
async function ensureDataForSort(items) {
  const missing = items.filter(
    (p) => !typeCache.has(p.id) || !weightCache.has(p.id) || !heightCache.has(p.id)
  );
  const chunk = 20;

  for (let i = 0; i < missing.length; i += chunk) {
    const part = missing.slice(i, i + chunk);
    await Promise.all(
      part.map(async (p) => {
        try { await fetchPokemonData(p.id); } catch {}
      })
    );
  }
}

// =============================================
// NAVIGATIE — filteren en sorteren
// In favorietenmodus worden alleen favorieten gebruikt
// =============================================

async function buildNavigation() {
  let list = [];

  if (favorietenModus) {
    // Alleen favorieten als navigatielijst
    const favorieten = JSON.parse(localStorage.getItem("favorieten")) || [];
    const results = await Promise.allSettled(
      favorieten.map((naam) => fetchPokemonData(naam.toLowerCase()))
    );
    list = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => ({ id: r.value.id, name: r.value.name }));
  } else {
    if (activeTypeFilter) {
      list = await getTypeList(activeTypeFilter);
    } else {
      await loadAllPokemonList();
      list = [...allPokemonList];
    }

    list = list.filter((p) => matchFormFilter(p.name));
    list = [...new Map(list.map((p) => [p.id, p])).values()];

    switch (activeSortOrder) {
      case "num-desc":
        list.sort((a, b) => b.id - a.id);
        break;
      case "a-z":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "z-a":
        list.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "type-asc":
      case "type-desc":
        await ensureDataForSort(list);
        list.sort((a, b) => {
          const ta = (typeCache.get(a.id) || "").toLowerCase();
          const tb = (typeCache.get(b.id) || "").toLowerCase();
          const cmp = ta.localeCompare(tb);
          if (cmp !== 0) return activeSortOrder === "type-asc" ? cmp : -cmp;
          return a.id - b.id;
        });
        break;
      case "weight-asc":
      case "weight-desc":
        await ensureDataForSort(list);
        list.sort((a, b) => {
          const wa = weightCache.get(a.id) ?? Infinity;
          const wb = weightCache.get(b.id) ?? Infinity;
          return activeSortOrder === "weight-asc" ? wa - wb : wb - wa;
        });
        break;
      case "height-asc":
      case "height-desc":
        await ensureDataForSort(list);
        list.sort((a, b) => {
          const ha = heightCache.get(a.id) ?? Infinity;
          const hb = heightCache.get(b.id) ?? Infinity;
          return activeSortOrder === "height-asc" ? ha - hb : hb - ha;
        });
        break;
      case "num-asc":
      default:
        list.sort((a, b) => a.id - b.id);
        break;
    }
  }

  navigationList = list;
}

// Zoekt de positie van de huidige Pokémon in de navigatielijst
function findCurrentIndex() {
  return navigationList.findIndex((p) => p.id === currentPokemonId);
}

// Geeft de volgende Pokémon in de lijst terug
function nextInNavigation() {
  if (!navigationList.length) return null;
  const i = findCurrentIndex();
  if (i === -1) return navigationList[0];
  return navigationList[(i + 1) % navigationList.length];
}

// Geeft de vorige Pokémon in de lijst terug
function prevInNavigation() {
  if (!navigationList.length) return null;
  const i = findCurrentIndex();
  if (i === -1) return navigationList[navigationList.length - 1];
  return navigationList[(i - 1 + navigationList.length) % navigationList.length];
}

// =============================================
// POKÉMON LADEN EN WEERGEVEN
// =============================================

// Laadt een Pokémon op basis van naam of ID en vult alle elementen op de pagina in
async function loadPokemon(identifier) {
  const token = ++latestLoadToken;

  try {
    const data = await fetchPokemonData(identifier);
    if (token !== latestLoadToken) return;

    currentPokemonId = data.id;
    const mainType = data.types?.[0]?.type?.name || "";
    const pokemonName = formatLabel(data.name);

    applyPokemonTheme(mainType);
    applyCardTheme(mainType);

    // Naam weergeven
    const nameEl = document.getElementById("name");
    if (nameEl) nameEl.textContent = pokemonName;

    // Hartje updaten op basis van favorieten
    updateFavoriteBtn(pokemonName);

    // Afbeelding instellen
    const imageEl = document.getElementById("pokemonImage");
    if (imageEl) {
      imageEl.src = getBestSprite(data);
      imageEl.alt = pokemonName;
    }

    // Type weergeven
    const typeEl = document.getElementById("type");
    if (typeEl) typeEl.textContent = data.types.map((t) => formatLabel(t.type.name)).join(", ");

    // ID weergeven
    const idEl = document.getElementById("id");
    if (idEl) idEl.textContent = String(data.id);

    // Gewicht weergeven (API geeft hectogram, omzetten naar kg)
    const weightEl = document.getElementById("weight");
    if (weightEl) weightEl.textContent = `${(data.weight / 10).toFixed(1)} kg`;

    // Hoogte weergeven (API geeft decimeter, omzetten naar meter)
    const heightEl = document.getElementById("heightValue");
    if (heightEl) heightEl.textContent = `${(data.height / 10).toFixed(1)} m`;

    // Kaartnaam instellen
    const cardName = document.getElementById("cardName");
    if (cardName) cardName.textContent = pokemonName;

    // HP weergeven op de kaart
    const cardHp = document.getElementById("cardHp");
    if (cardHp) {
      const hp = data.stats.find((s) => s.stat.name === "hp");
      cardHp.textContent = hp ? `${hp.base_stat} HP` : "";
    }

    // Type-label op de kaart
    const cardType = document.getElementById("cardType");
    if (cardType) cardType.textContent = formatLabel(mainType);

    // Stats weergeven als balkjes
    const statsEl = document.getElementById("stats");
    if (statsEl) {
      statsEl.innerHTML = "";
      data.stats.forEach((s) => {
        const row = document.createElement("div");
        row.className = "stat";
        row.innerHTML = `
          <div class="stat-name">${formatLabel(s.stat.name)}: ${s.base_stat}</div>
          <div class="stat-bar"><div class="stat-fill" style="width:${Math.min(s.base_stat, 200) / 2}%"></div></div>
        `;
        statsEl.appendChild(row);
      });
    }

    // Moves weergeven (maximaal 12)
    const movesEl = document.getElementById("moves");
    if (movesEl) {
      movesEl.innerHTML = "";
      const moves = data.moves.slice(0, 12);
      if (!moves.length) movesEl.textContent = "Geen moves gevonden.";
      moves.forEach(({ move }) => {
        const item = document.createElement("div");
        item.className = "move-item";
        item.textContent = formatLabel(move.name);
        movesEl.appendChild(item);
      });
    }

// Abilities weergeven
const abilitiesEl = document.getElementById("abilities");
if (abilitiesEl) {
  abilitiesEl.innerHTML = "";
  const abilities = [...data.abilities].sort((a, b) => a.slot - b.slot);
  if (!abilities.length) abilitiesEl.textContent = "Geen abilities gevonden.";
  abilities.forEach(({ ability }) => {
    const item = document.createElement("div");
    item.className = "ability-item";
    item.textContent = formatLabel(ability.name);
    abilitiesEl.appendChild(item);
  });
}

await loadSpeciesAndEvolution(data.species.url, token);
} catch (e) {
  console.error(e);
}
}


// =============================================
// SPECIES EN EVOLUTIE
// =============================================

// Haalt de Pokémon-beschrijving en evolutieketen op via de species-API
async function loadSpeciesAndEvolution(speciesUrl, token) {
  try {
    const res = await fetch(speciesUrl);
    if (!res.ok) throw new Error("Species kon niet laden");
    const species = await res.json();

    if (token !== latestLoadToken) return;

    const entry = species.flavor_text_entries.find((e) => e.language.name === "en");
    const desc = entry ? entry.flavor_text.replace(/\f/g, " ") : "No description found.";
    const descEl = document.getElementById("description");
    if (descEl) descEl.textContent = desc;

    if (species.evolution_chain?.url) {
      await loadEvolution(species.evolution_chain.url, token);
    }
  } catch (e) {
    console.error(e);
  }
}

// Haalt de evolutieketen op en toont alle evoluties als klikbare afbeeldingen
async function loadEvolution(chainUrl, token) {
  const evoList = document.getElementById("evoList");
  if (!evoList) return;
  evoList.innerHTML = "";

  try {
    const res = await fetch(chainUrl);
    if (!res.ok) throw new Error("Evolution chain kon niet laden");
    const chain = await res.json();
    if (token !== latestLoadToken) return;

    const speciesNames = [];
    function walk(node) {
      if (!node) return;
      if (node.species?.name) speciesNames.push(node.species.name);
      (node.evolves_to || []).forEach(walk);
    }
    walk(chain.chain);

    const uniqueSpecies = [...new Set(speciesNames)];

    const defaultNames = (
      await Promise.all(
        uniqueSpecies.map(async (s) => {
          try {
            const r = await fetch(`${speciesApiBase}${s}`);
            if (!r.ok) return s;
            const d = await r.json();
            return d.varieties?.find((v) => v.is_default)?.pokemon?.name || s;
          } catch {
            return s;
          }
        })
      )
    ).filter(Boolean);

    const namesToShow = [...defaultNames];

    if (activeFormFilter === "gmax") {
      namesToShow.length = 0;
      defaultNames.forEach((n) => namesToShow.push(`${n}-gmax`));
    } else if (activeFormFilter === "all") {
      defaultNames.forEach((n) => namesToShow.push(`${n}-gmax`));
    }

    const rows = await Promise.allSettled(
      [...new Set(namesToShow)].map(async (name) => {
        const p = await fetchPokemonData(name);
        return { name: p.name, id: p.id, sprite: getBestSprite(p) };
      })
    );

    if (token !== latestLoadToken) return;

    rows.forEach((row) => {
      if (row.status !== "fulfilled" || !row.value) return;
      const v = row.value;

      const wrap = document.createElement("div");
      wrap.className = "evo-item";

      const img = document.createElement("img");
      img.src = v.sprite;
      img.alt = formatLabel(v.name);
      img.title = formatLabel(v.name);
      img.addEventListener("click", () => loadPokemon(v.name));
      img.onerror = () => wrap.remove();

      const label = document.createElement("div");
      label.textContent = formatLabel(v.name);

      wrap.appendChild(img);
      wrap.appendChild(label);
      evoList.appendChild(wrap);
    });
  } catch (e) {
    console.error(e);
  }
}

// =============================================
// FILTER- EN NAVIGATIELOGICA
// =============================================

async function refreshAndKeepContext() {
  await buildNavigation();
  if (!navigationList.length) return;

  const inList = navigationList.some((p) => p.id === currentPokemonId);
  if (!inList) {
    await loadPokemon(navigationList[0].id);
  }
}

async function onTypeChange(value) {
  activeTypeFilter = (value || "").trim().toLowerCase();
  await refreshAndKeepContext();
}

async function onFormChange(value) {
  activeFormFilter = (value || "all").trim().toLowerCase();
  await refreshAndKeepContext();
}

async function onSortChange(value) {
  activeSortOrder = (value || "num-asc").trim().toLowerCase();
  await refreshAndKeepContext();
}

// =============================================
// KNOPPEN EN EVENTLISTENERS INSTELLEN
// =============================================

function initControls() {
  const typeFilter = document.getElementById("typeFilter");
  const formFilter = document.getElementById("formFilter");
  const sortOrder = document.getElementById("sortOrder");

  typeFilter?.addEventListener("change", async (e) => onTypeChange(e.target.value));
  formFilter?.addEventListener("change", async (e) => onFormChange(e.target.value));
  sortOrder?.addEventListener("change", async (e) => onSortChange(e.target.value));

  // Volgende Pokémon knop
  document.getElementById("nextArrow")?.addEventListener("click", async () => {
    const next = nextInNavigation();
    if (next) await loadPokemon(next.id);
  });

  // Vorige Pokémon knop
  document.getElementById("previousArrow")?.addEventListener("click", async () => {
    const prev = prevInNavigation();
    if (prev) await loadPokemon(prev.id);
  });

  // Hartje knop — voegt toe of verwijdert de huidige Pokémon uit favorieten
  document.getElementById("favoriteBtn")?.addEventListener("click", () => {
    const naam = document.getElementById("name").textContent;
    toggleFavorite(naam);
  });

  // Favorieten knop — gaat naar de favorietenpagina
  document.getElementById("favorietenBtn")?.addEventListener("click", () => {
    window.location.href = "favorieten.html";
  });
}

// Vergelijkknop — slaat de huidige Pokémon op en gaat naar vergelijk.html
document.getElementById("vergelijkBtn")?.addEventListener("click", () => {
  const naam = document.getElementById("name").textContent.toLowerCase();
  localStorage.setItem("vergelijkPokemon", naam);
  window.location.href = "vergelijk.html";
});

// =============================================
// APP STARTEN
// =============================================

async function startApp() {
  try {
    initControls();

    // Controleer of we vanuit de favorietenpagina komen
    const komtVanFavorieten = localStorage.getItem("favorietenModus") === "true";
    const geselecteerd = localStorage.getItem("geselecteerdePokemon");

    if (komtVanFavorieten) {
      favorietenModus = true;
      updateFavorietenModusBalk();
    }

    await buildNavigation();

    if (geselecteerd) {
      // Laad de Pokémon die aangeklikt werd op de favorietenpagina
      localStorage.removeItem("geselecteerdePokemon");
      await loadPokemon(geselecteerd);
    } else if (navigationList.length) {
      await loadPokemon(navigationList[0].id);
    } else {
      await loadPokemon("bulbasaur");
    }
  } catch (e) {
    console.error(e);
    await loadPokemon("bulbasaur");
  }
}

startApp();