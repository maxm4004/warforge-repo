import React, { useState, useEffect } from "react";
import ArmyBuilder, { ARMY_CATALOGS, ARMY_CODES, ARMY_KEYS, initRosterForCatalog, applyRemoteGameData } from "./ArmyBuilder.jsx";
import ModelliEditor, { INITIAL_GROUPS } from "./ModelliEditor.jsx";
import ElementiEditor, { genId } from "./ElementiEditor.jsx";
import GithubSettings from "./GithubSettings.jsx";
import ArmyExport from "./ArmyExport.jsx";

const DEFAULT_GITHUB_CONFIG = {
  owner: "",
  repo: "",
  branch: "main",
  pathTemplate: "armies/{code}.json",
  coordinatePath: "Coordinate.json",
  templatePath: "Template.json",
  generatedArmyPathTemplate: "generated/{code}-army.json",
  rulesJsonPath: "json",
  token: "",
};

async function fetchGithubFile(cfg, path) {
  const owner = (cfg.owner || "").trim();
  const repo = (cfg.repo || "").trim();
  const branch = (cfg.branch || "main").trim();
  const token = (cfg.token || "").trim();
  if (!owner || !repo) return null;
  const cleanPath = path.trim().replace(/^\/+/, "");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
  const resp = await fetch(apiUrl, { headers: token ? { Authorization: `token ${token}` } : {} });
  if (!resp.ok) return null;
  const data = await resp.json();
  const decoded = decodeURIComponent(escape(atob(data.content)));
  return JSON.parse(decoded);
}

// Recupera i 7 dataset di base (regole+cataloghi) da GitHub e li adatta alla
// forma che l'app si aspetta internamente, senza toccare il resto del codice.
async function loadRemoteGameData(cfg) {
  const basePath = (cfg.rulesJsonPath || "json").replace(/\/+$/, "");
  const armyKeys = ARMY_KEYS;

  const [unitTypesRaw, moraleRaw, weaponsRaw, capabilitiesRaw, armyCodesRaw, ...armyResults] = await Promise.all([
    fetchGithubFile(cfg, `${basePath}/unit_types.json`),
    fetchGithubFile(cfg, `${basePath}/morale.json`),
    fetchGithubFile(cfg, `${basePath}/weapons.json`),
    fetchGithubFile(cfg, `${basePath}/capabilities.json`),
     fetchGithubFile(cfg, `${basePath}/army_codes.json`),
    ...armyKeys.map((key) => fetchGithubFile(cfg, `${basePath}/armies/${key}.json`)),
  ]);

  const result = {};

  if (unitTypesRaw?.unit_types) result.unitTypes = unitTypesRaw.unit_types;
  if (moraleRaw?.morale_levels) result.moraleLevels = moraleRaw.morale_levels;

  if (armyCodesRaw) {
        result.armyCodes = armyCodesRaw;
  }

  if (weaponsRaw?.weapons) {
    result.weapons = weaponsRaw.weapons;
  }

  if (capabilitiesRaw?.capabilities) {
    const capabilities = {};
    Object.entries(capabilitiesRaw.capabilities).forEach(([key, val]) => {
      capabilities[key] = typeof val === "string" ? val : (val.description || "");
    });
    result.capabilities = capabilities;
  }

  // Applica ogni esercito indipendentemente — se anche solo uno manca il
  // campo "code" o il file non si trova, gli altri 13 restano comunque
  // validi. Prima uno scartava tutto in blocco.
  const armyCatalogs = {};
  const armyCodes = {};
  let anyArmyLoaded = false;
  armyKeys.forEach((key, i) => {
    if (armyResults[i]) {
      armyCatalogs[key] = armyResults[i];
      anyArmyLoaded = true;
      if (armyResults[i].code) armyCodes[key] = armyResults[i].code;
    }
  });
  if (anyArmyLoaded) {
    result.armyCatalogs = armyCatalogs;
    if (Object.keys(armyCodes).length > 0) result.armyCodes = armyCodes;
  }

  return result;
}

