// Ordovie — palier 1, étape 1 : données réelles + module Finances (lecture).
// Le moteur de calcul vient de finance-core.js (copie conforme de Gestion Finances v20).
"use strict";

const APP_VERSION = "0.30.0"; // garder aligné avec VERSION dans sw.js
const SETTINGS_KEY = "ordovie_settings_v1";
const DATA_KEY = "ordovie_finances_v1";

/* ---------- réglages et données (sur l'appareil uniquement) ---------- */
function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; }
  catch (e) { alert("Enregistrement impossible sur cet appareil : " + e.message); return false; }
}
let settings = readJSON(SETTINGS_KEY) || {};
function saveSettings() { writeJSON(SETTINGS_KEY, settings); }

// `state` est déclaré dans finance-core.js (moteur v20).
function loadData() {
  const raw = readJSON(DATA_KEY);
  state = raw ? mergeDefaults(raw) : null;
}
function saveData() {
  state.meta.lastSaved = new Date().toISOString();
  writeJSON(DATA_KEY, state);
}
loadData();

/* ---------- utilitaires ---------- */
const $ = (sel) => document.querySelector(sel);
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Mode discret (œil) : masque les montants à l'écran, réglage mémorisé sur l'appareil.
// Écrans de consultation concernés par le mode discret (les écrans de saisie restent lisibles).
const MASKED_SCREENS = ["home", "finances", "analyses"];
const maskedNow = () => !!settings.hideAmounts && MASKED_SCREENS.includes(current);
function money(v) { return maskedNow() ? "•••••• CHF" : fmtCHF(v); }
function signed(v) { return maskedNow() ? "••••" : (v >= 0 ? "+" : "−") + fmtCHF(Math.abs(v)); }
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function eyeBtn() { return `<button class="eye-btn" data-act="toggle-eye" aria-label="${settings.hideAmounts ? "Afficher" : "Masquer"} les montants">${settings.hideAmounts ? EYE_OFF : EYE_OPEN}</button>`; }
function pct(part, total) { return total > 0 ? Math.round(part / total * 100) + " %" : "—"; }
function daysSince(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null; }
// Mois calendaire précédent (celui qu'on clôture normalement), au format AAAA-MM.
function previousCalendarMonth() {
  const d = new Date(); let y = d.getFullYear(), m = d.getMonth();
  if (m === 0) { m = 12; y -= 1; }
  return y + "-" + String(m).padStart(2, "0");
}

/* ---------- modules ---------- */
const ICONS = {
  finances: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M6 16v-5"/><path d="M11 16V8"/><path d="M16 16v-3"/><path d="M21 16V5"/></svg>',
  contrats: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M4 10h16"/></svg>',
  assurances: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  documents: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  analyses: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/></svg>',
  impots: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>',
};
const MODULES = [
  { id: "finances", name: "Finances", sub: "Vue d'ensemble", ready: true },
  { id: "contrats", name: "Contrats", sub: "Échéances et primes", ready: true },
  { id: "analyses", name: "Analyses", sub: "Projections, variations", ready: true },
  { id: "documents", name: "Documents", sub: "Coffre-fort", ready: true },
  { id: "impots", name: "Impôts", sub: "Préparer la déclaration", ready: true },
];

/* ---------- cadre d'écran ---------- */
function setTitle(t, isHome) {
  const el = $("#screen-title");
  el.innerHTML = isHome
    ? '<img src="icons/icon-192.png" alt="" class="title-logo"><span class="wordmark">Ordovie</span>'
    : esc(t);
}
function setBottomBar(html) {
  const bar = $("#bottombar");
  if (html) { bar.innerHTML = html; bar.hidden = false; } else { bar.innerHTML = ""; bar.hidden = true; }
}

