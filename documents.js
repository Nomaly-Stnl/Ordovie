// Ordovie — documents des contrats : stockage local (IndexedDB) + transcription par Claude en JSON structuré.
// Les fichiers restent sur l'appareil ; ils ne partent chez Anthropic qu'au moment de la transcription.
"use strict";

/* ---------- stockage des fichiers (IndexedDB) ---------- */
const DOCS_DB = "ordovie_docs", DOCS_STORE = "files";
function docsDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DOCS_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(DOCS_STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function docsTx(mode, fn) {
  const db = await docsDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(DOCS_STORE, mode), st = tx.objectStore(DOCS_STORE);
    const out = fn(st);
    tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    tx.onerror = () => rej(tx.error);
  });
}
const putFile = (rec) => docsTx("readwrite", (st) => st.put(rec));
const getFile = (id) => docsTx("readonly", (st) => st.get(id));
const delFile = (id) => docsTx("readwrite", (st) => st.delete(id));
const allFiles = () => docsTx("readonly", (st) => st.getAll());

/* ---------- conversions ---------- */
function blobToB64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
function b64ToBlob(b, type) { const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); }
// Photo → JPEG compressé (max 1600 px). Si le navigateur ne sait pas, on garde l'original.
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.8));
  } catch (e) { return file; }
}

/* ---------- appel à l'API Claude ---------- */
const DEFAULT_MODEL = "claude-sonnet-5-5";
// Un nom saisi à la main qui ne ressemble pas à un identifiant d'API (ex. « Sonnet ») est ignoré.
function aiModel() { const m = (settings.aiModel || "").trim(); return /^claude-[a-z0-9.-]+$/.test(m) ? m : DEFAULT_MODEL; }
function aiReady() { return !!settings.apiKey; }
async function callClaude(body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(Object.assign({ model: aiModel() }, body)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(apiErrorText(r.status, j));
  return { text: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), usage: j.usage, stop: j.stop_reason };
}

// Message d'erreur lisible (le message brut de l'API peut être très court, ex. « model: … »).
function apiErrorText(status, j) {
  const type = j && j.error && j.error.type, msg = (j && j.error && j.error.message) || "";
  const hint = status === 401 ? "clé API invalide ou révoquée"
    : status === 403 ? "cette clé n'a pas accès à cette ressource"
    : status === 404 || type === "not_found_error" ? `modèle « ${aiModel()} » introuvable pour ta clé — choisis-en un dans Paramètres → Tester la connexion`
    : status === 400 && /credit|balance/i.test(msg) ? "crédit API insuffisant (Claude Console → Billing)"
    : status === 429 ? "trop de requêtes ou plafond de dépenses atteint"
    : status === 529 || status >= 500 ? "service Claude momentanément indisponible, réessaie" : "";
  return `${hint || "erreur"} (HTTP ${status}${type ? ", " + type : ""}${msg ? " : " + msg : ""})`;
}
async function listModels() {
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(apiErrorText(r.status, j));
  return (j.data || []).filter((m) => !m.lifecycle || m.lifecycle === "active");
}

