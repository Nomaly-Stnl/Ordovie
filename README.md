# Ordovie

Application personnelle (PWA) de gestion financière et administrative d'un foyer suisse :
finances, contrats, assurances, documents.

- Fonctionne hors ligne, installable depuis Chrome (« Installer l'application »).
- **Aucune donnée personnelle dans ce dépôt** : tout reste sur l'appareil, sauvegardes chiffrées hors dépôt.
- La clé API Claude se saisit dans Paramètres et reste sur l'appareil.

## Développement

Fichiers statiques, aucun build : `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.json`.
À chaque publication, incrémenter `VERSION` dans `sw.js` et `APP_VERSION` dans `app.js`
pour que les téléphones proposent la mise à jour.
