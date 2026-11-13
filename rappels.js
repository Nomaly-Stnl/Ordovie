// Ordovie — rappels libres (expertise, vignette, pneus, 3a…) + envoi vers l'agenda du téléphone pour de vraies notifications.
"use strict";

const RAPPEL_PRESETS = [
  ["Expertise du véhicule", "", "aucune", "La date figure sur la convocation du service des automobiles."],
  ["Vignette autoroutière", "01-31", "annuelle", "La vignette de l'année précédente est valable jusqu'au 31 janvier."],
  ["Pneus d'hiver", "10-15", "annuelle", "Règle d'usage : d'octobre à Pâques."],
  ["Pneus d'été", "04-15", "annuelle", ""],
  ["Versement 3e pilier", "12-15", "annuelle", "Le versement doit être crédité avant le 31.12 pour compter cette année."],
  ["Renouveler passeport / ID", "", "aucune", "Compter plusieurs semaines de délai."],
];
const REPET = { aucune: "une fois", mensuelle: "chaque mois", annuelle: "chaque année" };
let rEdit = null;

function rappels() { admin.rappels = admin.rappels || []; seedRappels(); return admin.rappels; }
// Rappels standards ajoutés UNE seule fois (supprimables ; ils ne reviennent pas ensuite).
const DEFAULT_RAPPELS = [1, 2, 3, 4]; // vignette, pneus hiver, pneus été, 3e pilier
function seedRappels() {
  if (admin.rappelsSeeded) return;
  admin.rappelsSeeded = true;
  DEFAULT_RAPPELS.forEach((k) => {
    const p = RAPPEL_PRESETS[k];
    if (admin.rappels.some((r) => r.titre === p[0])) return;
    admin.rappels.push({ id: "r" + Date.now().toString(36) + k, titre: p[0], date: presetDate(p[1]), repete: p[2], avance: 14, notes: p[3], fait: false });
  });
  saveAdmin();
}
// Prochaine occurrence (les rappels répétés avancent tout seuls une fois la date passée et marquée « fait »).
function nextDate(r) { return parseISO(r.date); }
function addPeriod(iso, rep) {
  const d = parseISO(iso); if (!d) return iso;
  const n = rep === "mensuelle" ? new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate()))
    : new Date(d.getFullYear() + 1, d.getMonth(), Math.min(d.getDate(), new Date(d.getFullYear() + 1, d.getMonth() + 1, 0).getDate()));
  return iso.length ? `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}` : iso;
}
function rappelAlerts() {
  return rappels().filter((r) => !r.fait && nextDate(r)).map((r) => ({ r, n: daysUntil(nextDate(r)) }))
    .filter((x) => x.n <= (Number(x.r.avance) || 14)).sort((a, b) => a.n - b.n)
    .map(({ r, n }) => ({ c: n <= 3 ? "red" : "", t: n < 0 ? `${r.titre} (en retard, ${fmtDate(r.date)})` : n === 0 ? `${r.titre} : aujourd'hui` : `${r.titre} le ${fmtDate(r.date)} (${n} j)` }));
}

