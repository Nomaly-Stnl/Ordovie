// Ordovie — Analyses : projections du patrimoine et variation mensuelle.
// Calculs repris du moteur v20 (projectionSeriesAtRate, tauxPondere) : aucune formule nouvelle.
"use strict";

let projYears = 10;

function lineChart(series, years) {
  const W = 340, H = 200, l = 44, r = 8, t = 12, b = 22;
  const all = series.flatMap((s) => s.pts.map((p) => p.valeur));
  const max = Math.max(...all, 1), min = Math.min(...all, 0);
  const X = (y) => l + (W - l - r) * y / years, Y = (v) => t + (H - t - b) * (1 - (v - min) / (max - min || 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
  const k = (v) => maskedNow() ? "•••" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1000) + "k";
  return `<svg class="lchart" viewBox="0 0 ${W} ${H}" width="100%">
    ${ticks.map((v) => `<line x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"></line><text x="${l - 6}" y="${Y(v) + 3}" text-anchor="end">${k(v)}</text>`).join("")}
    ${[0, Math.round(years / 2), years].map((y) => `<text x="${X(y)}" y="${H - 6}" text-anchor="${y === years ? "end" : y === 0 ? "start" : "middle"}">${y === 0 ? "auj." : "+" + y + " ans"}</text>`).join("")}
    ${series.map((s) => `<polyline class="${s.cls}" fill="none" points="${s.pts.map((p) => X(p.annee) + "," + Y(p.valeur)).join(" ")}"></polyline>`).join("")}
  </svg>`;
}

let anaTab = "evolution";
// Deux familles : ce que tu possèdes (patrimoine) / tes investissements en bourse (ETF & actions).
const ANA_GROUPS = [["Mon patrimoine", [["evolution", "Évolution"], ["patrimoine", "Projection"]]],
                    ["ETF & actions", [["portefeuille", "Portefeuille"], ["explorer", "Explorer"]]]];

// Épargne mensuelle lissée : moyenne (revenus − dépenses) des 12 dernières clôtures.
// Un seul mois (bonus, gros achat, déficit) ne doit pas fausser une projection sur 10 ans.
function epargneLissee() {
  const ks = historiqueMonthsSorted().slice(-12).filter((k) => {
    const h = state.historique[k]; return h && (Number(h.revenus) || Number(h.depenses));
  });
  if (!ks.length) return { v: budgetSurplus(), n: 0 };
  const v = ks.reduce((s, k) => s + (Number(state.historique[k].revenus) || 0) - (Number(state.historique[k].depenses) || 0), 0) / ks.length;
  return { v, n: ks.length, from: ks[0], to: ks[ks.length - 1] };
}
function serie(years, rate, mensuel) {
  const pv = patrimoineTotal(), out = [{ annee: 0, valeur: pv }];
  for (let y = 1; y <= years; y++) out.push({ annee: y, valeur: fvCompound(rate, y, mensuel * 12, pv) });
  return out;
}

function renderAnalyses() {
  setTitle("Analyses"); setBottomBar("");
  if (!state) { $("#screen").innerHTML = '<div class="card"><p class="muted">Importe d\'abord tes données.</p></div>'; return; }
  const body = anaTab === "evolution" ? tabEvolution() : anaTab === "portefeuille" ? tabPortefeuille() : anaTab === "explorer" ? renderExplorerTab() : tabPatrimoine();
  $("#screen").innerHTML = `<div class="ana-eye">${settings.hideAmounts ? "Montants masqués" : ""}${eyeBtn()}</div><div class="tab-groups">${ANA_GROUPS.map(([g, tabs]) => `<div class="tab-group ${tabs.some(([k]) => k === anaTab) ? "active" : ""}">
      <div class="tg-label">${g}</div><div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === anaTab ? "on" : ""}" data-anatab="${k}">${l}</button>`).join("")}</div></div>`).join("")}</div>${body}`;
}

/* ---------- onglet Patrimoine : « où en serai-je dans X ans ? » ---------- */
function tabPatrimoine() {
  const ep = epargneLissee(), rate = tauxPondere(), infl = Number(state.params.inflation) || 0;
  const band = { median: serie(projYears, rate, ep.v), pessimiste: serie(projYears, 0.03, ep.v), optimiste: serie(projYears, 0.10, ep.v) };
  const at = (s) => s[s.length - 1].valeur;
  const now = patrimoineTotal(), mensuel = ep.v;
  const vActu = at(band.median), v3 = at(band.pessimiste), v10 = at(band.optimiste);
  const cashShare = totalActifs() > 0 ? totalCash() / totalActifs() : 0;
  const scen = (cls, titre, sous, v) => `<div class="scen ${cls}"><span class="dot"></span>
      <div class="scen-txt"><div class="scen-t">${titre}</div><div class="r-sub">${sous}</div></div>
      <div class="scen-v">${money(v)}</div></div>`;
  return `
    <div class="card">
      <div class="c-title">Où en seras-tu dans…</div>
      <div class="seg" style="margin-top:8px;">${[5, 10, 20, 30].map((y) => `<button class="seg-btn ${y === projYears ? "on" : ""}" data-proj="${y}">${y} ans</button>`).join("")}</div>
      ${lineChart([{ pts: band.optimiste, cls: "opt" }, { pts: band.pessimiste, cls: "pes" }, { pts: band.median, cls: "med" }], projYears)}
      ${scen("med", "Si tu continues comme aujourd'hui", `ton argent rapporte ≈ ${fmtPct(rate)} par an`, vActu)}
      ${scen("pes", "Si ton argent rapportait 3 % par an", "placement prudent", v3)}
      ${scen("opt", "Si ton argent rapportait 10 % par an", "très favorable, rarement durable", v10)}
    </div>
    ${ep.v < 0 ? `<div class="card insight neg-b"><strong>Attention.</strong> En moyenne sur ${ep.n} mois, tes dépenses dépassent tes revenus de ${money(-ep.v)} par mois : à ce rythme, ton patrimoine diminue. La projection le montre telle quelle.</div>` : ""}
    ${rate < 0.03 ? `<div class="card insight"><strong>À retenir.</strong> ${Math.round(cashShare * 100)} % de tes actifs dorment sur des comptes à ${fmtPct(state.params.rendements.cash)}.
      Sur ${projYears} ans, simplement obtenir 3 % au lieu de ${fmtPct(rate)} représenterait <strong>≈ ${money(v3 - vActu)}</strong> de plus.</div>` : ""}
    <div class="card">
      <div class="c-title">En clair, comment c'est calculé</div>
      <ol class="steps-list">
        <li>On part de ce que tu as aujourd'hui : <strong>${money(now)}</strong>.</li>
        <li>Chaque mois, tu ajoutes ton épargne moyenne : <strong>${money(mensuel)}</strong> (soit ${money(mensuel * 12)} par an)${ep.n ? `, calculée sur tes ${ep.n} dernières clôtures (${esc(monthLabel(ep.from))} → ${esc(monthLabel(ep.to))}) pour lisser les mois exceptionnels` : ", tirée de ton budget actuel (aucune clôture encore)"}.</li>
        <li>Chaque année, tout ce montant rapporte un pourcentage, et ce gain rapporte à son tour l'année suivante : c'est l'« effet boule de neige ».</li>
        <li>Seul le pourcentage change entre les trois lignes : c'est lui qui fait toute la différence sur le long terme.</li>
      </ol>
      <p class="muted small">Montants en francs futurs. Avec ${fmtPct(infl)} d'inflation par an, ${money(vActu)} dans ${projYears} ans vaudront ≈ ${money(vActu / Math.pow(1 + infl, projYears))} d'aujourd'hui.
      Hypothèses : épargne constante, pas d'impôts. Une projection n'est pas une prévision.</p>
    </div>`;
}

/* ---------- onglet Évolution : variation d'un mois à l'autre ---------- */
function tabEvolution() {
  const keys = historiqueMonthsSorted().slice(-13);
  if (keys.length < 2) return '<div class="card"><p class="muted">Il faut au moins deux clôtures.</p></div>';
  const deltas = keys.slice(1).map((k, i) => ({ k, v: historyTotal(state.historique[k]) - historyTotal(state.historique[keys[i]]) }));
  const W = 340, H = 160, mid = 70, slot = W / deltas.length, bw = Math.min(20, slot * 0.6);
  const m = Math.max(...deltas.map((d) => Math.abs(d.v)), 1);
  const bars = deltas.map((d, i) => {
    const h = Math.max(1, Math.abs(d.v) / m * (mid - 16)), x = slot * i + (slot - bw) / 2;
    const [mon, yr] = monthLabel(d.k).split(" ");
    const newYear = i === 0 || d.k.slice(0, 4) !== deltas[i - 1].k.slice(0, 4);
    return `<g class="hbar" tabindex="0"><rect class="${d.v >= 0 ? "up" : "down"}" x="${x}" y="${d.v >= 0 ? mid - h : mid}" width="${bw}" height="${h}" rx="2"></rect>
      <text class="mon" x="${x + bw / 2}" y="${H - 22}" text-anchor="middle">${esc(mon)}</text>
      ${newYear ? `<text class="yr" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">20${esc(yr)}</text>` : ""}
      <text class="val" x="${Math.min(Math.max(x + bw / 2, 30), W - 30)}" y="11" text-anchor="middle">${esc(signed(d.v))}</text>
      <title>${esc(monthLabel(d.k))} : ${esc(signed(d.v))}</title></g>`;
  }).join("");
  const tot = deltas.reduce((s, d) => s + d.v, 0), pos = deltas.filter((d) => d.v >= 0).length;
  return `<div class="card chart-card">
      <div class="c-title" style="margin:2px 4px 6px;">Gain ou perte chaque mois</div>
      <svg class="hchart vchart" viewBox="0 0 ${W} ${H}" width="100%"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="axis"></line>${bars}</svg>
      <p class="muted small">${esc(monthLabel(deltas[0].k))} → ${esc(monthLabel(deltas[deltas.length - 1].k))} : <strong class="${tot >= 0 ? "pos" : "neg"}">${signed(tot)}</strong> au total · ${pos} mois en hausse sur ${deltas.length}. Touche une barre pour le montant.</p>
    </div>
    <div class="card"><p class="muted small">Chaque barre = patrimoine net de fin de mois moins celui du mois précédent : ton épargne du mois plus (ou moins) l'évolution des marchés et de tes autres actifs. Les 12 dernières clôtures sont affichées, l'année figure sous le premier mois de chaque année.</p></div>`;
}

/* ---------- onglet Portefeuille (prochaine version) ---------- */
function tabPortefeuille() { return renderPortefeuilleTab(); }

$("#screen").addEventListener("click", (e) => {
  if (current !== "analyses") return;
  const t = e.target.closest("[data-proj],[data-anatab]"); if (!t) return;
  if (t.dataset.anatab) anaTab = t.dataset.anatab; else projYears = Number(t.dataset.proj);
  renderAnalyses();
});
