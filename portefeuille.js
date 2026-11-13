// Ordovie — Analyses › Portefeuille : tes ETF et actions, par titre, région et secteur, comparés à tes cibles.
// Reprend l'outil « Gestion ETF » de la v20 : cibles en % par titre dans state.pilotageETF.target.
"use strict";

const REG_LABELS = Object.assign({}, TICKER_DB.regionLabels, { AmeriqueNord: "Amérique du Nord", EM_Asie: "Asie émergente / EM", Europe: "Europe (hors Suisse)", Autres: "Autres", HorsActions: "Hors actions" });
const SEC_LABELS = Object.assign({}, TICKER_DB.sectorLabels, { Materials: "Matériaux (industrie)", Matieres: "Matières premières", Healthcare: "Santé", ConsDisc: "Conso. discrétionnaire",
  ConsStaples: "Conso. de base", Energy: "Énergie", Diversifie: "Diversifié", Cash: "Liquidités" });
let pfLinkIdx = null;     // position en cours de liaison à un titre
let pfAdding = false;     // recherche « ajouter une cible » ouverte
let pfOnlyFree = false;

function pf() { state.pilotageETF = state.pilotageETF || { target: {}, monthlyBudget: 0, notesPerso: "" }; state.pilotageETF.target = state.pilotageETF.target || {}; return state.pilotageETF; }
function heldByTicker() {
  const m = {};
  state.positions.filter((p) => p.ticker && p.categorie !== "Crypto").forEach((p) => { m[p.ticker] = (m[p.ticker] || 0) + positionValue(p); });
  return m;
}
function distOf(item, axis) { return axis === "geo" ? (item.type === "action" ? { [item.region || "Autres"]: 100 } : (item.geo || {})) : (item.sectors || {}); }
// Agrège une répartition : poids (CHF ou %) par titre × répartition du titre.
function aggregate(weights, axis) {
  const out = {}, tot = Object.values(weights).reduce((s, v) => s + v, 0) || 1;
  Object.entries(weights).forEach(([tk, w]) => {
    const it = TICKER_BY_ID[tk]; if (!it || !w) return;
    const d = distOf(it, axis), dt = Object.values(d).reduce((s, v) => s + v, 0) || 100;
    Object.entries(d).forEach(([k, v]) => { out[k] = (out[k] || 0) + (w / tot) * (v / dt); });
  });
  return out;
}
function distBars(actual, target, labels) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(target)])].filter((k) => (actual[k] || 0) > 0.004 || (target[k] || 0) > 0.004)
    .sort((a, b) => Math.max(actual[b] || 0, target[b] || 0) - Math.max(actual[a] || 0, target[a] || 0));
  const hasT = Object.keys(target).length > 0;
  return keys.map((k) => `<div class="row"><div><div class="r-name">${esc(labels[k] || k)}</div>
      <div class="bar"><span style="width:${Math.round((actual[k] || 0) * 100)}%"></span>${hasT ? `<i class="target" style="left:${Math.round((target[k] || 0) * 100)}%"></i>` : ""}</div></div>
      <div class="r-val">${Math.round((actual[k] || 0) * 100)} %${hasT ? `<div class="r-sub">cible ${Math.round((target[k] || 0) * 100)} %</div>` : ""}</div></div>`).join("") || '<p class="muted small">Aucune donnée.</p>';
}
function searchBox(id) {
  return `<input type="text" class="big-input" id="${id}" placeholder="Nom, ticker ou ISIN" autocomplete="off">
    <label class="chk"><input type="checkbox" id="pf-free" ${pfOnlyFree ? "checked" : ""}> seulement 0 % frais Neon</label>
    <div class="results" id="${id}-res"></div>`;
}