// Lien « ajouter à Google Agenda » : l'agenda du téléphone envoie ensuite de vraies notifications.
function gcalLink(titre, isoDate, details, rep) {
  const d = parseISO(isoDate); if (!d) return "";
  const f = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const p = new URLSearchParams({ action: "TEMPLATE", text: titre, dates: f(d) + "/" + f(end), details: (details ? details + "\n\n" : "") + "Rappel Ordovie" });
  if (rep === "annuelle") p.set("recur", "RRULE:FREQ=YEARLY"); else if (rep === "mensuelle") p.set("recur", "RRULE:FREQ=MONTHLY");
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

function renderRappels() {
  setTitle("Rappels"); setBottomBar('<button class="btn primary btn-main" id="btn-new-rappel">+ Nouveau rappel</button>');
  const list = rappels().map((r, i) => ({ r, i, d: nextDate(r) })).sort((a, b) => (a.r.fait - b.r.fait) || ((a.d ? a.d.getTime() : Infinity) - (b.d ? b.d.getTime() : Infinity)));
  $("#screen").innerHTML = `
    ${rEdit ? rappelForm() : ""}
    ${list.map(({ r, i, d }) => { const n = d ? daysUntil(d) : null;
      return `<div class="card rappel ${r.fait ? "fait" : n !== null && n <= 3 ? "urgent" : n !== null && n <= (Number(r.avance) || 14) ? "soon" : ""}">
        <div class="li-head"><span class="c-title">${esc(r.titre)}</span><span class="r-sub">${esc(REPET[r.repete] || "")}</span></div>
        <div class="r-sub">${r.fait ? "✓ fait" : d ? (n < 0 ? "en retard · " : n === 0 ? "aujourd'hui · " : "dans " + n + " j · ") + fmtDate(r.date) : "sans date"}${r.notes ? " · " + esc(r.notes) : ""}</div>
        <div class="btn-row">
          ${!r.fait ? `<button class="btn sm" data-rdone="${i}">✓ Fait</button>` : `<button class="btn sm" data-rundo="${i}">Rétablir</button>`}
          ${d && !r.fait ? `<a class="btn sm" href="${gcalLink(r.titre, r.date, r.notes, r.repete)}" target="_blank" rel="noopener">${ic("calendar", 15)}Agenda</a>` : ""}
          <button class="link-btn" data-redit="${i}">Modifier</button>
        </div></div>`; }).join("") || (rEdit ? "" : '<div class="card"><p class="muted">Aucun rappel. Ajoute ceux que rien d\'autre dans l\'app ne connaît : expertise, vignette, pneus, versement 3a…</p></div>')}
    <p class="muted small">Les rappels apparaissent dans « À traiter » sur l'accueil quelques jours avant. Pour une vraie notification sur ton téléphone, touche <strong>Agenda</strong> : le rappel s'ajoute à Google Agenda, qui te préviendra.</p>`;
}
function rappelForm() {
  const r = rEdit;
  return `<div class="card">
    <div class="c-title">${r._i === -1 ? "Nouveau rappel" : "Modifier le rappel"}</div>
    ${r._i === -1 ? `<div class="chips">${RAPPEL_PRESETS.map((p, k) => `<button class="chip" data-rpreset="${k}">${esc(p[0])}</button>`).join("")}</div>` : ""}
    <label class="field">Titre</label><input type="text" class="sm-input" data-r="titre" value="${esc(r.titre)}">
    <div class="tx-grid">
      <div><label class="field">Date</label><input type="date" class="sm-input" data-r="date" value="${esc(r.date)}"></div>
      <div><label class="field">Répétition</label><select class="sm-input" data-r="repete">${Object.entries(REPET).map(([k, l]) => `<option value="${k}" ${k === r.repete ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="field">Prévenir (jours avant)</label><input type="text" inputmode="numeric" class="sm-input" data-r="avance" value="${esc(r.avance)}"></div>
    </div>
    <label class="field">Notes</label><input type="text" class="sm-input" data-r="notes" value="${esc(r.notes || "")}">
    <div class="btn-row"><button class="btn primary" id="r-save">Enregistrer</button><button class="btn" id="r-cancel">Annuler</button>
      ${r._i !== -1 ? '<button class="btn danger" id="r-del">Supprimer</button>' : ""}</div></div>`;
}
function presetDate(mmdd) {
  if (!mmdd) return "";
  const t = new Date(), y = t.getFullYear(); let iso = `${y}-${mmdd}`;
  if (parseISO(iso) < new Date(t.getFullYear(), t.getMonth(), t.getDate())) iso = `${y + 1}-${mmdd}`;
  return iso;
}

$("#screen").addEventListener("input", (e) => { if (current === "rappels" && rEdit && e.target.dataset.r) rEdit[e.target.dataset.r] = e.target.value; });
$("#screen").addEventListener("click", (e) => {
  if (current !== "rappels") return;
  const t = e.target.closest("button"); if (!t) return;
  const R = rappels();
  if (t.dataset.rpreset !== undefined) { const p = RAPPEL_PRESETS[Number(t.dataset.rpreset)]; Object.assign(rEdit, { titre: p[0], date: presetDate(p[1]), repete: p[2], notes: p[3] }); renderRappels(); }
  else if (t.dataset.redit !== undefined) { rEdit = Object.assign({}, R[Number(t.dataset.redit)], { _i: Number(t.dataset.redit) }); renderRappels(); window.scrollTo(0, 0); }
  else if (t.dataset.rdone !== undefined) {
    const r = R[Number(t.dataset.rdone)];
    if (r.repete !== "aucune" && r.date) r.date = addPeriod(r.date, r.repete); else r.fait = true; // répété : passe à la prochaine échéance
    saveAdmin(); renderRappels();
  } else if (t.dataset.rundo !== undefined) { R[Number(t.dataset.rundo)].fait = false; saveAdmin(); renderRappels(); }
  else if (t.id === "r-cancel") { rEdit = null; renderRappels(); }
  else if (t.id === "r-del") { if (confirm("Supprimer ce rappel ?")) { R.splice(rEdit._i, 1); saveAdmin(); rEdit = null; renderRappels(); } }
  else if (t.id === "r-save") {
    if (!String(rEdit.titre || "").trim()) { alert("Donne un titre."); return; }
    const i = rEdit._i, r = { id: rEdit.id || "r" + Date.now().toString(36), titre: rEdit.titre.trim(), date: rEdit.date, repete: rEdit.repete || "aucune", avance: parseNum(rEdit.avance) || 14, notes: rEdit.notes || "", fait: false };
    if (i === -1) R.push(r); else R[i] = r;
    saveAdmin(); rEdit = null; renderRappels();
  }
});
$("#bottombar").addEventListener("click", (e) => {
  if (!e.target.closest("#btn-new-rappel")) return;
  rEdit = { _i: -1, titre: "", date: "", repete: "aucune", avance: 14, notes: "" }; renderRappels(); window.scrollTo(0, 0);
});
if (current === "home") renderHome();
