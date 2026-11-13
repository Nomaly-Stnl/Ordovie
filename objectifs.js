// Ordovie — objectifs : affichage sur la page Finances + étape « Objectifs » de la clôture.
"use strict";

function progBar(p, cls) {
  return `<div class="bar"><span class="${cls || ""}" style="width:${Math.round(Math.min(1, Math.max(0, p)) * 100)}%"></span></div>`;
}
function objPct(p) { return Math.round(Math.min(1, Math.max(0, p)) * 100) + " %"; }

function fiCible() { return 25 * 12 * budgetDepensesTotal(); }

/* ---------- section de la page Finances (lecture) ---------- */
function objectifsSection() {
  const fuC = fondsUrgenceCible(), fuA = fondsUrgenceActuel(), fuP = fondsUrgenceProgress();
  const p3C = state.params.plafond3aAvec2P, p3V = pilier3aVerseCetteAnnee(), p3P = pilier3aProgress();
  const info = pilier3aSoldeDebutAnneeInfo();
  const src = info.source === "cloture" ? "depuis la clôture de déc. " + (info.year - 1)
    : info.source === "manuel" ? "depuis le solde saisi au 1er janvier"
    : info.source === "premier" ? "depuis la clôture de " + monthLabel(info.key) + " (versements de ce mois non comptés)"
    : "solde au 1er janvier inconnu (Paramètres)";
  const persos = (state.objectifs || []).map((o) => {
    const fi = o.id === "fi";
    // FI (règle des 4 %) : capital visé = 25 × dépenses annuelles du budget, recalculé automatiquement.
    const a = fi ? patrimoineTotal() - totalPhysique() : objectifActuel(o), c = fi ? fiCible() : Number(o.cible) || 0, p = c > 0 ? a / c : 0;
    return `<div class="obj">
      <div class="li-head"><span>${esc(o.nom)}</span><span class="r-sub">${objPct(p)}</span></div>
      ${progBar(p)}
      <div class="r-sub">${money(a)} / ${money(c)}${o.dateCible ? " · " + esc(o.dateCible) : ""}${fi ? " · 25 × tes dépenses annuelles · hors actifs physiques" : o.localisation ? " · 📍 " + esc(o.localisation) : ""}</div>
    </div>`;
  }).join("");
  return `<div class="section-title">Objectifs</div>
    <div class="card">
      <div class="obj">
        <div class="li-head"><span>Fonds d'urgence</span><span class="r-sub">${objPct(fuP)}</span></div>
        ${progBar(fuP, fuP >= 1 ? "ok" : "")}
        <div class="r-sub">${money(fuA)} de liquidités / ${money(fuC)} (${esc(String(state.params.moisFondsUrgence))} mois de charges fixes)</div>
      </div>
      <div class="obj">
        <div class="li-head"><span>3e pilier ${esc(String(state.params.anneeFiscale))}</span><span class="r-sub">${objPct(p3P)}</span></div>
        ${progBar(p3P, p3P >= 1 ? "ok" : "")}
        <div class="r-sub">${money(p3V)} versés / ${money(p3C)} · ${esc(src)}</div>
        ${p3V < p3C ? `<div class="r-sub">Reste ${money(p3C - p3V)} à verser · économie d'impôt ≈ ${money(p3V * (Number(state.params.tauxMarginal) || 0))}</div>` : ""}
      </div>
      ${persos}
    </div>`;
}

/* ---------- étape « Objectifs » de la clôture ---------- */
function pageObjectifs() {
  const d = wz.draft;
  wz.origObj = wz.origObj || Object.fromEntries((state.objectifs || []).map((o) => [o.id, (o.versements || []).length]));
  const cards = (d.objectifs || []).map((o, i) => {
    if (o.id === "fi") return "";
    const b = "objectifs." + i, orig = wz.origObj[o.id] || 0, open = wz.ui.openObj === i;
    const vs = (o.versements || []).map((v, vi) => ({ v, vi })).filter((x) => x.vi >= orig);
    return `<div class="card">
      <div class="li-head"><span class="c-title">${esc(o.nom)}</span><button class="link-btn" data-rm="${b}" data-rmname="${esc(o.nom)}">Retirer</button></div>
      <p class="muted small" data-oinfo="${i}"></p>
      ${vs.map(({ v, vi }) => `<div class="tx tx-buy"><div class="li-head"><span>Mis de côté</span><button class="link-btn" data-rmtx="${b}.versements.${vi}">Retirer</button></div>
        <div class="tx-grid"><div><label class="field">Date</label><input type="text" class="sm-input" data-wzt="${b}.versements.${vi}.date" value="${esc(v.date)}"></div>
        <div><label class="field">Montant (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${b}.versements.${vi}.montant" value="${esc(v.montant || "")}"></div></div></div>`).join("")}
      <div class="btn-row"><button class="btn sm" data-act="obj-vers" data-i="${i}">+ Mis de côté ce mois</button></div>
      ${open ? `<div class="tx-grid">
          <div class="span2"><label class="field">Nom</label><input type="text" class="sm-input" data-wzt="${b}.nom" value="${esc(o.nom)}"></div>
          <div><label class="field">Cible (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="${b}.cible" value="${esc(o.cible || 0)}"></div>
          <div><label class="field">Échéance</label><input type="text" class="sm-input" data-wzt="${b}.dateCible" value="${esc(o.dateCible || "")}" placeholder="ex. 2027-06"></div>
          <div class="span2"><label class="field">📍 Emplacement</label><input type="text" class="sm-input" data-wzt="${b}.localisation" value="${esc(o.localisation || "")}" placeholder="ex. compte épargne, enveloppe"></div>
        </div><button class="link-btn" data-act="obj-close">Masquer les détails</button>`
      : `<button class="link-btn" data-act="obj-open" data-i="${i}">Détails (cible, échéance, emplacement)</button>`}
    </div>`;
  }).join("");
  const adder = wz.ui.newObj ? `<div class="card"><div class="c-title">Nouvel objectif</div>
      ${tf("__new.nom", "", "Nom (ex. Voyage Japon)")}
      <div class="tx-grid"><div><label class="field">Cible (CHF)</label><input type="text" inputmode="decimal" class="sm-input" data-wz="__new.cible"></div>
        <div><label class="field">Échéance</label><input type="text" class="sm-input" data-wzt="__new.date" placeholder="ex. 2027-06"></div>
        <div class="span2"><label class="field">📍 Emplacement</label><input type="text" class="sm-input" data-wzt="__new.loc"></div></div>
      <div class="btn-row"><button class="btn primary" data-act="obj-add">Ajouter</button><button class="btn" data-act="cancel-new">Annuler</button></div></div>`
    : `<button class="btn full" data-act="obj-new">+ Nouvel objectif</button>`;
  return `${cards || '<div class="card"><p class="muted">Aucun objectif personnel.</p></div>'}${adder}
    <p class="muted small">Suivi uniquement : l'argent mis de côté reste compté là où il se trouve (compte, actif physique…). L'indépendance financière se calcule seule.</p>`;
}
function refreshObjInfo() {
  document.querySelectorAll("[data-oinfo]").forEach((el) => {
    const o = wz.draft.objectifs[Number(el.dataset.oinfo)]; if (!o) return;
    const a = objectifActuel(o), c = Number(o.cible) || 0;
    el.textContent = fmtCHF(a) + " / " + fmtCHF(c) + " (" + objPct(c > 0 ? a / c : 0) + ")" + (o.dateCible ? " · échéance " + o.dateCible : "") + (o.localisation ? " · 📍 " + o.localisation : "");
  });
}
// Actions propres à l'étape (appelées par le gestionnaire de la clôture).
function objAction(a, t) {
  const d = wz.draft;
  if (a === "obj-vers") { const o = d.objectifs[Number(t.dataset.i)]; (o.versements = o.versements || []).push({ date: todayCH(), montant: "" }); }
  else if (a === "obj-open") wz.ui = { openObj: Number(t.dataset.i) };
  else if (a === "obj-close") wz.ui = {};
  else if (a === "obj-new") wz.ui = { newObj: true };
  else if (a === "obj-add") {
    const nom = newVal("nom"); if (!nom) { alert("Indique un nom."); return false; }
    (d.objectifs = d.objectifs || []).push({ id: uid("o"), nom, cible: parseNum(newVal("cible")), dateCible: newVal("date"), localisation: newVal("loc"), note: "", versements: [] });
    wz.ui = {};
  } else return null;
  return true;
}

/* ---------- section Projets de la page Finances : dépenses des 12 derniers mois ---------- */
function projetsSection() {
  const keys = historiqueMonthsSorted().slice(-12);
  const ids = new Set((state.budget.projets || []).map((p) => p.id));
  keys.forEach((k) => Object.keys(state.historique[k].projets || {}).forEach((id) => ids.add(id)));
  const nameOf = (id) => ((state.budget.projets || []).find((p) => p.id === id) || {}).nom || id;
  const blocks = [...ids].map((id) => {
    const vals = keys.map((k) => Number((state.historique[k].projets || {})[id]) || 0);
    if (!vals.some((v) => v)) return "";
    const tot = vals.reduce((s, v) => s + v, 0), max = Math.max(...vals, 1);
    const W = 320, H = 70, slot = W / keys.length, bw = Math.min(18, slot * 0.6);
    const hide = maskedNow();
    const bars = keys.map((k, i) => {
      const h = Math.max(vals[i] ? 2 : 0, vals[i] / max * (H - 18)), x = slot * i + (slot - bw) / 2;
      return `<g class="hbar" tabindex="0"><rect x="${x}" y="${H - 14 - h}" width="${bw}" height="${h}" rx="2"></rect>
        <text class="mon" x="${x + bw / 2}" y="${H - 2}" text-anchor="middle">${esc(monthLabel(k).split(" ")[0])}</text>
        ${hide ? "" : `<text class="val" x="${Math.min(Math.max(x + bw / 2, 22), W - 22)}" y="10" text-anchor="middle">${esc(fmtCHF(vals[i]).replace(" CHF", ""))}</text>`}
        <title>${esc(monthLabel(k))} — ${hide ? "masqué" : esc(fmtCHF(vals[i]))}</title></g>`;
    }).join("");
    const active = (state.budget.projets || []).some((p) => p.id === id);
    return `<div class="obj"><div class="li-head"><span>${esc(nameOf(id))}${active ? "" : ' <span class="tag">terminé</span>'}</span>
        <span class="r-sub">${money(tot)} sur ${keys.length} mois · moy. ${money(tot / keys.length)}</span></div>
      <svg class="hchart proj" viewBox="0 0 ${W} ${H}" width="100%">${bars}</svg></div>`;
  }).join("");
  return blocks ? `<div class="section-title">Projets <span class="legend">dépenses par mois</span></div><div class="card">${blocks}</div>` : "";
}