/* ---------- accueil ---------- */
function todoItems() {
  const items = [];
  if (!state) {
    items.push({ c: "", t: "Bienvenue ! Ouvre Finances → Commencer, puis fais ta première clôture du mois" });
    if (typeof contratAlerts === "function") items.push(...contratAlerts());
    if (typeof rappelAlerts === "function") items.push(...rappelAlerts());
    return items;
  }
  const pm = previousCalendarMonth();
  const ob = onboardVisible() && !Object.keys(state.historique || {}).length; // nouvel utilisateur : la liste « Premiers pas » s'en charge
  if (!ob && !state.historique[pm]) items.push({ c: "", t: "Mois de " + monthLabel(pm) + " pas encore clôturé" });
  if (typeof contratAlerts === "function") items.push(...contratAlerts());
  if (typeof docAlerts === "function") items.push(...docAlerts());
  if (typeof taxAlerts === "function") items.push(...taxAlerts());
  if (typeof rappelAlerts === "function") items.push(...rappelAlerts());
  const d = daysSince(settings.lastExport);
  if (settings.demo || (onboardVisible() && !settings.lastExport)) { /* démo ou premiers pas : déjà signalé ailleurs */ }
  else if (d === null) items.push({ c: "red", t: "Aucune sauvegarde chiffrée faite (Paramètres)" });
  else if (d > 30) items.push({ c: "red", t: "Dernière sauvegarde il y a " + d + " jours" });
  if (!items.length) items.push({ c: "green", t: "Rien d'urgent" });
  return items;
}

/* ---------- premiers pas (nouvel utilisateur) ---------- */
function onboardSteps() {
  const p = settings.profil || {};
  return [
    { k: "profil", t: "Ton profil", h: "Prénom et canton : l'assistant adapte ses réponses.", ok: !!(p.prenom && p.canton), go: "settings" },
    { k: "cloture", t: "Ta première clôture du mois", h: "≈ 10 minutes : comptes, revenus, dépenses. La base de tout le suivi.", ok: !!(state && Object.keys(state.historique || {}).length), go: "cloture" },
    { k: "contrat", t: "Ton premier contrat", h: "Assurance maladie, bail, abonnement… L'app te dira quand décider.", ok: !!(admin.contrats || []).length, go: "contrats" },
    { k: "lock", t: "Protéger l'app", h: "Empreinte ou mot de passe à l'ouverture.", ok: typeof lockEnabled === "function" && lockEnabled(), go: "settings" },
    { k: "backup", t: "Ta première sauvegarde chiffrée", h: "Un fichier protégé par mot de passe, à garder hors du téléphone.", ok: !!settings.lastExport, go: "settings" },
    { k: "ia", t: "Activer l'IA (facultatif)", h: "Clé API Claude : lecture des contrats par photo et assistant.", ok: !!settings.apiKey, go: "settings", opt: true },
  ];
}
// Masquée pour un utilisateur déjà installé (≥ 2 clôtures) ou quand tout est fait.
function onboardVisible() {
  if (!state || settings.onboardDone || settings.demo || Object.keys(state.historique || {}).length >= 2) return false;
  return onboardSteps().some((s) => !s.ok && !s.opt);
}
function onboardHtml() {
  if (!onboardVisible()) return "";
  const st = onboardSteps(), req = st.filter((s) => !s.opt), done = req.filter((s) => s.ok).length;
  const next = st.find((s) => !s.ok);
  return `<div class="section-title">Premiers pas <span class="legend">${done} / ${req.length}</span></div>
    <div class="card onboard">
      ${st.map((s) => `<button class="ob-step ${s.ok ? "ok" : ""} ${s === next ? "next" : ""}" data-ob="${s.go}" data-obk="${s.k}">
        <span class="ob-chk">${s.ok ? "✓" : ""}</span><span><strong>${esc(s.t)}</strong>${s.ok ? "" : `<span class="r-sub">${esc(s.h)}</span>`}</span></button>`).join("")}
      <div class="ob-foot">
        ${typeof appIsEmpty === "function" && appIsEmpty() ? '<button class="link-btn" id="demo-again">🎭 Revoir la démo</button>' : "<span></span>"}
        <button class="link-btn" id="ob-hide">${done === req.length ? "Terminé, masquer" : "Masquer"}</button>
      </div>
    </div>`;
}

