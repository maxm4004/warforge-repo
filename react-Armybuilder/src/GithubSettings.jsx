import React from "react";

/* ============================================================
   GitHub Settings — WARFORGE
   Configurazione condivisa (owner/repo/branch/percorso/token)
   usata da Army Builder per Salva/Carica. Persistita in
   localStorage, sollevata a livello App così resta la stessa
   in tutti i tab.
   ============================================================ */

export default function GithubSettings({ githubConfig, updateGithubConfig }) {
  return (
    <div className="min-h-screen bg-[#0A0908] p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-5">
        <h1 className="font-serif text-2xl text-[#EDE6D6] tracking-wide">Impostazioni GitHub</h1>
        <p className="text-xs font-mono text-[#EDE6D6]/50">
          Configurazione condivisa usata da "Salva" e "Carica" nell'Army Builder.
        </p>

        <div className="bg-[#EDE6D6] border border-[#9C7A3C] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Owner (utente/organizzazione)
              <input
                value={githubConfig.owner}
                onChange={(e) => updateGithubConfig({ owner: e.target.value })}
                placeholder="maxm4004"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Repo
              <input
                value={githubConfig.repo}
                onChange={(e) => updateGithubConfig({ repo: e.target.value })}
                placeholder="WARFORGE-IEF"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Branch
              <input
                value={githubConfig.branch}
                onChange={(e) => updateGithubConfig({ branch: e.target.value })}
                placeholder="main"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Percorso file (usa {"{tag}"} o {"{code}"})
              <input
                value={githubConfig.pathTemplate}
                onChange={(e) => updateGithubConfig({ pathTemplate: e.target.value })}
                placeholder="armies/{code}.json"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#9C7A3C]/30">
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Percorso Modelli
              <input
                value={githubConfig.coordinatePath}
                onChange={(e) => updateGithubConfig({ coordinatePath: e.target.value })}
                placeholder="Coordinate.json"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Percorso Elementi
              <input
                value={githubConfig.templatePath}
                onChange={(e) => updateGithubConfig({ templatePath: e.target.value })}
                placeholder="Template.json"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-[#9C7A3C]/30">
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Percorso dati regolamento (cartella con unit_types.json, morale.json, weapons.json, capabilities.json, armies/)
              <input
                value={githubConfig.rulesJsonPath}
                onChange={(e) => updateGithubConfig({ rulesJsonPath: e.target.value })}
                placeholder="json"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-[#9C7A3C]/30">
            <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
              Percorso file esercito generato (usa {"{tag}"} o {"{code}"})
              <input
                value={githubConfig.generatedArmyPathTemplate}
                onChange={(e) => updateGithubConfig({ generatedArmyPathTemplate: e.target.value })}
                placeholder="generated/{code}-army.json"
                className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col text-xs font-mono text-[#2B2622]/70 gap-1">
            Personal Access Token (permessi di scrittura sul repo — serve solo per "Salva")
            <input
              type="password"
              value={githubConfig.token}
              onChange={(e) => updateGithubConfig({ token: e.target.value })}
              placeholder="github_pat_..."
              className="border border-[#9C7A3C]/60 bg-white px-2 py-1 text-sm"
            />
          </label>
          <p className="text-[11px] italic text-[#2B2622]/60">
            ⚠ Il token resta salvato in chiaro nel localStorage di questo browser. Non condividere il computer/profilo browser se il token ha permessi di scrittura sul repo.
          </p>
        </div>
      </div>
    </div>
  );
}
