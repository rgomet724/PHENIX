# Administration centrale ARGOS / PHENIX

Ce patch ajoute une véritable page d’administration commune à PHENIX, au portail ARGOS, à ATLAS et aux Arrêtés municipaux.

## Ce que le patch ajoute

- accès strictement réservé aux administrateurs PHENIX et au compte administrateur Render de secours ;
- page « Accès refusé » pour les autres utilisateurs ;
- création, modification et suppression des comptes ;
- modification du nom, de l’identifiant, du rôle et du mot de passe ;
- longueur minimale du mot de passe réglable de 4 à 32 caractères (6 par défaut) ;
- accès et rôle distincts pour PHENIX, ARGOS, ATLAS et Arrêtés ;
- affichage ou masquage de chaque tuile ARGOS par utilisateur ;
- gestion des applications, catégories, liens, logos, couleurs et ordre d’affichage ;
- personnalisation du titre, sous-titre, logo, fond, couleurs et icône d’onglet de chaque application ;
- historique commun : administration, PHENIX, ATLAS et Arrêtés ;
- navigation des tuiles dans la même fenêtre afin d’éviter la multiplication des fenêtres Web App.

Les comptes et les données existantes ne sont pas supprimés. Les nouveaux réglages sont enregistrés sur le disque Render dans `/var/data/admin-center.json`.

## Installation sur GitHub

1. Décompresser le ZIP sur l’ordinateur.
2. Ouvrir le dépôt GitHub `rgomet724/PHENIX` et rester à la racine.
3. Cliquer sur **Add file**, puis **Upload files**.
4. Faire glisser tout le contenu du dossier décompressé `PATCH_ADMINISTRATION_CENTRALE` dans la page GitHub.
5. Vérifier que GitHub affiche bien les chemins indiqués ci-dessous et ne les a pas tous placés à la racine.
6. Cliquer sur **Commit changes**.
7. Attendre le déploiement automatique Render. S’il ne démarre pas, ouvrir `PEGASE-2`, puis **Manual Deploy** → **Deploy latest commit**.

Ne pas supprimer les autres fichiers déjà présents dans `public`, `portail` ou `portail/atlas`.

## Emplacement exact des fichiers

À la racine du dépôt, remplacer :

- `server.js`
- `portal-router.js`
- `atlas-router.js`
- `arretes-router.js`

À la racine du dépôt, ajouter :

- `admin-router.js`
- `central-config.js`

Dans `portail`, remplacer :

- `portail/index.html`
- `portail/app.js`

Dans `portail`, ajouter le dossier complet :

- `portail/administration/index.html`
- `portail/administration/app.js`
- `portail/administration/styles.css`
- `portail/administration/access-denied.html`

Dans `portail/atlas`, remplacer :

- `portail/atlas/app.js`

Dans `public`, remplacer ou ajouter :

- remplacer `public/index.html`
- ajouter `public/admin-theme.js`

Il n’y a aucun changement à faire dans `package.json`, `package-lock.json` ou les variables Render.

## Vérification après déploiement

1. Ouvrir `https://pegase-2.onrender.com/` et se connecter avec un compte PHENIX administrateur.
2. Cliquer sur **Administration centrale**, ou ouvrir directement :
   `https://pegase-2.onrender.com/portail/administration/`
3. Vérifier les onglets : Utilisateurs, Accès et rôles, Applications, Apparence, Historique et Sécurité.
4. Ouvrir la même adresse avec un compte non administrateur : la page doit afficher **Accès refusé**.

Si une ancienne version reste affichée, effectuer `Ctrl + F5` une fois après le déploiement.

## Premier réglage conseillé

Dans **Sécurité**, choisir le nombre minimal de caractères souhaité. La valeur par défaut est 6 et la valeur minimale autorisée est 4.

Dans **Accès et rôles**, sélectionner ensuite chaque utilisateur et régler séparément ses droits PHENIX, ARGOS, ATLAS et Arrêtés.