function renderHome() {
  setTitle("", true);
  setBottomBar(typeof aiReady === "function" && aiReady() ? '<button class="btn primary btn-main" id="btn-ask">💬 Poser une question</button>' : "");
  let summary;
  if (state) {
    const total = patrimoineTotal();
    const last = lastHistoryEntry();
    const delta = last ? total - historyTotal(last) : null;
    summary = `
      <div class="label">Patrimoine net</div>
      <div class="big">${money(total)}</div>
      <div class="delta ${delta === null ? "muted" : delta >= 0 ? "pos" : "neg"}">
        ${delta === null ? "Aucune clôture pour comparer" : signed(delta) + " depuis la clôture de " + monthLabel(lastHistoryMonth())}
      </div>`;
  } else {
    summary = `<div class="label">Patrimoine net</div><div class="big">—</div>
      <div class="delta muted">Aucune donnée sur cet appareil</div>`;
  }
  $("#screen").innerHTML = `
    <div class="summary">${eyeBtn()}${summary}</div>
    ${onboardHtml()}
    <div class="section-title">À traiter <button class="link-btn legend-link" id="btn-rappels">🔔 Rappels</button></div>
    <div class="todo">
      ${todoItems().map((i) => `<div class="todo-item"><span class="dot ${i.c}"></span>${esc(i.t)}</div>`).join("")}
    </div>
    <div class="section-title">Modules</div>
    <div class="tiles">
      ${MODULES.map((m) => `
        <button class="tile ${m.ready ? "" : "soon"}" data-module="${m.id}">
          ${ICONS[m.id] || ""}
          <div><div class="t-name">${esc(m.name)}</div><div class="t-sub">${esc(m.sub)}</div></div>
        </button>`).join("")}
    </div>
    <div class="version">Ordovie ${esc(APP_VERSION)}</div>`;
}

/* ---------- module Finances (lecture) ---------- */
function renderFinances() {
  setTitle("Finances");
  if (!state) {
    setBottomBar("");
    $("#screen").innerHTML = `<div class="card"><div class="c-title">Bienvenue dans Finances</div>
      <p class="muted">Commence avec des données vides : tu rempliras tes comptes, revenus et dépenses lors de ta première « Clôture du mois ».</p>
      <button class="btn primary full" id="btn-start-empty">Commencer</button>
      <p class="muted small">Tu as déjà une sauvegarde Ordovie ? Paramètres (roue) → Restaurer / importer.</p></div>`;
    return;
  }
  setBottomBar('<button class="btn btn-side" id="btn-gerer">Paramètres</button><button class="btn primary btn-main" id="btn-close-month">Clôturer le mois</button>');
  if (!Object.keys(state.historique || {}).length && !patrimoineTotal()) {
    $("#screen").innerHTML = `
      <div class="card"><div class="c-title">Ta première clôture</div>
        <p class="muted">Une fois par mois, tu notes tes soldes, revenus et dépenses. Ordovie en tire ton patrimoine net, ton budget, ton taux d'épargne et leur évolution.</p>
        <p class="muted">La première prend ≈ 10 minutes, les suivantes 5. Rien n'est enregistré avant la validation finale.</p>
        <button class="btn primary full" id="btn-close-month">Faire ma première clôture</button></div>
      <p class="muted small">Tu as une sauvegarde Ordovie ? Roue ⚙️ → Restaurer / importer.</p>`;
    return;
  }
  const actifs = totalActifs();
  const cib = (state.params && state.params.cibles) || {};
  const rows = [
    { n: "Liquidités", v: totalCash(), c: cib.cash },
    { n: "3e pilier", v: total3a(), c: cib.pilier3a },
    { n: "ETF / actions", v: totalETF(), c: cib.etf },
    { n: "Crypto", v: totalCrypto(), c: cib.crypto },
    { n: "Actifs physiques", v: totalPhysique(), c: cib.physique },
  ];
  const dettes = totalDettes();
  const months = historiqueMonthsSortedDesc().slice(0, 6);
  $("#screen").innerHTML = `
    <div class="summary">${eyeBtn()}
      <div class="label">Patrimoine net</div>
      <div class="big">${money(patrimoineTotal())}</div>
      <div class="delta muted">Actifs ${money(actifs)}${dettes ? " · dettes " + money(dettes) : ""}</div>
    </div>

    <div class="section-title">Répartition <span class="legend"><i class="target-dot"></i> cible</span></div>
    <div class="list">
      ${rows.map((r) => `
        <div class="row">
          <div><div class="r-name">${esc(r.n)}</div><div class="bar"><span style="width:${actifs > 0 ? Math.min(100, Math.max(0, r.v / actifs * 100)) : 0}%"></span>${typeof r.c === "number" ? `<i class="target" style="left:${Math.min(100, Math.max(0, r.c * 100))}%"></i>` : ""}</div></div>
          <div class="r-val">${money(r.v)}<div class="r-sub">${pct(r.v, actifs)}${typeof r.c === "number" ? " · cible " + Math.round(r.c * 100) + " %" : ""}</div></div>
        </div>`).join("")}
      ${dettes ? `<div class="row"><div class="r-name">Dettes</div><div class="r-val neg">−${money(dettes)}</div></div>` : ""}
    </div>

    <div class="section-title">Budget mensuel</div>
    <div class="list">
      <div class="row"><div class="r-name">Revenus</div><div class="r-val">${money(budgetRevenusTotal())}</div></div>
      <div class="row"><div class="r-name">Dépenses</div><div class="r-val">${money(budgetDepensesTotal())}</div></div>
      <div class="row"><div class="r-name">Surplus</div><div class="r-val ${budgetSurplus() >= 0 ? "pos" : "neg"}">${money(budgetSurplus())}<div class="r-sub">taux d'épargne ${fmtPct(tauxEpargne())}</div></div></div>
    </div>

    <div class="section-title">Évolution du patrimoine net <span class="legend">12 derniers mois</span></div>
    <div class="card chart-card">${historyChart()}
      <button class="link-btn" data-goto="historique">Voir tout l'historique →</button></div>
    ${objectifsSection()}
    ${projetsSection()}`;
}

