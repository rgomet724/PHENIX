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

Cette tuile et celle de SYRIUS sont également présentes dans **Administration centrale → Applications** et dans la liste des autorisations des tuiles ARGOS. Leur nom, catégorie, lien, logo, couleur et ordre sont modifiables comme les autres tuiles. Le portail et les deux panneaux d’administration partagent le même catalogue et le même répertoire de données. La migration du catalogue rétablit une seule fois les rubriques par défaut manquantes, dont « Outils et applications », puis conserve les suppressions et personnalisations. La suppression d’une tuile ne supprime pas l’application ni ses données.

Le lien **Renouveler mon mot de passe** de l’écran de connexion permet de changer le mot de passe commun en fournissant l’ancien, même si l’accès PHENIX est désactivé. La politique de mot de passe de l’administration centrale s’applique également ici.

## Composer la page

**Personnaliser** ouvre le mode édition. Les modifications de la page restent privées à l’éditeur jusqu’au bouton **Enregistrer** ; **Annuler** abandonne ces modifications.

**Gérer les pages** permet d’ajouter, renommer, dupliquer, réordonner et retirer des pages. En consultation, les pages changent automatiquement toutes les **60 secondes**, également en vue écran. Les boutons précédent/suivant et les onglets permettent de choisir une page ; **Pause** suspend le défilement localement. L’édition et les fenêtres ouvertes suspendent aussi la rotation. La suppression d’une page déplace ses blocs vers une autre page afin de conserver le contenu.

Types de blocs : astreinte direction, publications de la vie du service, réunions, texte libre, photos/affiches et liens utiles. Les blocs se déplacent par leur poignée ou leurs flèches, se dupliquent, se masquent ou se suppriment. La propriété **Page** déplace un bloc entre les pages. Les propriétés permettent aussi de choisir la largeur, la hauteur, le fond et la couleur du texte. **Hauteur fixe** empêche le contenu d’agrandir le bloc ; le contenu supplémentaire reste accessible par défilement à l’intérieur. Les textes disposent de taille, alignement, gras et italique.

Les publications et photos disposent de réglages de hauteur d’image (0 pour masquer), de largeur (25 à 100 %) et d’ajustement (image entière ou recadrée). Les photos occupent 120 pixels de haut par défaut. Un bloc de publications affiche une publication par défaut ; son sélecteur permet de choisir une publication précise ou les dernières publications, avec un nombre réglable de 1 à 5. Le titre d’une publication ouvre son contenu complet. Les autres informations de la page ne sont plus repoussées par une grande photo.

L’apparence générale permet de modifier le titre, le sous-titre, les couleurs, la police, le logo et l’image de fond. Les paramètres d’apparence de l’administration centrale servent de valeurs initiales.

Le bloc **Astreinte direction** est une tuile compacte, carrée par défaut, de 220 pixels de large au maximum. Il permet de modifier le libellé, le responsable, le téléphone et les précisions et suit le même enregistrement que la page. Il peut être déplacé ou ajouté sur plusieurs pages ; les coordonnées sont communes.

## Publications et réunions

Les publications sont partagées dès le bouton **Publier** ou **Enregistrer la publication**. Elles sont indépendantes des modifications non enregistrées de la mise en page. Elles acceptent un titre, du texte, une photo et une épingle « À la une ». Le serveur renseigne l’auteur et la date ; une modification conserve l’auteur d’origine et ajoute l’identité du dernier éditeur.

Les réunions indiquent titre, début, fin facultative, lieu, ordre du jour et lien facultatif. Les heures sont saisies et affichées en **Europe/Paris**, enregistrées en UTC et exportables en fichier calendrier `.ics`. Elles deviennent visibles lors de l’enregistrement de la page.

**Vue écran** masque les commandes et tente d’activer le plein écran. Les pages changent toutes les minutes ; les publications automatiques peuvent également défiler à la fréquence choisie dans l’apparence. Les informations sont rafraîchies toutes les 30 secondes sans remettre à zéro la minute de rotation.

Les anciens dashboards sont convertis en deux pages (« Informations » et « Vie du service ») à la lecture. Le bandeau d’astreinte devient une tuile, les publications passent sur leur propre page et les contenus existants sont conservés. Le format de stockage passe en version 2 lors du prochain enregistrement.

## Stockage et protections

- `dashboard.json` et `dashboard.json.backup` : contenus, mise en page, auteurs, version et historique interne des modifications.
- `dashboard-media/` : photos privées, servies après contrôle du droit Dashboard.
- Répertoire : `DASHBOARD_DATA_DIR`, sinon `PORTAL_DATA_DIR`, sinon le dossier de `PHENIX_DATA_FILE` (par défaut `/var/data`). Ce répertoire doit être sur le stockage persistant en production.
- Photos JPEG, PNG et WebP uniquement, 2 Mo maximum. Les fichiers de 1 Mo ou moins sont envoyés directement. Les grandes photos JPEG sont réduites et restent en JPEG ; les PNG et WebP sont réduits en PNG pour conserver leur transparence. La préparation est limitée à 10 secondes et l’envoi à 30 secondes, avec progression et annulation à la fermeture du formulaire. Pas de SVG. Quota de 1 000 fichiers ou 200 Mo. Les médias ne sont pas supprimés automatiquement du stockage lorsqu’un bloc ou une publication est retiré ; leur conservation doit être incluse dans la politique d’exploitation et de sauvegarde.
- Maximum : 20 pages, 120 blocs au total, 100 éléments par bloc de réunions/liens et 500 publications.
- Aucune exécution de HTML saisi dans les textes ; les liens autorisent seulement les protocoles HTTP/HTTPS et les chemins internes.
- Contrôles d’origine, jetons anti-CSRF, limitation des requêtes et contrôle des rôles côté serveur.
- Chaque modification vérifie la version courante. En cas de conflit, la page de l’autre éditeur n’est pas écrasée ; l’interface propose de télécharger le brouillon puis de recharger.
- Une base illisible déclenche une erreur sans réinitialisation silencieuse.

## Vérification

`npm run test:dashboard` vérifie notamment les accès indépendants, les rôles, la révocation, les photos privées, l’attribution des publications, la validation des liens, les conflits et la persistance.

Les tests d’intégration existants vérifient également le raccordement au serveur, au catalogue des droits et au portail ARGOS.