function renderPortefeuilleTab() {
  const P = pf(), held = heldByTicker(), totHeld = Object.values(held).reduce((s, v) => s + v, 0);
  const tks = [...new Set([...Object.keys(held), ...Object.keys(P.target)])].filter((t) => TICKER_BY_ID[t]);
  const totT = tks.reduce((s, t) => s + (Number(P.target[t]) || 0), 0);
  const unlinked = state.positions.map((p, i) => ({ p, i })).filter((x) => !x.p.ticker && x.p.categorie !== "Crypto");
  const tgtW = Object.fromEntries(tks.map((t) => [t, Number(P.target[t]) || 0]));
  const invest = Number(P.monthlyBudget) || 0;
  tks.sort((a, b) => (held[b] || 0) - (held[a] || 0) || (tgtW[b] - tgtW[a]));

  return `
    <div class="summary"><div class="label">ETF et actions</div><div class="big">${money(totHeld)}</div>
      <div class="delta muted">${tks.length} titre(s) suivi(s) · total des cibles <span class="${Math.abs(totT - 100) > 0.5 && totT > 0 ? "neg" : ""}">${+totT.toFixed(1)} %</span></div></div>

    <div class="section-title">Par titre</div>
    ${tks.map((t) => {
      const it = TICKER_BY_ID[t], h = held[t] || 0, act = totHeld > 0 ? h / totHeld * 100 : 0, tg = tgtW[t], gap = act - tg;
      return `<div class="card pf-line">
        <div class="li-head"><span><strong>${esc(t)}</strong> <span class="tag">${it.type === "etf" ? "ETF" : "Action"}</span>${it.savingsPlan0 ? '<span class="tag gold">0 % frais</span>' : ""}</span>
          <span class="r-val">${money(h)}</span></div>
        <div class="r-sub">${esc(it.name)}${it.type === "etf" && it.ter != null ? " · TER " + it.ter + " %" : ""}</div>
        <div class="pf-grid">
          <div><div class="r-sub">actuel</div><strong>${act.toFixed(1)} %</strong></div>
          <div><div class="r-sub">cible</div><div class="pf-cible"><input type="text" inputmode="decimal" class="pf-in" data-pft="${esc(t)}" value="${tg || ""}" placeholder="0"><span>%</span></div></div>
          <div><div class="r-sub">écart</div><strong class="${Math.abs(gap) < 1 ? "pos" : Math.abs(gap) < 4 ? "gold" : "neg"}">${gap >= 0 ? "+" : ""}${gap.toFixed(1)} pt</strong></div>
        </div>
        ${invest > 0 && tg > 0 ? `<div class="r-sub">À investir ce mois : <strong>${money(invest * tg / 100)}</strong></div>` : ""}
        ${!h ? `<button class="link-btn" data-pfdel="${esc(t)}">retirer de la liste</button>` : ""}
      </div>`;
    }).join("") || '<div class="card"><p class="muted">Aucun titre lié. Ajoute une cible ci-dessous, ou lie tes positions existantes à un titre.</p></div>'}
    ${tks.length ? `<button class="btn full" data-pfact="norm">Ajuster les cibles à 100 %</button>` : ""}

    ${pfAdding ? `<div class="card"><div class="c-title">Ajouter une cible</div>${searchBox("pf-add")}
        <button class="btn" data-pfact="cancel">Annuler</button></div>`
      : `<button class="btn full" data-pfact="add">+ Ajouter un titre à suivre</button>`}

    ${unlinked.length ? `<div class="section-title">Positions non liées à un titre</div>
      <div class="card">${unlinked.map(({ p, i }) => pfLinkIdx === i
        ? `<div class="obj"><strong>${esc(p.nom)}</strong> (${money(positionValue(p))})${searchBox("pf-link")}<button class="btn sm" data-pfact="cancel">Annuler</button></div>`
        : `<div class="obj li-head"><span>${esc(p.nom)} · ${money(positionValue(p))}</span><button class="btn sm" data-pflink="${i}">Lier</button></div>`).join("")}
        <p class="muted small">Lier une position à son titre (ex. ton « Nasdaq 100 » au bon ETF) permet de calculer sa région et son secteur.</p></div>` : ""}

    <div class="section-title">Par région <span class="legend"><i class="target-dot"></i> cible</span></div>
    <div class="list">${distBars(aggregate(held, "geo"), totT > 0 ? aggregate(tgtW, "geo") : {}, REG_LABELS)}</div>
    <div class="section-title">Par secteur</div>
    <div class="list">${distBars(aggregate(held, "sector"), totT > 0 ? aggregate(tgtW, "sector") : {}, SEC_LABELS)}</div>
    <p class="muted small">Un ETF est réparti selon sa composition (ex. un ETF Monde compte un peu partout) ; une action compte entièrement dans sa région et son secteur. Barre = ce que tu détiens, trait = ta cible. Crypto non incluse.</p>

    <div class="section-title">Budget mensuel à investir</div>
    <div class="card"><div class="edit-row"><span class="name">Montant investi chaque mois en ETF/actions</span>
      <input type="text" inputmode="decimal" class="sm-input amount" id="pf-budget" value="${maskedNow() ? "•••" : invest || ""}" ${maskedNow() ? "disabled" : ""}><span class="unit">CHF</span></div>
      <p class="muted small">Réparti selon tes cibles (« À investir ce mois » sur chaque titre). Repère : épargne moyenne ${money(epargneLissee().v)}/mois × ${Math.round((state.params.reglesurplus.etf || 0) * 100)} % (ta règle ETF) = ${money(epargneLissee().v * (state.params.reglesurplus.etf || 0))}.</p></div>

    <div class="section-title">Stratégie et notes</div>
    <div class="card"><textarea class="sm-input" id="pf-notes" rows="4" placeholder="Ta stratégie, tes règles, les précautions…">${esc(P.notesPerso || "")}</textarea></div>`;
}

