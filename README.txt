PHENIX V36.2 - Correctif Dashboard + restauration Événements

- Dashboard : conserve le nom de l'utilisateur, le bouton Rafraîchir et le bouton Déconnexion.
- Événements : calendrier restauré comme dans la version V35 (Mois / Semaine / Aujourd'hui / Nouvel événement).
- Données : recherche automatique d'anciens événements dans plusieurs générations de sauvegardes /var/data.
- Sauvegardes : rotation sur data.backup.json, data.backup2.json et data.backup3.json.

Déploiement : remplacer public/index.html, server.js et package.json.
Ne supprimez pas /var/data/data.json ni les fichiers data.backup*.json sur Render.
