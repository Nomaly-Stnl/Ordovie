// Ordovie — situations typiques où un contrat peut servir (ou faire économiser), par type.
// Chaque situation ouvre l'assistant avec la question pré-remplie, vérifiée sur TA police.
"use strict";

const ASTUCES = {
  "Assurance maladie (LAMal)": [
    ["Exclure la couverture accidents", "Si tu travailles au moins 8 h par semaine chez un employeur, tu es déjà assuré contre les accidents par lui (LAA) : la couverture accidents de la LAMal peut être suspendue, ce qui baisse la prime."],
    ["Franchise et modèle d'assurance", "Une franchise plus élevée ou un modèle médecin de famille / télémédecine réduisent la prime. Intéressant si tu vas peu chez le médecin."],
    ["Prestations souvent oubliées", "Certains examens de prévention, vaccins et la maternité sont pris en charge par l'assurance de base."],
  ],
  "Complémentaire (LCA)": [
    ["Lunettes et lentilles", "L'assurance de base ne rembourse plus les lunettes des adultes ; beaucoup de complémentaires participent chaque année ou tous les quelques ans."],
    ["Sport, fitness, prévention", "Participation fréquente à un abonnement de fitness, à des cours de sport ou de prévention."],
    ["Médecines complémentaires", "Ostéopathie, physiothérapie au-delà de la base, naturopathie : souvent partiellement remboursées."],
    ["Voyage et urgences à l'étranger", "Frais de traitement au-delà des tarifs suisses, rapatriement, recherche et sauvetage."],
  ],
  "RC / ménage": [
    ["Tu abîmes le bien de quelqu'un", "Verre renversé sur l'ordinateur d'un ami, dégât chez quelqu'un : c'est le rôle de la responsabilité civile."],
    ["Dégâts en quittant ton logement", "Dégâts causés au logement loué (pas l'usure normale) : la RC peut couvrir une partie de ce que la régie réclame."],
    ["Vol hors de chez toi", "Vélo volé, bagages ou sac volés en voyage : souvent couverts avec l'option « vol simple à l'extérieur »."],
    ["Dégâts d'eau, incendie, bris de glace", "Fuite, inondation, plaque vitrocéramique cassée, vitre brisée : selon les options choisies."],
  ],
  "Véhicule": [
    ["Pare-brise abîmé", "L'option bris de glace couvre souvent la réparation ou le remplacement, parfois sans franchise et sans perte de bonus."],
    ["Martre, animal, grêle", "Câbles rongés par une martre, collision avec un animal, grêle : couverts par la casco partielle."],
    ["Panne et voiture de remplacement", "Dépannage, remorquage, véhicule de remplacement : à vérifier selon les options."],
  ],
  "Protection juridique": [
    ["Litige avec le bailleur", "Caution non rendue, défauts du logement, contestation d'une hausse de loyer."],
    ["Litige avec l'employeur", "Salaire impayé, licenciement contesté, certificat de travail."],
    ["Achat qui tourne mal", "Produit défectueux, garantie refusée, commande en ligne jamais livrée."],
    ["Circulation routière", "Contestation d'une amende ou d'un retrait de permis, accident avec un tiers."],
  ],
  "Assurance vie / 3b": [
    ["Ce que vaut ton contrat", "Valeur de rachat actuelle, ce qu'un rachat anticipé ferait perdre, couverture décès et invalidité."],
    ["Aspect fiscal", "Traitement des primes et de la prestation selon ton canton."],
  ],
  "Bail / logement": [
    ["Baisse du taux de référence", "Quand le taux hypothécaire de référence baisse, tu peux demander une baisse de loyer."],
    ["Défauts du logement", "Un défaut non réparé (chauffage, humidité, bruit) peut justifier une réduction de loyer."],
    ["Départ anticipé", "Conditions pour quitter avant le terme : locataire de remplacement, délais."],
  ],
  "Téléphone / internet": [["Résilier ou renégocier", "Fin d'engagement, frais de résiliation, offre concurrente moins chère."]],
  "Abonnement": [["Encore utile ?", "Coût annuel réel et conditions de résiliation."]],
};

function astucesHtml(c) {
  const list = ASTUCES[c.type] || [];
  if (!list.length) return "";
  const ai = typeof aiReady === "function" && aiReady();
  return `<div class="card"><div class="c-title">Situations où ce contrat peut servir</div>
    ${list.map(([t, h], k) => `<div class="obj astuce"><div><strong>${esc(t)}</strong><div class="r-sub">${esc(h)}</div></div>
      ${ai && editIdx !== -1 ? `<button class="btn sm" data-astuce="${k}">Vérifier</button>` : ""}</div>`).join("")}
    <p class="muted small">Pistes générales : ce qui s'applique vraiment dépend de ta police${ai ? " — « Vérifier » pose la question à l'assistant sur ton contrat" : " (ajoute ta clé API pour vérifier avec l'assistant)"}.</p></div>`;
}

function askPrefilled(scopeId, question) {
  openAssistant(scopeId);
  const i = document.getElementById("chat-input"); if (i) { i.value = question; i.focus(); }
}

$("#screen").addEventListener("click", (e) => {
  const t = e.target.closest("[data-astuce],#btn-analyse-contrats"); if (!t) return;
  if (t.id === "btn-analyse-contrats" && current === "contrats") {
    askPrefilled(null, "Passe en revue tous mes contrats : quelles prestations j'oublie probablement d'utiliser, est-ce qu'il y a des doublons (je paie deux fois la même couverture), des trous de couverture importants, et où je pourrais économiser ? Classe par priorité.");
  } else if (t.dataset.astuce !== undefined && current === "contrat-edit" && draftC) {
    const [titre, aide] = (ASTUCES[draftC.type] || [])[Number(t.dataset.astuce)] || [];
    askPrefilled(draftC.id, `Situation : « ${titre} » (${aide}) Est-ce que mon contrat couvre ou permet cela ? Cite l'article, indique les conditions, la franchise et la démarche.`);
  }
});