function runSearch(input) {
  const q = input.value.trim().toLowerCase(), box = document.getElementById(input.id + "-res");
  if (!q) { box.innerHTML = ""; return; }
  const m = TICKER_ALL.filter((i) => (!pfOnlyFree || i.savingsPlan0) && (i.ticker.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || (i.isin || "").toLowerCase().includes(q))).slice(0, 15);
  box.innerHTML = m.map((i) => `<button class="result" data-pfpick="${esc(i.ticker)}"><strong>${esc(i.ticker)}</strong> ${esc(i.name)}
    <span class="tag">${i.type === "etf" ? "ETF" : "Action"}</span>${i.savingsPlan0 ? '<span class="tag gold">0 % frais</span>' : ""}</button>`).join("") || '<p class="muted small">Aucun résultat.</p>';
}

const onPf = () => current === "analyses" && anaTab === "portefeuille";
$("#screen").addEventListener("input", (e) => {
  if (!onPf()) return;
  if (e.target.id === "pf-add" || e.target.id === "pf-link") runSearch(e.target);
});
$("#screen").addEventListener("change", (e) => {
  if (!onPf()) return;
  const t = e.target, P = pf();
  if (t.dataset.pft) { const v = parseNum(t.value); if (v > 0) P.target[t.dataset.pft] = v; else P.target[t.dataset.pft] = 0; saveData(); renderAnalyses(); }
  else if (t.id === "pf-budget") { P.monthlyBudget = parseNum(t.value); saveData(); renderAnalyses(); }
  else if (t.id === "pf-notes") { P.notesPerso = t.value; saveData(); }
  else if (t.id === "pf-free") { pfOnlyFree = t.checked; const i = document.getElementById("pf-add") || document.getElementById("pf-link"); if (i) runSearch(i); }
});
$("#screen").addEventListener("click", (e) => {
  if (!onPf()) return;
  const t = e.target.closest("button"); if (!t) return;
  const P = pf();
  if (t.dataset.pfact === "add") { pfAdding = true; pfLinkIdx = null; renderAnalyses(); }
  else if (t.dataset.pfact === "cancel") { pfAdding = false; pfLinkIdx = null; renderAnalyses(); }
  else if (t.dataset.pfact === "norm") {
    const tot = Object.values(P.target).reduce((s, v) => s + (Number(v) || 0), 0); if (tot <= 0) return;
    Object.keys(P.target).forEach((k) => { P.target[k] = Math.round((Number(P.target[k]) || 0) / tot * 1000) / 10; });
    saveData(); renderAnalyses();
  } else if (t.dataset.pflink !== undefined) { pfLinkIdx = Number(t.dataset.pflink); pfAdding = false; renderAnalyses(); }
  else if (t.dataset.pfdel) { delete P.target[t.dataset.pfdel]; saveData(); renderAnalyses(); }
  else if (t.dataset.pfpick) {
    const it = TICKER_BY_ID[t.dataset.pfpick]; if (!it) return;
    if (pfLinkIdx !== null) {
      const p = state.positions[pfLinkIdx];
      if (!confirm(`Lier « ${p.nom} » à ${it.ticker} — ${it.name} ?`)) return;
      p.ticker = it.ticker; if (it.type === "etf" && !(Number(p.fraisTER) > 0)) p.fraisTER = (Number(it.ter) || 0) / 100;
      pfLinkIdx = null;
    } else { if (!(it.ticker in P.target)) P.target[it.ticker] = 0; pfAdding = false; }
    saveData(); renderAnalyses();
  }
});
