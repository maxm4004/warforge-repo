import React, { useState, useMemo } from "react";

/* ============================================================
   LAYER DATI — dati reali da WARFORGE-IEF (json/unit_types.json,
   json/morale.json, json/weapons.json, json/armies/*.json)
   ============================================================ */

let UNIT_TYPES = {};

let MORALE_LEVELS = {};

let WEAPONS = {};

let CAPABILITIES_INFO = {};

// Le 14 Army List storiche — catalogo completo da json/armies/*.json
let ARMY_CATALOGS = {};

// Alcuni nomi in historical_enemies non combaciano esattamente col nome
// del catalogo corrispondente (es. "Normanni" -> "Primi Normanni").
// Mappa esplicita per gli alias noti; tutto il resto si risolve per match esatto sul nome.
// Codici ufficiali a 3 lettere usati per gli asset (immagini unità/banner) e per l'export JSON.
// Non derivabili automaticamente dalla chiave del catalogo (es. i tre "primi_*" confliggerebbero).
// Elenco minimo delle 14 chiavi armata — serve solo per sapere quali file
// armies/{key}.json andare a cercare su GitHub. Non è "dato di gioco": i
// contenuti reali (nome, unità, codice, ecc.) arrivano tutti da remoto.
const ARMY_KEYS = [
  "anglosassoni", "vichinghi", "primi_normanni", "franchi_carolingi",
  "irlandesi_pre_conquista", "comunali_italiani", "longobardi", "primi_bizantini",
  "primi_crociati", "tardo_sassanidi", "tedeschi_medioevali_imperiali",
  "turchi_selgiuchidi", "ordine_teutonico", "russi_medioevali",
];

let ARMY_CODES = {};

function resolveEnemyTag(enemyCode) {
  const found = Object.entries(ARMY_CODES).find(([, code]) => code === enemyCode);
  return found ? found[0] : null;
}

// Sovrascrive in-place i dati caricati da GitHub, mantenendo la stessa
// identità di riferimento degli oggetti (così chi li ha già importati
// altrove vede l'aggiornamento senza bisogno di ripassarli come prop).
function mutateInPlace(target, source) {
  if (!source) return;
  Object.keys(target).forEach((k) => delete target[k]);
  Object.assign(target, source);
}

function applyRemoteGameData({ unitTypes, moraleLevels, weapons, capabilities, armyCatalogs, armyCodes } = {}) {
  mutateInPlace(UNIT_TYPES, unitTypes);
  mutateInPlace(MORALE_LEVELS, moraleLevels);
  mutateInPlace(WEAPONS, weapons);
  mutateInPlace(CAPABILITIES_INFO, capabilities);
  mutateInPlace(ARMY_CATALOGS, armyCatalogs);
  mutateInPlace(ARMY_CODES, armyCodes);
}

export { ARMY_CATALOGS, ARMY_CODES, ARMY_KEYS, initRosterForCatalog, applyRemoteGameData };



/* ============================================================
   LAYER LOGICA — funzioni pure, nessuna dipendenza da React.
   Riutilizzabili 1:1 da un futuro panel TTS Lua.
   ============================================================ */