/* ---------- graphique en barres : patrimoine net des 12 dernières clôtures ---------- */
function historyChart() {
  const keys = historiqueMonthsSorted().slice(-12);
  if (!keys.length) return '<p class="muted">Aucune clôture pour l\'instant.</p>';
  const vals = keys.map((k) => historyTotal(state.historique[k]));
  const W = 340, H = 170, top = 24, bottom = 24, left = 6, right = 6;
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  // Échelle qui part de 0 pour des barres honnêtes ; gère aussi un patrimoine négatif.
  const span = (max - min) || 1, ih = H - top - bottom;
  const y = (v) => top + (max - v) / span * ih, y0 = y(0);
  const slot = (W - left - right) / keys.length, bw = Math.min(26, slot * 0.62);
  const hide = maskedNow();
  const bars = keys.map((k, i) => {
    const v = vals[i], x = left + slot * i + (slot - bw) / 2, yt = Math.min(y(v), y0), h = Math.max(1, Math.abs(y(v) - y0));
    const last = i === keys.length - 1;
    const label = monthLabel(k).split(" ");
    return `<g class="hbar${last ? " last" : ""}" tabindex="0">
      <rect x="${x}" y="${yt}" width="${bw}" height="${h}" rx="3"></rect>
      <text class="mon" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(label[0])}${keys.length <= 6 ? " " + esc(label[1]) : ""}</text>
      ${hide ? "" : `<text class="val" x="${Math.min(Math.max(x + bw / 2, 30), W - 30)}" y="${Math.max(12, yt - 6)}" text-anchor="middle">${esc(fmtCHF(v).replace(" CHF", ""))}</text>`}
      <title>${esc(monthLabel(k))} — ${hide ? "masqué" : esc(fmtCHF(v))}</title></g>`;
  }).join("");
  const first = vals[0], lastV = vals[vals.length - 1], diff = lastV - first;
  return `<svg class="hchart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Patrimoine net par mois">
      <line x1="0" x2="${W}" y1="${y0}" y2="${y0}" class="axis"></line>${bars}</svg>
    <p class="muted small">${keys.length > 1 ? `${esc(monthLabel(keys[0]))} → ${esc(monthLabel(keys[keys.length - 1]))} : <strong class="${diff >= 0 ? "pos" : "neg"}">${signed(diff)}</strong>` : "Une seule clôture"} · touche une barre pour voir sa valeur</p>`;
}

