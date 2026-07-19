import React, { useState } from "react";
import { ARMY_CATALOGS, ARMY_CODES, ARMY_KEYS } from "./ArmyBuilder.jsx";

/* ============================================================
   Generazione file esercito — WARFORGE
   Fonde i 3 file in un unico {tag}-army.json pronto per il gioco:
   - Army Builder → "unita" (armylist: tipo, model, basi, ecc.)
   - Coordinate.json → geometria (offset/scale/material/type) per gruppo tipo
   - Template.json → mesh URL per nickname
   Risultato: "unita" (invariato) + "modelli" (catalogo nickname
   già fuso, mesh+geometria insieme) — un solo file, non serve
   più che il gioco apra Coordinate.json e Template.json a parte.
   ============================================================ */

function findGroupForTipo(groups, tipo) {
  const entry = Object.entries(groups || {}).find(([, g]) => g.tipi.includes(tipo));
  return entry ? entry[1] : null;
}

function buildMeshNode(meshData, geometry) {
  const kind = meshData?.kind || "model";
  const rotY = meshData?.rotY_fix != null ? { rotY: meshData.rotY_fix } : {};

  if (kind === "bundle") {
    return {
      customAssetbundle: {
        assetBundleURL: meshData?.assetBundleURL || "",
        assetBundleSecondaryURL: meshData?.assetBundleSecondaryURL || "",
        material: geometry.material,
        type: geometry.type,
        ...(geometry.scaleX !== undefined ? { scaleX: geometry.scaleX } : {}),
        ...(geometry.scaleY !== undefined ? { scaleY: geometry.scaleY } : {}),
        ...(geometry.scaleZ !== undefined ? { scaleZ: geometry.scaleZ } : {}),
        ...(geometry.offsetX !== undefined ? { offsetX: geometry.offsetX, offsetY: geometry.offsetY, offsetZ: geometry.offsetZ } : {}),
        ...rotY,
      },
    };
  }
  return {
    customMesh: {
      meshURL: meshData?.meshURL || "",
      diffuseURL: meshData?.diffuseURL || "",
      colliderURL: meshData?.colliderURL || "",
      material: geometry.material,
      type: geometry.type,
      ...(geometry.scaleX !== undefined ? { scaleX: geometry.scaleX } : {}),
      ...(geometry.scaleY !== undefined ? { scaleY: geometry.scaleY } : {}),
      ...(geometry.scaleZ !== undefined ? { scaleZ: geometry.scaleZ } : {}),
      ...(geometry.offsetX !== undefined ? { offsetX: geometry.offsetX, offsetY: geometry.offsetY, offsetZ: geometry.offsetZ } : {}),
      ...rotY,
    },
  };
}

function mergeArmyFile(tag, roster, groups, templatesForArmy) {
  const catalog = ARMY_CATALOGS[tag];
  const armyCode = ARMY_CODES[tag];
  const warnings = [];

  if (!catalog) {
    return { exportObj: { versione: "2.0-IEF", nome: tag, tag: armyCode || "", unita: [], modelli: {} }, warnings: ["⚠ Dati esercito non ancora caricati da GitHub."] };
  }

  const usedNicknames = new Set(
    roster.map((e) => e.unit.model).filter(Boolean)
  );

  const unitiSenzaModello = roster.filter((e) => !e.unit.model).map((e) => e.unit.nome_display);
  if (unitiSenzaModello.length > 0) {
    warnings.push(`Unità senza modello 3D assegnato (escluse dal catalogo modelli, ma presenti in "unita"): ${unitiSenzaModello.join(", ")}`);
  }

  const modelli = {};
  usedNicknames.forEach((nickname) => {
    const templateEntry = (templatesForArmy || []).find((t) => t.nickname === nickname);
    if (!templateEntry) {
      warnings.push(`Nickname "${nickname}" assegnato a un'unità ma non trovato in Template.json per questo esercito.`);
      return;
    }
    const group = templateEntry.groupId ? groups?.[templateEntry.groupId] : findGroupForTipo(groups, templateEntry.tipo);
    if (!group || !group.base || !group.slots || group.slots.length === 0) {
      warnings.push(`Nessun gruppo geometrico popolato in Coordinate.json per il tipo "${templateEntry.tipo}" (nickname "${nickname}").`);
      return;
    }

    const children = group.slots.map((slot, i) => {
      const meshSlot = templateEntry.slots?.[i] || {};
      const childNode = buildMeshNode(meshSlot, slot);
      if (slot.child) {
        const childMesh = templateEntry.children?.[i];
        if (childMesh) {
          childNode.children = [buildMeshNode(childMesh, slot.child)];
        }
        // Se il modello non prevede una figura annidata per questo slot
        // (checkbox non spuntata in Elementi), semplicemente non la aggiunge:
        // il gruppo Coordinate rende disponibile lo slot, non lo impone.
      }
      return childNode;
    });

    modelli[nickname] = {
      ...buildMeshNode(templateEntry.base, group.base),
      children,
    };
  });

  const exportObj = {
    versione: "2.0-IEF",
    nome: catalog.name,
    tag: armyCode,
    unita: roster.map((e) => e.unit),
    modelli,
  };

  return { exportObj, warnings };
}

export default function ArmyExport({ rosters, groups, templates, githubConfig }) {
  const catalogTags = ARMY_KEYS;
  const [currentTag, setCurrentTag] = useState(catalogTags[0]);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const [githubStatus, setGithubStatus] = useState("");

  const roster = (rosters && rosters[currentTag]) || [];
  const templatesForArmy = (templates && templates[currentTag]) || [];

  const { exportObj, warnings } = mergeArmyFile(currentTag, roster, groups, templatesForArmy);
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

  const resolvedPath = () => {
    const template = (githubConfig?.generatedArmyPathTemplate) || "generated/{code}-army.json";
    const code = (ARMY_CODES[currentTag] || "").toLowerCase();
    return template.replace("{tag}", currentTag).replace("{code}", code).trim().replace(/^\/+/, "");
  };

  const saveToGithub = async () => {
    const cfg = githubConfig || {};
    const owner = (cfg.owner || "").trim();
    const repo = (cfg.repo || "").trim();
    const branch = (cfg.branch || "main").trim();
    const token = (cfg.token || "").trim();
    const path = resolvedPath();
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
          message: `Genera ${path}`,
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

  return (
    <div className="min-h-screen bg-[#0A0908] p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="font-serif text-2xl text-[#EDE6D6] tracking-wide">Generazione file esercito</h1>
          <p className="text-xs font-mono text-[#EDE6D6]/50">
            Fonde armylist + Coordinate.json + Template.json in un unico file, pronto per il gioco.
          </p>
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

        <div className="bg-[#26211d] border border-[#9C7A3C]/40 px-4 py-3 text-xs font-mono text-[#EDE6D6]/70 space-y-1">
          <div>Unità in armylist: <span className="text-[#9C7A3C] font-bold">{roster.length}</span></div>
          <div>Nickname unici nel catalogo modelli generato: <span className="text-[#9C7A3C] font-bold">{Object.keys(exportObj.modelli).length}</span></div>
        </div>

        {warnings.length > 0 && (
          <div className="bg-[#7A2E2E]/10 border border-[#7A2E2E]/50 px-4 py-2 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="text-xs font-mono text-[#c26b6b]">⚠ {w}</div>
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
          <span className="text-[10px] font-mono text-[#EDE6D6]/40 ml-auto">
            GitHub: {(githubConfig?.owner) || "?"}/{(githubConfig?.repo) || "?"}/{resolvedPath()}
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