const TRANSCRIBE_PROMPT = `Tu reçois les pages d'un contrat suisse (police d'assurance, conditions générales, bail ou abonnement).
Transcris-le FIDÈLEMENT en JSON, sans rien inventer. Si une information est absente, mets null.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme :
{
 "titre": "nom du document",
 "fournisseur": "...", "typeContrat": "...", "numero": "...", "titulaire": "...",
 "prime": {"montant": nombre ou null, "periode": "mensuelle|trimestrielle|semestrielle|annuelle|null"},
 "debut": "AAAA-MM-JJ ou null", "echeance": "AAAA-MM-JJ ou null", "delaiResiliationMois": nombre ou null,
 "couvertures": [{"nom": "...", "somme": "...", "franchise": "...", "details": "..."}],
 "exclusions": ["..."],
 "sinistre": {"telephone": "...", "delaiDeclaration": "...", "demarche": "..."},
 "articles": [{"ref": "numéro de l'article", "titre": "...", "texte": "texte intégral, mot pour mot"}],
 "remarques": "pages illisibles, informations douteuses, etc.",
 "categorie": "UNE des catégories de la liste ci-dessous",
 "tacite": true si le contrat se renouvelle automatiquement, false s'il prend fin seul, null si inconnu,
 "deduit": {"echeance": "AAAA-MM-JJ ou null", "delaiResiliationMois": nombre ou null, "tacite": true/false/null, "explication": "une phrase"}
}`;
// Consignes ajoutées à l'envoi (date du jour, catégories, règles suisses usuelles pour compléter ce que la police ne dit pas).
function transcribePrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return TRANSCRIBE_PROMPT + `

Date du jour : ${today}.
Catégories possibles : ${CONTRAT_TYPES.map(([t]) => t).join(" | ")}.
Les champs transcrits (debut, echeance, delaiResiliationMois…) ne contiennent QUE ce qui est écrit sur le document.
Si l'échéance, le délai de résiliation ou le renouvellement n'y figurent pas, remplis "deduit" avec la règle suisse usuelle
pour ce type de contrat, et explique-la en une phrase. Exemples :
- Assurance maladie de base (LAMal) : échéance au 31 décembre de l'année en cours, lettre reçue au plus tard le dernier jour ouvrable de novembre (délai 1 mois), renouvellement tacite.
- Complémentaires (LCA), ménage/RC, véhicule, protection juridique : échéance et délai selon les conditions générales ; à défaut, échéance annuelle à la date anniversaire, délai 3 mois, renouvellement tacite.
- Bail d'habitation : délai légal de 3 mois pour l'échéance contractuelle ou le terme usuel local.
L'échéance déduite est toujours la PROCHAINE échéance après la date du jour. Si tu ne peux rien déduire de fiable, mets null.`;
}

function extractJSON(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Réponse sans JSON");
  return JSON.parse(text.slice(a, b + 1));
}

async function transcribeDoc(doc) {
  const blocks = [];
  for (const fid of doc.files) {
    const f = await getFile(fid); if (!f) continue;
    const data = await blobToB64(f.blob);
    blocks.push(f.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: f.type || "image/jpeg", data } });
  }
  if (!blocks.length) throw new Error("Aucune page à transcrire");
  blocks.push({ type: "text", text: transcribePrompt() });
  const r = await callClaude({ max_tokens: 16000, messages: [{ role: "user", content: blocks }] });
  const json = extractJSON(r.text);
  return { json, truncated: r.stop === "max_tokens", usage: r.usage };
}