/* ---------- paramètres ---------- */
async function renderSettings() {
  setTitle("Paramètres");
  setBottomBar("");
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) {}
  const hasKey = !!settings.apiKey;
  const d = daysSince(settings.lastExport);
  $("#screen").innerHTML = `
    <div class="card">
      <div class="c-title">Mes données</div>
      <p class="muted">${state
        ? "Données présentes · " + historiqueMonthsSorted().length + " mois d'historique · dernière modification " + (state.meta.lastSaved ? new Date(state.meta.lastSaved).toLocaleDateString("fr-CH") : "—")
        : "Aucune donnée sur cet appareil."}</p>
      ${state ? "" : '<button class="btn primary" id="btn-start-empty">Commencer avec des données vides</button>'}
    </div>

    ${securityCards()}

    <div class="card">
      <div class="c-title">Profil (facultatif)</div>
      <p class="muted small">Aide l'assistant à adapter ses réponses (fiscalité cantonale, couple…). Reste sur ce téléphone.</p>
      <div class="tx-grid">
        <div><label class="field">Prénom</label><input type="text" class="sm-input" data-profil="prenom" value="${esc((settings.profil || {}).prenom || "")}"></div>
        <div><label class="field">Canton</label><input type="text" class="sm-input" data-profil="canton" value="${esc((settings.profil || {}).canton || "")}" placeholder="ex. Berne"></div>
        <div class="span2"><label class="field">Situation</label><input type="text" class="sm-input" data-profil="situation" value="${esc((settings.profil || {}).situation || "")}" placeholder="ex. marié, sans enfant"></div>
      </div>
    </div>

    <div class="card">
      <div class="c-title">Clé API Claude</div>
      <p class="muted">Gardée uniquement sur ce téléphone, jamais publiée. Active la lecture des contrats par photo et l'assistant.</p>
      <label class="field" for="api-key">Clé ${hasKey ? "(enregistrée)" : ""}</label>
      <input type="password" id="api-key" autocomplete="off" placeholder="${hasKey ? "•••••••• (remplacer)" : "sk-ant-…"}">
      <div class="btn-row">
        <button class="btn primary" id="save-key">Enregistrer</button>
        ${hasKey ? '<button class="btn" id="clear-key">Effacer</button>' : ""}
      </div>
      ${hasKey ? `<label class="field">Modèle utilisé</label>
      <div class="model-line"><strong>${esc(typeof aiModel === "function" ? aiModel() : "")}</strong>
        <button class="btn sm" id="btn-test-ai">Tester la connexion</button></div>
      <div id="ai-models"></div>` : ""}
      <p class="muted small">Sans clé, les fonctions IA (transcription des contrats, assistant) restent masquées.</p>
    </div>

    <div class="card">
      <div class="c-title">Stockage</div>
      <p class="muted">Stockage persistant : <strong>${persisted === null ? "inconnu" : persisted ? "activé" : "non activé"}</strong>.
      Protège contre un nettoyage automatique du navigateur. Seule une sauvegarde gardée hors du téléphone protège contre la perte du téléphone.</p>
      ${persisted ? "" : '<button class="btn" id="persist">Activer</button>'}
    </div>

    <div class="card danger-zone">
      <div class="c-title">Effacer toutes les données</div>
      <p class="muted small">Supprime de ce téléphone : finances, contrats, documents et leurs pages, rappels, conversations. Ensuite, tu choisis si tu effaces aussi la clé API et le verrouillage (remise à zéro complète). Fais d'abord une sauvegarde chiffrée si tu veux pouvoir revenir en arrière.</p>
      <button class="btn danger" id="btn-wipe">Effacer toutes les données…</button>
    </div>
    <div class="version">Ordovie ${esc(APP_VERSION)}</div>`;
}

