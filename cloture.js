// Ordovie — clôture du mois pas à pas (v0.5).
// Une page par catégorie (comptes, ETF/actions, crypto, actifs physiques, dettes, revenus, projets, bilan).
// Tout se fait sur un BROUILLON : rien n'est enregistré avant « Valider la clôture ».
"use strict";

let wz = null; // { month, draft, i, steps, origLens, ui }

/* ---------- utilitaires ---------- */
// Exécute un calcul du moteur v20 sur le brouillon ; onSaved() permet, à l'intérieur, de relire les données enregistrées.
let _savedState = null;
function onDraft(fn) { const s = state; _savedState = s; state = wz.draft; try { return fn(); } finally { state = s; _savedState = null; } }
function onSaved(fn) { const s = state; state = _savedState; try { return fn(); } finally { state = s; } }
function parseNum(str) {
  if (str === null || str === undefined) return 0;
  const v = parseFloat(String(str).trim().replace(/['\s]/g, "").replace(",", "."));
  return isNaN(v) ? 0 : v;
}
function todayCH() {
  const d = new Date();
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
}
function setPath(obj, path, val) {
  const ks = path.split("."); const last = ks.pop();
  ks.reduce((o, k) => o[k], obj)[last] = val;
}
function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
// Champ numérique (data-wz) ou texte (data-wzt).
function nf(path, value, label, cls) {
  return `<label class="field">${esc(label)}</label><input type="text" inputmode="decimal" class="${cls || "big-input"}" data-wz="${path}" value="${value === null || value === undefined ? "" : esc(value)}">`;
}
function tf(path, value, label, cls) {
  return `<label class="field">${esc(label)}</label><input type="text" class="${cls || "big-input"}" data-wzt="${path}" value="${esc(value || "")}">`;
}

const STEP_LABELS = { month: "Mois", comptes: "Comptes", etf: "ETF / actions", crypto: "Crypto", physique: "Actifs physiques",
  dettes: "Dettes", revenus: "Revenus", fixes: "Charges fixes", variables: "Dépenses variables", projets: "Projets", objectifs: "Objectifs", recap: "Bilan" };

function startCloture() {
  const draft = JSON.parse(JSON.stringify(state));
  const origLens = {};
  draft.positions.forEach((p) => { origLens[p.id] = { a: (p.achats || []).length, v: (p.ventes || []).length }; });
  // Ordre : le quotidien d'abord (revenus, comptes, charges), l'investissement ensuite.
  const steps = ["month", "revenus", "comptes", "fixes", "variables", "objectifs", "dettes", "physique", "etf", "crypto", "projets", "recap"];
  wz = { month: previousCalendarMonth(), draft, i: 0, steps, origLens, ui: {} };
  go("cloture");
}

/* ---------- rendu ---------- */
function renderCloture() {
  if (!wz) { go("finances"); return; }
  const st = wz.steps[wz.i];
  setTitle("Clôture — " + monthLabel(wz.month));
  const isLast = wz.i === wz.steps.length - 1;
  setBottomBar(`<button class="btn" id="wz-prev" ${wz.i === 0 ? "disabled" : ""}>Précédent</button>
    <button class="btn primary" id="${isLast ? "wz-validate" : "wz-next"}">${isLast ? "Valider la clôture" : "Suivant"}</button>`);
  const pages = { month: pageMonth, comptes: pageComptes, etf: () => pagePositions("ETF"), crypto: () => pagePositions("Crypto"),
    physique: pagePhysique, dettes: pageDettes, revenus: pageRevenus, fixes: pageFixes, variables: pageVariables, projets: pageProjets, objectifs: pageObjectifs, recap: pageRecap };
  $("#screen").innerHTML = `
    <div class="steps"><span style="width:${Math.round((wz.i + 1) / wz.steps.length * 100)}%"></span></div>
    <div class="muted small" style="margin:6px 2px 12px;">Étape ${wz.i + 1} sur ${wz.steps.length} · ${esc(STEP_LABELS[st])}</div>
    ${pages[st]()}`;
  refreshLive();
}

function pageMonth() {
  const exist = state.historique[wz.month];
  return `<div class="card">
    <div class="c-title">Quel mois clôtures-tu ?</div>
    <p class="muted">Par défaut le mois terminé. Rien n'est enregistré avant la validation finale ; la maison permet d'abandonner sans rien modifier.</p>
    <input type="month" id="wz-month" class="big-input" value="${esc(wz.month)}">
    <div id="wz-month-warn">${exist ? warnExist(exist) : ""}</div></div>`;
}
function warnExist(h) { return `<p class="warn">${esc(monthLabel(wz.month))} est déjà clôturé (total ${fmtCHF(historyTotal(h))}). Valider remplacera cette clôture.</p>`; }

function pageComptes() {
  const d = wz.draft;
  return `<div class="card">
    ${d.comptes.map((c, i) => `
      <div class="line-item">
        <div class="li-head"><span>${esc(c.nom)} <span class="tag">${c.categorie === "3a" ? "3e pilier" : "Cash"}</span></span>
          <button class="link-btn" data-rm="comptes.${i}" data-rmname="${esc(c.nom)}">Retirer</button></div>
        <input type="text" inputmode="decimal" class="mid-input" data-wz="comptes.${i}.solde" value="${esc(c.solde)}">
      </div>`).join("")}
    <p class="muted small">Total liquidités <strong id="lv-cash"></strong> · 3e pilier <strong id="lv-3a"></strong></p>
  </div>
  ${wz.ui.newCompte ? `<div class="card"><div class="c-title">Nouveau compte</div>
      ${tf("__new.nom", "", "Nom (ex. Compte épargne 2)")}
      <label class="field">Type</label>
      <div class="seg"><button class="seg-btn ${wz.ui.newCompteCat !== "3a" ? "on" : ""}" data-act="cat-cash">Cash</button><button class="seg-btn ${wz.ui.newCompteCat === "3a" ? "on" : ""}" data-act="cat-3a">3e pilier</button></div>
      ${nf("__new.solde", "", "Solde (CHF)")}
      <div class="btn-row"><button class="btn primary" data-act="add-compte">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`
    : `<button class="btn full" data-act="new-compte">+ Nouveau compte</button>`}`;
}

function positionCard(p, idx) {
  const crypto = p.categorie === "Crypto";
  const usesAchats = (p.achats || []).length > 0;
  const orig = wz.origLens[p.id] || { a: 0, v: 0 };
  const newA = (p.achats || []).map((a, ai) => ({ a, ai })).filter((x) => x.ai >= orig.a);
  const newV = (p.ventes || []).map((v, vi) => ({ v, vi })).filter((x) => x.vi >= orig.v);
  const base = "positions." + idx;
  return `<div class="card pos-card">
    <div class="li-head"><span class="c-title">${esc(p.nom)}${p.ticker ? ` <span class="tag">${esc(p.ticker)}</span>` : ""}</span>
      <button class="link-btn" data-rm="positions.${idx}" data-rmname="${esc(p.nom)}">Retirer</button></div>
    ${usesAchats
      ? `<label class="field">Prix actuel du marché (CHF / unité)</label><input type="text" inputmode="decimal" class="mid-input" data-wz="${base}.prixActuel" value="${esc(p.prixActuel)}">`
      : `<label class="field">Valeur actuelle (CHF)</label><input type="text" inputmode="decimal" class="mid-input" data-wz="${base}.valeurManuelle" value="${esc(p.valeurManuelle)}">`}
    <p class="muted small" data-live="${idx}"></p>
    ${newA.map(({ a, ai }) => `<div class="tx tx-buy"><div class="li-head"><span>Achat</span><button class="link-btn" data-rmtx="${base}.achats.${ai}">Retirer</button></div>
      <div class="tx-grid">
        <div><label class="field">Date</label><input type="text" class="sm-input" data-wzt="${base}.achats.${ai}.date" value="${esc(a.date)}"></div>
        <div><label class="field">Quantité</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.achats.${ai}.quantite" value="${esc(a.quantite || "")}"></div>
        ${crypto
          ? `<div class="span2"><label class="field">Montant payé total (CHF, frais inclus)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.achats.${ai}.montantPaye" value="${esc(a.montantPaye || "")}"></div>`
          : `<div><label class="field">Prix / unité (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.achats.${ai}.prixPaye" value="${esc(a.prixPaye || "")}"></div>
             <div><label class="field">Frais (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.achats.${ai}.frais" value="${esc(a.frais || "")}"></div>`}
      </div></div>`).join("")}
    ${newV.map(({ v, vi }) => `<div class="tx tx-sell"><div class="li-head"><span>Vente</span><button class="link-btn" data-rmtx="${base}.ventes.${vi}">Retirer</button></div>
      <div class="tx-grid">
        <div><label class="field">Date</label><input type="text" class="sm-input" data-wzt="${base}.ventes.${vi}.date" value="${esc(v.date)}"></div>
        <div><label class="field">Quantité</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.ventes.${vi}.quantite" value="${esc(v.quantite || "")}"></div>
        ${crypto
          ? `<div class="span2"><label class="field">Montant reçu total (CHF, frais déduits)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.ventes.${vi}.montantVenteTotal" value="${esc(v.montantVenteTotal || "")}"></div>`
          : `<div><label class="field">Prix / unité (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.ventes.${vi}.prixVenteUnitaire" value="${esc(v.prixVenteUnitaire || "")}"></div>
             <div><label class="field">Frais (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${base}.ventes.${vi}.frais" value="${esc(v.frais || "")}"></div>`}
      </div></div>`).join("")}
    <div class="btn-row"><button class="btn sm" data-addtx="buy" data-idx="${idx}">+ Achat</button><button class="btn sm" data-addtx="sell" data-idx="${idx}">+ Vente</button></div>
  </div>`;
}

function pagePositions(cat) {
  const d = wz.draft;
  const list = d.positions.map((p, i) => ({ p, i })).filter((x) => x.p.categorie === cat);
  const isEtf = cat === "ETF";
  let adder;
  if (wz.ui.newPos === cat) {
    adder = isEtf
      ? `<div class="card"><div class="c-title">Nouvel ETF / action</div>
          <input type="text" class="big-input" id="wz-search" placeholder="Nom, ticker ou ISIN (ex. S&P 500, NVIDIA)" autocomplete="off">
          <div id="wz-results" class="results"></div>
          <p class="muted small">Pas dans la liste ? <button class="link-btn" data-act="free-etf">Ajouter une position libre</button></p>
          <button class="btn" data-act="cancel-new">Annuler</button></div>`
      : `<div class="card"><div class="c-title">Nouvelle crypto</div>
          ${tf("__new.nom", "", "Nom (ex. Solana)")}
          <div class="btn-row"><button class="btn primary" data-act="add-crypto">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`;
  } else {
    adder = `<button class="btn full" data-act="new-pos" data-cat="${cat}">+ ${isEtf ? "Nouvel ETF / action" : "Nouvelle crypto"}</button>`;
  }
  return `${list.length ? list.map(({ p, i }) => positionCard(p, i)).join("") : `<div class="card"><p class="muted">Aucune position ${isEtf ? "ETF / action" : "crypto"}.</p></div>`}
    <p class="muted small" style="margin:0 2px 10px;">Total ${isEtf ? "ETF / actions" : "crypto"} : <strong id="lv-cat"></strong></p>
    ${adder}`;
}

function pagePhysique() {
  const d = wz.draft;
  return `<div class="card">
    ${(d.actifsPhysiques || []).map((a, i) => `<div class="line-item">
      <div class="li-head"><span>${esc(a.nom)}</span><button class="link-btn" data-rm="actifsPhysiques.${i}" data-rmname="${esc(a.nom)}">Retirer</button></div>
      <input type="text" inputmode="decimal" class="mid-input" data-wz="actifsPhysiques.${i}.valeurActuelle" value="${esc(a.valeurActuelle)}"></div>`).join("") || '<p class="muted">Aucun actif physique.</p>'}
    <p class="muted small">Valeur estimée actuelle. Inchangé ? « Suivant ».</p></div>
  ${wz.ui.newPhys ? `<div class="card"><div class="c-title">Nouvel actif</div>
      ${tf("__new.nom", "", "Description (ex. Vélo, Bijou)")}${nf("__new.valeur", "", "Valeur / prix d'achat (CHF)")}
      <div class="btn-row"><button class="btn primary" data-act="add-phys">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`
    : `<button class="btn full" data-act="new-phys">+ Nouvel actif physique</button>`}`;
}
const DETTE_TYPES = ["Hypothèque", "Leasing", "Prêt", "Carte de crédit", "Autre"];
function typeSelect(path, cur) {
  return `<select class="sm-input" data-wzt="${path}">${DETTE_TYPES.map((t) => `<option ${t === (cur || "Autre") ? "selected" : ""}>${t}</option>`).join("")}</select>`;
}
function pageDettes() {
  // Leasing avec date de fin : solde proposé = mensualité × mensualités restantes après le mois clôturé.
  wz.draft.dettes = wz.draft.dettes || [];
  wz.draft.dettes.forEach((x) => { const s = leasingSolde(x, wz.month); if (s !== null && !x._touched) x.solde = s; });
  const cards = wz.draft.dettes.map((x, i) => {
    const open = wz.ui.openDette === i, b = "dettes." + i;
    const calc = leasingSolde(x, wz.month) !== null;
    return `<div class="card">
      <div class="li-head"><span class="c-title">${esc(x.nom)} <span class="tag">${esc(x.type || "Autre")}</span></span>
        <button class="link-btn" data-rm="${b}" data-rmname="${esc(x.nom)}">Retirer</button></div>
      <label class="field">Solde restant dû (CHF)</label>
      <input type="text" inputmode="decimal" class="mid-input" data-wz="${b}.solde" data-touch="${b}" value="${esc(x.solde)}">
      ${calc ? `<p class="muted small">Calculé : ${leasingMoisRestants(x, wz.month)} mensualités restantes × ${fmtCHF2(Number(x.mensualite) || 0)}.</p>` : ""}
      ${open ? `<div class="tx-grid">
          <div class="span2"><label class="field">Nom</label><input type="text" class="sm-input" data-wzt="${b}.nom" value="${esc(x.nom)}"></div>
          <div><label class="field">Type</label>${typeSelect(b + ".type", x.type)}</div>
          <div><label class="field">Fin du contrat</label><input type="month" class="sm-input" data-wzt="${b}.finContrat" value="${esc(x.finContrat || "")}"></div>
          <div><label class="field">Capital initial (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${b}.capitalInitial" value="${esc(x.capitalInitial || 0)}"></div>
          <div><label class="field">Mensualité (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${b}.mensualite" value="${esc(x.mensualite || 0)}"></div>
          <div><label class="field">Taux annuel (%)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${b}.taux" data-pct="1" value="${esc(+((Number(x.taux) || 0) * 100).toFixed(3))}"></div>
        </div>
        <p class="muted small" data-dinfo="${i}"></p>
        <button class="link-btn" data-act="dette-close">Masquer les détails</button>`
      : `<button class="link-btn" data-act="dette-open" data-i="${i}">Détails (type, taux, mensualité, fin de contrat)</button>`}
    </div>`;
  }).join("");
  const adder = wz.ui.newDette ? `<div class="card"><div class="c-title">Nouvelle dette</div>
      ${tf("__new.nom", "", "Nom (ex. Leasing voiture)")}
      <label class="field">Type</label>${typeSelect("__new.type", "Autre")}
      <div class="tx-grid">
        <div><label class="field">Solde restant (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="__new.solde"></div>
        <div><label class="field">Mensualité (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="__new.mensualite"></div>
        <div><label class="field">Capital initial (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="__new.capital"></div>
        <div><label class="field">Taux annuel (%)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="__new.taux"></div>
        <div class="span2"><label class="field">Fin du contrat (optionnel)</label><input type="month" class="sm-input" data-wzt="__new.fin"></div>
      </div>
      <p class="muted small">Leasing avec une date de fin : laisse le solde vide, il sera calculé (mensualité × mensualités restantes).</p>
      <div class="btn-row"><button class="btn primary" data-act="add-dette">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`
    : `<button class="btn full" data-act="new-dette">+ Nouvelle dette</button>`;
  return `${cards || '<div class="card"><p class="muted">Aucune dette. Patrimoine net = actifs.</p></div>'}${adder}`;
}
function budgetLines(key) {
  return (wz.draft.budget[key] || []).map((r, i) => `<div class="line-item"><div class="li-head"><span>${esc(r.nom)}</span>
      <button class="link-btn" data-rm="budget.${key}.${i}" data-rmname="${esc(r.nom)}">Retirer</button></div>
    <input type="text" inputmode="decimal" class="mid-input" data-wz="budget.${key}.${i}.montant" value="${esc(r.montant)}"></div>`).join("") || '<p class="muted small">Aucune ligne.</p>';
}
function budgetAdder(key, label) {
  return wz.ui.newBudget === key
    ? `<div class="card"><div class="c-title">${esc(label)}</div>${tf("__new.nom", "", "Nom")}${nf("__new.montant", "", "Montant (CHF)")}
        <div class="btn-row"><button class="btn primary" data-act="add-budget" data-key="${key}">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`
    : `<button class="btn full" data-act="new-budget" data-key="${key}">+ ${esc(label)}</button>`;
}
function pageRevenus() {
  return `<div class="card">${budgetLines("revenus")}
    <p class="muted small">Montants réellement reçus ce mois. Ils servent aussi de base pour le mois suivant. Total <strong id="lv-rev"></strong></p></div>
    ${budgetAdder("revenus", "Nouveau revenu")}`;
}
function pageFixes() {
  return `<div class="card">${budgetLines("fixes")}
    <p class="muted small">Loyer, assurances, impôts… Inchangé ? « Suivant ». Total <strong id="lv-fix"></strong></p></div>
    ${budgetAdder("fixes", "Nouvelle charge fixe")}`;
}
function pageVariables() {
  return `<div class="card">${budgetLines("variables")}
    <p class="muted small">Total <strong id="lv-var"></strong> · surplus du mois <strong id="lv-surplus"></strong> (projets à l'étape suivante)</p></div>
    ${budgetAdder("variables", "Nouvelle dépense variable")}`;
}
function pageProjets() {
  const d = wz.draft;
  return `<div class="card">${(d.budget.projets || []).map((p, i) => `<div class="line-item">
      <div class="li-head"><span>${esc(p.nom)}</span><button class="link-btn" data-rm="budget.projets.${i}" data-rmname="${esc(p.nom)}">Retirer</button></div>
      <input type="text" inputmode="decimal" class="mid-input" data-wz="budget.projets.${i}.montant" value="${esc(p.montant)}"></div>`).join("") || '<p class="muted">Aucun projet.</p>'}
    <p class="muted small">Montant dépensé ce mois-ci pour chaque projet. Retirer un projet ne touche pas à son historique.</p></div>
  ${wz.ui.newProj ? `<div class="card"><div class="c-title">Nouveau projet</div>${tf("__new.nom", "", "Nom du projet")}${nf("__new.montant", "", "Dépensé ce mois (CHF)")}
      <div class="btn-row"><button class="btn primary" data-act="add-proj">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`
    : `<button class="btn full" data-act="new-proj">+ Nouveau projet</button>`}`;
}

function pageRecap() {
  const t = onDraft(() => ({ cash: totalCash(), p3a: total3a(), etf: totalETF(), crypto: totalCrypto(), phys: totalPhysique(), dettes: totalDettes(), total: patrimoineTotal() }));
  const ks = Object.keys(state.historique).filter((k) => k < wz.month).sort();
  const pk = ks.length ? ks[ks.length - 1] : null, h = pk ? state.historique[pk] : null;
  const line = (n, v, prev) => `<div class="row"><div class="r-name">${esc(n)}</div><div class="r-val">${fmtCHF(v)}${prev !== null && prev !== undefined ? `<div class="r-sub ${v - prev >= 0 ? "pos" : "neg"}">${signed(v - prev)}</div>` : ""}</div></div>`;
  let nA = 0, nV = 0;
  wz.draft.positions.forEach((p) => { const o = wz.origLens[p.id] || { a: 0, v: 0 };
    nA += (p.achats || []).slice(o.a).filter((a) => parseNum(a.quantite) > 0).length;
    nV += (p.ventes || []).slice(o.v).filter((v) => parseNum(v.quantite) > 0).length; });
  const exist = state.historique[wz.month];
  return `<div class="summary">
      <div class="label">Patrimoine net — ${esc(monthLabel(wz.month))}</div>
      <div class="big">${fmtCHF(t.total)}</div>
      <div class="delta ${h ? (t.total - historyTotal(h) >= 0 ? "pos" : "neg") : "muted"}">${h ? signed(t.total - historyTotal(h)) + " vs " + monthLabel(pk) : "Première clôture"}</div></div>
    <div class="list">
      ${line("Liquidités", t.cash, h && h.cash)}${line("3e pilier", t.p3a, h && h.pilier3a)}
      ${line("ETF / actions", t.etf, h && h.etf)}${line("Crypto", t.crypto, h && h.crypto)}
      ${line("Actifs physiques", t.phys, h && h.physique)}${t.dettes ? line("Dettes", -t.dettes, h ? -(h.dettes || 0) : null) : ""}
    </div>
    <div class="list" style="margin-top:12px;">
      <div class="row"><div class="r-name">Revenus du mois</div><div class="r-val">${fmtCHF(onDraft(budgetRevenusTotal))}</div></div>
      <div class="row"><div class="r-name">Dépenses du mois</div><div class="r-val">${fmtCHF(onDraft(budgetDepensesTotal))}</div></div>
      <div class="row"><div class="r-name">Surplus</div><div class="r-val ${onDraft(budgetSurplus) >= 0 ? "pos" : "neg"}">${fmtCHF(onDraft(budgetSurplus))}</div></div>
    </div>
    ${nA || nV ? `<p class="muted small">${nA} achat(s) et ${nV} vente(s) seront ajoutés au journal.</p>` : ""}
    ${exist ? `<p class="warn">Remplace la clôture existante de ${esc(monthLabel(wz.month))} (${fmtCHF(historyTotal(exist))}).</p>` : ""}`;
}

/* ---------- valeurs en direct (sans re-rendu : le champ garde le focus) ---------- */
function refreshLive() {
  if (!wz) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  onDraft(() => {
    set("lv-cash", fmtCHF(totalCash())); set("lv-3a", fmtCHF(total3a()));
    set("lv-rev", fmtCHF(budgetRevenusTotal())); set("lv-var", fmtCHF(budgetVariablesTotalSansProjets()));
    set("lv-fix", fmtCHF(budgetFixesTotal())); set("lv-surplus", fmtCHF(budgetSurplus()));
    const st = wz.steps[wz.i];
    if (st === "etf") set("lv-cat", fmtCHF(totalETF()));
    if (st === "crypto") set("lv-cat", fmtCHF(totalCrypto()));
    refreshObjInfo();
    document.querySelectorAll("[data-dinfo]").forEach((el) => {
      const x = state.dettes[Number(el.dataset.dinfo)]; if (!x) return;
      el.textContent = "Intérêts ≈ " + fmtCHF(detteInteretAnnuel(x)) + "/an · durée restante : " + detteDureeLabel(x);
    });
    document.querySelectorAll("[data-live]").forEach((el) => {
      const p = state.positions[Number(el.dataset.live)];
      const prev = _savedState.positions.find((x) => x.id === p.id);
      const q = positionQuantite(p), v = positionValue(p);
      el.innerHTML = `Valeur : <strong>${fmtCHF2(v)}</strong>${prev ? ` (avant ${fmtCHF2(onSaved(() => positionValue(prev)))})` : " (nouvelle)"}${q ? " · quantité " + (+q.toFixed(8)) : ""}`;
    });
  });
}

/* ---------- actions ---------- */
function wzGo(dir) { wz.ui = {}; wz.i = Math.max(0, Math.min(wz.steps.length - 1, wz.i + dir)); renderCloture(); window.scrollTo(0, 0); }
function newVal(name) { const el = document.querySelector(`[data-wzt="__new.${name}"],[data-wz="__new.${name}"]`); return el ? String(el.value).trim() : ""; }
function addPosition(obj) { wz.draft.positions.push(Object.assign({ prixActuel: 0, valeurManuelle: 0, achats: [], ventes: [], fraisTER: 0, ticker: "" }, obj)); }

function wzValidate() {
  const exist = state.historique[wz.month];
  if (exist && !confirm(monthLabel(wz.month) + " est déjà clôturé (" + fmtCHF(historyTotal(exist)) + "). Remplacer ?")) return;
  // Nettoyage : on ne garde pas les lignes d'achat/vente laissées vides.
  wz.draft.positions.forEach((p) => {
    p.achats = (p.achats || []).filter((a) => parseNum(a.quantite) > 0);
    p.ventes = (p.ventes || []).filter((v) => parseNum(v.quantite) > 0);
  });
  (wz.draft.dettes || []).forEach((x) => { delete x._touched; });
  (wz.draft.objectifs || []).forEach((o) => { if (Array.isArray(o.versements)) o.versements = o.versements.filter((v) => parseNum(v.montant) !== 0); });
  state = wz.draft;
  closeMonth(wz.month);
  saveData();
  const label = monthLabel(wz.month);
  wz = null;
  alert("Clôture de " + label + " enregistrée. Pense à exporter une sauvegarde.");
  go("finances");
}

function handleAct(t) {
  const d = wz.draft, a = t.dataset.act;
  const r = objAction(a, t);
  if (r === false) return;
  if (r) { renderCloture(); return; }
  if (a === "new-compte") { wz.ui = { newCompte: true }; }
  else if (a === "cat-cash" || a === "cat-3a") { wz.ui.newCompteCat = a === "cat-3a" ? "3a" : "Cash";
    const keepNom = newVal("nom"), keepSolde = newVal("solde"); renderCloture();
    const n = document.querySelector('[data-wzt="__new.nom"]'), s = document.querySelector('[data-wz="__new.solde"]');
    if (n) n.value = keepNom; if (s) s.value = keepSolde; return; }
  else if (a === "add-compte") {
    const nom = newVal("nom"); if (!nom) { alert("Indique un nom."); return; }
    d.comptes.push({ id: uid("c"), nom, categorie: wz.ui.newCompteCat === "3a" ? "3a" : "Cash", solde: parseNum(newVal("solde")) });
    wz.ui = {};
  } else if (a === "new-pos") { wz.ui = { newPos: t.dataset.cat }; }
  else if (a === "free-etf") {
    const nom = prompt("Nom de la position :"); if (!nom) return;
    addPosition({ id: uid("etf"), nom: nom.trim(), categorie: "ETF" }); wz.ui = {};
  } else if (a === "add-crypto") {
    const nom = newVal("nom"); if (!nom) { alert("Indique un nom."); return; }
    addPosition({ id: uid("cr"), nom, categorie: "Crypto" }); wz.ui = {};
  } else if (a === "new-phys") { wz.ui = { newPhys: true }; }
  else if (a === "add-phys") {
    const nom = newVal("nom"); if (!nom) { alert("Indique une description."); return; }
    const v = parseNum(newVal("valeur"));
    (d.actifsPhysiques = d.actifsPhysiques || []).push({ id: uid("act"), nom, dateAchat: "", prixAchat: v, valeurActuelle: v });
    wz.ui = {};
  } else if (a === "new-proj") { wz.ui = { newProj: true }; }
  else if (a === "add-proj") {
    const nom = newVal("nom"); if (!nom) { alert("Indique un nom."); return; }
    (d.budget.projets = d.budget.projets || []).push({ id: uid("p"), nom, montant: parseNum(newVal("montant")) });
    wz.ui = {};
  } else if (a === "new-budget") { wz.ui = { newBudget: t.dataset.key }; }
  else if (a === "add-budget") {
    const nom = newVal("nom"); if (!nom) { alert("Indique un nom."); return; }
    (d.budget[t.dataset.key] = d.budget[t.dataset.key] || []).push({ id: uid("b"), nom, montant: parseNum(newVal("montant")) });
    wz.ui = {};
  } else if (a === "dette-open") { wz.ui = { openDette: Number(t.dataset.i) }; }
  else if (a === "dette-close") { wz.ui = {}; }
  else if (a === "new-dette") { wz.ui = { newDette: true }; }
  else if (a === "add-dette") {
    const nom = newVal("nom"); if (!nom) { alert("Indique un nom."); return; }
    const x = { id: uid("d"), nom, type: newVal("type") || "Autre", capitalInitial: parseNum(newVal("capital")),
      solde: parseNum(newVal("solde")), taux: parseNum(newVal("taux")) / 100, mensualite: parseNum(newVal("mensualite")), finContrat: newVal("fin") };
    const auto = leasingSolde(x, wz.month);
    if (auto !== null && !newVal("solde")) x.solde = auto; else if (newVal("solde")) x._touched = true;
    (wz.draft.dettes = wz.draft.dettes || []).push(x); wz.ui = {};
  }
  else if (a === "cancel-new") { wz.ui = {}; }
  renderCloture();
}

/* ---------- écouteurs (posés une seule fois, délégation) ---------- */
$("#screen").addEventListener("input", (e) => {
  if (!wz || current !== "cloture") return;
  const t = e.target;
  if (t.id === "wz-month") {
    if (/^\d{4}-\d{2}$/.test(t.value)) {
      wz.month = t.value; setTitle("Clôture — " + monthLabel(wz.month));
      const ex = state.historique[wz.month]; $("#wz-month-warn").innerHTML = ex ? warnExist(ex) : "";
    }
    return;
  }
  if (t.id === "wz-search") {
    const q = t.value.trim().toLowerCase(), box = $("#wz-results");
    if (!q) { box.innerHTML = ""; return; }
    const m = TICKER_ALL.filter((i) => i.ticker.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || (i.isin || "").toLowerCase().includes(q)).slice(0, 15);
    box.innerHTML = m.map((i) => `<button class="result" data-pick="${esc(i.ticker)}"><strong>${esc(i.ticker)}</strong> ${esc(i.name)}
      <span class="tag">${i.type === "etf" ? "ETF" : "Action"}</span>${i.savingsPlan0 ? '<span class="tag gold">0% frais</span>' : ""}</button>`).join("") || '<p class="muted small">Aucun résultat.</p>';
    return;
  }
  const path = t.dataset.wz, tpath = t.dataset.wzt;
  if (path && !path.startsWith("__new.")) {
    setPath(wz.draft, path, parseNum(t.value) / (t.dataset.pct ? 100 : 1));
    if (t.dataset.touch) setPath(wz.draft, t.dataset.touch + "._touched", true);
    refreshLive();
  }
  else if (tpath && !tpath.startsWith("__new.")) {
    setPath(wz.draft, tpath, t.value);
    // Changer le type ou la date de fin d'une dette peut déclencher le calcul automatique du leasing.
    if (/^dettes\.\d+\.(type|finContrat)$/.test(tpath)) { setPath(wz.draft, tpath.replace(/\.(type|finContrat)$/, "._touched"), false); renderCloture(); }
  }
});
$("#screen").addEventListener("click", (e) => {
  if (!wz || current !== "cloture") return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.act) { handleAct(t); return; }
  if (t.dataset.pick) {
    const it = TICKER_BY_ID[t.dataset.pick]; if (!it) return;
    addPosition({ id: uid("etf"), nom: it.name, categorie: "ETF", ticker: it.ticker, fraisTER: it.type === "etf" ? (Number(it.ter) || 0) / 100 : 0 });
    wz.ui = {}; renderCloture(); return;
  }
  if (t.dataset.addtx) {
    const p = wz.draft.positions[Number(t.dataset.idx)];
    if (t.dataset.addtx === "buy") (p.achats = p.achats || []).push(p.categorie === "Crypto" ? { date: todayCH(), quantite: "", montantPaye: "" } : { date: todayCH(), quantite: "", prixPaye: "", frais: "" });
    else (p.ventes = p.ventes || []).push(p.categorie === "Crypto" ? { date: todayCH(), quantite: "", montantVenteTotal: "" } : { date: todayCH(), quantite: "", prixVenteUnitaire: "", frais: "" });
    renderCloture(); return;
  }
  if (t.dataset.rmtx) {
    const ks = t.dataset.rmtx.split("."); const idx = Number(ks.pop());
    ks.reduce((o, k) => o[k], wz.draft).splice(idx, 1); renderCloture(); return;
  }
  if (t.dataset.rm) {
    if (!confirm("Retirer « " + t.dataset.rmname + " » ? (effectif seulement si tu valides la clôture)")) return;
    const ks = t.dataset.rm.split("."); const idx = Number(ks.pop());
    ks.reduce((o, k) => o[k], wz.draft).splice(idx, 1); renderCloture(); return;
  }
});
$("#bottombar").addEventListener("click", (e) => {
  if (!wz || current !== "cloture") return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "wz-next") wzGo(1); else if (t.id === "wz-prev") wzGo(-1); else if (t.id === "wz-validate") wzValidate();
});

/* ---------- leasing : solde déduit de la date de fin ---------- */
// Nombre de mensualités restantes APRÈS le mois "AAAA-MM" donné, jusqu'au mois de fin inclus.
function leasingMoisRestants(d, monthKey) {
  if (!d || d.type !== "Leasing" || !/^\d{4}-\d{2}$/.test(d.finContrat || "") || !/^\d{4}-\d{2}$/.test(monthKey || "")) return null;
  const [fy, fm] = d.finContrat.split("-").map(Number), [y, m] = monthKey.split("-").map(Number);
  return Math.max(0, (fy * 12 + fm) - (y * 12 + m));
}
function leasingSolde(d, monthKey) {
  const n = leasingMoisRestants(d, monthKey);
  return n === null ? null : Math.round(n * (Number(d.mensualite) || 0) * 100) / 100;
}