/* ---------- nouveau contrat à partir de la police : l'IA remplit la fiche ---------- */
// Retourne { champ: "lu" | "déduit" } pour signaler dans le formulaire l'origine de chaque valeur.
function fillFromTranscription(c, t) {
  const src = {}, isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || ""), dd = t.deduit || {};
  const set = (k, v, how) => { if (v === null || v === undefined || v === "") return; c[k] = v; src[k] = how; };
  if (CONTRAT_TYPES.some(([n]) => n === t.categorie)) set("type", t.categorie, "lu");
  set("fournisseur", t.fournisseur, "lu");
  set("numero", t.numero, "lu");
  if (t.prime && t.prime.montant != null && !isNaN(Number(t.prime.montant))) set("prime", Number(t.prime.montant), "lu");
  if (t.prime && PERIODE_OK.includes(t.prime.periode)) set("periode", t.prime.periode, "lu");
  if (isoOk(t.debut)) set("debut", t.debut, "lu");
  if (isoOk(t.echeance)) set("echeance", t.echeance, "lu"); else if (isoOk(dd.echeance)) set("echeance", dd.echeance, "déduit");
  if (t.delaiResiliationMois != null) set("delaiMois", Number(t.delaiResiliationMois), "lu"); else if (dd.delaiResiliationMois != null) set("delaiMois", Number(dd.delaiResiliationMois), "déduit");
  if (typeof t.tacite === "boolean") set("tacite", t.tacite, "lu"); else if (typeof dd.tacite === "boolean") set("tacite", dd.tacite, "déduit");
  c.aiSrc = src; c.aiNote = dd.explication || "";
  return src;
}
let newBusy = false;
async function importNewContract(files) {
  // Le contrat est créé tout de suite (marqué _new) pour que ses pages soient rangées ; « Annuler » le retire.
  const doc = { id: "doc" + Date.now().toString(36), nom: "Police", files: [] };
  for (const f of files) {
    const isPdf = f.type === "application/pdf";
    const blob = isPdf ? f : await compressImage(f);
    const id = doc.id + "-" + doc.files.length;
    await putFile({ id, type: isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name: f.name, blob });
    doc.files.push(id);
  }
  draftC.docs = [doc]; draftC._new = true;
  admin.contrats.push(JSON.parse(JSON.stringify(draftC))); editIdx = admin.contrats.length - 1; saveAdmin();
  newBusy = true; renderContratEdit();
  try {
    const r = await transcribeDoc(doc);
    doc.transcription = r.json; doc.truncated = r.truncated; doc.transcribedAt = new Date().toISOString(); doc.model = aiModel();
    if (r.json.titre) doc.nom = r.json.titre;
    fillFromTranscription(draftC, r.json);
    persistDocs();
  } catch (err) { alert("Lecture impossible : " + err.message + "\nLes pages sont gardées : complète la fiche à la main."); }
  newBusy = false; if (current === "contrat-edit") renderContratEdit();
}
function newImportHtml() {
  if (editIdx !== -1 && !(draftC && draftC._new)) return "";
  if (newBusy) return `<div class="card ai-card"><div class="c-title">Lecture de la police…</div><p class="muted small">L'IA lit le document et remplit la fiche (jusqu'à une minute).</p><div class="spinner"></div></div>`;
  if (draftC && draftC.aiSrc) return `<div class="card ai-card"><div class="c-title">${ic("check")}Fiche pré-remplie</div>
      <p class="muted small">Vérifie les champs marqués <span class="src lu">lu</span> (sur la police) et <span class="src deduit">déduit</span> (règle usuelle)${draftC.aiNote ? " : " + esc(draftC.aiNote.replace(/\.\s*$/, "")) : ""}. Puis « Enregistrer ».</p></div>`;
  if (editIdx !== -1) return "";
  return aiReady()
    ? `<div class="card ai-card"><div class="c-title">Partir de ta police</div>
        <p class="muted small">Prends-la en photo (toutes les pages) ou choisis le PDF. L'IA remplit la fiche et la police est rangée dans tes documents. Coût : quelques centimes.</p>
        <label class="btn primary full file-btn">${ic("doc")}Importer la police<input type="file" id="new-doc-input" accept="image/*,application/pdf" multiple hidden></label>
        <p class="muted small" style="text-align:center;margin-bottom:0;">ou remplis la fiche ci-dessous à la main</p></div>`
    : `<div class="card"><p class="muted small">Avec une clé API (Paramètres), tu pourras importer la police en photo : l'IA remplit la fiche pour toi.</p></div>`;
}
function srcTag(k) { const s = draftC && draftC.aiSrc && draftC.aiSrc[k]; return s ? ` <span class="src ${s === "lu" ? "lu" : "deduit"}">${s}</span>` : ""; }

