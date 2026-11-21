# ATLAS — Tableau des interventions

L’interface de `/portail/atlas/` reprend le bleu nuit, les accents bleus et les panneaux clairs de PHENIX. Les couleurs, le titre, le logo et le fond configurés dans l’administration restent pris en compte.

## Utilisation

- Les indicateurs du haut donnent la situation globale : interventions en attente, prioritaires en attente, interventions en cours et patrouilles disponibles.
- Le bloc « À affecter en priorité » présente la prochaine intervention retenue par le serveur, indépendamment des filtres d’affichage. La priorité précède l’ancienneté.
- La recherche porte sur les motifs, codes, adresses, observations et indicatifs des patrouilles. Elle ignore les accents et accepte plusieurs mots.
- Les filtres et le tri agissent sur les deux listes. Les indicateurs globaux restent visibles, et le nombre de résultats précise qu’un filtre est actif.
- Chaque fiche affiche le temps d’attente avant affectation, puis la durée d’intervention. Les chronomètres utilisent l’heure transmise par le serveur pour compenser le décalage de l’ordinateur.
- Pour affecter une autre intervention, ouvrir « Affecter une patrouille » sur sa fiche. Le choix est conservé pendant l’actualisation de la liste. Les patrouilles disponibles sont présentées en premier.
- Le formulaire de création regroupe motif, localisation et observations. Le motif peut être saisi librement ou choisi dans les suggestions du catalogue partagé. La recherche des voies dans la Base Adresse Nationale reste disponible au clavier.
- Toute création enregistre une intervention en attente, même si la dernière affectation utilisait le mode automatique. L’affectation manuelle ou automatique se fait ensuite depuis le tableau et démarre l’intervention.
- Les comptes Consultation disposent d’une indication explicite de leur mode de lecture.

Une interruption de connexion affiche un bandeau et conserve le dernier état reçu. La dernière heure d’actualisation permet d’identifier les informations potentiellement anciennes. Une fenêtre modale bloque le fond de page, garde la navigation au clavier dans la fenêtre et restitue le focus à sa fermeture.

## Validation

```sh
npm run test:atlas
node --test test/browser-security.test.js
node --check portail/atlas/app.js
node --check portail/atlas/board.js
```

Les tests ATLAS couvrent les tris, la recherche, les indicateurs, les disponibilités, les chronomètres et les contrats API des actions avec un DOM et un réseau simulés. Ils ne remplacent pas les essais dans un navigateur.

À vérifier sur une instance de recette : rendu sur ordinateur et mobile, ouverture des affectations, création avec recherche BAN au clavier, affectations manuelle et automatique, passage sur place puis clôture, notifications, compte Consultation et perte/reprise de connexion.

La refonte ne nécessite ni migration de données ni dépendance supplémentaire. Les routes API et les contrôles d’accès côté serveur sont conservés.
