PORTAIL POLICE MUNICIPALE CHALON-SUR-SAÔNE — V1

Déploiement Render :
1. Créez un nouveau Web Service Node.js.
2. Build command : npm install
3. Start command : npm start
4. Ajoutez un Persistent Disk monté sur /var/data.
5. Variables d'environnement obligatoires :
   SESSION_SECRET = chaîne aléatoire d'au moins 32 caractères
   PORTAL_ADMIN_LOGIN = votre identifiant administrateur
   PORTAL_ADMIN_PASSWORD = votre mot de passe initial (12 caractères minimum conseillé)
6. Après le premier démarrage, connectez-vous avec le compte admin.
7. Administration > Applications : remplacez le lien PHENIX d'exemple par votre vrai lien Render PHENIX.

Fonctions :
- vraie page de connexion
- comptes utilisateurs
- rôle admin
- catégories modifiables
- applications/liens modifiables
- upload d'un logo par application
- ordre des catégories et applications
- ouverture des applications dans un nouvel onglet
- identité Police Municipale Chalon-sur-Saône
