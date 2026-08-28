PHENIX V36.1 - correctif urgent

Corrections :
- bouton Modifier des équipages réparé avec identifiants data-id robustes ;
- création/modification/suppression des indicatifs et natures réparée ;
- fenêtre + des listes affichée correctement ;
- archive "Tous les événements enregistrés" ajoutée sous le calendrier ;
- sauvegarde atomique de data.json + data.backup.json ;
- récupération automatique des événements depuis data.backup.json si la liste courante est vide ;
- la base n'est plus réinitialisée silencieusement si data.json est illisible.

Déploiement : server.js, package.json et public/index.html.
IMPORTANT : ne supprimez pas /var/data/data.json sur Render.
