// Ordovie — assistant (Claude) : conversation libre, avec tes contrats et leurs transcriptions en contexte.
// Visible seulement si une clé API est enregistrée. Historique gardé sur l'appareil (et dans la sauvegarde).
"use strict";

let chatScope = null; // id d'un contrat pour limiter le contexte, sinon null = tous
let chatBusy = false;

function chatList() { admin.chats = admin.chats || []; return admin.chats; }

function contractsContext(scopeId) {
  const list = (admin.contrats || []).filter((c) => !scopeId || c.id === scopeId);
  if (!list.length) return "Aucun contrat enregistré.";
  return list.map((c) => {
    const dl = typeof deadline === "function" ? deadline(c) : null;
    const head = `### Contrat : ${c.fournisseur || "?"} — ${c.type}
Titulaire : ${c.titulaire || "?"} · N° ${c.numero || "?"} · Prime ${c.prime || "?"} CHF (${c.periode || "?"})
Échéance ${c.echeance || "?"} · délai de résiliation ${c.delaiMois ?? "?"} mois${dl ? " · date limite de résiliation " + iso(dl) : ""}${c.notes ? "\nNotes : " + c.notes : ""}`;
    const own = (c.docs || []).filter((d) => d.transcription);
    const linked = (c.linkedDocs || []).map((id) => (admin.documents || []).find((d) => d.id === id)).filter((d) => d && d.transcription);
    const docs = own.concat(linked).map((d) => `#### Document « ${d.nom} » (transcription)\n${JSON.stringify(d.transcription)}`).join("\n");
    return head + (docs ? "\n" + docs : "\n(Aucun document transcrit pour ce contrat.)");
  }).join("\n\n");
}

// Résumé compact des finances (envoyé seulement pour les questions générales, pas pour une question limitée à un contrat).
function financeContext() {
  if (!state) return "Aucune donnée financière.";
  const p = state.params, f = (v) => Math.round(Number(v) || 0);
  const lines = (arr) => (arr || []).map((x) => `${x.nom} ${f(x.montant)}`).join(", ");
  const hist = historiqueMonthsSorted().slice(-12).map((k) => `${k}: net ${f(historyTotal(state.historique[k]))}, revenus ${f(state.historique[k].revenus)}, dépenses ${f(state.historique[k].depenses)}`).join("\n");
  return `Patrimoine net ${f(patrimoineTotal())} CHF (actifs ${f(totalActifs())}, dettes ${f(totalDettes())}).
Répartition : liquidités ${f(totalCash())} (cible ${Math.round(p.cibles.cash * 100)} %), 3e pilier ${f(total3a())} (cible ${Math.round(p.cibles.pilier3a * 100)} %), ETF/actions ${f(totalETF())} (cible ${Math.round(p.cibles.etf * 100)} %), crypto ${f(totalCrypto())} (cible ${Math.round(p.cibles.crypto * 100)} %), actifs physiques ${f(totalPhysique())} (cible ${Math.round(p.cibles.physique * 100)} %).
Comptes : ${state.comptes.map((c) => `${c.nom} (${c.categorie}) ${f(c.solde)}`).join(", ")}.
Positions : ${state.positions.map((x) => `${x.nom}${x.ticker ? " [" + x.ticker + "]" : ""} (${x.categorie}) valeur ${f(positionValue(x))}, coût ${f(positionCost(x))}`).join(", ") || "aucune"}.
Dettes : ${(state.dettes || []).map((d) => `${d.nom} (${d.type}) solde ${f(d.solde)}, taux ${((Number(d.taux) || 0) * 100).toFixed(2)} %, mensualité ${f(d.mensualite)}`).join(", ") || "aucune"}.
Budget mensuel : revenus ${f(budgetRevenusTotal())} [${lines(state.budget.revenus)}] ; charges fixes ${f(budgetFixesTotal())} [${lines(state.budget.fixes)}] ; variables [${lines(state.budget.variables)}] ; projets [${lines(state.budget.projets)}] ; surplus ${f(budgetSurplus())} (taux d'épargne ${(tauxEpargne() * 100).toFixed(1)} %).
Règle de répartition du surplus : ${Object.entries(p.reglesurplus || {}).map(([k, v]) => k + " " + Math.round(v * 100) + " %").join(", ")}.
3e pilier ${p.anneeFiscale} : versé ${f(pilier3aVerseCetteAnnee())} sur plafond ${f(p.plafond3aAvec2P)} ; taux marginal ${Math.round(p.tauxMarginal * 100)} %.
Objectifs : ${(state.objectifs || []).map((o) => o.id === "fi" ? `indépendance financière ${f(patrimoineTotal() - totalPhysique())}/${f(25 * 12 * budgetDepensesTotal())}` : `${o.nom} ${f(objectifActuel(o))}/${f(o.cible)}${o.dateCible ? " pour " + o.dateCible : ""}`).join(", ")}.
Rendements attendus (paramètres) : ${Object.entries(p.rendements).map(([k, v]) => k + " " + (v * 100).toFixed(1) + " %").join(", ")} ; rendement pondéré actuel ${(tauxPondere() * 100).toFixed(2)} %.
Historique (12 dernières clôtures) :
${hist || "aucun"}`;
}

