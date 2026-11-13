// Ordovie — Impôts : page d'information pour préparer la déclaration, à partir de ce que l'app sait déjà.
// Pas de calcul d'impôt (barèmes cantonaux trop complexes) : check-list des pièces, déductions à vérifier, valeurs utiles.
"use strict";
function isBerne() { return /^(be|bern|berne)$/i.test(((settings.profil || {}).canton || "").trim()); }

function imp() { admin.impots = admin.impots || {}; const y = String(Number(state ? state.params.anneeFiscale : new Date().getFullYear())); admin.impots[y] = admin.impots[y] || { delai: "", coche: {} }; return { y, o: admin.impots[y] }; }

// Cherche dans le coffre un document d'une catégorie qui mentionne l'année (nom, notes ou transcription).
// words : au moins un des mots doit apparaître. Une police d'assurance n'est jamais prise pour une attestation fiscale.
function findVault(cat, year, words) {
  const linked = new Set((admin.contrats || []).flatMap((c) => c.linkedDocs || []));
  return (admin.documents || []).filter((d) => d.categorie === cat && !d.archived && !linked.has(d.id)).find((d) => {
    const t = d.transcription || {};
    if (/police|conditions générales|\bcga\b/i.test([d.nom, t.type, t.titre].filter(Boolean).join(" "))) return false;
    const txt = [d.nom, d.notes, d.transcription && JSON.stringify(d.transcription)].filter(Boolean).join(" ").toLowerCase();
    return txt.includes(String(year)) && (!words || words.some((w) => txt.includes(w)));
  });
}

function piecesList(year) {
  const L = [];
  L.push({ k: "salaire", t: `Certificat de salaire ${year}`, h: "Remis par l'employeur en début d'année. Un par personne et par employeur (conjoint·e compris).", f: findVault("Revenus", year, ["salaire", "lohn"]) });
  L.push({ k: "3a", t: `Attestation 3e pilier ${year}`, h: "Envoyée par ta banque ou ta fondation 3a (ex. VIAC) en janvier. Une par compte 3a.", f: findVault("Prévoyance", year, ["3a", "pilier", "säule"]) });
  (state.comptes || []).filter((c) => c.categorie === "Cash").forEach((c) => L.push({ k: "bq-" + c.id, t: `Relevé fiscal au 31.12 : ${c.nom}`, h: "Solde au 31 décembre et intérêts de l'année (attestation fiscale de la banque).", f: findVault("Banque", year, [String(c.nom).toLowerCase().split(" ").pop()]) }));
  if (totalETF() > 0) L.push({ k: "titres", t: "Relevé fiscal des titres (ETF / actions)", h: "Demande à ta banque ou à Neon le relevé fiscal annuel : valeur au 31.12 et dividendes, à reporter dans l'état des titres.", f: findVault("Banque", year, ["titre", "fiscal", "neon"]) });
  if (totalCrypto() > 0) L.push({ k: "crypto", t: "Cryptos : quantités et valeur au 31.12", h: "La crypto fait partie de la fortune. Les cours de fin d'année publiés par l'Administration fédérale des contributions servent de référence.", f: null });
  const assur = (admin.contrats || []).filter((c) => /LAMal|LCA|Complémentaire/i.test(c.type || ""));
  L.push({ k: "lamal", t: "Attestation des primes d'assurance maladie", h: assur.length ? "Tes caisses : " + assur.map((c) => c.fournisseur || c.type).join(", ") + "." : "Délivrée par ta caisse maladie (LAMal et complémentaires).", f: findVault("Santé", year, ["attestation fiscale", "attestation de prime", "attestation des primes", "steuerbescheinigung"]) || findVault("Impôts", year, ["prime"]) });
  L.push({ k: "frais-med", t: "Frais médicaux non remboursés", h: "Franchise, quote-part, dentiste, lunettes… Déductibles au-delà d'un seuil lié à ton revenu : garde les décomptes.", f: findVault("Santé", year, ["décompte", "decompte", "facture", "quote-part", "franchise", "remboursement"]) });
  if ((state.dettes || []).length) L.push({ k: "dettes", t: "Attestation des dettes et intérêts payés", h: "Pour chaque prêt / hypothèque : solde au 31.12 et intérêts de l'année.", f: null });
  L.push({ k: "dons", t: "Reçus de dons", h: "Dons à des organisations d'utilité publique reconnues : déductibles à partir d'un montant minimum.", f: findVault("Impôts", year, ["don"]) });
  L.push({ k: "taxation", t: `Dernier avis de taxation (${year - 1})`, h: "Utile pour reprendre les montants et vérifier les acomptes.", f: findVault("Impôts", year - 1, ["taxation", "veranlagung"]) });
  return L;
}

