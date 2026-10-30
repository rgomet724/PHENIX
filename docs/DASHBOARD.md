# Dashboard · Vie du service

Adresse : `/dashboard/` (ou `/dashboard`, redirigé vers la même page).

## Accès et rôles

Le Dashboard possède son propre écran de connexion et une autorisation distincte dans **Administration centrale → Accès et rôles → Dashboard · Vie du service**. Il utilise les comptes professionnels existants et la session commune, sans exiger que l’accès PHENIX ou ARGOS soit activé.

- Les administrateurs disposent de l’accès par défaut.
- Les autres profils doivent être autorisés dans l’administration centrale.
- Les administrateurs et superviseurs peuvent modifier si leur rôle Dashboard est également administrateur ou superviseur.
- Les opérateurs et profils de consultation peuvent lire uniquement. Un opérateur reste en lecture seule même si un rôle Dashboard plus élevé lui est attribué par erreur.
- La désactivation de l’accès s’applique aux sessions déjà ouvertes ainsi qu’aux photos.

Une tuile Dashboard est ajoutée au portail ARGOS ; elle est filtrée selon le droit Dashboard de chaque utilisateur.

Le lien **Renouveler mon mot de passe** de l’écran de connexion permet de changer le mot de passe commun en fournissant l’ancien, même si l’accès PHENIX est désactivé. La politique de mot de passe de l’administration centrale s’applique également ici.

## Composer la page

**Personnaliser** ouvre le mode édition. Les modifications de la page restent privées à l’éditeur jusqu’au bouton **Enregistrer** ; **Annuler** abandonne ces modifications.

Types de blocs : publications de la vie du service, réunions, texte libre, photos/affiches et liens utiles. Les blocs se déplacent par leur poignée ou leurs flèches, se dupliquent, se masquent ou se suppriment. Les propriétés permettent de choisir leur largeur, leur hauteur minimale, leur fond et leur couleur de texte. Les blocs de texte disposent aussi de taille, alignement, gras et italique. Sur téléphone, les blocs s’affichent verticalement.

L’apparence générale permet de modifier le titre, le sous-titre, les couleurs, la police, le logo et l’image de fond. Les paramètres d’apparence de l’administration centrale servent de valeurs initiales.

L’encart **Astreinte direction** permet de modifier le libellé, le responsable, le téléphone et les précisions. Il suit le même enregistrement que la page.

## Publications et réunions

Les publications sont partagées dès le bouton **Publier** ou **Enregistrer la publication**. Elles sont indépendantes des modifications non enregistrées de la mise en page. Elles acceptent un titre, du texte, une photo et une épingle « À la une ». Le serveur renseigne l’auteur et la date ; une modification conserve l’auteur d’origine et ajoute l’identité du dernier éditeur.

Les réunions indiquent titre, début, fin facultative, lieu, ordre du jour et lien facultatif. Les heures sont saisies et affichées en **Europe/Paris**, enregistrées en UTC et exportables en fichier calendrier `.ics`. Elles deviennent visibles lors de l’enregistrement de la page.

**Vue écran** masque les commandes, tente d’activer le plein écran et fait défiler les publications. La page en consultation se rafraîchit toutes les 30 secondes. La fréquence de défilement est personnalisable.

## Stockage et protections

- `dashboard.json` et `dashboard.json.backup` : contenus, mise en page, auteurs, version et historique interne des modifications.
- `dashboard-media/` : photos privées, servies après contrôle du droit Dashboard.
- Répertoire : `DASHBOARD_DATA_DIR`, sinon `PORTAL_DATA_DIR`, sinon le dossier de `PHENIX_DATA_FILE` (par défaut `/var/data`). Ce répertoire doit être sur le stockage persistant en production.
- Photos JPEG, PNG et WebP uniquement, 2 Mo maximum après optimisation côté navigateur. Pas de SVG. Quota de 1 000 fichiers ou 200 Mo. Les médias ne sont pas supprimés automatiquement du stockage lorsqu’un bloc ou une publication est retiré ; leur conservation doit être incluse dans la politique d’exploitation et de sauvegarde.
- Maximum : 60 blocs, 100 éléments par bloc de réunions/liens et 500 publications.
- Aucune exécution de HTML saisi dans les textes ; les liens autorisent seulement les protocoles HTTP/HTTPS et les chemins internes.
- Contrôles d’origine, jetons anti-CSRF, limitation des requêtes et contrôle des rôles côté serveur.
- Chaque modification vérifie la version courante. En cas de conflit, la page de l’autre éditeur n’est pas écrasée ; l’interface propose de télécharger le brouillon puis de recharger.
- Une base illisible déclenche une erreur sans réinitialisation silencieuse.

## Vérification

`npm run test:dashboard` vérifie notamment les accès indépendants, les rôles, la révocation, les photos privées, l’attribution des publications, la validation des liens, les conflits et la persistance.

Les tests d’intégration existants vérifient également le raccordement au serveur, au catalogue des droits et au portail ARGOS.
