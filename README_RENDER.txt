PORTAIL PM CHALON - CORRECTION CONNEXION RENDER

Réglages Render :
- Build Command : npm install
- Start Command : npm start
- Root Directory : vide

Variables obligatoires :
- PORTAL_ADMIN_LOGIN=admin (ou votre identifiant)
- PORTAL_ADMIN_PASSWORD=votre mot de passe exact
- SESSION_SECRET=une chaîne d'au moins 32 caractères

Cette version :
- authentifie l'administrateur directement avec les variables Render ;
- ne dépend plus d'un ancien hash admin stocké sur disque pour la connexion ;
- régénère et sauvegarde explicitement la session avant de répondre ;
- force la configuration cookie/proxy adaptée à HTTPS sur Render ;
- utilise un nouveau cookie pm_portal_sid_v2 afin d'éviter les anciens cookies invalides ;
- écrit dans les logs Render les connexions réussies/échouées sans afficher le mot de passe.

Après déploiement, ouvrez le site dans une nouvelle fenêtre privée ou rechargez complètement la page.
