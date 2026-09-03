PORTAIL POLICE MUNICIPALE CHALON-SUR-SAÔNE — V2
================================================

Cette V2 est reconstruite proprement pour Render.
Le site PHENIX existant peut rester sur son service actuel : le portail est prévu comme un Web Service séparé qui contient ensuite un lien vers PHENIX.

FONCTIONS
---------
- page de connexion professionnelle
- compte administrateur principal défini directement dans Render
- comptes utilisateurs supplémentaires créés depuis l'administration
- rôles Utilisateur / Administrateur
- catégories modifiables et ordonnées
- applications/liens modifiables et ordonnés
- logo facultatif par application, stocké avec la configuration
- applications ouvertes dans un nouvel onglet
- interface responsive inspirée de l'organisation visuelle d'un portail SSO
- authentification par jeton signé : cookie sécurisé + secours Authorization Bearer
- aucune dépendance npm externe et aucun express-session
- le compte admin Render reste utilisable même si le fichier de données a été remis à zéro

DÉPLOIEMENT RENDER
------------------
1. Décompresser le ZIP et mettre SON CONTENU à la racine d'un dépôt GitHub.
   À la racine on doit voir : server.js, package.json, public/.

2. Créer ou utiliser un Web Service Node.js Render pour LE PORTAIL.

3. Réglages :
   Build Command : npm install
   Start Command : npm start
   Root Directory : laisser vide

4. Variables d'environnement obligatoires :
   PORTAL_ADMIN_LOGIN = admin
   PORTAL_ADMIN_PASSWORD = votre mot de passe administrateur
   SESSION_SECRET = une valeur aléatoire d'au moins 32 caractères

   Variable facultative :
   PORTAL_ADMIN_NAME = Administrateur

5. STOCKAGE DES MODIFICATIONS
   Pour conserver utilisateurs, catégories, applications et logos après les redéploiements, montez un Persistent Disk Render sur /var/data puis ajoutez :
   DATA_DIR = /var/data

   Sans Persistent Disk, le portail fonctionne et le compte admin Render fonctionne toujours, mais les modifications enregistrées dans le portail peuvent être perdues lors d'un redéploiement/redémarrage de l'instance.

6. Après déploiement, vérifiez :
   https://VOTRE-PORTAIL.onrender.com/healthz

   Résultat attendu :
   ok: true
   version: 2.0.0
   adminConfigured: true
   sessionSecretConfigured: true

7. Connectez-vous avec PORTAL_ADMIN_LOGIN / PORTAL_ADMIN_PASSWORD.

8. Administration > Applications : modifiez la tuile PHENIX avec l'URL de votre site Render existant.

IMPORTANT
---------
Ne mettez jamais vos mots de passe ou secrets dans GitHub, dans le code ou dans une capture d'écran publique.
Si un secret a déjà été affiché dans une capture, remplacez-le dans Render.