function formatCapacita(c) {
  return c
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

// Coordinate LOGICHE in cm reali riferite all'unità (non coordinate TTS —
// quelle le calcola il deploy TTS autonomamente). x = posizione laterale nel
// rango, z = profondità del rango. Vedi prompt_react_positions.md.
function buildBasi(tipo, numBasi, basiPerRango) {
  const def = UNIT_TYPES[tipo];
  const larghezza = 4; // cm, sempre 4 per tutte le basi
  const profondita = def?.base_depth_cm || 0; // 
  const perRango = Math.max(1, Number(basiPerRango) || 4);
  const basi = [];
  for (let i = 0; i < numBasi; i++) {
    const rango = Math.floor(i / perRango);
    const posNelRango = i % perRango;
    basi.push({
      id: i + 1,
      seq: i + 1,
      guid: null,
      posizione: { x: posNelRango * larghezza, y: 0, z: rango * profondita },
    });
  }
  return basi;
}

function buildUnitFromTemplate(template, { numBasi, superiore, model, basiPerRango }) {
  const n = Number(numBasi);
  const finalNumBasi = Number.isFinite(n) && numBasi !== "" && numBasi !== null && numBasi !== undefined
    ? n
    : (template.bases_per_unit || 1);
  const perRango = basiPerRango || 4;
  return {
    nome_display: template.name,
    tipo: template.type,
    morale: template.morale,
    armi: [...template.weapons],
    modificatore: superiore ? "S" : "",
    model: model || "",
    basi_per_rango: perRango,
    basi: buildBasi(template.type, finalNumBasi, perRango),
  };
}

function buildArmy(nome, tag, unita) {
  return { versione: "2.0-IEF", nome, tag, unita };
}

// Genera automaticamente le unità chiave (is_key_unit), pre-selezionate
// al loro minimo di basi se previsto, altrimenti alla quantità standard per unità.
function initRosterForCatalog(catalog) {
  return catalog.units
    .filter((template) => template.is_key_unit && template.bases_min > 0)
    .map((template) => {
      const numBasi = template.bases_min;
      const unit = buildUnitFromTemplate(template, { numBasi, superiore: false });
      return { templateName: template.name, unit, costPerBase: template.cost_per_base, isKeyUnit: template.is_key_unit };
    });
}

function computeTotalCost(roster) {
  return roster.reduce((sum, entry) => sum + entry.unit.basi.length * entry.costPerBase, 0);
}

function validateRoster(roster, catalog) {
  if (!catalog) return [];
  const errori = [];
  if (roster.length === 0) errori.push("Nessuna unità presente in armylist.");

  const totals = {};
  roster.forEach((entry) => {
    totals[entry.templateName] = (totals[entry.templateName] || 0) + entry.unit.basi.length;
  });

  Object.entries(totals).forEach(([templateName, total]) => {
    const template = catalog.units.find((u) => u.name === templateName);
    if (!template) return;
    if (template.bases_min != null && total < template.bases_min) {
      errori.push(`${templateName}: ${total} basi, minimo richiesto ${template.bases_min}.`);
    }
    if (template.bases_max != null && total > template.bases_max) {
      errori.push(`${templateName}: ${total} basi, massimo consentito ${template.bases_max}.`);
    }
  });

  return errori;
}

/* ============================================================
   LAYER UI — componenti React
   ============================================================ */

// ⚠️ PROVVISORIO: verifica/correggi il percorso reale delle cartelle asset nel repo.
// Pattern atteso: {CODICE}_banner.png per i banner, {CODICE}_{TIPO_UNITA}.png per le unità.
// Asset locali: caricati da src/images/{codice}/ tramite import.meta.glob (Vite li
// serve come moduli, non come stringhe URL dirette). Chiave = percorso relativo esatto.
const bannerModules = import.meta.glob("./images/*/*_banner.png", { eager: true, import: "default" });
const unitImageModules = import.meta.glob("./images/*/*.png", { eager: true, import: "default" });

function getBannerUrl(code) {
  if (!code) return null;
  const c = code.toLowerCase();
  const key = `./images/${c}/${c}_banner.png`;
  return bannerModules[key] || null;
}

function getUnitImageUrl(code, tipo) {
  if (!code || !tipo) return null;
  const c = code.toLowerCase();
  const key = `./images/${c}/${c}_${tipo.toLowerCase()}.png`;
  return unitImageModules[key] || null;
}

//const LOGO_URL = "https://raw.githubusercontent.com/maxm4004/Tabletop-Simulator-Lua/main/logo/logo01.png";
const LOGO_URL = "/logo.png";

function SealBadge() {
  return (
    <div className="relative w-[200px] shrink-0 flex flex-col items-center justify-center">
      <img src={LOGO_URL} alt="WARFORGE" className="w-[200px] h-[220px] object-contain drop-shadow-[0_0_6px_#9C7A3C55]" />
    </div>
  );
}

function ArmyBanner({ code, name, subname, period, enemies, onEnemyClick }) {
  const url = getBannerUrl(code);
  const containerClass = url
    ? "relative w-full aspect-[3153/627] overflow-hidden rounded border-2 border-black bg-black"
    : "relative w-full h-32 overflow-hidden rounded border-2 border-black bg-black";
  return (
    <div className={containerClass}>
      {url && (
        <img src={url} alt="" className="w-full h-full object-cover" />
      )}
      {name && (
        <div className="absolute inset-0 flex items-center pl-28 md:pl-56 -translate-y-8 bg-gradient-to-r from-black/35 via-black/10 to-transparent">
          <div>
            <h2
              style={{ fontFamily: "'Marcellus', serif" }}
              className="text-4xl md:text-6xl font-bold text-[#D4AF6A] tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            >
              {name}
            </h2>
            {subname && (
              <h3
                style={{ fontFamily: "'Marcellus', serif" }}
                className="text-sm md:text-base text-[#D4AF6A] tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              >
                {subname}
              </h3>
            )}
            {period && (
              <p style={{ fontFamily: "'Marcellus', serif" }} className="mt-1 text-xs md:text-sm text-[#EDE6D6]/80 tracking-wide">
                {period}
              </p>
            )}
            {enemies && enemies.length > 0 && (
              <p style={{ fontFamily: "'Marcellus', serif" }} className="mt-1 text-[10px] md:text-xs text-[#EDE6D6]/70 tracking-wide">
                avversari storici:{" "}
                {enemies.map((enemy, i) => {
                  const enemyTag = resolveEnemyTag(enemy);
                  const label = enemyTag ? ARMY_CATALOGS[enemyTag].name : enemy;
                  return (
                    <span key={enemy}>
                      {i > 0 && ", "}
                      {enemyTag ? (
                        <button
                          onClick={() => onEnemyClick && onEnemyClick(enemyTag)}
                          className="underline decoration-dotted text-[#D4AF6A]/90 hover:text-[#EDE6D6] transition-colors"
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      )}
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitImage({ code, tipo, floatLeft }) {
  const url = getUnitImageUrl(code, tipo);
  return (
    <div className={`h-40 aspect-[3/4] overflow-hidden rounded border-2 border-black bg-white ${floatLeft ? "float-left mr-4 mb-2" : ""}`}>
      {url && (
        <img
          src={url}
          alt=""
          className="w-full h-full object-contain"
        />
      )}
    </div>
  );
}


function AddUnitForm({ catalog, roster, onAdd }) {
  const alreadyAdded = new Set(roster.map((entry) => entry.templateName));
  const selectable = catalog.units.filter((u) => u.type && u.bases_per_unit && !(u.is_key_unit && u.bases_min > 0) && !alreadyAdded.has(u.name));
  const [templateName, setTemplateName] = useState("");

  if (selectable.length === 0) return null;

  const handleAddClick = () => {
    const template = catalog.units.find((u) => u.name === templateName);
    if (template) {
      onAdd({ template, numBasi: template.bases_per_unit, superiore: false });
      setTemplateName("");
    }
  };

  return (
    <div className="bg-[#EDE6D6] border border-[#9C7A3C] p-4">
      <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
        Aggiungi Nuova Unità ({catalog.name})
        <div className="flex gap-2">
          <select
            className="flex-1 border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          >
            <option value="" disabled>— seleziona un'unità —</option>
            {selectable.map((u) => (
              <option key={u.name} value={u.name}>
                {u.name} · {u.type}{u.morale ? ` · ${u.morale}` : ""} · {u.bases_per_unit * u.cost_per_base}pt
              </option>
            ))}
          </select>
          <button
            onClick={handleAddClick}
            disabled={!templateName}
            className="bg-[#7A2E2E] text-[#EDE6D6] px-4 py-1.5 text-sm font-mono tracking-wide hover:bg-[#8f3737] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            Aggiungi
          </button>
        </div>
      </label>
    </div>
  );
}

function UnitRow({ entry, index, catalog, armyCode, armyTemplates, onRemove, onUpdateBasi, onUpdateBasiPerRango, onUpdateModel }) {
  const [open, setOpen] = useState(false);
  const unit = entry.unit;
  const def = UNIT_TYPES[unit.tipo];
  const cost = unit.basi.length * entry.costPerBase;
  const template = catalog.units.find((u) => u.name === entry.templateName);
  const capacitaLabel = template ? template.capabilities.map(formatCapacita).join(", ") : "";

  return (
    <div className="border-b border-[#9C7A3C]/30">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-4 py-2 px-3 hover:bg-[#9C7A3C]/5 group cursor-pointer"
      >
        <span className="font-mono text-xs text-[#9C7A3C] w-6 text-right shrink-0">{index + 1}.</span>

        <div className="w-64 shrink-0">
          <div className="text-sm text-[#EDE6D6] font-medium whitespace-nowrap">{entry.isKeyUnit ? "★ " : ""}{unit.nome_display}</div>
        </div>

        <span className="font-mono text-xs text-[#EDE6D6]/60 w-10 text-center shrink-0" title={def?.name || ""}>{template?.commander ? "" : unit.tipo}</span>

        <div className="w-24 shrink-0 text-xs font-mono text-[#EDE6D6]/80">
          {unit.morale || ""}{unit.modificatore ? ` (${unit.modificatore})` : ""}
        </div>

        <div className="w-28 shrink-0 text-xs text-[#EDE6D6]/70">{unit.armi.map((w) => WEAPONS[w]?.label || w).join(", ")}</div>

        <div className="flex-1 text-xs text-[#EDE6D6]/60 truncate" title={capacitaLabel}>{capacitaLabel}</div>

        <div className="w-16 flex justify-center text-sm font-mono text-[#EDE6D6]/80">
          {template?.bases_per_unit ? Math.round(unit.basi.length / template.bases_per_unit) : "—"}
        </div>

        <div className="w-20 flex justify-center text-sm font-mono text-[#EDE6D6]/80">
          {unit.basi.length}
        </div>

        <span className="font-mono text-[10px] text-[#EDE6D6]/50 w-16 text-right shrink-0">
          {template ? `${template.bases_per_unit * template.cost_per_base}pt` : ""}
        </span>

        <span className="font-mono text-[10px] text-[#9C7A3C] w-14 text-right shrink-0">{cost}pt</span>

        <div className="w-8 flex justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!(template && template.is_key_unit && template.bases_min > 0) && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              title="Rimuovi unità"
              className="text-[#c26b6b] hover:text-[#e08a8a] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="bg-[#EDE6D6] border-t border-[#9C7A3C]/40 px-4 py-4" onClick={(e) => e.stopPropagation()}>
          <UnitImage key={`${armyCode}-${unit.tipo}`} code={armyCode} tipo={unit.tipo} floatLeft />

          <div className="text-xs font-mono">
            <div className="bg-[#9C7A3C]/15 px-3 py-1.5">
              <span className="font-bold text-[#7A2E2E]">Tipo: </span>
              <span className="text-[#2B2622]">{template?.commander ? "Comandante" : `${unit.tipo} · ${def?.name || ""}`}</span>
            </div>
            <div className="px-3 py-1.5">
              <span className="font-bold text-[#7A2E2E]">Morale: </span>
              <span className="text-[#2B2622]">{unit.morale || ""}{unit.modificatore ? ` (${unit.modificatore})` : ""}</span>
            </div>
            <div className="bg-[#9C7A3C]/15 px-3 py-1.5">
              <span className="font-bold text-[#7A2E2E]">Armi: </span>
              <span className="text-[#2B2622]">{unit.armi.map((w) => WEAPONS[w]?.label || w).join(", ")}</span>
            </div>
            <div className="px-3 py-1.5">
              <span className="font-bold text-[#7A2E2E]">Capacità: </span>
              {template && template.capabilities.length > 0 ? (
                template.capabilities.map((c) => (
                  <span key={c} className="text-[#2B2622]"><span className="font-bold">{formatCapacita(c)}</span>: {CAPABILITIES_INFO[c] || ""}; </span>
                ))
              ) : <span className="text-[#2B2622]"></span>}
            </div>
            <div className="bg-[#9C7A3C]/15 px-3 py-1.5">
              <span className="font-bold text-[#7A2E2E]">Costo per base: </span>
              <span className="text-[#2B2622]">{entry.costPerBase}pt</span>
            </div>
            {template && template.bases_min != null && (
              <div className="px-3 py-1.5">
                <span className="font-bold text-[#7A2E2E]">Limiti Army List: </span>
                <span className="text-[#2B2622]">{template.bases_min}-{template.bases_max} basi</span>
              </div>
            )}
            {template && (
              <div className="bg-[#9C7A3C]/15 px-3 py-1.5">
                <span className="font-bold text-[#7A2E2E]">Basi per unità: </span>
                <span className="text-[#2B2622]">{template.bases_per_unit}</span>
              </div>
            )}
            {template && (
              <div className="px-3 py-1.5">
                <span className="font-bold text-[#7A2E2E]">Numero unità: </span>
                <span className="text-[#2B2622]">{Math.round(unit.basi.length / template.bases_per_unit)}</span>
              </div>
            )}
            {template && template.notes && (
              <div className="bg-[#9C7A3C]/15 px-3 py-1.5">
                <span className="font-bold text-[#7A2E2E]">Note: </span>
                <span className="text-[#2B2622] italic">{template.notes}</span>
              </div>
            )}
            <div className="bg-[#7A2E2E]/10 px-3 py-1.5">
              <span className="font-bold text-[#7A2E2E]">Costo totale: </span>
              <span className="text-[#7A2E2E] font-bold">{cost}pt</span>
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="font-bold text-[#7A2E2E]">Numero unità: </span>
              <input
                type="number"
                min={template?.bases_per_unit ? Math.ceil((template.bases_min || 0) / template.bases_per_unit) : 0}
                value={template?.bases_per_unit ? Math.round(unit.basi.length / template.bases_per_unit) : unit.basi.length}
                onChange={(e) => {
                  const bpu = template?.bases_per_unit || 1;
                  const numBasi = Math.max(0, Number(e.target.value) || 0) * bpu;
                  onUpdateBasi(index, numBasi, template?.bases_min ?? 0);
                }}
                className="border border-[#9C7A3C]/60 bg-white text-[#2B2622] px-2 py-1 text-sm w-20"
              />
              <span className="text-[10px] text-[#7A2E2E]/70">= {unit.basi.length} basi</span>
              {template?.bases_min > 0 && template?.bases_per_unit && (
                <span className="text-[10px] italic text-[#7A2E2E]/70">min {Math.ceil(template.bases_min / template.bases_per_unit)} unità</span>
              )}
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="font-bold text-[#7A2E2E]">Basi per rango: </span>
              <input
                type="number"
                min={1}
                value={unit.basi_per_rango || 4}
                onChange={(e) => onUpdateBasiPerRango(index, e.target.value)}
                className="border border-[#9C7A3C]/60 bg-white text-[#2B2622] px-2 py-1 text-sm w-20"
              />
              <span className="text-[10px] text-[#7A2E2E]/70">quante basi affiancate per riga prima di formare un nuovo rango</span>
            </div>
            <div className="bg-[#9C7A3C]/15 px-3 py-2 flex items-center gap-2">
              <span className="font-bold text-[#7A2E2E]">Modello 3D: </span>
              <select
                value={unit.model || ""}
                onChange={(e) => onUpdateModel(index, e.target.value)}
                className="border border-[#9C7A3C]/60 bg-white text-[#2B2622] px-2 py-1 text-sm"
              >
                <option value="">— nessuno —</option>
                {(armyTemplates || []).filter((t) => t.tipo === unit.tipo).map((t) => (
                  <option key={t.nickname} value={t.nickname}>{t.nickname}</option>
                ))}
              </select>
              {(armyTemplates || []).filter((t) => t.tipo === unit.tipo).length === 0 && (
                <span className="text-[10px] italic text-[#7A2E2E]/70">nessun modello {unit.tipo} in Template.json per questo esercito</span>
              )}
            </div>
          </div>

          <div className="clear-both"></div>
        </div>
      )}
    </div>
  );
}

export default function ArmyBuilder({ githubConfig, templates, rosters: rostersProp, setRosters: setRostersProp }) {
  const catalogTags = ARMY_KEYS;
  const [currentTag, setCurrentTag] = useState(catalogTags[0]);
  const [internalRosters, setInternalRosters] = useState(() => {
    const initial = {};
    Object.entries(ARMY_CATALOGS).forEach(([tag, cat]) => {
      initial[tag] = initRosterForCatalog(cat);
    });
    return initial;
  });
  const rosters = rostersProp ?? internalRosters;
  const setRosters = setRostersProp ?? setInternalRosters;
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const [githubStatus, setGithubStatus] = useState("");

  const catalog = ARMY_CATALOGS[currentTag];
  const roster = rosters[currentTag] || [];

  const errors = useMemo(() => validateRoster(roster, catalog), [roster, catalog]);
  const totalCost = useMemo(() => computeTotalCost(roster), [roster]);

  if (!catalog) {
    return (
      <div className="min-h-screen bg-[#0A0908] p-6 font-sans flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-mono text-sm text-[#EDE6D6]/70">Caricamento dati esercito da GitHub...</p>
          <p className="font-mono text-xs text-[#EDE6D6]/40">Se il messaggio persiste, controlla owner/repo/token nella tab "Impostazioni".</p>
        </div>
      </div>
    );
  }

  const setRoster = (next) => setRosters((r) => ({ ...r, [currentTag]: next }));

  const handleAdd = ({ template, numBasi, superiore }) => {
    const unit = buildUnitFromTemplate(template, { numBasi, superiore });
    setRoster([...roster, { templateName: template.name, unit, costPerBase: template.cost_per_base, isKeyUnit: template.is_key_unit }]);
  };

  const handleRemove = (i) => setRoster(roster.filter((_, idx) => idx !== i));

  const handleUpdateBasi = (i, newNumBasi, minFloor = 0) => {
    const n = Math.max(minFloor, Number(newNumBasi) || 0);
    setRoster(roster.map((entry, idx) => {
      if (idx !== i) return entry;
      return { ...entry, unit: { ...entry.unit, basi: buildBasi(entry.unit.tipo, n, entry.unit.basi_per_rango) } };
    }));
  };

  const handleUpdateBasiPerRango = (i, newBasiPerRango) => {
    const perRango = Math.max(1, Number(newBasiPerRango) || 4);
    setRoster(roster.map((entry, idx) => {
      if (idx !== i) return entry;
      const n = entry.unit.basi.length;
      return { ...entry, unit: { ...entry.unit, basi_per_rango: perRango, basi: buildBasi(entry.unit.tipo, n, perRango) } };
    }));
  };

  const handleUpdateModel = (i, model) => {
    setRoster(roster.map((entry, idx) => {
      if (idx !== i) return entry;
      return { ...entry, unit: { ...entry.unit, model } };
    }));
  };

  const armyTemplates = (templates && templates[currentTag]) || [];

  const unita = roster.map((entry) => entry.unit);
  const armyName = catalog.name;
  const exportedArmy = buildArmy(armyName, ARMY_CODES[currentTag] || currentTag.toUpperCase().slice(0, 3), unita);
  const jsonString = JSON.stringify(exportedArmy, null, 2);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard non disponibile
    }
  };

  const githubApplyRosterFromUnita = (unitaArray) => {
    const newRoster = (unitaArray || []).map((unit) => {
      const template = catalog.units.find((u) => u.name === unit.nome_display);
      return {
        templateName: unit.nome_display,
        unit,
        costPerBase: template ? template.cost_per_base : 0,
        isKeyUnit: template ? template.is_key_unit : false,
      };
    });
    setRoster(newRoster);
  };

  const githubPath = () => githubConfig.pathTemplate.replace("{tag}", currentTag).replace("{code}", (ARMY_CODES[currentTag] || "").toLowerCase()).trim().replace(/^\/+/, "");

  const saveToGithub = async () => {
    const owner = (githubConfig.owner || "").trim();
    const repo = (githubConfig.repo || "").trim();
    const branch = (githubConfig.branch || "main").trim();
    const token = (githubConfig.token || "").trim();
    if (!owner || !repo || !token) {
      setGithubStatus("⚠ Compila owner, repo e token nelle impostazioni.");
      return;
    }
    setGithubStatus("Salvataggio in corso...");
    const path = githubPath();
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    try {
      // Recupera lo SHA del file esistente (serve per aggiornarlo, non serve se è nuovo)
      let sha;
      const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
        headers: { Authorization: `token ${token}` },
      });
      if (getResp.ok) {
        const getData = await getResp.json();
        sha = getData.sha;
      }

      const contentBase64 = btoa(unescape(encodeURIComponent(jsonString)));
      const putResp = await fetch(apiUrl, {
        method: "PUT",
        headers: { Authorization: `token ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Aggiorna ${path} da Army Builder`,
          content: contentBase64,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!putResp.ok) {
        const err = await putResp.json();
        setGithubStatus(`⚠ Errore: ${err.message || putResp.status}`);
        return;
      }
      setGithubStatus(`✓ Salvato su ${owner}/${repo}/${path}`);
    } catch (err) {
      setGithubStatus(`⚠ Errore di rete: ${err.message}`);
    }
  };

  const loadFromGithub = async () => {
    const owner = (githubConfig.owner || "").trim();
    const repo = (githubConfig.repo || "").trim();
    const branch = (githubConfig.branch || "main").trim();
    const token = (githubConfig.token || "").trim();
    if (!owner || !repo) {
      setGithubStatus("⚠ Compila almeno owner e repo nelle impostazioni.");
      return;
    }
    setGithubStatus("Caricamento in corso...");
    const path = githubPath();
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
    try {
      const resp = await fetch(apiUrl, {
        headers: token ? { Authorization: `token ${token}` } : {},
      });
      if (!resp.ok) {
        setGithubStatus(`⚠ File non trovato o inaccessibile (${resp.status}).`);
        return;
      }
      const data = await resp.json();
      const decoded = decodeURIComponent(escape(atob(data.content)));
      const parsed = JSON.parse(decoded);
      githubApplyRosterFromUnita(parsed.unita);
      setGithubStatus(`✓ Caricato da ${owner}/${repo}/${path}`);
    } catch (err) {
      setGithubStatus(`⚠ Errore: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0908] p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-5">

        <div className="flex items-center gap-4">
          <SealBadge />
          <div className="flex-1 flex flex-col items-center justify-center">
            <h1
              style={{ fontFamily: "'Marcellus', serif" }}
              className="text-5xl font-bold text-[#EDE6D6] tracking-[0.2em] uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
            >
              Imperi <span className="text-[#9C7A3C]">e</span> Feudi
            </h1>
            <div className="mt-2 flex items-center gap-3 w-2/3">
              <div className="flex-1 h-px bg-[#9C7A3C]/50" />
              <span className="text-[#9C7A3C] text-xs tracking-[0.3em]">✦</span>
              <div className="flex-1 h-px bg-[#9C7A3C]/50" />
            </div>
          </div>
          <select
            value={currentTag}
            onChange={(e) => setCurrentTag(e.target.value)}
            className="bg-[#EDE6D6] border border-[#9C7A3C] px-3 py-1.5 text-sm font-mono"
          >
            {catalogTags.map((tag) => (
              <option key={tag} value={tag}>{ARMY_CODES[tag] || "?"} - {ARMY_CATALOGS[tag]?.name || tag}</option>
            ))}
          </select>
        </div>

        <div className="-mt-24">
          <ArmyBanner
            key={currentTag}
            code={ARMY_CODES[currentTag]}
            name={catalog.name}
            subname={catalog.subname}
            period={catalog.period}
            enemies={catalog.historical_enemies}
            onEnemyClick={setCurrentTag}
          />
        </div>

        <AddUnitForm catalog={catalog} roster={roster} onAdd={handleAdd} />

        <div className="bg-[#26211d] border border-[#9C7A3C]/40">
          <div className="flex items-center gap-4 border-b border-[#9C7A3C]/40 py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-[#9C7A3C]">
            <span className="w-6"></span>
            <span className="w-64">Unità</span>
            <span className="w-10 text-center">Tipo</span>
            <span className="w-24">Morale</span>
            <span className="w-28">Armi</span>
            <span className="flex-1">Capacità</span>
            <span className="w-16 text-center">N. Unità</span>
            <span className="w-20 text-center">Numero basi</span>
            <span className="w-16 text-right">Punti/Unità</span>
            <span className="w-14 text-right">Punti</span>
            <span className="w-8"></span>
          </div>
          {roster.length === 0 ? (
            <div className="py-8 text-center text-sm font-mono text-[#EDE6D6]/40">
              Nessuna unità in armylist. Aggiungine una dal catalogo qui sopra.
            </div>
          ) : (
            roster
              .map((entry, i) => ({ entry, i }))
              .sort((a, b) => {
                const aTemplate = catalog.units.find((u) => u.name === a.entry.templateName);
                const bTemplate = catalog.units.find((u) => u.name === b.entry.templateName);
                const rank = (t) => (t?.commander === "CnC" ? 0 : t?.commander === "Sub" ? 1 : 2);
                return rank(aTemplate) - rank(bTemplate);
              })
              .map(({ entry, i }) => (
                <UnitRow key={i} entry={entry} index={i} catalog={catalog} armyCode={ARMY_CODES[currentTag]} armyTemplates={armyTemplates} onRemove={handleRemove} onUpdateBasi={handleUpdateBasi} onUpdateBasiPerRango={handleUpdateBasiPerRango} onUpdateModel={handleUpdateModel} />
              ))
          )}
        </div>

        <div className="flex items-center justify-end text-xs font-mono text-[#EDE6D6]/70 px-1">
          <span>Totale: {totalCost}pt</span>
        </div>

        {errors.length > 0 && (
          <div className="bg-[#7A2E2E]/10 border border-[#7A2E2E]/50 px-4 py-2 space-y-1">
            {errors.map((e, i) => (
              <div key={i} className="text-xs font-mono text-[#c26b6b]">⚠ {e}</div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowJson((s) => !s)}
            className="bg-[#9C7A3C] text-[#1C1917] px-4 py-2 text-sm font-mono font-bold tracking-wide hover:bg-[#b28e49] transition-colors"
          >
            {showJson ? "Nascondi JSON" : "Esporta JSON"}
          </button>
          {showJson && (
            <button
              onClick={copyJson}
              className="border border-[#9C7A3C] text-[#EDE6D6] px-4 py-2 text-sm font-mono hover:bg-[#9C7A3C]/10 transition-colors"
            >
              {copied ? "Copiato ✓" : "Copia negli appunti"}
            </button>
          )}
          <button
            onClick={saveToGithub}
            className="bg-[#7A2E2E] text-[#EDE6D6] px-4 py-2 text-sm font-mono font-bold tracking-wide hover:bg-[#8f3737] transition-colors"
          >
            Salva
          </button>
          <button
            onClick={loadFromGithub}
            className="border border-[#9C7A3C] text-[#EDE6D6] px-4 py-2 text-sm font-mono hover:bg-[#9C7A3C]/10 transition-colors"
          >
            Carica
          </button>
          <span className="text-[10px] font-mono text-[#EDE6D6]/40 ml-auto">GitHub: {githubConfig.owner || "?"}/{githubConfig.repo || "?"}/{githubPath()}</span>
        </div>

        {githubStatus && (
          <div className="text-xs font-mono text-[#EDE6D6]/70 -mt-2">{githubStatus}</div>
        )}

        {showJson && (
          <pre className="bg-[#0f0d0b] border border-[#9C7A3C]/40 text-[#9dd39d] text-xs p-4 overflow-auto max-h-96 font-mono">
            {jsonString}
          </pre>
        )}
      </div>
    </div>
  );
}
