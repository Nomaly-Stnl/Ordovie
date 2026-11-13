// Ordovie — palier 2 : contrats et échéancier de résiliation.
// Données séparées des finances (clé ordovie_admin_v1), incluses dans la sauvegarde chiffrée.
"use strict";

const ADMIN_KEY = "ordovie_admin_v1";
let admin = readJSON(ADMIN_KEY) || { contrats: [] };
admin.contrats = admin.contrats || [];
function saveAdmin() { writeJSON(ADMIN_KEY, admin); }

const CONTRAT_TYPES = [
  // [libellé, échéance par défaut (MM-JJ), délai par défaut en mois]
  ["Assurance maladie (LAMal)", "12-31", 1],
  ["Complémentaire (LCA)", "12-31", 3],
  ["RC / ménage", "12-31", 3],
  ["Véhicule", "12-31", 3],
  ["Protection juridique", "12-31", 3],
  ["Assurance vie / 3b", "12-31", 3],
  ["Bail / logement", "", 3],
  ["Téléphone / internet", "", 2],
  ["Abonnement", "", 1],
  ["Autre", "", 3],
];
const PERIODES = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };
const TITULAIRES = ["Moi", "Conjoint·e", "Foyer"];

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const fmtDate = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return d + "." + m + "." + y; };
function parseISO(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function today0() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
// Soustrait n mois en restant dans le mois cible (31.12 − 3 mois = 30.09).
function minusMonths(d, n) {
  const y = d.getFullYear(), m = d.getMonth() - n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}
// Prochaine échéance : si le contrat se renouvelle tacitement chaque année, on avance d'année en année.
function nextEcheance(c) {
  const e = parseISO(c.echeance); if (!e) return null;
  if (c.tacite === false) return e;
  const t = today0(); let d = new Date(e);
  while (minusMonths(d, Number(c.delaiMois) || 0) < t) d = new Date(d.getFullYear() + 1, d.getMonth(), Math.min(d.getDate(), new Date(d.getFullYear() + 1, d.getMonth() + 1, 0).getDate()));
  return d;
}
function deadline(c) { const e = nextEcheance(c); return e ? minusMonths(e, Number(c.delaiMois) || 0) : null; }
function daysUntil(d) { return d ? Math.round((d - today0()) / 864e5) : null; }
function primeMensuelle(c) { return (Number(c.prime) || 0) * (PERIODES[c.periode] || 12) / 12; }
function totalPrimesMensuelles() { return admin.contrats.reduce((s, c) => s + primeMensuelle(c), 0); }

// Échéances à signaler sur l'accueil (≤ 60 jours).
function contratAlerts() {
  // Formulation neutre : on signale une décision à prendre, on ne pousse pas à résilier.
  return admin.contrats.map((c) => {
    const nm = c.fournisseur || c.type;
    if (c.tacite === false) { // contrat qui prend fin tout seul : simple information
      const e = nextEcheance(c), n = daysUntil(e);
      return e && n >= 0 && n <= 60 ? { at: e, c: "", t: `${nm} : fin du contrat le ${fmtDate(iso(e))} (${n} j)` } : null;
    }
    const dl = deadline(c), n = daysUntil(dl);
    return dl && n >= 0 && n <= 60 ? { at: dl, c: n <= 14 ? "red" : "", t: `${nm} : se renouvelle le ${fmtDate(iso(nextEcheance(c)))}, pour changer décider avant le ${fmtDate(iso(dl))} (${n} j)` } : null;
  }).filter(Boolean).sort((a, b) => a.at - b.at).map(({ c, t }) => ({ c, t }));
}

/* ---------- liste ---------- */
function renderContrats() {
  setTitle("Contrats");
  setBottomBar('<button class="btn primary btn-main" id="btn-new-contrat">+ Nouveau contrat</button>');
  const list = admin.contrats.map((c, i) => ({ c, i, dl: deadline(c) }))
    .sort((a, b) => { const k = (x) => (x.dl && daysUntil(x.dl) >= 0 ? x.dl.getTime() : Infinity); return k(a) - k(b); });
  $("#screen").innerHTML = `
    ${admin.contrats.length && typeof aiReady === "function" && aiReady() ? `<button class="btn full" id="btn-analyse-contrats">${ic("search")}Analyser mes contrats : oublis, doublons, économies</button>` : ""}
    <div class="summary"><div class="label">Primes et abonnements</div>
      <div class="big">${fmtCHF(totalPrimesMensuelles())}<span class="per"> / mois</span></div>
      <div class="delta muted">${admin.contrats.length} contrat(s) · ${fmtCHF(totalPrimesMensuelles() * 12)} par an</div></div>
    ${list.length ? `<div class="section-title">Par prochaine date de décision</div>` : ""}
    ${list.map(({ c, i, dl }) => {
      const n = daysUntil(dl);
      const ended = dl !== null && (c.tacite === false || n < 0); // contrat sans renouvellement : il prend fin tout seul
      const cls = dl === null || ended ? "" : n <= 14 ? "urgent" : n <= 60 ? "soon" : "";
      
      return `<button class="card contrat ${cls}" data-contrat="${i}">
        <div class="li-head"><span class="c-title">${esc(c.fournisseur || "Sans nom")}</span><span class="r-val">${fmtCHF2(primeMensuelle(c))}<span class="per">/mois</span></span></div>
        <div class="r-sub">${esc(c.type)}${c.titulaire && c.titulaire !== "Moi" ? " · " + esc(c.titulaire) : ""}${c.numero ? " · n° " + esc(c.numero) : ""}</div>
        <div class="deadline">${ended ? `Sans renouvellement · ${daysUntil(nextEcheance(c)) >= 0 ? "prend fin le" : "terminé le"} ${fmtDate(iso(nextEcheance(c)))}` : dl ? `Se renouvelle le ${fmtDate(iso(nextEcheance(c)))} · pour changer : avant le <strong>${fmtDate(iso(dl))}</strong> (${n} j)` : "Pas d'échéance renseignée"}</div>
      </button>`;
    }).join("") || `<div class="card"><p class="muted">Aucun contrat. Ajoute tes assurances, ton bail et tes abonnements : Ordovie calcule pour chacun jusqu'à quand tu peux changer et te prévient sur l'accueil 60 jours avant.</p></div>`}
    <p class="muted small">Si tu décides de changer : la lettre doit être <strong>reçue</strong> avant la date limite. Envoie-la en recommandé une dizaine de jours avant.</p>`;
}

/* ---------- fiche ---------- */
let editIdx = null; // index du contrat édité, -1 = nouveau
let draftC = null;
function openContrat(i) {
  editIdx = i;
  draftC = i === -1 ? { id: "k" + Date.now().toString(36), type: CONTRAT_TYPES[0][0], fournisseur: "", numero: "", titulaire: "Moi",
    prime: "", periode: "mensuelle", debut: "", echeance: new Date().getFullYear() + "-12-31", delaiMois: 1, tacite: true, notes: "" }
    : JSON.parse(JSON.stringify(admin.contrats[i]));
  go("contrat-edit");
}
function renderContratEdit() {
  const c = draftC; if (!c) { go("contrats"); return; }
  setTitle(editIdx === -1 || c._new ? "Nouveau contrat" : "Contrat");
  setBottomBar(`<button class="btn btn-side" id="btn-cancel-contrat">Annuler</button><button class="btn primary btn-main" id="btn-save-contrat">Enregistrer</button>`);
  const dl = deadline(c);
  const L = (txt, k) => `<label class="field">${txt}${typeof srcTag === "function" ? srcTag(k) : ""}</label>`;
  $("#screen").innerHTML = `
    ${typeof newImportHtml === "function" ? newImportHtml() : ""}
    <div class="card">
      ${L("Type", "type")}
      <select class="sm-input" data-c="type">${CONTRAT_TYPES.map(([t]) => `<option ${t === c.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      ${L("Assureur / fournisseur", "fournisseur")}<input type="text" class="sm-input" data-c="fournisseur" value="${esc(c.fournisseur)}" placeholder="ex. CSS, Mobilière, Swisscom">
      <div class="tx-grid">
        <div>${L("N° de police / client", "numero")}<input type="text" class="sm-input" data-c="numero" value="${esc(c.numero)}"></div>
        <div><label class="field">Titulaire</label><select class="sm-input" data-c="titulaire">${TITULAIRES.map((t) => `<option ${t === c.titulaire ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div>${L("Prime (CHF)", "prime")}<input type="text" inputmode="decimal" class="sm-input" data-c="prime" data-num="1" value="${esc(c.prime)}"></div>
        <div>${L("Périodicité", "periode")}<select class="sm-input" data-c="periode">${Object.keys(PERIODES).map((p) => `<option ${p === c.periode ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      </div>
    </div>
    <div class="card">
      <div class="c-title">Résiliation</div>
      <div class="tx-grid">
        <div>${L("Début du contrat", "debut")}<input type="date" class="sm-input" data-c="debut" value="${esc(c.debut)}"></div>
        <div>${L("Échéance", "echeance")}<input type="date" class="sm-input" data-c="echeance" value="${esc(c.echeance)}"></div>
        <div>${L("Délai de résiliation (mois)", "delaiMois")}<input type="text" inputmode="numeric" class="sm-input" data-c="delaiMois" data-num="1" value="${esc(c.delaiMois)}"></div>
        <div>${L("Renouvellement", "tacite")}<select class="sm-input" data-c="tacite"><option value="1" ${c.tacite !== false ? "selected" : ""}>tacite, chaque année</option><option value="0" ${c.tacite === false ? "selected" : ""}>non (prend fin)</option></select></div>
      </div>
      <p class="muted small" id="c-dl">${dlText(c)}</p>
      ${dl && daysUntil(dl) >= 0 && c.tacite !== false && typeof gcalLink === "function" ? `<a class="btn full" href="${gcalLink((c.fournisseur || c.type) + " : décider (renouvellement le " + fmtDate(iso(nextEcheance(c))) + ")", iso(dl), "Dernier jour pour que la lettre de résiliation soit reçue, si tu veux changer. Envoi en recommandé ~10 jours avant.", "annuelle")}" target="_blank" rel="noopener">${ic("calendar")}Ajouter la date limite à mon agenda</a>` : ""}
      <p class="muted small">Où trouver ces infos : sur ta police ou tes conditions générales, rubrique « durée » ou « résiliation ».</p>
    </div>
    ${editIdx !== -1 && typeof aiReady === "function" && aiReady() ? `<button class="btn full" id="btn-ask-contrat">${ic("chat")}Une question sur ce contrat ?</button>` : ""}
    ${typeof astucesHtml === "function" ? astucesHtml(c) : ""}
    ${typeof contratDocsHtml === "function" ? contratDocsHtml() : ""}
    <div class="card"><label class="field">Notes</label><textarea class="sm-input" rows="3" data-c="notes">${esc(c.notes || "")}</textarea></div>
    ${editIdx !== -1 && !c._new ? `<button class="btn full danger" id="btn-del-contrat">Supprimer ce contrat</button>` : ""}`;
  if (typeof fillThumbs === "function") fillThumbs();
}
function dlText(c) {
  const dl = deadline(c), e = nextEcheance(c);
  if (!dl) return "Indique l'échéance pour calculer la date limite.";
  if (c.tacite === false) return `Sans renouvellement : le contrat prend fin le <strong>${fmtDate(iso(e))}</strong>. Rien à faire.`;
  if (daysUntil(dl) < 0) return `Délai passé pour l'échéance du ${fmtDate(iso(e))}.`;
  return `Se renouvelle le ${fmtDate(iso(e))}. Si tu veux résilier ou changer, ta lettre doit être reçue avant le <strong>${fmtDate(iso(dl))}</strong> (dans ${daysUntil(dl)} jours).`;
}
function refreshDeadline() {
  const el = document.getElementById("c-dl"); if (!el) return;
  el.innerHTML = dlText(draftC);
}

/* ---------- écouteurs (une fois) ---------- */
const isContratScreen = () => current === "contrats" || current === "contrat-edit";
$("#screen").addEventListener("input", (e) => {
  if (current !== "contrat-edit" || !draftC) return;
  const t = e.target, k = t.dataset.c; if (!k) return;
  let v = t.value;
  if (t.dataset.num) v = parseNum(v);
  if (k === "tacite") v = v === "1";
  draftC[k] = v;
  if (k === "type") {
    // Valeurs par défaut utiles selon le type (modifiables).
    const def = CONTRAT_TYPES.find(([n]) => n === v);
    if (def) { draftC.delaiMois = def[2]; if (def[1]) draftC.echeance = new Date().getFullYear() + "-" + def[1]; }
    renderContratEdit(); return;
  }
  refreshDeadline();
});
$("#screen").addEventListener("click", (e) => {
  const t = e.target.closest("[data-contrat],#btn-del-contrat,#btn-ask-contrat"); if (!t || !isContratScreen()) return;
  if (t.id === "btn-ask-contrat") { openAssistant(draftC.id); return; }
  if (t.dataset.contrat !== undefined) { openContrat(Number(t.dataset.contrat)); return; }
  if (t.id === "btn-del-contrat" && confirm("Supprimer ce contrat et ses documents ?")) {
    (admin.contrats[editIdx].docs || []).forEach((d) => d.files.forEach((fid) => { if (typeof delFile === "function") delFile(fid).catch(() => {}); }));
    admin.contrats.splice(editIdx, 1); saveAdmin(); if (typeof syncLiensFinances === "function") syncLiensFinances(); draftC = null; go("contrats");
  }
});
$("#bottombar").addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "btn-new-contrat") openContrat(-1);
  else if (t.id === "btn-cancel-contrat") {
    if (draftC && draftC._new && admin.contrats[editIdx] && admin.contrats[editIdx]._new) {
      if (!confirm("Abandonner ce nouveau contrat ? La police importée sera supprimée.")) return;
      (admin.contrats[editIdx].docs || []).forEach((d) => d.files.forEach((fid) => { if (typeof delFile === "function") delFile(fid).catch(() => {}); }));
      admin.contrats.splice(editIdx, 1); saveAdmin();
    }
    draftC = null; go("contrats");
  }
  else if (t.id === "btn-save-contrat") {
    if (!String(draftC.fournisseur || "").trim()) { alert("Indique l'assureur ou le fournisseur."); return; }
    delete draftC._new; delete draftC.aiSrc; delete draftC.aiNote;
    if (editIdx === -1) admin.contrats.push(draftC); else admin.contrats[editIdx] = draftC;
    saveAdmin(); if (typeof syncLiensFinances === "function") syncLiensFinances(); draftC = null; go("contrats");
  }
});

// L'accueil a été dessiné avant le chargement de ce module : on le redessine pour afficher les échéances.
if (current === "home") renderHome();
