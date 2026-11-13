// Ordovie — Documents : coffre-fort unique (papiers personnels + documents des contrats).
// Fichiers dans IndexedDB (documents.js), fiches dans admin.documents, inclus dans la sauvegarde chiffrée.
"use strict";

const DOC_CATS = ["Identité", "Revenus", "Impôts", "Prévoyance", "Logement", "Véhicule", "Santé", "Achats & garanties", "Banque", "Autre"];
const DOC_ICONS = { "Archives": "🗃️", "Identité": "🪪", "Revenus": "💼", "Impôts": "🧾", "Prévoyance": "🏦", "Logement": "🏠", "Véhicule": "🚗", "Santé": "🩺", "Achats & garanties": "🛒", "Banque": "💳", "Autre": "📄", "Contrat": "📑" };
let docQuery = "", docCat = "";
let vEdit = null, vIsNew = false, vBusy = false;

function vault() { admin.documents = admin.documents || []; return admin.documents; }
// Tous les documents : coffre + documents joints aux contrats (même fichier, pas de copie).
function allDocs() {
  const out = vault().map((d, i) => ({ src: "vault", i, d, cat: d.categorie || "Autre", arch: isArchived(d) }));
  (admin.contrats || []).forEach((c, ci) => (c.docs || []).forEach((d) => out.push({ src: "contrat", ci, d, cat: "Contrat", contrat: c })));
  return out;
}
function linkedTo(id) {
  const cs = (admin.contrats || []).filter((c) => (c.linkedDocs || []).includes(id));
  return cs.length ? " · lié à " + esc(cs.map((c) => c.fournisseur || c.type).join(", ")) : "";
}
// Archivé : manuellement, remplacé par une nouvelle version, ou expiré. Jamais supprimé automatiquement.
function isArchived(d) { if (d.archived) return true; const e = docExpiry(d); return !!(e && daysUntil(e) < 0); }
function docYear(d) { const m = String(d.nom || "").match(/(19|20)\d{2}/g); return m ? Number(m[m.length - 1]) : 0; }
// Liste filtrée : en vigueur par défaut, « Archives » sur demande ; la recherche fouille partout.
function docItems() {
  const q = docQuery.trim().toLowerCase();
  return allDocs().filter((x) => {
    if (docCat === "Archives") { if (!x.arch) return false; }
    else { if (docCat && x.cat !== docCat) return false; if (x.arch && !q) return false; }
    return !q || [x.d.nom, x.cat, x.d.notes, x.contrat && x.contrat.fournisseur, x.d.transcription && JSON.stringify(x.d.transcription)].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
}
function docExpiry(d) { return d.expire && /^\d{4}-\d{2}-\d{2}$/.test(d.expire) ? parseISO(d.expire) : null; }
function docAlerts() {
  return vault().filter((d) => !d.archived).map((d) => ({ d, e: docExpiry(d) })).filter((x) => x.e && daysUntil(x.e) <= 90 && daysUntil(x.e) >= -30)
    .sort((a, b) => a.e - b.e)
    .map(({ d, e }) => { const n = daysUntil(e); return { c: n <= 30 ? "red" : "", t: n < 0 ? `${d.nom} : expiré depuis le ${fmtDate(d.expire)}` : `${d.nom} expire le ${fmtDate(d.expire)} (${n} j)` }; });
}

/* ---------- liste ---------- */
function renderDocuments() {
  setTitle("Documents");
  setBottomBar('<button class="btn primary btn-main" id="btn-new-doc">+ Ajouter un document</button>');
  const items = docItems();
  const counts = {}; allDocs().forEach((x) => { const k = x.arch ? "Archives" : x.cat; counts[k] = (counts[k] || 0) + 1; });
  const cats = [...DOC_CATS, "Contrat", "Archives"].filter((c) => counts[c]);
  $("#screen").innerHTML = `
    <input type="search" class="big-input" id="doc-q" placeholder="Rechercher (nom, contenu…)" value="${esc(docQuery)}" autocomplete="off">
    ${cats.length ? `<div class="chips">${["", ...cats].map((c) => `<button class="chip ${c === docCat ? "on" : ""}" data-dcat="${esc(c)}">${c ? esc(c) + " " + counts[c] : "Tout"}</button>`).join("")}</div>` : ""}
    <div id="doc-list">${docListHtml(items)}</div>
    <p class="muted small">Les documents restent sur ce téléphone et sont inclus dans ta sauvegarde chiffrée. Ceux joints à un contrat apparaissent ici avec l'étiquette « Contrat ».</p>`;
}
function docListHtml(items) {
  if (!items.length) return `<div class="card"><p class="muted">${allDocs().length ? "Aucun document ne correspond." : "Ton coffre est vide. Ajoute ton passeport, tes certificats de salaire, attestations 3a, factures avec garantie…"}</p></div>`;
  // Par catégorie, puis l'année la plus récente en premier (certificats, attestations…), puis le nom.
  return items.sort((a, b) => (a.cat > b.cat ? 1 : a.cat < b.cat ? -1 : 0) || docYear(b.d) - docYear(a.d) || String(a.d.nom).localeCompare(String(b.d.nom))).map((x) => {
    const e = x.src === "vault" ? docExpiry(x.d) : null, n = e ? daysUntil(e) : null;
    return `<button class="card doc-row" ${x.src === "vault" ? `data-vdoc="${x.i}"` : `data-cdoc="${x.ci}"`}>
      <span class="doc-ic">${ic("doc", 20)}</span>
      <span class="doc-main"><span class="c-title">${esc(x.d.nom || "Document")}</span>
        <span class="r-sub">${x.src === "contrat" ? "Contrat · " + esc(x.contrat.fournisseur || x.contrat.type) : esc(x.cat)} · ${x.d.files.length} page(s)${x.d.transcription ? " · transcrit" : ""}${x.src === "vault" ? linkedTo(x.d.id) : ""}${x.arch ? ' · <span class="tag">archivé</span>' : ""}</span>
        ${e ? `<span class="r-sub ${n < 0 ? "neg" : n <= 30 ? "neg" : n <= 90 ? "gold" : ""}">${n < 0 ? "Expiré le " : "Expire le "}${fmtDate(x.d.expire)}</span>` : ""}</span>
    </button>`;
  }).join("");
}

/* ---------- fiche ---------- */
function openVaultDoc(i) {
  vIsNew = i === -1;
  vEdit = vIsNew ? { id: "v" + Date.now().toString(36), nom: "", categorie: docCat && docCat !== "Contrat" ? docCat : "Identité", expire: "", notes: "", files: [], ajoute: new Date().toISOString() }
    : JSON.parse(JSON.stringify(vault()[i]));
  vEdit._i = i; go("doc-edit");
}
function renderDocEdit() {
  const d = vEdit; if (!d) { go("documents"); return; }
  setTitle(vIsNew ? "Nouveau document" : "Document");
  setBottomBar(`<button class="btn btn-side" id="btn-cancel-doc">Annuler</button><button class="btn primary btn-main" id="btn-save-doc">Enregistrer</button>`);
  const t = d.transcription;
  $("#screen").innerHTML = `
    <div class="card">
      <label class="field">Nom</label><input type="text" class="sm-input" data-v="nom" value="${esc(d.nom)}" placeholder="ex. Passeport, Certificat de salaire 2026">
      <div class="tx-grid">
        <div><label class="field">Catégorie</label><select class="sm-input" data-v="categorie">${DOC_CATS.map((c) => `<option ${c === d.categorie ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div><label class="field">Expire le (optionnel)</label><input type="date" class="sm-input" data-v="expire" value="${esc(d.expire)}"></div>
      </div>
      <label class="field">Notes</label><textarea class="sm-input" rows="2" data-v="notes">${esc(d.notes || "")}</textarea>
    </div>
    <div class="card">
      <div class="c-title">Pages</div>
      <div class="thumbs" id="v-thumbs"></div>
      <label class="btn full file-btn">+ Photos ou PDF<input type="file" id="v-input" accept="image/*,application/pdf" multiple hidden></label>
      ${d.files.length ? (vBusy ? '<p class="muted small">Transcription en cours…</p>'
        : aiReady() ? `<button class="btn full" id="v-tr">${t ? "Retranscrire" : "Transcrire avec Claude"}</button>` : '<p class="muted small">Ajoute ta clé API (Paramètres) pour transcrire et interroger ce document.</p>') : ""}
    </div>
    ${t ? `<div class="card"><div class="c-title">${esc(t.titre || "Transcription")}</div>
      ${[["Type", t.type], ["Émetteur", t.emetteur], ["Titulaire", t.titulaire], ["N°", t.numero], ["Émis le", t.dateEmission], ["Expire le", t.dateExpiration]]
        .filter(([, v]) => v).map(([k, v]) => `<div class="row"><div class="r-name">${esc(k)}</div><div class="r-val">${esc(v)}</div></div>`).join("")}
      ${(t.montants || []).length ? `<div class="r-sub" style="margin-top:6px;">${t.montants.map((m) => esc(m.libelle + " : " + m.montant)).join(" · ")}</div>` : ""}
      ${t.resume ? `<p class="small" style="margin-top:8px;">${esc(t.resume)}</p>` : ""}
      ${t.dateExpiration && /^\d{4}-\d{2}-\d{2}$/.test(t.dateExpiration) && t.dateExpiration !== d.expire ? `<button class="btn full" id="v-apply-exp">Utiliser l'expiration ${fmtDate(t.dateExpiration)}</button>` : ""}
      ${t.texte ? `<details class="art"><summary>Texte complet</summary><p>${esc(t.texte)}</p></details>` : ""}
    </div>` : ""}
    ${versionInfo(d)}
    ${!vIsNew ? `<div class="btn-row">${!isArchived(d) ? '<button class="btn" id="btn-new-version">↻ Nouvelle version</button>' : ""}
        <button class="btn" id="btn-archive">${d.archived ? "Sortir des archives" : "Archiver"}</button></div>
      <button class="btn full danger" id="btn-del-doc">Supprimer ce document</button>` : ""}`;
  fillVaultThumbs();
}
async function fillVaultThumbs() {
  const el = document.getElementById("v-thumbs"); if (!el || !vEdit) return;
  el.innerHTML = vEdit.files.length ? "" : '<p class="muted small">Aucune page.</p>';
  for (const fid of vEdit.files) {
    const f = await getFile(fid).catch(() => null); if (!f) continue;
    const url = URL.createObjectURL(f.blob);
    el.insertAdjacentHTML("beforeend", f.type === "application/pdf" ? `<a class="thumb pdf" href="${url}" target="_blank" rel="noopener">PDF</a>`
      : `<a class="thumb" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="page"></a>`);
  }
}

const GENERIC_PROMPT = `Tu reçois les pages d'un document administratif suisse (pièce d'identité, certificat de salaire, attestation, facture, avis d'impôt…).
Transcris-le FIDÈLEMENT en JSON, sans rien inventer (null si absent). Réponds UNIQUEMENT avec un objet JSON valide :
{"titre":"...","type":"...","emetteur":"...","titulaire":"...","numero":"...","dateEmission":"AAAA-MM-JJ ou null","dateExpiration":"AAAA-MM-JJ ou null",
 "montants":[{"libelle":"...","montant":"..."}],"resume":"2-3 phrases utiles : à quoi sert ce document, chiffres clés","texte":"texte intégral"}`;
async function transcribeVault(d) {
  const blocks = [];
  for (const fid of d.files) {
    const f = await getFile(fid); if (!f) continue;
    const data = await blobToB64(f.blob);
    blocks.push(f.type === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: f.type || "image/jpeg", data } });
  }
  blocks.push({ type: "text", text: GENERIC_PROMPT });
  const r = await callClaude({ max_tokens: 16000, messages: [{ role: "user", content: blocks }] });
  return { json: extractJSON(r.text), truncated: r.stop === "max_tokens" };
}

function versionInfo(d) {
  const prev = d.prevId && vault().find((x) => x.id === d.prevId), next = d.replacedBy && vault().find((x) => x.id === d.replacedBy);
  if (!prev && !next) return d.prevId && vIsNew ? "" : "";
  return `<div class="card"><div class="r-sub">${prev ? "Remplace : <strong>" + esc(prev.nom) + "</strong> (archivé)" : ""}${prev && next ? "<br>" : ""}${next ? "Remplacé par : <strong>" + esc(next.nom) + "</strong>" : ""}</div></div>`;
}
// Nouvelle version : même catégorie et notes, nom avec l'année suivante si elle y figure ; l'ancienne sera archivée à l'enregistrement.
function startNewVersion() {
  const old = vEdit, y = docYear(old);
  const nom = y ? String(old.nom).replace(new RegExp(String(y) + "(?!.*" + y + ")"), String(y + 1)) : old.nom + " (nouvelle version)";
  vIsNew = true;
  vEdit = { id: "v" + Date.now().toString(36), nom, categorie: old.categorie, expire: "", notes: old.notes || "", files: [], ajoute: new Date().toISOString(), prevId: old.id, _i: -1 };
  renderDocEdit();
}

/* ---------- écouteurs (une fois) ---------- */
$("#screen").addEventListener("input", (e) => {
  if (current === "documents" && e.target.id === "doc-q") {
    docQuery = e.target.value;
    document.getElementById("doc-list").innerHTML = docListHtml(docItems()); // sans re-rendu : le champ garde le focus
  } else if (current === "doc-edit" && vEdit && e.target.dataset.v) vEdit[e.target.dataset.v] = e.target.value;
});
$("#screen").addEventListener("change", async (e) => {
  if (current !== "doc-edit" || !vEdit) return;
  if (e.target.dataset.v) { vEdit[e.target.dataset.v] = e.target.value; return; }
  if (e.target.id !== "v-input") return;
  const files = [...e.target.files]; e.target.value = "";
  for (const f of files) {
    const isPdf = f.type === "application/pdf", blob = isPdf ? f : await compressImage(f);
    const id = vEdit.id + "-" + Date.now().toString(36) + vEdit.files.length;
    await putFile({ id, type: isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name: f.name, blob });
    vEdit.files.push(id);
    if (!vEdit.nom) vEdit.nom = f.name.replace(/\.[^.]+$/, "");
  }
  renderDocEdit();
});
$("#screen").addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (current === "documents") {
    if (t.dataset.dcat !== undefined) { docCat = t.dataset.dcat; renderDocuments(); }
    else if (t.dataset.vdoc !== undefined) openVaultDoc(Number(t.dataset.vdoc));
    else if (t.dataset.cdoc !== undefined) openContrat(Number(t.dataset.cdoc));
    return;
  }
  if (current !== "doc-edit" || !vEdit) return;
  if (t.id === "v-tr") {
    if (!confirm("Envoyer ce document (" + vEdit.files.length + " page(s)) à Claude pour transcription ? Quelques centimes sur ta clé API.")) return;
    vBusy = true; renderDocEdit();
    try { const r = await transcribeVault(vEdit); vEdit.transcription = r.json; vEdit.truncated = r.truncated; vEdit.transcribedAt = new Date().toISOString(); }
    catch (err) { alert("Transcription impossible : " + err.message); }
    vBusy = false; renderDocEdit();
  } else if (t.id === "v-apply-exp") { vEdit.expire = vEdit.transcription.dateExpiration; renderDocEdit(); }
  else if (t.id === "btn-new-version") startNewVersion();
  else if (t.id === "btn-archive") { vEdit.archived = !vEdit.archived; vault()[vEdit._i].archived = vEdit.archived; saveAdmin(); renderDocEdit(); }
  else if (t.id === "btn-del-doc") {
    if (!confirm("Supprimer « " + (vEdit.nom || "ce document") + " » et ses pages ?")) return;
    for (const fid of vEdit.files) await delFile(fid).catch(() => {});
    const gone = vEdit.id;
    (admin.contrats || []).forEach((c) => { if (c.linkedDocs) c.linkedDocs = c.linkedDocs.filter((x) => x !== gone); });
    vault().splice(vEdit._i, 1); saveAdmin(); vEdit = null; go("documents");
  }
});
$("#bottombar").addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "btn-new-doc") openVaultDoc(-1);
  else if (t.id === "btn-cancel-doc") {
    if (vIsNew && vEdit) for (const fid of vEdit.files) await delFile(fid).catch(() => {}); // pages d'un document jamais enregistré
    vEdit = null; go("documents");
  } else if (t.id === "btn-save-doc") {
    if (!String(vEdit.nom || "").trim()) { alert("Donne un nom au document."); return; }
    if (!vEdit.files.length && !confirm("Aucune page ajoutée. Enregistrer quand même (fiche seule) ?")) return;
    const i = vEdit._i; delete vEdit._i;
    if (vIsNew) {
      vault().push(vEdit);
      if (vEdit.prevId) { // l'ancienne version passe en archive ; les contrats liés suivent la nouvelle
        const old = vault().find((x) => x.id === vEdit.prevId);
        if (old) { old.archived = true; old.replacedBy = vEdit.id; }
        (admin.contrats || []).forEach((c) => { if (c.linkedDocs) c.linkedDocs = c.linkedDocs.map((x) => (x === vEdit.prevId ? vEdit.id : x)); });
      }
    } else vault()[i] = vEdit;
    saveAdmin(); vEdit = null; go("documents");
  }
});

// Accueil redessiné : les échéances de documents apparaissent dans « À traiter ».
if (current === "home") renderHome();
