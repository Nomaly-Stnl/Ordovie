// Ordovie — écran de bienvenue, mode démo (« Alex », données fictives) et visite guidée.
// Sécurités : la démo n'est proposée que si l'app est vide ; bandeau permanent ; sauvegarde et import bloqués ;
// quitter la démo efface TOUT le contenu de l'app (rien de réel ne peut s'y trouver, puisqu'elle partait de vide).
"use strict";

const DEMO_REF = 2026 * 12 + 10; // (mois 0-based) données rédigées pour novembre 2026 (dernière clôture : octobre 2026)

function appIsEmpty() {
  return !state && !((admin.contrats || []).length || (admin.documents || []).length || (admin.chats || []).length);
}
function inDemo() { return !!settings.demo; }

/* ---------- décalage des dates : la démo reste « actuelle » quel que soit le mois ---------- */
function shiftYM(y, m, d) { const t = y * 12 + (m - 1) + d; return [Math.floor(t / 12), (t % 12) + 1]; }
function shiftStr(s, d) {
  let m;
  const dd = (y, mo, day) => String(Math.min(+day, new Date(y, mo, 0).getDate())).padStart(2, "0"); // 31 → 30 si besoin
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { const [y, mo] = shiftYM(+m[1], +m[2], d); return `${y}-${String(mo).padStart(2, "0")}-${dd(y, mo, m[3])}`; }
  if ((m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s))) { const [y, mo] = shiftYM(+m[3], +m[2], d); return `${dd(y, mo, m[1])}.${String(mo).padStart(2, "0")}.${y}`; }
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) { const [y, mo] = shiftYM(+m[1], +m[2], d); return `${y}-${String(mo).padStart(2, "0")}`; }
  return s;
}
function shiftAll(o, d, skip) {
  if (Array.isArray(o)) return o.map((x) => shiftAll(x, d, skip));
  if (o && typeof o === "object") { const r = {}; for (const k of Object.keys(o)) r[k] = skip.includes(k) ? o[k] : shiftAll(o[k], d, skip); return r; }
  return typeof o === "string" ? shiftStr(o, d) : o;
}
function demoPayload() {
  const now = new Date(), delta = now.getFullYear() * 12 + now.getMonth() - DEMO_REF;
  const data = JSON.parse(JSON.stringify(DEMO_DATA));
  const skip = ["nom", "titre", "notes", "texte", "resume", "content", "note", "data", "remarques", "details", "demarche", "numero"];
  const f = shiftAll(data.finances, delta, skip), a = shiftAll(data.admin, delta, skip);
  const hist = {}; Object.keys(data.finances.historique).forEach((k) => { hist[shiftStr(k, delta)] = f.historique[k]; });
  f.historique = hist;
  f.params.anneeFiscale = now.getFullYear();
  f.pilier3aSoldeDebutAnnee = {};
  const imp = Object.values(a.impots || {})[0]; a.impots = imp ? { [String(now.getFullYear())]: imp } : {};
  return { finances: f, admin: a, docs: data.docs };
}

/* ---------- entrer / quitter ---------- */
async function startDemo() {
  if (!appIsEmpty()) { alert("La démo n'est disponible que dans une app vide."); return; }
  const p = demoPayload();
  state = mergeDefaults(p.finances); saveData();
  admin = Object.assign({ contrats: [] }, p.admin); saveAdmin();
  if (typeof importDocFiles === "function") await importDocFiles(p.docs).catch(() => {});
  settings.demo = true; settings.tour = 0; saveSettings();
  go("home");
}
async function exitDemo(confirmFirst) {
  if (confirmFirst && !confirm("Quitter la démo ?\n\nTout le contenu de l'app sera effacé (données d'Alex et tout ce que tu aurais ajouté pendant la démo). Tu repartiras d'une app vide.")) return;
  try { const all = await allFiles(); for (const f of all) await delFile(f.id); } catch (e) {}
  localStorage.removeItem(DATA_KEY); localStorage.removeItem(ADMIN_KEY);
  state = null; admin = { contrats: [] };
  delete settings.demo; delete settings.tour; saveSettings();
  go("home");
}

/* ---------- accueil vide : choix ---------- */
const _renderHome = renderHome;
renderHome = function () {
  if (appIsEmpty() && !inDemo()) {
    setTitle("", true); setBottomBar("");
    $("#screen").innerHTML = `
      <div class="welcome">
        <img src="icons/icon-192.png" alt="" class="welcome-logo">
        <h1>Bienvenue dans Ordovie</h1>
        <p class="muted">Tes finances, contrats, documents et impôts, au même endroit. Tout reste sur ton téléphone.</p>
      </div>
      <button class="card choice" id="demo-start"><span class="choice-ic">🎭</span><span><strong>Découvrir avec Alex</strong>
        <span class="r-sub">Une visite guidée avec des données fictives. À la fin, tout est effacé et tu commences avec les tiennes.</span></span></button>
      <button class="card choice" id="demo-skip"><span class="choice-ic">🚀</span><span><strong>Commencer avec mes données</strong>
        <span class="r-sub">Ouvre Finances → Commencer, puis fais ta première clôture du mois.</span></span></button>
      <p class="muted small" style="text-align:center;">Tu as une sauvegarde Ordovie ? Roue ⚙️ → Restaurer / importer.</p>`;
    return;
  }
  _renderHome();
};