export default function App() {
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [templates, setTemplates] = useState(() => {
    const t = {};
    ARMY_KEYS.forEach((tag) => { t[tag] = []; });
    return t;
  });
  const [rosters, setRosters] = useState(() => {
    const initial = {};
    Object.entries(ARMY_CATALOGS).forEach(([tag, cat]) => {
      initial[tag] = initRosterForCatalog(cat);
    });
    return initial;
  });
  const [activeTool, setActiveTool] = useState("army");
  const [githubConfig, setGithubConfig] = useState(() => {
    try {
      return { ...DEFAULT_GITHUB_CONFIG, ...(JSON.parse(localStorage.getItem("warforge_github_config")) || {}) };
    } catch {
      return DEFAULT_GITHUB_CONFIG;
    }
  });

  // Modelli ed Elementi si ricaricano da GitHub ad ogni apertura del tab —
  // eventuali modifiche non salvate vanno perse: responsabilità dell'utente
  // salvare prima di cambiare tab.

  const updateGithubConfig = (patch) => {
    setGithubConfig((c) => {
      const next = { ...c, ...patch };
      localStorage.setItem("warforge_github_config", JSON.stringify(next));
      return next;
    });
  };

  const [gameDataVersion, setGameDataVersion] = useState(0);
  const [gameDataStatus, setGameDataStatus] = useState("");

  // Carica una volta all'avvio i 7 dataset di base (regole+cataloghi) da
  // GitHub, sovrascrivendo in-place i valori hardcoded di default. Se il
  // caricamento fallisce (owner/repo non configurati, rete assente, ecc.)
  // l'app resta perfettamente funzionante con i dati hardcoded di fallback.
  useEffect(() => {
    const owner = (githubConfig.owner || "").trim();
    const repo = (githubConfig.repo || "").trim();
    if (!owner || !repo) return;
    setGameDataStatus("Caricamento dati di base da GitHub...");
    loadRemoteGameData(githubConfig)
      .then((data) => {
        applyRemoteGameData(data);
        setRosters((prev) => {
          const next = { ...prev };
          Object.entries(ARMY_CATALOGS).forEach(([tag, cat]) => {
            if (!prev[tag] || prev[tag].length === 0) next[tag] = initRosterForCatalog(cat);
          });
          return next;
        });
        setGameDataVersion((v) => v + 1);
        setGameDataStatus("");
      })
      .catch((err) => {
  console.error("Caricamento dati di base fallito:", err);
  setGameDataStatus("⚠ Caricamento dati di base fallito, uso i valori di default.");
});
      //.catch(() => setGameDataStatus("⚠ Caricamento dati di base fallito, uso i valori di default."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTool === "coordinate") {
      fetchGithubFile(githubConfig, githubConfig.coordinatePath || "Coordinate.json")
        .then((parsed) => {
          if (!parsed?.gruppi) return;
          const loadedGroups = {};
          Object.entries(parsed.gruppi).forEach(([id, g]) => {
            loadedGroups[id] = { note: g._note || "", tipi: g.tipi || [], base: g.base, slots: g.slots || [] };
          });
          setGroups(loadedGroups);
        })
        .catch(() => {});
    }

    if (activeTool === "template") {
      const armyKeys = ARMY_KEYS;
      fetchGithubFile(githubConfig, githubConfig.templatePath || "Template.json")
        .then((parsed) => {
          if (!parsed?.Army) return;
          const newTemplates = Object.fromEntries(armyKeys.map((k) => [k, []]));
          parsed.Army.forEach((army) => {
            const key = armyKeys.find((k) => k === army.name) || armyKeys.find((k) => ARMY_CODES[k] === army.Tag);
            if (key) {
              newTemplates[key] = (army.modelli || []).map((m) => ({
                nickname: m.nickname, id: m.id || genId(), tipo: m.tipo, groupId: m.groupId || "", base: m.base, slots: m.slots || [], children: m.children || [],
              }));
            }
          });
          setTemplates(newTemplates);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  const TOOLS = [
    { id: "army", label: "Army Builder", render: () => <ArmyBuilder githubConfig={githubConfig} templates={templates} rosters={rosters} setRosters={setRosters} /> },
    { id: "coordinate", label: "Modelli", render: () => <ModelliEditor groups={groups} setGroups={setGroups} githubConfig={githubConfig} /> },
    { id: "template", label: "Elementi", render: () => <ElementiEditor groups={groups} githubConfig={githubConfig} templates={templates} setTemplates={setTemplates} /> },
    { id: "export", label: "Generazione file esercito", render: () => <ArmyExport rosters={rosters} groups={groups} templates={templates} githubConfig={githubConfig} /> },
    { id: "settings", label: "Impostazioni", render: () => <GithubSettings githubConfig={githubConfig} updateGithubConfig={updateGithubConfig} /> },
  ];

  const active = TOOLS.find((t) => t.id === activeTool);

  return (
    <div className="min-h-screen bg-[#1C1917]">
      <nav className="border-b border-[#9C7A3C]/40 bg-[#0f0d0b] px-6 py-3 flex items-center gap-6">
        <span className="font-serif text-lg text-[#9C7A3C] tracking-widest uppercase shrink-0">WARFORGE</span>
        <div className="flex gap-2">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`px-4 py-1.5 text-sm font-mono tracking-wide transition-colors ${
                activeTool === tool.id
                  ? "bg-[#9C7A3C] text-[#1C1917] font-bold"
                  : "text-[#EDE6D6]/60 hover:text-[#EDE6D6] hover:bg-[#9C7A3C]/10"
              }`}
            >
              {tool.label}
            </button>
          ))}
        </div>
        {gameDataStatus && (
          <span className="text-xs font-mono text-[#EDE6D6]/50 ml-auto">{gameDataStatus}</span>
        )}
      </nav>

      {active && active.render()}
    </div>
  );
}