const DEDUCTIONS = [
  ["3e pilier A", "Les versements de l'année sont déduits du revenu, jusqu'au plafond. Chaque conjoint a son propre plafond."],
  ["Frais de déplacement", "Trajet domicile–travail : abonnement de transports publics, ou voiture si justifié (montants plafonnés)."],
  ["Repas hors domicile", "Si tu ne peux pas rentrer manger à midi, ou en cas de travail en équipe : forfait par jour travaillé."],
  ["Autres frais professionnels", "Forfait automatique en % du salaire, ou frais effectifs si plus élevés (outils, vêtements professionnels…)."],
  ["Formation continue", "Cours en lien avec ton activité professionnelle, avec les factures."],
  ["Primes d'assurance et intérêts d'épargne", "Forfait (plus élevé pour un couple marié), dans lequel entrent les primes maladie payées."],
  ["Double activité des conjoints", "Si vous travaillez tous les deux, une déduction spécifique s'applique."],
  ["Intérêts de dettes", "Les intérêts payés (prêt, hypothèque) sont déductibles."],
  ["Frais médicaux", "Part non remboursée, au-delà d'un seuil en % du revenu."],
  ["Dons", "Aux organisations d'utilité publique reconnues, avec les reçus."],
  ["Rachat LPP", "Un rachat dans ta caisse de pension est entièrement déductible (voir ton certificat LPP pour le potentiel)."],
];