/* ---------- import / export ---------- */
function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    if (isEncryptedBackup(text)) { pendingBackup = text; secUi = null; go("settings"); return; }
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { alert("Fichier illisible : ni sauvegarde Ordovie, ni JSON valide."); return; }
    applyImported(parsed);
  };
  reader.readAsText(file);
}
// Validation + confirmation communes (JSON v20, JSON Ordovie ou sauvegarde chiffrée déjà déchiffrée).
function applyImported(parsed, adminData) {
  if (!parsed || typeof parsed !== "object" || !parsed.comptes || !parsed.params) {
    alert("Ce fichier ne ressemble pas à des données Gestion Finances / Ordovie."); return false;
  }
  let candidate;
  try { candidate = mergeDefaults(parsed); } catch (e) { alert("Import impossible : " + e.message); return false; }
  const prev = state; state = candidate;
  const msg = "Importer ces données ?\n\nPatrimoine net : " + fmtCHF(patrimoineTotal()) +
    "\nHistorique : " + historiqueMonthsSorted().length + " mois" +
    (prev ? "\n\nAttention : les données actuelles de l'app seront remplacées." : "");
  if (!confirm(msg)) { state = prev; go("settings"); return false; }
  saveData();
  if (adminData && typeof admin !== "undefined") { admin = Object.assign({ contrats: [] }, adminData); saveAdmin(); }
  alert("Import réussi.");
  go("home");
  return true;
}
function exportFile() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ordovie-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  go("settings");
}

/* ---------- navigation ---------- */
let current = "home";
// Bouton « retour » d'Android : chaque écran est une entrée d'historique ; retour = écran précédent.
// Sur l'accueil, retour quitte l'app (comportement normal).
function go(screen, fromHistory) {
  if (current === "cloture" && screen !== "cloture" && wz) {
    if (!confirm("Abandonner la clôture en cours ? Rien n'a été enregistré.")) {
      if (fromHistory) history.pushState({ screen: current }, ""); // on reste sur la clôture
      return;
    }
    wz = null;
  }
  if (!fromHistory && screen !== current) {
    if (screen === "home") history.replaceState({ screen: "home" }, "");
    else history.pushState({ screen }, "");
  }
  current = screen;
  // Mode discret : neutralise aussi les couleurs (vert/rouge trahissent un gain ou une perte).
  document.body.classList.toggle("masked", !!settings.hideAmounts && MASKED_SCREENS.includes(screen));
  if (screen === "settings") renderSettings();
  else if (screen === "finances") renderFinances();
  else if (screen === "cloture") renderCloture();
  else if (screen.startsWith("gerer")) renderGerer(screen);
  else if (screen === "historique") renderHistorique();
  else if (screen === "contrats") renderContrats();
  else if (screen === "contrat-edit") renderContratEdit();
  else if (screen.startsWith("histo:")) renderHistoMois(screen.slice(6));
  else if (screen === "assistant") renderAssistant();
  else if (screen === "analyses") renderAnalyses();
  else if (screen === "documents") renderDocuments();
  else if (screen === "doc-edit") renderDocEdit();
  else if (screen === "impots") renderImpots();
  else if (screen === "rappels") renderRappels();
  else renderHome();
  window.scrollTo(0, 0);
}