/* ---------- interface dans la fiche contrat ---------- */
let docBusy = null; // id du document en cours de transcription
function contratDocsHtml() {
  if (editIdx === -1) return `<div class="card"><div class="c-title">Documents</div><p class="muted small">Importe la police ci-dessus, ou enregistre d'abord le contrat pour y joindre des documents.</p></div>`;
  const docs = draftC.docs || [];
  return `<div class="card"><div class="c-title">Documents</div>
    ${docs.map((d, di) => `<div class="doc">
        <div class="li-head"><span>${esc(d.nom || "Document")} <span class="tag">${d.files.length} page(s)</span></span>
          <button class="link-btn" data-docdel="${di}">Supprimer</button></div>
        <div class="thumbs" data-thumbs="${di}"></div>
        ${d.transcription ? `<div class="r-sub">✓ Transcrit le ${esc(new Date(d.transcribedAt).toLocaleDateString("fr-CH"))}
            · ${(d.transcription.articles || []).length} article(s) · ${(d.transcription.couvertures || []).length} couverture(s)
            ${d.truncated ? ' · <span class="neg">document long : transcription incomplète</span>' : ""}</div>
            <div class="btn-row"><button class="btn sm" data-docview="${di}">Voir la transcription</button><button class="btn sm" data-doctr="${di}">Retranscrire</button></div>`
          : docBusy === d.id ? `<p class="muted small">Transcription en cours… (jusqu'à une minute)</p>`
          : aiReady() ? `<div class="btn-row"><button class="btn primary sm" data-doctr="${di}">Transcrire avec Claude</button></div>`
          : `<p class="muted small">Ajoute ta clé API (Paramètres) pour transcrire ce document.</p>`}
      </div>`).join("")}
    ${linkedVaultHtml()}
    <label class="btn full file-btn">+ Ajouter un document (photos ou PDF)
      <input type="file" id="doc-input" accept="image/*,application/pdf" multiple hidden></label>
    <p class="muted small">Plusieurs photos = un document de plusieurs pages. Police et conditions générales : ajoute-les en documents séparés.</p>
  </div>`;
}
async function fillThumbs() {
  for (const el of document.querySelectorAll("[data-thumbs]")) {
    const d = (draftC.docs || [])[Number(el.dataset.thumbs)]; if (!d) continue;
    el.innerHTML = "";
    for (const fid of d.files) {
      const f = await getFile(fid).catch(() => null); if (!f) continue;
      const url = URL.createObjectURL(f.blob);
      el.insertAdjacentHTML("beforeend", f.type === "application/pdf"
        ? `<a class="thumb pdf" href="${url}" target="_blank" rel="noopener">PDF</a>`
        : `<a class="thumb" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="page"></a>`);
    }
  }
}
/* ---------- documents du coffre liés à ce contrat (référence, pas de copie) ---------- */
let pickVault = false;
function linkedVaultHtml() {
  const vdocs = admin.documents || [], ids = draftC.linkedDocs || [];
  const linked = ids.map((id) => vdocs.find((d) => d.id === id)).filter(Boolean);
  const free = vdocs.filter((d) => !ids.includes(d.id));
  return `${linked.map((d) => `<div class="doc"><div class="li-head"><span>${esc(d.nom)} <span class="tag">coffre · ${esc(d.categorie)}</span></span>
      <button class="link-btn" data-unlinkv="${esc(d.id)}">Délier</button></div>
      <div class="r-sub">${d.files.length} page(s)${d.transcription ? " · transcrit, lu par l'assistant" : " · pas encore transcrit (Documents → ce document → Transcrire)"}</div></div>`).join("")}
    ${pickVault ? `<div class="pick">${free.length ? free.map((d) => `<button class="result" data-linkv="${esc(d.id)}"><strong>${esc(d.nom)}</strong> <span class="tag">${esc(d.categorie)}</span></button>`).join("")
        : '<p class="muted small">Aucun autre document dans le coffre.</p>'}<button class="btn sm" data-linkv-cancel="1">Fermer</button></div>`
      : vdocs.length ? `<button class="btn full" data-linkv-open="1">${ic("link")}Lier un document du coffre</button>` : ""}`;
}
function persistLinks() { admin.contrats[editIdx].linkedDocs = (draftC.linkedDocs || []).slice(); saveAdmin(); }
$("#screen").addEventListener("click", (e) => {
  if (current !== "contrat-edit" || !draftC) return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.linkvOpen) { pickVault = true; renderContratEdit(); }
  else if (t.dataset.linkvCancel) { pickVault = false; renderContratEdit(); }
  else if (t.dataset.linkv) { draftC.linkedDocs = (draftC.linkedDocs || []).concat([t.dataset.linkv]); persistLinks(); pickVault = false; renderContratEdit(); }
  else if (t.dataset.unlinkv) { draftC.linkedDocs = (draftC.linkedDocs || []).filter((x) => x !== t.dataset.unlinkv); persistLinks(); renderContratEdit(); }
});