let taxTab = "declaration";
function renderImpots() {
  setTitle("Impôts"); setBottomBar(aiReady() ? '<button class="btn primary btn-main" id="btn-ask-tax">' + ic("chat") + 'Préparer ma déclaration avec l\'assistant</button>' : "");
  if (!state) { $("#screen").innerHTML = '<div class="card"><p class="muted">Importe d\'abord tes données.</p></div>'; return; }
  const tabs = `<div class="tabs">${[["declaration", "Déclaration"], ["simulation", "Simulation"]].map(([k, l]) => `<button class="tab ${k === taxTab ? "on" : ""}" data-taxtab="${k}">${l}</button>`).join("")}</div>`;
  $("#screen").innerHTML = tabs + (taxTab === "simulation" ? taxSimulation() : taxDeclaration());
}
function taxDeclaration() {
  const { y, o } = imp(), year = Number(y), p = state.params;
  const ign = o.ignore || {};
  const pieces = piecesList(year).map((x) => (ign[x.k] && x.f && ign[x.k] === x.f.id ? Object.assign(x, { f: null }) : x)), done = pieces.filter((x) => x.f || o.coche[x.k]).length;
  const dl = o.delai ? parseISO(o.delai) : null, n = dl ? daysUntil(dl) : null;
  const v3a = pilier3aVerseCetteAnnee(), eco = v3a * (Number(p.tauxMarginal) || 0);
  const interets = typeof totalInteretsAnnuelsDettes === "function" ? totalInteretsAnnuelsDettes() : 0;
  const dec = state.historique[year + "-12"];
  return `
    <div class="summary"><div class="label">Déclaration ${year}</div>
      <div class="big">${done} / ${pieces.length}<span class="per"> pièces prêtes</span></div>
      <div class="delta muted">Revenus et fortune ${year}, déclaration à déposer en ${year + 1}.</div></div>

    <div class="card">
      <div class="c-title">Délai de dépôt</div>
      <div class="edit-row"><span class="name">Délai indiqué sur ta lettre des impôts</span><input type="date" class="sm-input" id="tax-delai" value="${esc(o.delai)}" style="width:150px;"></div>
      ${dl ? `<p class="small ${n < 0 ? "neg" : n <= 30 ? "gold" : ""}">${n < 0 ? "Délai dépassé de " + (-n) + " jours" : "Dans " + n + " jours"}</p>` : ""}
      <p class="muted small">${isBerne() ? `Dans le canton de Berne, le délai figure sur la lettre qui accompagne la déclaration. Il peut être prolongé en ligne sur <a href="https://www.taxme.ch" target="_blank" rel="noopener">taxme.ch</a> (ou par téléphone) avec les codes de la lettre.` : `Le délai figure sur la lettre des impôts de ton canton. Il peut en général être prolongé en ligne avec les codes de cette lettre.`} Sans prolongation, une sommation payante peut être envoyée.</p>
    </div>

    <div class="section-title">Pièces à rassembler</div>
    <div class="card">${pieces.map((x) => `<div class="obj tax-item">
        <label class="tax-chk"><input type="checkbox" data-taxk="${esc(x.k)}" ${x.f || o.coche[x.k] ? "checked" : ""} ${x.f ? "disabled" : ""}>
          <span><span class="${x.f || o.coche[x.k] ? "done" : ""}">${esc(x.t)}</span>
          ${x.f ? `<span class="r-sub pos">✓ dans ton coffre : ${esc(x.f.nom)} · <button class="link-btn" data-taxign="${esc(x.k)}" data-doc="${esc(x.f.id)}">pas le bon document</button></span>` : `<span class="r-sub">${esc(x.h)}</span>`}</span></label>
      </div>`).join("")}
      <p class="muted small">Une pièce est cochée automatiquement si un document de la bonne catégorie, mentionnant ${year}, est dans ton coffre (Documents).</p></div>

    <div class="section-title">Ce que l'app sait déjà</div>
    <div class="list">
      <div class="row"><div class="r-name">3e pilier versé en ${year}</div><div class="r-val">${fmtCHF(v3a)}<div class="r-sub">plafond ${fmtCHF(p.plafond3aAvec2P)} · économie ≈ ${fmtCHF(eco)}</div></div></div>
      ${v3a < p.plafond3aAvec2P ? `<div class="row"><div class="r-name">Encore possible avant le 31.12</div><div class="r-val gold">${fmtCHF(p.plafond3aAvec2P - v3a)}<div class="r-sub">≈ ${fmtCHF((p.plafond3aAvec2P - v3a) * (Number(p.tauxMarginal) || 0))} d'impôt en moins</div></div></div>` : ""}
      ${interets ? `<div class="row"><div class="r-name">Intérêts de dettes (estimés)</div><div class="r-val">${fmtCHF(interets)}<div class="r-sub">par an</div></div></div>` : ""}
      <div class="row"><div class="r-name">Fortune nette ${dec ? "au 31.12." + year : "actuelle"}</div><div class="r-val">${fmtCHF(dec ? historyTotal(dec) : patrimoineTotal())}<div class="r-sub">${dec ? "clôture de décembre" : "clôture de décembre pas encore faite"}</div></div></div>
    </div>
    <p class="muted small">Économie estimée avec ton taux marginal (${Math.round((p.tauxMarginal || 0) * 100)} %, Paramètres). Le 3a de ton/ta conjoint·e se déduit en plus, avec son propre plafond.</p>

    <div class="section-title">Déductions à vérifier</div>
    <div class="card">${DEDUCTIONS.map(([t, h]) => `<details class="art"><summary>${esc(t)}</summary><p>${esc(h)}</p></details>`).join("")}
      <p class="muted small">Montants et plafonds exacts : guide officiel de la déclaration ${isBerne() ? "du canton de Berne" : "de ton canton"}. En cas de doute, une fiduciaire ou l'administration fiscale cantonale.</p></div>`;
}

