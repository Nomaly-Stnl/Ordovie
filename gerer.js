// Ordovie — module Finances : paramètres financiers (ce qui ne bouge presque jamais).
// Tout le reste (comptes, positions, dettes, revenus, dépenses, projets) se saisit dans la clôture du mois.
// Enregistrement dès qu'un champ est quitté.
"use strict";

const PCT_KEYS = { cash: "Liquidités", pilier3a: "3e pilier", etf: "ETF / actions", crypto: "Crypto", physique: "Actifs physiques" };

function edNum(path, v, opts) {
  opts = opts || {};
  const shown = opts.pct ? +(Number(v || 0) * 100).toFixed(3) : (v === null || v === undefined ? "" : v);
  return `<input type="text" inputmode="decimal" class="${opts.cls || "sm-input amount"}" data-ed="${path}" ${opts.pct ? 'data-pct="1"' : ""} value="${esc(shown)}">`;
}
function getP(path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), state); }
function setP(path, val) { const ks = path.split("."); const last = ks.pop(); ks.reduce((o, k) => o[k], state)[last] = val; }

function pctGroup(obj, path, keys, title, mustSum) {
  const total = Object.keys(keys).reduce((s, k) => s + (Number(obj[k]) || 0), 0);
  return `<div class="section-title">${esc(title)} ${mustSum ? `<span class="legend ${Math.abs(total - 1) > 0.001 ? "neg" : ""}" id="sum-${path}">total ${+(total * 100).toFixed(1)} %</span>` : ""}</div>
    <div class="card">${Object.keys(keys).map((k) => `<div class="edit-row">
        <span class="name">${esc(keys[k])}</span>${edNum(`${path}.${k}`, obj[k], { pct: true })}<span class="unit">%</span></div>`).join("")}</div>`;
}
const row = (label, input, unit) => `<div class="edit-row"><span class="name">${esc(label)}</span>${input}<span class="unit">${esc(unit || "")}</span></div>`;

function renderGerer() {
  if (!state) { go("finances"); return; }
  setTitle("Paramètres financiers"); setBottomBar("");
  const p = state.params;
  $("#screen").innerHTML = `<button class="link-btn back" data-goto="finances">← Finances</button>
    ${pctGroup(p.cibles, "params.cibles", PCT_KEYS, "Cibles d'allocation", true)}
    ${pctGroup(p.reglesurplus, "params.reglesurplus", { pilier3a: "3e pilier", etf: "ETF / actions", cash: "Liquidités", crypto: "Crypto" }, "Répartition du surplus mensuel", true)}
    ${pctGroup(p.rendements, "params.rendements", { etf: "ETF / actions", pilier3a: "3e pilier", cash: "Liquidités", crypto: "Crypto" }, "Rendements annuels attendus", false)}
    <div class="section-title">3e pilier et fiscalité</div>
    <div class="card">
      ${row("Année fiscale", edNum("params.anneeFiscale", p.anneeFiscale))}
      ${row("Plafond 3a (avec 2e pilier)", edNum("params.plafond3aAvec2P", p.plafond3aAvec2P), "CHF")}
      ${row("Taux marginal d'imposition", edNum("params.tauxMarginal", p.tauxMarginal, { pct: true }), "%")}
      ${row("Solde 3a au 1er janvier " + p.anneeFiscale + " (optionnel)", `<input type="text" inputmode="decimal" class="sm-input amount" data-p3a="${esc(String(p.anneeFiscale))}" value="${esc((state.pilier3aSoldeDebutAnnee || {})[String(p.anneeFiscale)] ?? "")}" placeholder="auto">`, "CHF")}
    </div>
    <div class="section-title">Divers</div>
    <div class="card">
      ${row("Fonds d'urgence (mois de charges fixes)", edNum("params.moisFondsUrgence", p.moisFondsUrgence), "mois")}
      ${row("Seuil d'alerte de rééquilibrage", edNum("params.seuilRebalancement", p.seuilRebalancement, { pct: true }), "%")}
      ${row("Inflation annuelle", edNum("params.inflation", p.inflation, { pct: true }), "%")}
    </div>
    <p class="muted small">Saisis les pourcentages tels quels (15 pour 15 %). Enregistré dès que tu quittes un champ.
    Comptes, positions, dettes, revenus, dépenses et projets se mettent à jour dans « Clôturer le mois ».</p>`;
}

const isGerer = () => typeof current === "string" && current.startsWith("gerer");
$("#screen").addEventListener("change", (e) => {
  if (!isGerer()) return;
  const t = e.target;
  if (t.dataset.p3a) {
    // Vide = calcul automatique (clôture de décembre, sinon première clôture de l'année).
    state.pilier3aSoldeDebutAnnee = state.pilier3aSoldeDebutAnnee || {};
    if (t.value.trim() === "") delete state.pilier3aSoldeDebutAnnee[t.dataset.p3a];
    else state.pilier3aSoldeDebutAnnee[t.dataset.p3a] = parseNum(t.value);
    saveData(); return;
  }
  if (!t.dataset.ed) return;
  let v = parseNum(t.value); if (t.dataset.pct) v = v / 100;
  setP(t.dataset.ed, v); saveData();
  const grp = t.dataset.ed.split(".").slice(0, 2).join(".");
  const el = document.getElementById("sum-" + grp);
  if (el) {
    const tot = Object.values(getP(grp)).reduce((s, x) => s + (Number(x) || 0), 0);
    el.textContent = "total " + +(tot * 100).toFixed(1) + " %"; el.classList.toggle("neg", Math.abs(tot - 1) > 0.001);
  }
});
$("#screen").addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t || !t.dataset.goto || !isGerer()) return;
  go(t.dataset.goto);
});