function vaultContext() {
  const all = (admin.documents || []);
  if (!all.length) return "Aucun document.";
  const arch = all.filter((d) => typeof isArchived === "function" && isArchived(d)), docs = all.filter((d) => !arch.includes(d));
  return (arch.length ? "Archives (versions anciennes, à consulter seulement pour une question sur une date passée) : " + arch.map((d) => d.nom).join(", ") + "\nEn vigueur :\n" : "") + docs.map((d) => `- ${d.nom} [${d.categorie}]${d.expire ? " expire le " + d.expire : ""}${d.notes ? " — " + d.notes : ""}` +
    (d.transcription ? "\n  " + JSON.stringify(Object.assign({}, d.transcription, { texte: d.transcription.texte ? String(d.transcription.texte).slice(0, 4000) : null })) : "")).join("\n");
}

// Profil facultatif (Paramètres) : prénom, situation, canton — rien n'est codé en dur.
function profilText() {
  const p = settings.profil || {};
  const parts = [p.prenom, p.situation, p.canton && "canton de " + p.canton].filter(Boolean);
  return parts.length ? " (" + parts.join(", ") + ")" : "";
}

function systemPrompt() {
  return `Tu es l'assistant personnel d'Ordovie, une application de gestion financière et administrative d'un foyer suisse${profilText()}.
Réponds en français, de façon claire et concrète. Tu peux répondre à toute question ; tu as en plus accès aux données de l'utilisateur ci-dessous (finances et contrats).
Pour les questions financières : appuie-toi sur ses chiffres réels, montre le calcul quand c'est utile, sois concret (montants, étapes). Tu n'es pas un conseiller financier agréé : présente des options et leurs conséquences plutôt que des ordres d'achat ou de vente.

Quand la question porte sur une couverture d'assurance ou une clause de contrat :
1. Commence par un verdict court : « Probablement couvert », « Probablement pas couvert » ou « Ça dépend de… ».
2. Cite le passage exact (entre guillemets) avec le contrat et le numéro d'article.
3. Indique franchise, plafond ou exclusion applicables s'il y en a.
4. Dis quoi faire ensuite (qui appeler, délai de déclaration, documents à garder).
5. Si l'information n'est pas dans les documents, dis-le franchement au lieu de supposer, et indique ce qu'il faudrait vérifier.
Termine les réponses de ce type par : « Indicatif — en cas de litige, la police originale et l'assureur font foi. »

Date du jour : ${iso(today0())}.

${chatScope ? "" : "=== FINANCES DE L'UTILISATEUR (montants en CHF) ===\n" + financeContext() + "\n\n=== DOCUMENTS PERSONNELS (coffre-fort) ===\n" + vaultContext() + "\n\n"}=== CONTRATS DE L'UTILISATEUR ===
${contractsContext(chatScope)}`;
}