$("#screen").addEventListener("change", (e) => {
  if (current !== "impots") return;
  const { o } = imp(), t = e.target;
  if (t.id === "tax-delai") { o.delai = t.value; saveAdmin(); renderImpots(); }
  else if (t.dataset.taxk) { o.coche[t.dataset.taxk] = t.checked; saveAdmin(); renderImpots(); }
});
$("#bottombar").addEventListener("click", (e) => {
  if (!e.target.closest("#btn-ask-tax")) return;
  openAssistant(null);
  const i = document.getElementById("chat-input");
  if (i) i.value = `Aide-moi à préparer ma déclaration d'impôts ${imp().y} : quelles déductions me concernent d'après mes données, et que me manque-t-il ?`;
});
function taxAlerts() {
  if (!state) return [];
  const { o } = imp(); if (!o.delai) return [];
  const n = daysUntil(parseISO(o.delai));
  return n <= 45 ? [{ c: n <= 14 ? "red" : "", t: n < 0 ? "Délai de déclaration d'impôts dépassé" : `Déclaration d'impôts à déposer d'ici le ${fmtDate(o.delai)} (${n} j)` }] : [];
}
if (current === "home") renderHome();

/* ---------- onglet Simulation : estimation par ton taux effectif réel ---------- */
function monRevenuAnnuel() {
  const y = String(state.params.anneeFiscale);
  const ks = Object.keys(state.historique).filter((k) => k.startsWith(y) && Number(state.historique[k].revenus));
  if (ks.length) return { v: ks.reduce((s, k) => s + Number(state.historique[k].revenus), 0) / ks.length * 12, src: `moyenne de tes ${ks.length} clôture(s) ${y} × 12` };
  return { v: budgetRevenusTotal() * 12, src: "budget mensuel × 12 (aucune clôture cette année)" };
}
function provisionImpots() {
  const l = (state.budget.fixes || []).filter((x) => /imp[oô]t/i.test(x.nom || ""));
  return l.length ? { v: l.reduce((s, x) => s + (Number(x.montant) || 0), 0) * 12, noms: l.map((x) => x.nom).join(", ") } : null;
}
function taxSim() { const { o } = imp(); o.sim = o.sim || {}; return o.sim; }
function taxSimulation() {
  const S = taxSim(), p = state.params, year = Number(imp().y), tm = Number(p.tauxMarginal) || 0;
  const me = monRevenuAnnuel(), moi = S.monRevenu > 0 ? Number(S.monRevenu) : me.v, conj = Number(S.conjoint) || 0, foyer = moi + conj;
  const ready = Number(S.refRevenu) > 0 && Number(S.refImpot) > 0;
  const taux = ready ? Number(S.refImpot) / Number(S.refRevenu) : 0;
  const v3a = pilier3aVerseCetteAnnee(), d3a = v3a - (Number(S.ref3a) || 0);
  const est = ready ? Math.max(0, taux * foyer - d3a * tm) : 0;
  const prov = provisionImpots();
  const f = (k, v, ph) => `<input type="text" inputmode="decimal" class="sm-input amount" data-sim="${k}" value="${v ? esc(v) : ""}" placeholder="${ph || ""}">`;
  return `
    ${ready ? `<div class="summary"><div class="label">Impôts ${year} estimés</div><div class="big">${fmtCHF(est)}</div>
      <div class="delta muted">soit ${fmtCHF(est / 12)} par mois · taux effectif ${(taux * 100).toFixed(1)} %</div></div>
      ${prov ? `<div class="card ${prov.v >= est ? "" : "insight"}"><div class="li-head"><span>Ta provision (${esc(prov.noms)})</span><strong>${fmtCHF(prov.v)}</strong></div>
        <p class="small ${prov.v >= est ? "pos" : "gold"}">${prov.v >= est ? `✓ Elle couvre l'estimation (marge ${fmtCHF(prov.v - est)}).` : `Il manquerait ≈ ${fmtCHF(est - prov.v)}, soit ${fmtCHF((est - prov.v) / 12)} de plus par mois.`}</p></div>` : ""}`
    : `<div class="card insight"><strong>Pour estimer tes impôts</strong>, il me faut 2 chiffres de ton dernier avis de taxation (ci-dessous). Ils donnent ton taux réel, avec toutes tes déductions et ta commune.</div>`}

    <div class="section-title">Ton dernier avis de taxation</div>
    <div class="card">
      <div class="edit-row"><span class="name">Année de l'avis</span>${f("refAnnee", S.refAnnee, String(year - 1))}<span class="unit"></span></div>
      <div class="edit-row"><span class="name">Revenus nets du foyer cette année-là</span>${f("refRevenu", S.refRevenu, "ex. 98000")}<span class="unit">CHF</span></div>
      <div class="edit-row"><span class="name">Impôt total (canton, commune, fédéral, église)</span>${f("refImpot", S.refImpot, "ex. 13000")}<span class="unit">CHF</span></div>
      <div class="edit-row"><span class="name">3a versé cette année-là (optionnel)</span>${f("ref3a", S.ref3a, "0")}<span class="unit">CHF</span></div>
      <p class="muted small">« Revenus nets » : salaires nets annuels du foyer (13e compris), comme sur tes certificats de salaire. L'impôt total se trouve sur l'avis de taxation ou la facture finale.</p>
    </div>

    <div class="section-title">Cette année (${year})</div>
    <div class="card">
      <div class="edit-row"><span class="name">Tes revenus nets<br><span class="r-sub">auto : ${fmtCHF(me.v)} (${esc(me.src)})</span></span>${f("monRevenu", S.monRevenu, Math.round(me.v))}<span class="unit">CHF</span></div>
      <div class="edit-row"><span class="name">Revenus nets de ta conjointe</span>${f("conjoint", S.conjoint, "0")}<span class="unit">CHF</span></div>
      <div class="row"><div class="r-name">Revenus du foyer</div><div class="r-val">${fmtCHF(foyer)}</div></div>
      <div class="row"><div class="r-name">3a versé cette année</div><div class="r-val">${fmtCHF(v3a)}<div class="r-sub">${d3a ? (d3a > 0 ? "−" : "+") + fmtCHF(Math.abs(d3a * tm)) + " d'impôt vs l'année de référence" : "comme l'année de référence"}</div></div></div>
    </div>

    <div class="card"><div class="c-title">Comment c'est calculé</div>
      <ol class="steps-list">
        <li>Ton taux réel = impôt total ÷ revenus de l'année de référence${ready ? ` = <strong>${(taux * 100).toFixed(1)} %</strong>` : ""}.</li>
        <li>On applique ce taux aux revenus du foyer de cette année.</li>
        <li>On ajuste pour la différence de versements 3a (× ton taux marginal de ${Math.round(tm * 100)} %).</li>
      </ol>
      <p class="muted small">Approximation (± 10 % environ) : l'impôt suisse est progressif, donc si tes revenus augmentent nettement, l'impôt réel monte un peu plus vite que l'estimation. Changement de commune, d'enfants ou de situation = refaire avec un nouvel avis.</p>
      <p class="small">Pour un calcul précis avec les barèmes officiels : <a href="https://swisstaxcalculator.estv.admin.ch" target="_blank" rel="noopener">calculateur fiscal de la Confédération (AFC)</a>.</p></div>`;
}
$("#screen").addEventListener("change", (e) => {
  if (current !== "impots" || !e.target.dataset.sim) return;
  const v = e.target.value.trim(); taxSim()[e.target.dataset.sim] = v === "" ? "" : parseNum(v); saveAdmin(); renderImpots();
});
$("#screen").addEventListener("click", (e) => {
  const g = e.target.closest("[data-taxign]");
  if (g && current === "impots") { e.preventDefault(); const { o } = imp(); (o.ignore = o.ignore || {})[g.dataset.taxign] = g.dataset.doc; saveAdmin(); renderImpots(); return; }
  const t = e.target.closest("[data-taxtab]"); if (!t || current !== "impots") return;
  taxTab = t.dataset.taxtab; renderImpots();
});