/* ---------- visite guidée ---------- */
const TOUR = [
  { s: "home", t: "Tout en un coup d'œil", x: "En haut, le patrimoine net d'Alex. Dessous, « À traiter » : uniquement ce qui demande une action." },
  { s: "finances", t: "Finances : suivre son patrimoine", x: "Une clôture par mois, environ 5 minutes. Tu vois où va ton argent et comment ton patrimoine évolue." },
  { s: "contrats", t: "Contrats : plus d'oubli", x: "L'app calcule la date limite pour résilier et te prévient à temps. Plus de renouvellement subi." },
  { s: "assistant", t: "Tes contrats, enfin compris", x: "Photographie une police, l'IA la lit. Pose ta question : elle répond en citant l'article. Ici, vélo volé : couvert ?" },
  { s: "documents", t: "Documents : ton coffre-fort", x: "Tous tes papiers au même endroit, sur ton téléphone. L'app prévient avant une expiration." },
  { s: "rappels", t: "Rappels dans ton agenda", x: "Pas de notification en plus : « 📅 Agenda » envoie le rappel directement dans ton agenda personnel.", end: true },
];
function tourGo(i) {
  const st = TOUR[i]; settings.tour = i; saveSettings();
  if (st.s === "contrat-lamal") { const k = (admin.contrats || []).findIndex((c) => /LAMal/.test(c.type)); if (k >= 0) { openContrat(k); return; } }
  if (st.s === "assistant") { if (typeof openAssistant === "function") { openAssistant(null); return; } }
  go(st.s);
}
function renderDemoChrome() {
  let b = document.getElementById("demo-banner"), c = document.getElementById("tour-card");
  if (!inDemo()) { if (b) b.remove(); if (c) c.remove(); document.body.classList.remove("demo-on", "tour-on"); return; }
  if (!b) { b = document.createElement("div"); b.id = "demo-banner"; document.body.appendChild(b); }
  b.innerHTML = `🎭 Démo : données fictives d'Alex <button id="demo-exit">Quitter la démo</button>`;
  document.body.classList.add("demo-on");
  const i = settings.tour;
  if (typeof i !== "number" || !TOUR[i]) { if (c) c.remove(); document.body.classList.remove("tour-on"); return; }
  if (!c) { c = document.createElement("div"); c.id = "tour-card"; document.body.appendChild(c); }
  const st = TOUR[i];
  c.innerHTML = `<div class="tour-step">${i + 1} / ${TOUR.length}</div><div class="tour-t">${esc(st.t)}</div><div class="tour-x">${esc(st.x)}</div>
    <div class="tour-btns">${st.end
      ? `<button class="btn" id="tour-free">Explorer la démo</button><button class="btn primary" id="tour-finish">Effacer la démo et commencer</button>`
      : `<button class="btn" id="tour-skip">Passer la visite</button>${i > 0 ? '<button class="btn" id="tour-prev">←</button>' : ""}<button class="btn primary" id="tour-next">Suivant →</button>`}</div>`;
  document.body.classList.add("tour-on");
}
const _go = go;
go = function (screen, fromHistory) { _go(screen, fromHistory); renderDemoChrome(); };

document.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "demo-start") startDemo();
  else if (t.id === "demo-skip") go("finances");
  else if (t.id === "demo-exit" || t.id === "tour-finish") exitDemo(true);
  else if (t.id === "tour-next") tourGo(Math.min(TOUR.length - 1, settings.tour + 1));
  else if (t.id === "tour-prev") tourGo(Math.max(0, settings.tour - 1));
  else if (t.id === "tour-skip" || t.id === "tour-free") { delete settings.tour; saveSettings(); renderDemoChrome(); }
});

// Garde-fous : en démo, pas de sauvegarde ni d'import (Alex ne doit jamais se retrouver dans une vraie sauvegarde).
document.addEventListener("click", (e) => {
  if (!inDemo()) return;
  const t = e.target.closest('[data-sec="backup"],#btn-import,#btn-export'); if (!t) return;
  e.stopImmediatePropagation(); e.preventDefault();
  alert("Indisponible en mode démo. Quitte d'abord la démo (bandeau en haut), puis sauvegarde ou importe tes vraies données.");
}, true);

if (current === "home") go("home");
