import React, { useState } from "react";

/* ============================================================
   Coordinate.json Editor — WARFORGE
   Gestisce i gruppi di geometria (offset/scale/material/type) per
   footprint+numero-figure, condivisi da tutte le 14 armate IEF.
   Non contiene mai URL mesh/diffuse/collider — quelle vivono nel
   Template.json "slim" per esercito (prossimo editor).
   ============================================================ */

const UNIT_TYPES_LIST = ["KN", "CP", "CL", "FM", "FL", "FP", "ART", "EL"];

const INITIAL_GROUPS = {
  G_4x3_f3: {
    note: "KN, CP — base 4x3cm, 3 figure a cavallo (slot+child). Ricavato da ENG_AC1/FRA_AC1.",
    tipi: ["KN", "CP"],
    base: { material: 3, type: 0, scaleZ: 1 },
    slots: [
      { offsetX: -1.0, offsetY: 0, offsetZ: 0.4, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68,
        child: { offsetX: -1.0, offsetY: 1.3, offsetZ: -0.1, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 } },
      { offsetX: 0, offsetY: 0, offsetZ: 0.4, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68,
        child: { offsetX: 0, offsetY: 1.3, offsetZ: -0.1, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 } },
      { offsetX: 1.0, offsetY: 0, offsetZ: 0.4, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68,
        child: { offsetX: 1.0, offsetY: 1.3, offsetZ: -0.1, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 } },
    ],
  },
  G_4x3_f2: {
    note: "CL — base 4x3cm, 2 figure. DA FARE: nessun riferimento diretto nei dati Lionheart forniti, sospeso.",
    tipi: ["CL"],
    base: null,
    slots: [],
  },
  G_4x2_f3: {
    note: "FM — base 4x2cm, 3 figure appiedate. Ricavato da ENG_UI1/ENG_UI2. Attenzione: nei dati sorgente una delle due varianti aveva rotY:270 su tutti gli slot (mesh esportato con rotazione errata), l'altra no — qui lasciato senza rotY, verificare caso per caso in Template.json con rotY_fix.",
    base: { material: 3, type: 0, scaleZ: 0.65 },
    slots: [
      { offsetX: -0.942, offsetY: 0.671, offsetZ: -0.076, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
      { offsetX: 0.074, offsetY: 0.671, offsetZ: -0.113, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
      { offsetX: 1.112, offsetY: 0.671, offsetZ: -0.046, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
    ],
  },
  G_4x2_f2: {
    note: "FL — base 4x2cm, 2 figure. DA FARE: sospeso.",
    tipi: ["FL"],
    base: null,
    slots: [],
  },
  "G_4x1.5_f4": {
    note: "FP — base 4x1.5cm, 4 figure appiedate. Ricavato da ENG_AI1.",
    tipi: ["FP"],
    base: { material: 3, type: 0, scaleZ: 0.5 },
    slots: [
      { offsetX: -1.084, offsetY: 0.671, offsetZ: -0.089, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
      { offsetX: -0.278, offsetY: 0.671, offsetZ: -0.092, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
      { offsetX: 0.481, offsetY: 0.671, offsetZ: -0.090, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
      { offsetX: 1.226, offsetY: 0.671, offsetZ: -0.090, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 },
    ],
  },
  G_4x4_f3: {
    note: "ART, EL — base 4x4cm, 3 figure. DA FARE: nessun riferimento nei dati forniti, sospeso.",
    tipi: ["ART", "EL"],
    base: null,
    slots: [],
  },
  G_gen_f1: {
    note: "GEN — caso speciale, 1 figura, nessuna base_depth_cm definita. DA FARE: sospeso.",
    tipi: ["GEN"],
    base: null,
    slots: [],
  },
};

function emptySlot() {
  return { offsetX: 0, offsetY: 0, offsetZ: 0, material: 3, type: 0, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68, child: null };
}

function NumberField({ label, value, onChange, step = 0.01 }) {
  return (
    <label className="flex flex-col text-[10px] font-mono text-[#EDE6D6]/60 gap-0.5">
      {label}
      <input
        type="number"
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="border border-[#9C7A3C]/60 bg-[#EDE6D6] text-[#2B2622] px-1.5 py-1 text-xs w-20"
      />
    </label>
  );
}

function SlotEditor({ slot, onChange, onRemove, canRemove }) {
  const setField = (field, value) => onChange({ ...slot, [field]: value });

  const toggleChild = () => {
    if (slot.child) {
      const { child, ...rest } = slot;
      onChange({ ...rest, child: null });
    } else {
      onChange({ ...slot, child: { offsetX: slot.offsetX, offsetY: 1.3, offsetZ: -0.1, material: 3, type: 1, scaleX: 0.68, scaleY: 0.68, scaleZ: 0.68 } });
    }
  };

  return (
    <div className="border border-[#9C7A3C]/40 bg-[#26211d] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#9C7A3C]">Slot</span>
        {canRemove && (
          <button onClick={onRemove} className="text-[10px] font-mono text-[#c26b6b] hover:text-[#e08a8a] underline">rimuovi</button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="offsetX" value={slot.offsetX} onChange={(v) => setField("offsetX", v)} />
        <NumberField label="offsetY" value={slot.offsetY} onChange={(v) => setField("offsetY", v)} />
        <NumberField label="offsetZ" value={slot.offsetZ} onChange={(v) => setField("offsetZ", v)} />
        <NumberField label="material" value={slot.material} onChange={(v) => setField("material", v)} step={1} />
        <NumberField label="type" value={slot.type} onChange={(v) => setField("type", v)} step={1} />
        <NumberField label="scaleX" value={slot.scaleX} onChange={(v) => setField("scaleX", v)} />
        <NumberField label="scaleY" value={slot.scaleY} onChange={(v) => setField("scaleY", v)} />
        <NumberField label="scaleZ" value={slot.scaleZ} onChange={(v) => setField("scaleZ", v)} />
      </div>

      <label className="flex items-center gap-2 text-[10px] font-mono text-[#EDE6D6]/60">
        <input type="checkbox" checked={!!slot.child} onChange={toggleChild} />
        ha figura annidata (es. cavaliere sopra il cavallo)
      </label>

      {slot.child && (
        <div className="border-t border-[#9C7A3C]/30 pt-2 mt-1 pl-3 border-l-2 border-l-[#7A2E2E]/50">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7A2E2E]">Figlio (annidato)</span>
          <div className="grid grid-cols-4 gap-2 mt-1">
            <NumberField label="offsetX" value={slot.child.offsetX} onChange={(v) => onChange({ ...slot, child: { ...slot.child, offsetX: v } })} />
            <NumberField label="offsetY" value={slot.child.offsetY} onChange={(v) => onChange({ ...slot, child: { ...slot.child, offsetY: v } })} />
            <NumberField label="offsetZ" value={slot.child.offsetZ} onChange={(v) => onChange({ ...slot, child: { ...slot.child, offsetZ: v } })} />
            <NumberField label="material" value={slot.child.material} onChange={(v) => onChange({ ...slot, child: { ...slot.child, material: v } })} step={1} />
            <NumberField label="type" value={slot.child.type} onChange={(v) => onChange({ ...slot, child: { ...slot.child, type: v } })} step={1} />
            <NumberField label="scaleX" value={slot.child.scaleX} onChange={(v) => onChange({ ...slot, child: { ...slot.child, scaleX: v } })} />
            <NumberField label="scaleY" value={slot.child.scaleY} onChange={(v) => onChange({ ...slot, child: { ...slot.child, scaleY: v } })} />
            <NumberField label="scaleZ" value={slot.child.scaleZ} onChange={(v) => onChange({ ...slot, child: { ...slot.child, scaleZ: v } })} />
          </div>
        </div>
      )}
    </div>
  );
}

function GroupEditor({ groupId, group, onChange, onRename, onDelete }) {
  const setNote = (note) => onChange({ ...group, note });
  const setTipi = (tipiStr) => onChange({ ...group, tipi: tipiStr.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) });

  const setBaseEnabled = (enabled) => {
    onChange({ ...group, base: enabled ? { material: 3, type: 0, scaleZ: 1 } : null, slots: enabled ? group.slots : [] });
  };

  const updateSlot = (i, newSlot) => {
    const slots = [...group.slots];
    slots[i] = newSlot;
    onChange({ ...group, slots });
  };
  const addSlot = () => onChange({ ...group, slots: [...group.slots, emptySlot()] });
  const removeSlot = (i) => onChange({ ...group, slots: group.slots.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <input
          value={groupId}
          onChange={(e) => onRename(e.target.value)}
          className="font-serif text-lg text-[#EDE6D6] bg-transparent border-b border-[#9C7A3C]/40 focus:outline-none focus:border-[#9C7A3C] px-1"
        />
        <button onClick={onDelete} className="text-xs font-mono text-[#c26b6b] hover:text-[#e08a8a] underline">elimina gruppo</button>
      </div>

      <label className="flex flex-col text-xs font-mono text-[#EDE6D6]/70 gap-1">
        Tipi (separati da virgola)
        <input
          value={group.tipi.join(", ")}
          onChange={(e) => setTipi(e.target.value)}
          className="border border-[#9C7A3C]/60 bg-[#EDE6D6] text-[#2B2622] px-2 py-1 text-sm"
          placeholder="es. KN, CP"
        />
      </label>

      <label className="flex flex-col text-xs font-mono text-[#EDE6D6]/70 gap-1">
        Note
        <textarea
          value={group.note}
          onChange={(e) => setNote(e.target.value)}
          className="border border-[#9C7A3C]/60 bg-[#EDE6D6] text-[#2B2622] px-2 py-1 text-sm resize-y"
          rows={2}
        />
      </label>

      <label className="flex items-center gap-2 text-xs font-mono text-[#EDE6D6]/70">
        <input type="checkbox" checked={!!group.base} onChange={(e) => setBaseEnabled(e.target.checked)} />
        Gruppo popolato (ha una base e degli slot definiti)
      </label>

      {group.base && (
        <>
          <div className="border border-[#9C7A3C]/40 bg-[#26211d] p-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#9C7A3C]">Base</span>
            <div className="grid grid-cols-4 gap-2 mt-1">
              <NumberField label="material" value={group.base.material} onChange={(v) => onChange({ ...group, base: { ...group.base, material: v } })} step={1} />
              <NumberField label="type" value={group.base.type} onChange={(v) => onChange({ ...group, base: { ...group.base, type: v } })} step={1} />
              <NumberField label="scaleZ" value={group.base.scaleZ} onChange={(v) => onChange({ ...group, base: { ...group.base, scaleZ: v } })} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[#9C7A3C]">Slot ({group.slots.length})</span>
              <button onClick={addSlot} className="text-xs font-mono text-[#9C7A3C] hover:text-[#b28e49] underline">+ aggiungi slot</button>
            </div>
            {group.slots.map((slot, i) => (
              <SlotEditor
                key={i}
                slot={slot}
                onChange={(s) => updateSlot(i, s)}
                onRemove={() => removeSlot(i)}
                canRemove={group.slots.length > 0}
              />
            ))}
            {group.slots.length === 0 && (
              <div className="text-xs font-mono text-[#EDE6D6]/40 italic py-2">Nessuno slot ancora — aggiungine uno.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { INITIAL_GROUPS, UNIT_TYPES_LIST };

export default function ModelliEditor({ groups: groupsProp, setGroups: setGroupsProp, githubConfig } = {}) {
  const [internalGroups, setInternalGroups] = useState(INITIAL_GROUPS);
  const groups = groupsProp ?? internalGroups;
  const setGroups = setGroupsProp ?? setInternalGroups;
  const [selectedId, setSelectedId] = useState(Object.keys(INITIAL_GROUPS)[0]);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const [githubStatus, setGithubStatus] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  const assignedTipi = new Set(Object.values(groups).flatMap((g) => g.tipi));
  const unassignedTipi = UNIT_TYPES_LIST.filter((t) => !assignedTipi.has(t));

  const updateGroup = (id, newGroup) => setGroups((g) => ({ ...g, [id]: newGroup }));

  const renameGroup = (oldId, newId) => {
    if (!newId || newId === oldId || groups[newId]) return;
    setGroups((g) => {
      const { [oldId]: val, ...rest } = g;
      return { ...rest, [newId]: val };
    });
    setSelectedId(newId);
  };

  const deleteGroup = (id) => {
    setGroups((g) => {
      const { [id]: _, ...rest } = g;
      return rest;
    });
    const remaining = Object.keys(groups).filter((k) => k !== id);
    setSelectedId(remaining[0] || "");
  };

  const addGroup = () => {
    const id = newGroupName.trim();
    if (!id || groups[id]) return;
    setGroups((g) => ({ ...g, [id]: { note: "", tipi: [], base: null, slots: [] } }));
    setSelectedId(id);
    setNewGroupName("");
  };

  const exportObj = {
    versione: "1.0",
    gruppi: Object.fromEntries(
      Object.entries(groups).map(([id, g]) => [
        id,
        {
          _note: g.note,
          tipi: g.tipi,
          base: g.base,
          slots: g.slots.map((s) => {
            const { child, ...rest } = s;
            return child ? { ...rest, child } : rest;
          }),
        },
      ])
    ),
  };
  const jsonString = JSON.stringify(exportObj, null, 2);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard non disponibile
    }
  };

  const saveToGithub = async () => {
    const cfg = githubConfig || {};
    const owner = (cfg.owner || "").trim();
    const repo = (cfg.repo || "").trim();
    const branch = (cfg.branch || "main").trim();
    const token = (cfg.token || "").trim();
    const path = (cfg.coordinatePath || "Coordinate.json").trim().replace(/^\/+/, "");
    if (!owner || !repo || !token) {
      setGithubStatus("⚠ Compila owner, repo e token nella tab Impostazioni.");
      return;
    }
    setGithubStatus("Salvataggio in corso...");
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    try {
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
          message: `Aggiorna ${path} da Coordinate Editor`,
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
    const cfg = githubConfig || {};
    const owner = (cfg.owner || "").trim();
    const repo = (cfg.repo || "").trim();
    const branch = (cfg.branch || "main").trim();
    const token = (cfg.token || "").trim();
    const path = (cfg.coordinatePath || "Coordinate.json").trim().replace(/^\/+/, "");
    if (!owner || !repo) {
      setGithubStatus("⚠ Compila almeno owner e repo nella tab Impostazioni.");
      return;
    }
    setGithubStatus("Caricamento in corso...");
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
    try {
      const resp = await fetch(apiUrl, { headers: token ? { Authorization: `token ${token}` } : {} });
      if (!resp.ok) {
        setGithubStatus(`⚠ File non trovato o inaccessibile (${resp.status}).`);
        return;
      }
      const data = await resp.json();
      const decoded = decodeURIComponent(escape(atob(data.content)));
      const parsed = JSON.parse(decoded);
      const loadedGroups = {};
      Object.entries(parsed.gruppi || {}).forEach(([id, g]) => {
        loadedGroups[id] = { note: g._note || "", tipi: g.tipi || [], base: g.base, slots: g.slots || [] };
      });
      setGroups(loadedGroups);
      setSelectedId(Object.keys(loadedGroups)[0] || "");
      setGithubStatus(`✓ Caricato da ${owner}/${repo}/${path}`);
    } catch (err) {
      setGithubStatus(`⚠ Errore: ${err.message}`);
    }
  };

  const selectedGroup = groups[selectedId];

  return (
    <div className="min-h-screen bg-[#1C1917] p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-5">

        <div>
          <h1 className="font-serif text-2xl text-[#EDE6D6] tracking-wide">MODELLI</h1>
          <p className="text-xs font-mono text-[#EDE6D6]/50">
            Geometria standard per gruppo footprint+figure — condivisa da tutte le 14 armate IEF. Nessuna URL mesh qui.
          </p>
        </div>

        {unassignedTipi.length > 0 && (
          <div className="bg-[#7A2E2E]/10 border border-[#7A2E2E]/50 px-4 py-2">
            <span className="text-xs font-mono text-[#c26b6b]">⚠ Tipi non assegnati a nessun gruppo: {unassignedTipi.join(", ")}</span>
          </div>
        )}

        <div className="flex gap-5">
          <div className="w-56 shrink-0 space-y-1">
            {Object.entries(groups).map(([id, g]) => (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                className={`w-full text-left px-3 py-2 text-xs font-mono border ${
                  selectedId === id
                    ? "bg-[#9C7A3C]/20 border-[#9C7A3C] text-[#EDE6D6]"
                    : "bg-[#26211d] border-[#9C7A3C]/30 text-[#EDE6D6]/60 hover:bg-[#9C7A3C]/10"
                }`}
              >
                <div className="font-bold">{id}</div>
                <div className="text-[10px] opacity-70">
                  
                </div>
              </button>
            ))}

            <div className="flex gap-1 pt-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="nuovo_gruppo"
                className="flex-1 border border-[#9C7A3C]/60 bg-[#EDE6D6] text-[#2B2622] px-2 py-1 text-xs"
              />
              <button onClick={addGroup} className="bg-[#9C7A3C] text-[#1C1917] px-2 py-1 text-xs font-bold">+</button>
            </div>
          </div>

          <div className="flex-1 bg-[#26211d] border border-[#9C7A3C]/40 p-4">
            {selectedGroup ? (
              <GroupEditor
                groupId={selectedId}
                group={selectedGroup}
                onChange={(g) => updateGroup(selectedId, g)}
                onRename={(newId) => renameGroup(selectedId, newId)}
                onDelete={() => deleteGroup(selectedId)}
              />
            ) : (
              <div className="text-sm font-mono text-[#EDE6D6]/40">Nessun gruppo selezionato.</div>
            )}
          </div>
        </div>

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
          <span className="text-[10px] font-mono text-[#EDE6D6]/40 ml-auto">
            GitHub: {(githubConfig?.owner) || "?"}/{(githubConfig?.repo) || "?"}/{(githubConfig?.coordinatePath) || "Coordinate.json"}
          </span>
        </div>

        {githubStatus && (
          <div className="text-xs font-mono text-[#EDE6D6]/70">{githubStatus}</div>
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