function persistDocs() { admin.contrats[editIdx].docs = JSON.parse(JSON.stringify(draftC.docs || [])); saveAdmin(); }

function renderTranscription(di) {
  const d = draftC.docs[di], t = d.transcription || {};
  setTitle("Transcription"); setBottomBar(`<button class="btn primary btn-main" id="btn-back-contrat">Retour au contrat</button>`);
  const rowsKV = [["Fournisseur", t.fournisseur], ["Type", t.typeContrat], ["N°", t.numero], ["Titulaire", t.titulaire],
    ["Prime", t.prime && t.prime.montant != null ? t.prime.montant + " CHF " + (t.prime.periode || "") : null],
    ["Début", t.debut], ["Échéance", t.echeance], ["Délai de résiliation", t.delaiResiliationMois != null ? t.delaiResiliationMois + " mois" : null]]
    .filter(([, v]) => v);
  $("#screen").innerHTML = `
    <div class="card"><div class="c-title">${esc(t.titre || d.nom)}</div>
      ${rowsKV.map(([k, v]) => `<div class="row kv"><div class="r-name">${esc(k)}</div><div class="r-val">${esc(v)}</div></div>`).join("")}
      ${applicable(t).length ? `<button class="btn full" id="btn-apply-tr" data-di="${di}">Reporter ${applicable(t).map((x) => x[0]).join(", ")} dans la fiche</button>` : ""}
    </div>
    ${t.sinistre ? `<div class="section-title">En cas de sinistre</div><div class="card"><p>${esc([t.sinistre.telephone, t.sinistre.delaiDeclaration, t.sinistre.demarche].filter(Boolean).join(" · "))}</p></div>` : ""}
    ${(t.couvertures || []).length ? `<div class="section-title">Couvertures</div><div class="card">${t.couvertures.map((c) => `<div class="obj"><strong>${esc(c.nom || "")}</strong>
      <div class="r-sub">${esc([c.somme && "Somme : " + c.somme, c.franchise && "Franchise : " + c.franchise].filter(Boolean).join(" · "))}</div>
      ${c.details ? `<div class="muted small">${esc(c.details)}</div>` : ""}</div>`).join("")}</div>` : ""}
    ${(t.exclusions || []).length ? `<div class="section-title">Exclusions</div><div class="card"><ul class="plain">${t.exclusions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${(t.articles || []).length ? `<div class="section-title">Articles (${t.articles.length})</div><div class="card">${t.articles.map((a) => `<details class="art"><summary>${esc((a.ref ? "Art. " + a.ref + " — " : "") + (a.titre || ""))}</summary><p>${esc(a.texte || "")}</p></details>`).join("")}</div>` : ""}
    ${t.remarques ? `<p class="muted small">Remarques : ${esc(t.remarques)}</p>` : ""}
    <p class="muted small">Transcription automatique : en cas de doute, c'est le document original qui fait foi.</p>`;
}
const PERIODE_OK = ["mensuelle", "trimestrielle", "semestrielle", "annuelle"];
function applicable(t) {
  const out = [];
  if (t.numero && !draftC.numero) out.push(["n°", "numero", t.numero]);
  if (t.prime && t.prime.montant != null && !(Number(draftC.prime) > 0)) out.push(["prime", "prime", Number(t.prime.montant)]);
  if (t.prime && PERIODE_OK.includes(t.prime.periode) && !(Number(draftC.prime) > 0)) out.push(["périodicité", "periode", t.prime.periode]);
  if (t.echeance && /^\d{4}-\d{2}-\d{2}$/.test(t.echeance) && t.echeance !== draftC.echeance) out.push(["échéance", "echeance", t.echeance]);
  if (t.delaiResiliationMois != null && Number(t.delaiResiliationMois) !== Number(draftC.delaiMois)) out.push(["délai", "delaiMois", Number(t.delaiResiliationMois)]);
  const dd = t.deduit || {};
  if (!t.echeance && /^\d{4}-\d{2}-\d{2}$/.test(dd.echeance || "") && dd.echeance !== draftC.echeance) out.push(["échéance (déduite)", "echeance", dd.echeance]);
  if (t.delaiResiliationMois == null && dd.delaiResiliationMois != null && Number(dd.delaiResiliationMois) !== Number(draftC.delaiMois)) out.push(["délai (déduit)", "delaiMois", Number(dd.delaiResiliationMois)]);
  if (t.fournisseur && !draftC.fournisseur) out.push(["fournisseur", "fournisseur", t.fournisseur]);
  return out;
}

/* ---------- écouteurs ---------- */
$("#screen").addEventListener("change", async (e) => {
  if (current === "contrat-edit" && e.target.id === "new-doc-input") {
    const files = [...e.target.files]; e.target.value = ""; if (files.length) importNewContract(files); return;
  }
  if (current !== "contrat-edit" || e.target.id !== "doc-input") return;
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  const doc = { id: "doc" + Date.now().toString(36), nom: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "") : "Document " + ((draftC.docs || []).length + 1), files: [] };
  for (const f of files) {
    const isPdf = f.type === "application/pdf";
    const blob = isPdf ? f : await compressImage(f);
    const id = doc.id + "-" + doc.files.length;
    await putFile({ id, type: isPdf ? "application/pdf" : (blob.type || "image/jpeg"), name: f.name, blob });
    doc.files.push(id);
  }
  draftC.docs = (draftC.docs || []).concat([doc]); persistDocs(); renderContratEdit();
});
$("#screen").addEventListener("click", async (e) => {
  if (current !== "contrat-edit") return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.docdel !== undefined) {
    const d = draftC.docs[Number(t.dataset.docdel)];
    if (!confirm("Supprimer « " + d.nom + " » et sa transcription ?")) return;
    for (const fid of d.files) await delFile(fid).catch(() => {});
    draftC.docs.splice(Number(t.dataset.docdel), 1); persistDocs(); renderContratEdit();
  } else if (t.dataset.doctr !== undefined) {
    const d = draftC.docs[Number(t.dataset.doctr)];
    if (!confirm("Envoyer ce document (" + d.files.length + " page(s)) à Claude pour transcription ? Coût estimé : quelques centimes par page, sur ta clé API.")) return;
    docBusy = d.id; renderContratEdit();
    try {
      const r = await transcribeDoc(d);
      d.transcription = r.json; d.truncated = r.truncated; d.transcribedAt = new Date().toISOString(); d.model = aiModel();
      persistDocs(); docBusy = null; renderTranscription(Number(t.dataset.doctr)); current = "contrat-edit";
    } catch (err) { docBusy = null; renderContratEdit(); alert("Transcription impossible : " + err.message); }
  } else if (t.dataset.docview !== undefined) { renderTranscription(Number(t.dataset.docview)); }
  else if (t.id === "btn-apply-tr") {
    const d = draftC.docs[Number(t.dataset.di)];
    applicable(d.transcription).forEach(([, k, v]) => { draftC[k] = v; });
    alert("Fiche mise à jour. Pense à « Enregistrer » le contrat."); renderContratEdit();
  }
});
$("#bottombar").addEventListener("click", (e) => { if (e.target.closest("#btn-back-contrat")) renderContratEdit(); });

/* ---------- sauvegarde : les fichiers voyagent dans la sauvegarde chiffrée ---------- */
async function exportDocFiles() {
  const recs = await allFiles().catch(() => []);
  const out = [];
  for (const r of recs) out.push({ id: r.id, type: r.type, name: r.name, data: await blobToB64(r.blob) });
  return out;
}
async function importDocFiles(list) {
  for (const r of list || []) await putFile({ id: r.id, type: r.type, name: r.name, blob: b64ToBlob(r.data, r.type) });
}
