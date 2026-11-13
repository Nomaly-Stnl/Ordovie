// Ordovie — Analyses › Explorer : trouver un ETF/une action par secteur et par région dans la base Neon.
"use strict";

let exSector = "", exRegion = "", exFree = false, exType = "etf";

function topShares(dist, labels, n) {
  const tot = Object.values(dist || {}).reduce((s, v) => s + v, 0) || 100;
  return Object.entries(dist || {}).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${labels[k] || k} ${Math.round(v / tot * 100)} %`).join(" · ");
}
function share(dist, key) {
  const tot = Object.values(dist || {}).reduce((s, v) => s + v, 0) || 100;
  return (dist && dist[key] ? dist[key] : 0) / tot;
}

function renderExplorerTab() {
  const held = heldByTicker(), heldTot = Object.values(held).reduce((s, v) => s + v, 0);
  const mySec = aggregate(held, "sector"), myReg = aggregate(held, "geo");
  const secKeys = Object.keys(SEC_LABELS).filter((k) => TICKER_ALL.some((i) => (i.sectors || {})[k]));
  const regKeys = Object.keys(REG_LABELS).filter((k) => TICKER_ALL.some((i) => distOf(i, "geo")[k]));
  const targets = pf().target;

  let list = TICKER_ALL.filter((i) => (exType === "all" || i.type === exType) && (!exFree || i.savingsPlan0));
  list = list.map((i) => {
    const s = exSector ? share(i.sectors, exSector) : 1, r = exRegion ? share(distOf(i, "geo"), exRegion) : 1;
    return { i, score: s * r, s, r };
  }).filter((x) => (exSector || exRegion) ? x.score > 0.001 : true)
    .sort((a, b) => b.score - a.score || (a.i.ter ?? 9) - (b.i.ter ?? 9)).slice(0, 30);

  const ctx = [exSector && heldTot > 0 ? `Ton portefeuille : ${SEC_LABELS[exSector] || exSector} ${Math.round((mySec[exSector] || 0) * 100)} %` : "",
    exRegion && heldTot > 0 ? `${REG_LABELS[exRegion] || exRegion} ${Math.round((myReg[exRegion] || 0) * 100)} %` : ""].filter(Boolean).join(" · ");

  return `
    <div class="card">
      <div class="c-title">Trouver un titre</div>
      <label class="field">Secteur</label>
      <select class="sm-input" id="ex-sector"><option value="">Tous les secteurs</option>${secKeys.map((k) => `<option value="${k}" ${k === exSector ? "selected" : ""}>${esc(SEC_LABELS[k] || k)}</option>`).join("")}</select>
      <label class="field">Région</label>
      <select class="sm-input" id="ex-region"><option value="">Toutes les régions</option>${regKeys.map((k) => `<option value="${k}" ${k === exRegion ? "selected" : ""}>${esc(REG_LABELS[k] || k)}</option>`).join("")}</select>
      <div class="seg" style="margin-top:10px;">
        <button class="seg-btn ${exType === "etf" ? "on" : ""}" data-extype="etf">ETF</button>
        <button class="seg-btn ${exType === "action" ? "on" : ""}" data-extype="action">Actions</button>
        <button class="seg-btn ${exType === "all" ? "on" : ""}" data-extype="all">Tous</button>
      </div>
      <label class="chk"><input type="checkbox" id="ex-free" ${exFree ? "checked" : ""}> seulement 0 % frais Neon</label>
      ${ctx ? `<p class="small gold">${esc(ctx)}</p>` : ""}
    </div>
    <div class="section-title">${list.length} résultat(s) ${exSector || exRegion ? "· triés par exposition" : ""}</div>
    ${list.map(({ i, score }) => {
      const followed = i.ticker in targets || held[i.ticker];
      return `<div class="card ex-item">
        <div class="li-head"><span><strong>${esc(i.ticker)}</strong> <span class="tag">${i.type === "etf" ? "ETF" : "Action"}</span>${i.savingsPlan0 ? '<span class="tag gold">0 % frais</span>' : ""}${i.confidence === "estime" ? '<span class="tag">estimé</span>' : ""}</span>
          ${followed ? '<span class="r-sub">suivi ✓</span>' : `<button class="btn sm" data-exfollow="${esc(i.ticker)}">Suivre</button>`}</div>
        <div class="r-sub">${esc(i.name)}${i.type === "etf" && i.ter != null ? " · TER " + i.ter + " %" : ""}</div>
        ${exSector || exRegion ? `<div class="bar" style="margin:8px 0 4px;"><span style="width:${Math.round(score * 100)}%"></span></div>
          <div class="r-sub">Exposition : <strong>${Math.round(score * 100)} %</strong> ${esc([exSector && (SEC_LABELS[exSector] || exSector), exRegion && (REG_LABELS[exRegion] || exRegion)].filter(Boolean).join(" × "))}</div>` : ""}
        <div class="r-sub">🌍 ${esc(topShares(distOf(i, "geo"), REG_LABELS, 2))}</div>
        <div class="r-sub">🏭 ${esc(topShares(i.sectors, SEC_LABELS, 3))}</div>
      </div>`;
    }).join("") || '<div class="card"><p class="muted">Aucun titre pour ces critères.</p></div>'}
    <p class="muted small">Base Neon Invest (269 actions, 105 ETF). « Estimé » : composition déduite du thème de l'ETF, pas d'une liste officielle. Vérifie toujours la fiche du produit avant d'acheter.</p>`;
}

const onEx = () => current === "analyses" && anaTab === "explorer";
$("#screen").addEventListener("change", (e) => {
  if (!onEx()) return;
  const t = e.target;
  if (t.id === "ex-sector") exSector = t.value; else if (t.id === "ex-region") exRegion = t.value; else if (t.id === "ex-free") exFree = t.checked; else return;
  renderAnalyses();
});
$("#screen").addEventListener("click", (e) => {
  if (!onEx()) return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.extype) { exType = t.dataset.extype; renderAnalyses(); }
  else if (t.dataset.exfollow) { pf().target[t.dataset.exfollow] = 0; saveData(); renderAnalyses(); }
});