function mdLite(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^### (.+)$/gm, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

function renderAssistant() {
  const scoped = chatScope ? (admin.contrats || []).find((c) => c.id === chatScope) : null;
  setTitle("Assistant");
  setBottomBar("");
  if (!aiReady()) {
    $("#screen").innerHTML = `<div class="card"><p class="muted">Ajoute ta clé API dans Paramètres pour activer l'assistant.</p></div>`;
    return;
  }
  const msgs = chatList().filter((m) => (m.scope || null) === (chatScope || null));
  const nDocs = (admin.contrats || []).reduce((s, c) => s + (c.docs || []).filter((d) => d.transcription).length, 0);
  $("#screen").innerHTML = `
    <div class="chat-head muted small">${scoped ? `Question sur <strong>${esc(scoped.fournisseur || scoped.type)}</strong> · <button class="link-btn" data-chat="all">tous les contrats</button>`
      : `Finances + ${(admin.contrats || []).length} contrat(s) · ${nDocs} document(s) transcrit(s) en contexte`}
      ${msgs.length ? ` · <button class="link-btn" data-chat="clear">effacer la conversation</button>` : ""}</div>
    <div class="chat" id="chat">
      ${msgs.length ? msgs.map((m) => `<div class="msg ${m.role}">${m.role === "assistant" ? mdLite(m.content) : esc(m.content).replace(/\n/g, "<br>")}</div>`).join("")
        : `<div class="msg hint">Exemples : « Comment répartir mon surplus ce mois-ci ? » · « Combien verser encore sur mon 3a avant la fin de l'année ? » · « Où puis-je réduire mes dépenses ? » · « Un incendie dans mon salon, suis-je couvert ? » · « Quand dois-je résilier ma LAMal ? »</div>`}
      ${chatBusy ? '<div class="msg assistant typing">…</div>' : ""}
    </div>
    <form id="chat-form" class="chat-form">
      <textarea id="chat-input" rows="2" placeholder="Pose ta question…" ${chatBusy ? "disabled" : ""}></textarea>
      <button class="btn primary" type="submit" ${chatBusy ? "disabled" : ""}>Envoyer</button>
    </form>
    <p class="muted small">${scoped ? "Ce contrat et ses documents sont envoyés" : "Tes finances, contrats et documents transcrits sont envoyés"} à Claude avec chaque question. Coût : quelques centimes par question.</p>`;
  const c = document.getElementById("chat"); const last = c.lastElementChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: "end" });
}

async function sendChat(text) {
  const list = chatList(), scope = chatScope || null;
  list.push({ role: "user", content: text, scope, at: new Date().toISOString() });
  chatBusy = true; saveAdmin(); renderAssistant();
  const convo = list.filter((m) => (m.scope || null) === scope && !m.error).slice(-20).map((m) => ({ role: m.role, content: m.content }));
  try {
    const r = await callClaude({ max_tokens: 4000, system: systemPrompt(), messages: convo });
    list.push({ role: "assistant", content: r.text || "(réponse vide)", scope, at: new Date().toISOString() });
  } catch (err) {
    list.push({ role: "assistant", content: "Erreur : " + err.message, scope, at: new Date().toISOString(), error: true });
  }
  if (list.length > 200) list.splice(0, list.length - 200);
  chatBusy = false; saveAdmin();
  if (current === "assistant") renderAssistant();
}

function openAssistant(scopeId) { chatScope = scopeId || null; go("assistant"); }

$("#screen").addEventListener("submit", (e) => {
  if (e.target.id !== "chat-form") return;
  e.preventDefault();
  const t = document.getElementById("chat-input"), v = t.value.trim();
  if (!v || chatBusy) return;
  sendChat(v);
});
$("#screen").addEventListener("click", (e) => {
  const t = e.target.closest("[data-chat]"); if (!t || current !== "assistant") return;
  if (t.dataset.chat === "all") { chatScope = null; renderAssistant(); }
  else if (t.dataset.chat === "clear" && confirm("Effacer cette conversation ?")) {
    admin.chats = chatList().filter((m) => (m.scope || null) !== (chatScope || null)); saveAdmin(); renderAssistant();
  }
});

// L'accueil a été dessiné avant ce module : on le redessine pour afficher « Poser une question ».
if (current === "home") renderHome();
