// Ordovie — moteur financier, repris À L'IDENTIQUE de « Gestion Finances v20 » (aucune réécriture).
// Ne pas modifier sans re-tester contre la v20 : c'est la garantie que les chiffres restent justes.
function defaultState(){
// Données de départ NEUTRES (aucune donnée personnelle dans le code public).
const s = {
  meta: { lastSaved: null, version: 2 },
  params: {
    devise: "CHF", anneeFiscale: new Date().getFullYear(), statutCivil: "", canton: "",
    plafond3aAvec2P: 7258, plafond3aSans2P: 36288, tauxMarginal: 0.20,
    rendements: { etf: 0.05, pilier3a: 0.01, cash: 0.005, crypto: 0.05 },
    inflation: 0.012,
    cibles: { cash: 0.15, pilier3a: 0.20, etf: 0.45, crypto: 0.10, physique: 0.10 },
    reglesurplus: { pilier3a: 0.30, etf: 0.50, cash: 0.10, crypto: 0.10 },
    moisFondsUrgence: 3,
    seuilRebalancement: 0.05
  },
  comptes: [
    {id:"cc", nom:"Compte courant", categorie:"Cash", solde:0},
    {id:"ce", nom:"Compte épargne", categorie:"Cash", solde:0}
  ],
  positions: [],
  dettes: [],
  actifsPhysiques: [],
  budget: {
    revenus: [
      {id:"salaire", nom:"Salaire net mensuel", montant:0},
      {id:"treizieme", nom:"13e mois (mensualisé)", montant:0},
      {id:"secondaire", nom:"Revenus secondaires", montant:0}
    ],
    fixes: [
      {id:"loyer", nom:"Loyer", montant:0},
      {id:"caissemaladie", nom:"Caisse maladie", montant:0},
      {id:"telephone", nom:"Téléphone / internet", montant:0},
      {id:"electricite", nom:"Électricité", montant:0},
      {id:"assdiverses", nom:"Assurances (RC, ménage…)", montant:0},
      {id:"impots", nom:"Impôts (provision)", montant:0}
    ],
    variables: [
      {id:"nourriture", nom:"Nourriture", montant:0},
      {id:"loisirs", nom:"Loisirs / sorties", montant:0},
      {id:"habits", nom:"Habits / soins", montant:0},
      {id:"imprevu", nom:"Imprévu / divers", montant:0}
    ],
    projets: []
  },
  objectifs: [
    {id:"fi", nom:"Indépendance financière (FI)", cible:0, actuel:null, dateCible:"", note:"Calculé automatiquement : 25 × tes dépenses annuelles"}
  ],
  pilier3aVersements: [],
  pilier3aSoldeDebutAnnee: {},
  historique: {},
  chomage: { tauxIndemnite:0.70, plafondLACI:10500, dureeIndemnisation:24 },
  assurances: [],
  pilotageETF: { target: {}, monthlyBudget: 0, notesPerso: "" }
};
return s;
}
/* ---------- helpers ---------- */
const sum = arr => arr.reduce((s,x)=>s+(Number(x)||0),0);
const fmtCHF = v => (v===null||v===undefined||isNaN(v)) ? "—" : Math.round(v).toLocaleString("fr-CH")+" CHF";
const fmtCHF2 = v => (v===null||v===undefined||isNaN(v)) ? "—" : v.toLocaleString("fr-CH",{minimumFractionDigits:2,maximumFractionDigits:2})+" CHF";
const fmtPct = v => (v===null||v===undefined||isNaN(v)) ? "—" : (v*100).toLocaleString("fr-CH",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
const MONTH_LABELS = {"01":"Jan","02":"Fév","03":"Mar","04":"Avr","05":"Mai","06":"Juin","07":"Juil","08":"Août","09":"Sep","10":"Oct","11":"Nov","12":"Déc"};
function monthLabel(key){ const [y,m]=key.split("-"); return MONTH_LABELS[m]+" "+y.slice(2); }

/* ---------- calculs achats / ventes / positions ----------
   Méthode : coût moyen pondéré (PRU) simple, calculé sur l'ensemble
   des achats de la position. Pas de FIFO, pas de PRU recalculé à
   chaque vente — approximation assumée (outil personnel). */
function achatsQuantite(p){ return sum((p.achats||[]).map(a=>a.quantite)); }
// Coût d'un lot acheté : pour le Crypto le champ saisi est le montant TOTAL payé
// (montantPaye, frais déjà inclus) ; pour l'ETF c'est quantite * prixPaye + frais de transaction.
function achatCoutUnitaire(p, a){
  if(p.categorie==="Crypto") return Number(a.montantPaye)||0;
  return (Number(a.quantite)||0)*(Number(a.prixPaye)||0) + (Number(a.frais)||0);
}
function achatsCout(p){ return sum((p.achats||[]).map(a=>achatCoutUnitaire(p,a))); }
function ventesQuantite(p){ return sum((p.ventes||[]).map(v=>v.quantite)); }
// Montant reçu pour un lot vendu : Crypto -> montantVenteTotal saisi ; ETF -> quantite * prixVenteUnitaire − frais de transaction (montant net).
function venteMontantUnitaire(p, v){
  if(p.categorie==="Crypto") return Number(v.montantVenteTotal)||0;
  return (Number(v.quantite)||0)*(Number(v.prixVenteUnitaire)||0) - (Number(v.frais)||0);
}
function ventesMontantTotal(p){ return sum((p.ventes||[]).map(v=>venteMontantUnitaire(p,v))); }
function positionUsesAchats(p){ return (p.achats||[]).length>0 && achatsQuantite(p)>0; }
// PRU (prix de revient unitaire) : coût moyen pondéré sur TOUS les achats de la position.
// Ne change pas avec les ventes (nature du coût moyen pondéré).
function positionPRU(p){ const qa=achatsQuantite(p); return qa>0 ? achatsCout(p)/qa : 0; }
// Quantité restante après ventes (jamais négative — clampée à 0, avec avertissement console si dépassement).
function positionQuantite(p){
  if(!positionUsesAchats(p)) return 0;
  const restante = achatsQuantite(p) - ventesQuantite(p);
  if(restante < -1e-9){
    console.warn(`Position "${p.nom}" : quantité vendue (${ventesQuantite(p)}) supérieure à la quantité achetée (${achatsQuantite(p)}) — quantité restante clampée à 0.`);
  }
  return Math.max(0, restante);
}
// Coût non réalisé restant = quantité restante × PRU (le PRU global, inchangé par les ventes).
function positionCost(p){ return positionUsesAchats(p) ? positionQuantite(p)*positionPRU(p) : 0; }
function positionValue(p){
  if(positionUsesAchats(p)){
    const prix = Number(p.prixActuel)||0;
    return prix>0 ? positionQuantite(p)*prix : positionCost(p);
  }
  return Number(p.valeurManuelle)||0;
}
// Gain LATENT (non réalisé) : calculé sur la quantité restante (post-ventes) uniquement.
function positionGain(p){ return positionUsesAchats(p) ? positionValue(p)-positionCost(p) : null; }
// Gain RÉALISÉ (ventes) : somme sur toutes les ventes de quantite_vendue × (prixVenteUnitaire − PRU global).
// PRU = PRU global de la position (pas un PRU historique à la date de vente) — simplification assumée.
function positionGainRealise(p){
  if(!positionUsesAchats(p)) return 0;
  const pru = positionPRU(p);
  return sum((p.ventes||[]).map(v => venteMontantUnitaire(p,v) - (Number(v.quantite)||0)*pru));
}
function totalByCat(cat){ return state.positions.filter(p=>p.categorie===cat).reduce((s,p)=>s+positionValue(p),0); }
function totalETF(){ return totalByCat("ETF"); }
function totalCrypto(){ return totalByCat("Crypto"); }
function totalPositionsCost(){ return state.positions.reduce((s,p)=>s+positionCost(p),0); }
function totalPositionsValue(){ return state.positions.reduce((s,p)=>s+positionValue(p),0); }
function totalPhysique(){ return sum(state.actifsPhysiques.map(a=>a.valeurActuelle)); }
// Frais de transaction (courtage) payés sur une position ETF/Actions : somme des frais des achats et des ventes.
// Crypto : 0 (les frais sont déjà inclus dans le montant payé / montant de vente saisi).
function positionFraisTransaction(p){
  if(p.categorie==="Crypto") return 0;
  return sum((p.achats||[]).map(a=>a.frais)) + sum((p.ventes||[]).map(v=>v.frais));
}
function totalFraisTransaction(){ return state.positions.reduce((s,p)=>s+positionFraisTransaction(p),0); }
function positionFraisAnnuel(p){ return positionValue(p)*(Number(p.fraisTER)||0); }
function totalFraisAnnuels(){ return state.positions.reduce((s,p)=>s+positionFraisAnnuel(p),0); }
function fraisMoyenPondere(){ const v=totalPositionsValue(); return v>0 ? totalFraisAnnuels()/v : 0; }

/* ---------- calculs comptes (liste dynamique) ---------- */
function comptesByCat(cat){ return state.comptes.filter(c=>c.categorie===cat); }
function totalCash(){ return sum(comptesByCat("Cash").map(c=>c.solde)); }
function total3a(){ return sum(comptesByCat("3a").map(c=>c.solde)); }
function totalActifs(){ return totalCash()+total3a()+totalETF()+totalCrypto()+totalPhysique(); }
function totalDettes(){ return sum((state.dettes||[]).map(d=>d.solde)); }
function patrimoineTotal(){ return totalActifs()-totalDettes(); }
function detteInteretAnnuel(d){ return (Number(d.solde)||0) * (Number(d.taux)||0); }
function detteInteretMensuel(d){ return detteInteretAnnuel(d)/12; }
function detteProgression(d){
  const ci = Number(d.capitalInitial)||0;
  if(ci<=0) return null;
  const p = (ci-(Number(d.solde)||0))/ci;
  return Math.max(0, Math.min(1, p));
}
function detteDureeRestanteMois(d){
  const mensualite = Number(d.mensualite)||0;
  const solde = Number(d.solde)||0;
  if(solde<=0) return 0;
  if(mensualite<=0) return null;
  const im = detteInteretMensuel(d);
  if(mensualite<=im) return -1;
  const tm = (Number(d.taux)||0)/12;
  if(tm<=0){ return Math.ceil(solde/mensualite); }
  const ratio = 1-(solde*tm)/mensualite;
  if(!(ratio>0)) return -1;
  const n = -Math.log(ratio)/Math.log(1+tm);
  return Number.isFinite(n) ? Math.ceil(n) : null;
}
function totalInteretsAnnuelsDettes(){ return sum((state.dettes||[]).map(detteInteretAnnuel)); }
function detteDureeLabel(d){
  const duree = detteDureeRestanteMois(d);
  if(duree===null) return "—";
  if(duree===-1) return "Mensualité insuffisante (n'amortit pas le capital)";
  if(duree===0) return "Soldée";
  const ans = Math.floor(duree/12), mois = duree%12;
  if(ans>0) return `${ans} an${ans>1?'s':''}${mois>0?' '+mois+' mois':''}`;
  return `${mois} mois`;
}

/* ---------- calculs budget (dont projets dynamiques) ---------- */
function budgetRevenusTotal(){ return sum(state.budget.revenus.map(x=>x.montant)); }
function budgetFixesTotal(){ return sum(state.budget.fixes.map(x=>x.montant)); }
function budgetVariablesTotalSansProjets(){ return sum(state.budget.variables.map(x=>x.montant)); }
function budgetProjetsTotal(){ return sum((state.budget.projets||[]).map(x=>x.montant)); }
function budgetVariablesTotal(){ return budgetVariablesTotalSansProjets() + budgetProjetsTotal(); }
function budgetDepensesTotal(){ return budgetFixesTotal()+budgetVariablesTotal(); }
function budgetSurplus(){ return budgetRevenusTotal()-budgetDepensesTotal(); }
function tauxEpargne(){ return budgetRevenusTotal()>0 ? budgetSurplus()/budgetRevenusTotal() : 0; }

/* ---------- historique ---------- */
function historiqueMonthsSorted(){ return Object.keys(state.historique).sort(); }
function historiqueMonthsSortedDesc(){ return historiqueMonthsSorted().slice().reverse(); }
function lastHistoryMonth(){ const k=historiqueMonthsSorted(); return k.length?k[k.length-1]:null; }
function previousHistoryMonth(){ const k=historiqueMonthsSorted(); return k.length>=2?k[k.length-2]:null; }
function lastHistoryEntry(){ const m=lastHistoryMonth(); return m?state.historique[m]:null; }
function historyActifs(entry){ return (entry.cash||0)+(entry.pilier3a||0)+(entry.etf||0)+(entry.crypto||0)+(entry.physique||0); }
function historyTotal(entry){ return historyActifs(entry)-(entry.dettes||0); }
function firstMonthOfYear(year){ const ks=historiqueMonthsSorted().filter(k=>k.startsWith(String(year))); return ks.length?ks[0]:null; }

function projetsSnapshot(){
  const o={};
  (state.budget.projets||[]).forEach(p=>{ o[p.id]=p.montant; });
  return o;
}
function projetCumul(id){
  return sum(historiqueMonthsSorted().map(m=>(state.historique[m].projets||{})[id]||0));
}
function projetNomById(id){
  const p=(state.budget.projets||[]).find(x=>x.id===id);
  return p ? p.nom : id;
}
function allProjectIdsEverUsed(){
  const ids = new Set((state.budget.projets||[]).map(p=>p.id));
  historiqueMonthsSorted().forEach(m=>{
    Object.keys(state.historique[m].projets||{}).forEach(id=>ids.add(id));
  });
  return [...ids];
}
function closeMonth(monthKey){
  state.historique[monthKey] = {
    cash: totalCash(), pilier3a: total3a(), etf: totalETF(), crypto: totalCrypto(), physique: totalPhysique(),
    dettes: totalDettes(), projets: projetsSnapshot(), revenus: budgetRevenusTotal(), depenses: budgetDepensesTotal()
  };
}
function deleteMonth(monthKey){ delete state.historique[monthKey]; }
function purgeProjectFromHistory(pid){
  historiqueMonthsSorted().forEach(m=>{
    if(state.historique[m].projets) delete state.historique[m].projets[pid];
  });
}

/* ---------- objectifs ---------- */
function fondsUrgenceCible(){ return state.params.moisFondsUrgence * budgetFixesTotal(); }
function fondsUrgenceActuel(){ return totalCash(); }
function fondsUrgenceProgress(){ const c=fondsUrgenceCible(); return c>0?Math.min(fondsUrgenceActuel()/c,1):0; }

// Solde 3a au 1er janvier de l'année fiscale : clôture "<année-1>-12" de l'historique si elle existe,
// sinon valeur saisie manuellement dans state.pilier3aSoldeDebutAnnee["<année>"].
function pilier3aSoldeDebutAnneeInfo(){
  const year = Number(state.params.anneeFiscale);
  const key = (year-1)+"-12";
  const h = state.historique ? state.historique[key] : null;
  if(h && h.pilier3a!==undefined && h.pilier3a!==null && h.pilier3a!=="" && !isNaN(Number(h.pilier3a))){
    return {valeur:Number(h.pilier3a), source:"cloture", key, year};
  }
  const m = state.pilier3aSoldeDebutAnnee || {};
  const v = m[String(year)];
  if(!(v===undefined || v===null || v==="" || isNaN(Number(v)))) return {valeur:Number(v), source:"manuel", key, year};
  // Repli : première clôture disponible de l'année fiscale (ex. janvier).
  const firstKey = Object.keys(state.historique||{}).filter(k=>k.slice(0,4)===String(year)).sort()[0];
  if(firstKey){
    const hf = state.historique[firstKey];
    if(hf && hf.pilier3a!==undefined && hf.pilier3a!==null && hf.pilier3a!=="" && !isNaN(Number(hf.pilier3a))){
      return {valeur:Number(hf.pilier3a), source:"premier", key:firstKey, year};
    }
  }
  return {valeur:null, source:"manquant", key, year};
}
// Variation brute (peut être négative) ; null si le solde au 1er janvier est inconnu.
function pilier3aVariationAnnee(){
  const info = pilier3aSoldeDebutAnneeInfo();
  return info.valeur===null ? null : total3a()-info.valeur;
}
function pilier3aVerseCetteAnnee(){
  // = solde 3a actuel − solde au 1er janvier (jamais négatif). Le journal pilier3aVersements
  // est purement informatif et n'entre plus dans le calcul (évite tout double comptage).
  // NB : sur un 3a investi, la variation inclut aussi la performance des marchés.
  const d = pilier3aVariationAnnee();
  return d===null ? 0 : Math.max(0, d);
}
// Objectif personnel : actuel = somme du journal de versements (repli sur l'ancien champ "actuel" si absent).
function objectifActuel(o){
  if(Array.isArray(o.versements)) return sum(o.versements.map(v=>v.montant));
  return Number(o.actuel)||0;
}
function pilier3aProgress(){ const c=state.params.plafond3aAvec2P; return c>0?Math.min(pilier3aVerseCetteAnnee()/c,1):0; }

/* ---------- chômage ---------- */
function chomageMensuel(){ return Math.min(budgetRevenusTotal()*state.chomage.tauxIndemnite, state.chomage.plafondLACI); }
function chomageEcart(){ return chomageMensuel()-budgetRevenusTotal(); }
function chomageResteVivreActuel(){ return budgetRevenusTotal()-budgetDepensesTotal(); }
function chomageResteVivreChomage(){ return chomageMensuel()-budgetDepensesTotal(); }
function chomageMoisSurvieSansRevenu(){ const c=budgetDepensesTotal(); return c>0?totalCash()/c:0; }
function chomageMoisSurvieAvecChomage(){ const r=chomageResteVivreChomage(); if(r>=0) return Infinity; return totalCash()/(-r); }

/* ---------- projections ---------- */
function tauxPondere(){
  // Rendement pondéré par l'ALLOCATION RÉELLE ACTUELLE (pas la règle de surplus) :
  // le patrimoine déjà en poche croît selon ce qu'il est vraiment aujourd'hui (ex: cash qui dort à 0,5%),
  // pas selon la stratégie appliquée aux futurs versements. Le physique n'a pas de rendement attendu (0%).
  const rd = state.params.rendements;
  const actifs = totalActifs();
  if(actifs<=0) return 0;
  return (totalCash()*rd.cash + total3a()*rd.pilier3a + totalETF()*rd.etf + totalCrypto()*rd.crypto) / actifs;
}
function tauxPondereNetDeFrais(){ return tauxPondere()-fraisMoyenPondere(); }
function fvCompound(rate, years, annualContribution, presentValue){
  if(rate===0) return presentValue+annualContribution*years;
  const g=Math.pow(1+rate, years);
  return presentValue*g + annualContribution*(g-1)/rate;
}
function projectionSeriesAtRate(years, rate){
  const annual=budgetSurplus()*12, pv=patrimoineTotal();
  const out=[{annee:0,valeur:pv}];
  for(let y=1;y<=years;y++) out.push({annee:y, valeur: fvCompound(rate,y,annual,pv)});
  return out;
}
function projectionSeries(years){ return projectionSeriesAtRate(years, tauxPondere()); }
function projectionBand(years){
  return {
    pessimiste: projectionSeriesAtRate(years, 0.03),
    median: projectionSeriesAtRate(years, tauxPondere()),
    optimiste: projectionSeriesAtRate(years, 0.10),
  };
}
let state = null;
function migrateV1(parsed){
  // v1 : comptes = {cash, pilier3a} -> v2 : comptes = [{id,nom,categorie,solde}]
  if(parsed.comptes && !Array.isArray(parsed.comptes)){
    const c = parsed.comptes;
    parsed.comptes = [];
    if(c.cash!==undefined) parsed.comptes.push({id:"cc", nom:"Compte courant / épargne", categorie:"Cash", solde:c.cash});
    if(c.pilier3a!==undefined) parsed.comptes.push({id:"p3a", nom:"3a Pilier", categorie:"3a", solde:c.pilier3a});
  }
  // v1 : positions = {quantite,prixUnitaire,coutInvesti} -> v2 : {prixActuel, achats:[...]}
  if(Array.isArray(parsed.positions)){
    parsed.positions = parsed.positions.map(p=>{
      if(p.achats) return p; // déjà au nouveau format
      const np = {id:p.id, nom:p.nom, categorie:p.categorie, prixActuel:p.prixUnitaire||0, valeurManuelle:p.valeurManuelle||0, achats:[]};
      if(p.quantite>0){
        const prixPaye = p.coutInvesti>0 ? p.coutInvesti/p.quantite : (p.prixUnitaire||0);
        np.achats = [{date:"", quantite:p.quantite, prixPaye}];
      }
      return np;
    });
  }
  // Crypto : ancien format achats = {quantite, prixPaye} où prixPaye était en réalité
  // le MONTANT TOTAL payé pour le lot (jamais un prix unitaire — l'utilisateur a toujours saisi
  // le montant total). Migration -> {quantite, montantPaye} : montantPaye = ancien prixPaye
  // (copie directe, PAS de multiplication). Le prixUnitaire (montantPaye/quantite) est
  // ensuite calculé à l'affichage, jamais stocké. Spécifique à ce fichier personnel.
  if(Array.isArray(parsed.positions)){
    parsed.positions.forEach(p=>{
      if(p.categorie==="Crypto" && Array.isArray(p.achats)){
        p.achats.forEach(a=>{
          if(a.montantPaye===undefined && a.prixPaye!==undefined){
            a.montantPaye = a.prixPaye;
            delete a.prixPaye;
          }
        });
      }
      // valeurs par défaut : achats/ventes toujours présents comme tableaux
      if(!Array.isArray(p.achats)) p.achats = [];
      if(!Array.isArray(p.ventes)) p.ventes = [];
    });
  }
  // v1 : budget.sentinelleMoisCourant -> v2 : budget.projets [{id:'sentinelle',...}]
  if(parsed.budget && parsed.budget.sentinelleMoisCourant!==undefined && !parsed.budget.projets){
    parsed.budget.projets = [{id:"sentinelle", nom:"Sentinelle", montant:parsed.budget.sentinelleMoisCourant}];
    delete parsed.budget.sentinelleMoisCourant;
  }
  // v1 : historique[m].sentinelle (nombre) -> v2 : historique[m].projets {sentinelle:valeur}
  if(parsed.historique){
    Object.keys(parsed.historique).forEach(m=>{
      const e = parsed.historique[m];
      if(e.sentinelle!==undefined && !e.projets){
        e.projets = {sentinelle: e.sentinelle};
        delete e.sentinelle;
      }
      if(!e.projets) e.projets = {};
    });
  }
  return parsed;
}
// Objectifs personnels (hors "fi") : journal de versements + localisation.
// Migration : un ancien "actuel" numérique > 0 sans journal devient un versement unique "reprise".
function normalizeObjectif(o){
  if(!o || o.id==="fi") return o;
  const no = Object.assign({localisation:""}, o);
  if(!Array.isArray(no.versements)){
    const a = Number(no.actuel)||0;
    no.versements = a>0 ? [{date:"reprise", montant:a}] : [];
  }
  return no;
}
function mergeDefaults(parsed){
  parsed = migrateV1(parsed);
  const def = defaultState();
  const merged = Object.assign({}, def, parsed, {
    params: Object.assign({}, def.params, parsed.params, {
      rendements: Object.assign({}, def.params.rendements, parsed.params && parsed.params.rendements),
      cibles: Object.assign({}, def.params.cibles, parsed.params && parsed.params.cibles),
      reglesurplus: Object.assign({}, def.params.reglesurplus, parsed.params && parsed.params.reglesurplus),
    }),
    comptes: Array.isArray(parsed.comptes) ? parsed.comptes : def.comptes,
    positions: (Array.isArray(parsed.positions) ? parsed.positions : def.positions).map(p=>{
      const np = Object.assign({fraisTER:0, achats:[], ventes:[], ticker:""}, p);
      if(np.categorie!=="Crypto"){
        np.achats = (np.achats||[]).map(a=>Object.assign({frais:0}, a));
        np.ventes = (np.ventes||[]).map(v=>Object.assign({frais:0}, v));
      }
      return np;
    }),
    objectifs: (Array.isArray(parsed.objectifs) ? parsed.objectifs : def.objectifs).map(normalizeObjectif),
    pilier3aSoldeDebutAnnee: (parsed.pilier3aSoldeDebutAnnee && typeof parsed.pilier3aSoldeDebutAnnee==="object" && !Array.isArray(parsed.pilier3aSoldeDebutAnnee))
      ? parsed.pilier3aSoldeDebutAnnee : {},
    dettes: (Array.isArray(parsed.dettes) ? parsed.dettes : def.dettes).map(d=>Object.assign({type:"Autre", capitalInitial:0, mensualite:0}, d)),
    pilier3aVersements: Array.isArray(parsed.pilier3aVersements) ? parsed.pilier3aVersements : def.pilier3aVersements,
    assurances: Array.isArray(parsed.assurances) ? parsed.assurances : def.assurances,
    budget: Object.assign({}, def.budget, parsed.budget, {
      projets: (parsed.budget && Array.isArray(parsed.budget.projets)) ? parsed.budget.projets : def.budget.projets
    }),
    chomage: Object.assign({}, def.chomage, parsed.chomage),
    pilotageETF: Object.assign({}, def.pilotageETF, parsed.pilotageETF, {
      target: Object.assign({}, def.pilotageETF.target, parsed.pilotageETF && parsed.pilotageETF.target),
      monthlyBudget: (parsed.pilotageETF && typeof parsed.pilotageETF.monthlyBudget === "number")
        ? parsed.pilotageETF.monthlyBudget
        : computeDefaultMonthlyBudget(Object.assign({}, def.budget, parsed.budget)),
      notesPerso: (parsed.pilotageETF && typeof parsed.pilotageETF.notesPerso === "string")
        ? parsed.pilotageETF.notesPerso
        : def.pilotageETF.notesPerso,
    }),
  });
  return merged;
}
function computeDefaultMonthlyBudget(budgetObj){
  const rev = sum((budgetObj.revenus||[]).map(x=>x.montant));
  const fixes = sum((budgetObj.fixes||[]).map(x=>x.montant));
  const vars = sum((budgetObj.variables||[]).map(x=>x.montant)) + sum((budgetObj.projets||[]).map(x=>x.montant));
  return rev - (fixes + vars);
}
