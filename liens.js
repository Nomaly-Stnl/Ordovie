// Ordovie — lien Contrats → Finances : une charge fixe peut « suivre » un ou plusieurs contrats.
// Son montant mensuel = somme des primes mensualisées des contrats liés, mis à jour automatiquement.
"use strict";

// Ligne de charges fixes proposée pour chaque type de contrat (par id de ligne, sinon par mot-clé dans le nom).
const LIEN_CIBLES = {
  "Assurance maladie (LAMal)": ["caissemaladie", /maladie|lamal/i],
  "Complémentaire (LCA)": ["caissemaladie", /maladie|compl/i],
  "RC / ménage": ["assdiverses", /assurance|rc|ménage/i],
  "Protection juridique": ["assdiverses", /assurance|juridique/i],
  "Véhicule": ["assdiverses", /voiture|véhicule|auto|assurance/i],
  "Bail / logement": ["loyer", /loyer|bail/i],
  "Téléphone / internet": ["telephone", /téléphone|internet|mobile/i],
};
const round2 = (x) => Math.round(x * 100) / 100;
function contratById(id) { return (admin.contrats || []).find((c) => c.id === id && !c._new); }
function lienLigne(budget, contratId) { return (budget.fixes || []).find((l) => (l.contrats || []).includes(contratId)); }

// Recalcule les lignes liées. Retourne true si un montant a changé.
function syncLiens(budget) {
  if (!budget || !budget.fixes) return false;
  let changed = false;
  for (const l of budget.fixes) {
    if (!l.contrats || !l.contrats.length) continue;
    l.contrats = l.contrats.filter((id) => contratById(id));
    if (!l.contrats.length) { delete l.contrats; changed = true; continue; } // contrats supprimés : la ligne redevient manuelle
    const v = round2(l.contrats.reduce((s, id) => s + primeMensuelle(contratById(id)), 0));
    if (Number(l.montant) !== v) { l.montant = v; changed = true; }
  }
  return changed;
}
// Après une modification de contrat : met à jour le budget courant des finances.
function syncLiensFinances() { if (state && state.budget && syncLiens(state.budget)) saveData(); }

function cibleLigne(budget, c) {
  const def = LIEN_CIBLES[c.type]; if (!def) return null;
  return (budget.fixes || []).find((l) => l.id === def[0]) || (budget.fixes || []).find((l) => def[1].test(l.nom)) || null;
}
// Contrats avec une prime, pas encore liés à une charge fixe.
function contratsNonLies(budget) {
  return (admin.contrats || []).filter((c) => !c._new && primeMensuelle(c) > 0 && !lienLigne(budget, c.id));
}
function lier(budget, c, ligne) {
  if (!ligne) { ligne = { id: uid("b"), nom: c.fournisseur || c.type, montant: 0 }; budget.fixes.push(ligne); }
  // Une ligne saisie à la main devient « liée » : son montant manuel est remplacé par les primes.
  ligne.contrats = (ligne.contrats || []).concat([c.id]);
  syncLiens(budget);
}

/* ---------- étape « Charges fixes » de la clôture ---------- */
function liensHtml() {
  const b = wz.draft.budget, libres = contratsNonLies(b);
  if (!libres.length) return "";
  return `<div class="card lien-card"><div class="c-title">Depuis tes contrats</div>
    <p class="muted small">Lie une charge à ses contrats : son montant suivra automatiquement les primes.</p>
    ${libres.map((c) => { const cible = cibleLigne(b, c);
      return `<div class="lien-row"><div><strong>${esc(c.fournisseur || c.type)}</strong><span class="r-sub">${esc(c.type)} · ${fmtCHF2(primeMensuelle(c))}/mois</span></div>
        <button class="btn sm" data-lk="${esc(c.id)}">${cible ? "Lier à « " + esc(cible.nom) + " »" : "Ajouter comme charge"}</button></div>`; }).join("")}
    ${libres.length > 1 ? `<button class="btn primary full" data-lk-all="1">Tout lier (${libres.length})</button>` : ""}
  </div>`;
}
// Ligne liée : montant en lecture seule (il se modifie dans la fiche du contrat).
function ligneLieeHtml(r, i) {
  const noms = r.contrats.map((id) => contratById(id)).filter(Boolean).map((c) => c.fournisseur || c.type).join(", ");
  return `<div class="line-item"><div class="li-head"><span>${esc(r.nom)}</span><button class="link-btn" data-unlk="${i}">Délier</button></div>
    <div class="linked-val"><strong>${fmtCHF2(r.montant)}</strong><span class="r-sub">${ic("link", 13)} suit : ${esc(noms)}</span></div></div>`;
}

$("#screen").addEventListener("click", (e) => {
  if (typeof wz === "undefined" || !wz || current !== "cloture") return;
  const t = e.target.closest("button"); if (!t) return;
  const b = wz.draft.budget;
  if (t.dataset.lk) { const c = contratById(t.dataset.lk); if (c) lier(b, c, cibleLigne(b, c)); }
  else if (t.dataset.lkAll) { contratsNonLies(b).forEach((c) => lier(b, c, cibleLigne(b, c))); }
  else if (t.dataset.unlk !== undefined) { const l = b.fixes[Number(t.dataset.unlk)]; if (l) delete l.contrats; }
  else return;
  renderCloture();
});