// Écouteurs posés UNE seule fois sur des éléments persistants (délégation) : pas d'empilement.
$("#btn-home").addEventListener("click", () => go("home"));
history.replaceState({ screen: "home" }, "");
window.addEventListener("popstate", (e) => {
  if (document.body.classList.contains("is-locked")) { history.pushState({ screen: current }, ""); return; }
  go((e.state && e.state.screen) || "home", true);
});
$("#btn-settings").addEventListener("click", () => go("settings"));
$("#bottombar").addEventListener("click", (e) => {
  if (e.target.closest("#btn-close-month")) startCloture();
  else if (e.target.closest("#btn-gerer")) go("gerer-params");
  else if (e.target.closest("#btn-ask")) openAssistant(null);
});
$("#screen").addEventListener("change", (e) => {
  if (e.target.dataset && e.target.dataset.profil) { settings.profil = settings.profil || {}; settings.profil[e.target.dataset.profil] = e.target.value.trim(); saveSettings(); return; }
  if (e.target.id === "ai-model") { settings.aiModel = e.target.value; saveSettings(); go("settings"); alert("Modèle enregistré : " + e.target.value); return; }
  if (e.target.id === "file-import" && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ""; }
});
$("#screen").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "btn-import") $("#file-import").click();
  else if (t.id === "btn-wipe") {
    const d = daysSince(settings.lastExport);
    const ok = prompt("Effacer TOUTES les données de l'app ?\n" + (d === null ? "⚠️ Tu n'as jamais fait de sauvegarde chiffrée." : "Dernière sauvegarde : il y a " + d + " jour(s).") + "\n\nTape EFFACER pour confirmer :");
    if (ok !== "EFFACER") { if (ok !== null) alert("Rien n'a été effacé."); return; }
    if (typeof exitDemo === "function") { await exitDemo(false); } // efface finances, contrats, documents (et pages), rappels…
    const full = confirm("Données effacées.\n\nEffacer AUSSI la clé API, le verrouillage (empreinte / mot de passe) et le profil ?\n\nOK = remise à zéro complète (comme une app neuve)\nAnnuler = les garder");
    if (full) { settings = {}; localStorage.removeItem(SETTINGS_KEY); }
    else { delete settings.lastExport; saveSettings(); }
    alert(full ? "Remise à zéro complète effectuée : l'app est comme neuve." : "Données effacées. Clé API et verrouillage conservés.");
    go("home");
  }
  else if (t.id === "btn-start-empty") { state = mergeDefaults({}); saveData(); go("finances"); }
  else if (t.id === "btn-rappels") go("rappels");
  else if (t.id === "ob-hide") { settings.onboardDone = true; saveSettings(); go("home"); }
  else if (t.dataset && t.dataset.ob) {
    if (t.dataset.ob === "cloture") { startCloture(); return; }
    go(t.dataset.ob);
    // Paramètres : amener directement à la bonne carte
    const sel = { profil: '[data-profil="prenom"]', lock: '[data-sec="setpwd"],[data-sec="lock-off"]', backup: '[data-sec="backup"]', ia: "#api-key" }[t.dataset.obk];
    const el = sel && document.querySelector(sel);
    if (el) { el.closest(".card").scrollIntoView({ block: "start" }); el.closest(".card").classList.add("flash"); }
  }
  else if (t.id === "btn-ask") openAssistant(null);
  else if (t.id === "btn-test-ai") {
    const box = $("#ai-models"); box.innerHTML = '<p class="muted small">Connexion…</p>';
    try {
      const models = await listModels();
      const cur = aiModel();
      box.innerHTML = `<p class="small pos">✓ Clé valide · ${models.length} modèle(s) disponibles.</p>
        <select id="ai-model" class="sm-input">${models.map((m) => `<option value="${esc(m.id)}" ${m.id === cur ? "selected" : ""}>${esc(m.display_name || m.id)}${m.id === DEFAULT_MODEL ? " (recommandé)" : ""}</option>`).join("")}</select>
        ${models.some((m) => m.id === cur) ? "" : `<p class="small neg">Le modèle actuel « ${esc(cur)} » n'est pas disponible pour ta clé : choisis-en un dans la liste.</p>`}`;
    } catch (err) { box.innerHTML = `<p class="small neg">✗ ${esc(err.message)}</p>`; }
  }
  else if (t.dataset.act === "toggle-eye") { settings.hideAmounts = !settings.hideAmounts; saveSettings(); go(current); }
  else if (t.id === "btn-export") exportFile();
  else if (t.id === "save-key") {
    const v = $("#api-key").value.trim();
    if (v) { settings.apiKey = v; saveSettings(); go("settings"); }
  } else if (t.id === "clear-key") {
    if (confirm("Effacer la clé API de ce téléphone ?")) { delete settings.apiKey; saveSettings(); go("settings"); }
  } else if (t.id === "persist") {
    try { await navigator.storage.persist(); } catch (err) {}
    go("settings");
  } else if (t.dataset.module) {
    const m = MODULES.find((x) => x.id === t.dataset.module);
    if (m && m.ready) go(m.id);
    else if (m) alert(m.name + " : " + m.sub + ".");
  }
});

/* ---------- service worker + bandeau de mise à jour ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const showBanner = (worker) => {
        $("#update-banner").hidden = false;
        $("#btn-update").onclick = () => worker.postMessage("skipWaiting");
      };
      if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showBanner(nw);
        });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update(); });
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return; reloading = true; location.reload();
    });
  });
}

go("home");
