PHENIX V27 - MESSAGERIE POUR TOUS

Corrections :
- messagerie disponible pour TOUS les utilisateurs, y compris Dashboard
- les comptes Dashboard peuvent recevoir, lire et envoyer des messages
- tous les utilisateurs peuvent être choisis dans « Nouvelle discussion sécurisée »
- la Discussion générale est restaurée et toujours visible
- la Discussion générale envoie le message à tous les utilisateurs, Dashboard inclus
- la Discussion générale ne peut plus être supprimée
- corbeille conservée uniquement pour les discussions privées
- aucun rôle/droit d'accès affiché à côté des noms
- notifications sonores et notifications bureau conservées

Fichiers à remplacer :
- server.js
- public/index.html

Aucune nouvelle variable Render.
SESSION_SECRET reste obligatoire.
