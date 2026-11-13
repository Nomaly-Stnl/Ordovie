// Ordovie — historique des clôtures : liste par année + détail d'un mois (consultation et correction).
"use strict";

const HISTO_FIELDS = [
  ["cash", "Liquidités"], ["pilier3a", "3e pilier"], ["etf", "ETF / actions"], ["crypto", "Crypto"],
  ["physique", "Actifs physiques"], ["dettes", "Dettes"], ["revenus", "Revenus du mois"], ["depenses", "Dépenses du mois"],
];

function renderHistorique() {
  setTitle("Historique"); setBottomBar("");
  const keys = historiqueMonthsSortedDesc();
  const byYear = {};
  keys.forEach((k) => { (byYear[k.slice(0, 4)] = byYear[k.slice(0, 4)] || []).push(k); });
  $("#screen").innerHTML = `<button class="link-btn back" data-goto="finances">← Finances</button>
    ${Object.keys(byYear).sort().reverse().map((y) => `
      <div class="section-title">${esc(y)}</div>
      <div class="list">${byYear[y].map((k) => {
        const all = historiqueMonthsSorted(), idx = all.indexOf(k), prev = idx > 0 ? state.historique[all[idx - 1]] : null;
        const t = historyTotal(state.historique[k]), dlt = prev ? t - historyTotal(prev) : null;
        return `<button class="row row-btn" data-goto="histo:${k}">
          <div class="r-name">${esc(monthLabel(k))}</div>
          <div class="r-val">${fmtCHF(t)}${dlt !== null ? `<div class="r-sub ${dlt >= 0 ? "pos" : "neg"}">${signed(dlt)}</div>` : ""}</div></button>`;
      }).join("")}</div>`).join("") || '<div class="card"><p class="muted">Aucune clôture.</p></div>'}
    <p class="muted small">Touche un mois pour voir le détail et le corriger.</p>`;
}

function renderHistoMois(k) {
  const h = state.historique[k];
  if (!h) { go("historique"); return; }
  setTitle(monthLabel(k)); setBottomBar("");
  const projets = Object.entries(h.projets || {});
  $("#screen").innerHTML = `<button class="link-btn back" data-goto="historique">← Historique</button>
    <div class="summary"><div class="label">Patrimoine net — ${esc(monthLabel(k))}</div><div class="big" id="hm-total">${fmtCHF(historyTotal(h))}</div>
      <div class="delta muted" id="hm-surplus">Surplus du mois ${fmtCHF((Number(h.revenus) || 0) - (Number(h.depenses) || 0))}</div></div>
    <div class="card">
      ${HISTO_FIELDS.map(([f, label]) => `<div class="edit-row"><span class="name">${esc(label)}</span>
        <input type="text" inputmode="decimal" class="sm-input amount" data-hf="${k}|${f}" value="${esc(h[f] || 0)}"><span class="unit">CHF</span></div>`).join("")}
    </div>
    ${projets.length ? `<div class="section-title">Projets</div><div class="card">${projets.map(([id, v]) => `<div class="edit-row">
        <span class="name">${esc(((state.budget.projets || []).find((p) => p.id === id) || {}).nom || id)}</span>
        <input type="text" inputmode="decimal" class="sm-input amount" data-hp="${k}|${esc(id)}" value="${esc(v || 0)}"><span class="unit">CHF</span></div>`).join("")}</div>` : ""}
    <p class="muted small">Ce sont les totaux enregistrés à la clôture. Une correction ici ne modifie que ce mois de l'historique, pas tes comptes actuels. Enregistré dès que tu quittes un champ.</p>
    <button class="btn full danger" data-histdel="${k}">Supprimer la clôture de ${esc(monthLabel(k))}</button>`;
}

const isHisto = () => typeof current === "string" && (current === "historique" || current.startsWith("histo:"));
$("#screen").addEventListener("change", (e) => {
  if (!isHisto()) return;
  const t = e.target;
  if (t.dataset.hf) { const [k, f] = t.dataset.hf.split("|"); state.historique[k][f] = parseNum(t.value); }
  else if (t.dataset.hp) { const [k, id] = t.dataset.hp.split("|"); state.historique[k].projets[id] = parseNum(t.value); }
  else return;
  saveData();
  const k = current.slice(6), h = state.historique[k];
  $("#hm-total").textContent = fmtCHF(historyTotal(h));
  $("#hm-surplus").textContent = "Surplus du mois " + fmtCHF((Number(h.revenus) || 0) - (Number(h.depenses) || 0));
});
$("#screen").addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.goto && (isHisto() || current === "finances") && (t.dataset.goto === "historique" || t.dataset.goto.startsWith("histo:") || isHisto())) { go(t.dataset.goto); return; }
  if (t.dataset.histdel && isHisto()) {
    const k = t.dataset.histdel;
    if (!confirm("Supprimer définitivement la clôture de " + monthLabel(k) + " (" + fmtCHF(historyTotal(state.historique[k])) + ") ?")) return;
    deleteMonth(k); saveData(); go("historique");
  }
});
