PHENIX + PORTAIL PM CHALON — INSTALLATION SIMPLE
================================================

OBJECTIF
- https://pegase-2.onrender.com/          -> PHENIX
- https://pegase-2.onrender.com/portail/ -> Portail d'accès
- La tuile PHENIX du portail ouvre automatiquement la racine /.

FICHIERS À ENVOYER SUR GITHUB
1. server.js                 (remplace l'actuel)
2. package.json              (remplace l'actuel)
3. portal-router.js          (nouveau fichier à la racine)
4. public/index.html         (restaure PHENIX)
5. tout le dossier portail/  (nouveau dossier)
6. data/.gitkeep             (facultatif, le dossier PHENIX utilise surtout /var/data sur Render)

IMPORTANT
- NE SUPPRIME PAS les images et fichiers déjà présents dans public/ : PHENIX les utilise.
- L'ancien public/app.js et public/styles.css peuvent rester : le PHENIX fourni ici ne les charge pas.
- Sur Render, garde Build Command = npm install et Start Command = npm start.

VARIABLES RENDER POUR LE PORTAIL
- PORTAL_ADMIN_LOGIN
- PORTAL_ADMIN_PASSWORD
- SESSION_SECRET (32 caractères minimum)

Les variables existantes de PHENIX, dont STREAMDECK_SECRET si utilisé, peuvent rester.

APRÈS LE DÉPLOIEMENT
1. Tester PHENIX : / 
2. Tester le portail : /portail/
3. Diagnostic portail : /portail/api/healthz
4. Se connecter au portail avec PORTAL_ADMIN_LOGIN / PORTAL_ADMIN_PASSWORD.

STOCKAGE
- PHENIX continue d'utiliser /var/data/data.json et /var/data/sessions.
- Le portail utilise /var/data/portal.json.
- Les deux bases sont séparées.
