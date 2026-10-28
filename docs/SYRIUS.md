# SYRIUS · Console radio PHENIX

La route `/syrius/` ajoute une console radio à PHENIX. La présentation reprend les principes visibles dans les démonstrations publiques SYRIUS : carte tactique, groupes d’appel, alternat PTT et messagerie. Le code, les pictogrammes et le fond de plan de secours sont propres à ce projet.

Références : [SYRIUS — ACMOSS](https://www.acmoss.fr/syrius), [démonstration publique Airbus](https://www.criticalcommunications.airbus.com/fr/newsroom/web-story/lacmoss-et-airbus-ont-d%C3%A9ploy%C3%A9-les-terminaux-du-r%C3%A9seau-radio-du-futur-rrf-pendant-le-congr%C3%A8s-national-des-sapeurs-pompiers-de-france-cnspf-2023-%C3%A0-toulouse).

## Administration des conférences

Les comptes PHENIX administrateurs disposent initialement du rôle administrateur SYRIUS. Les comptes superviseur et opérateur disposent d’un accès utilisateur. Les comptes dashboard sont désactivés pour SYRIUS par défaut. Ces droits se changent dans le centre d’administration existant, à la rubrique des accès utilisateurs.

Depuis l’onglet **Admin** de la console, un administrateur peut :

- créer et nommer une conférence ;
- modifier son nom, sa description et sa couleur ;
- ouvrir le groupe à tous les utilisateurs SYRIUS autorisés, ou sélectionner ses membres ;
- archiver la conférence et la réouvrir ultérieurement ;
- prendre en compte les alertes de conférence.

Les administrateurs SYRIUS conservent l’accès à toutes les conférences. Une restriction de membres s’applique également aux messages, à l’historique et aux positions. L’archivage ferme la liaison des postes présents. Une désactivation centrale de compte est prise en compte au prochain échange ou au contrôle de session, toutes les 15 secondes au maximum.

La tuile SYRIUS est ajoutée à la réponse du portail ARGOS. Les tuiles déjà enregistrées sont conservées. Les droits centraux et les règles de visibilité de la tuile restent appliqués.

## Utilisation

1. Ouvrir `/syrius/` et utiliser les identifiants PHENIX. Une session PHENIX existante fonctionne aussi.
2. Sélectionner puis rejoindre une conférence.
3. Maintenir **PTT** ou **Espace** pour parler et relâcher pour rendre la parole.
4. Autoriser le microphone à la demande du navigateur. Si la lecture audio est bloquée, cliquer sur **Activer l’écoute audio**.
5. Utiliser la messagerie ou le journal de la conférence. Les messages se conservent lors d’un renommage.
6. Utiliser **Partager ma position** pour la diffuser aux seuls postes de la conférence rejointe. Le partage s’arrête en quittant le groupe ou en cliquant à nouveau sur le bouton.

Le profil permet de choisir l’indicatif et la disponibilité du poste. La déconnexion ferme la session PHENIX commune. Les alertes sont adressées aux utilisateurs de la conférence sur ce site.

## Audio et téléphone — version 2.1

Le son est relayé par le serveur Express, en PCM16 mono à 16 kHz. Les paquets de 160 ms partent sur une connexion WebSocket sécurisée continue, sans attendre un aller-retour réseau par fragment. Le serveur utilise le flux SSE existant pour l’écoute. Un secours HTTPS regroupe jusqu’à quatre fragments par requête pour conserver la cadence sur les connexions à latence élevée. Aucun relais TURN ni connexion directe entre appareils n’est nécessaire. Aucun audio n’est enregistré. Utiliser une seule instance Node pour les présences et alternats. Render accepte cette connexion WSS sur le même port que le site : aucune clé ni variable d’environnement supplémentaire n’est nécessaire.

Après avoir rejoint un groupe, toucher **Activer le micro et le son**, puis autoriser le microphone. Le contexte audio est repris après l’autorisation et un micro déjà disponible est réutilisé lors d’une interruption de la lecture sur iPhone. Maintenir PTT pour parler. La surface PTT bloque la sélection de texte et le geste de loupe Safari, y compris quand le micro n’est pas encore prêt ; la messagerie reste sélectionnable. Dans **Audio**, les tests du haut-parleur et du microphone permettent de vérifier les autorisations ; le test micro reste local. Hors émission, le micro n’envoie aucun son. Sa piste déjà autorisée est conservée lors des pauses, changements de groupe et retours au premier plan pour éviter les demandes répétées. Le bouton « Désactiver mon microphone », la déconnexion ou la fermeture de la page arrêtent la piste. Safari ou iOS peut toujours révoquer l’accès ; le site ne peut pas mémoriser une autorisation à la place du navigateur. Une émission dure au maximum 60 secondes.

Sur téléphone : navigation inférieure Radio, Groupes, Messages, Carte et Plus ; grand PTT et administration adaptée. **Plus → Installer sur mon téléphone** fournit l’installation sur l’écran d’accueil. Le manifeste ouvre l’application dans une fenêtre autonome. La connexion Internet et l’application visible sont nécessaires ; la réception écran verrouillé n’est pas garantie. Le service worker ne conserve que la page hors connexion, jamais les données de session ou les flux radio.

Le relais utilise environ 43 ko/s par auditeur pendant une émission, hors en-têtes et TLS. La cadence et les files sont bornées pour éviter l’accumulation de son sur les connexions lentes. Les tickets WSS sont à usage unique, liés à la session et au poste SSE, et expirent après 30 secondes. Le ticket est envoyé après l’ouverture du socket, jamais dans l’URL. Une confirmation de fin de phrase précède la libération du PTT ; aucun accusé par fragment ne bloque l’émission. Cette architecture convient à de petits groupes.

## Apparence — administration centrale

Les réglages restent dans **Administration centrale → Apparence → SYRIUS**. Le titre, le sous-titre, le logo, l’icône d’onglet, les couleurs et le fond y sont conservés. Les changements sont diffusés aux consoles SYRIUS ouvertes et s’appliquent aussi à la connexion. La couleur principale pilote l’en-tête et la navigation ; la secondaire pilote les actions et la carte PTT. Les couleurs propres aux conférences identifient les groupes dans le répertoire. La tuile SYRIUS ajoutée automatiquement à ARGOS reprend le logo et les couleurs du centre.

Les images se chargent par des URL distinctes : elles ne sont pas répétées dans le flux de parole. Aucune page de modification de l’apparence n’est ajoutée à SYRIUS.

Pour les confirmations Safari répétées, régler **Micro → Autoriser** dans les réglages de ce site. La reprise du haut-parleur utilise le premier geste après une suspension. [Réglages Safari — Apple](https://support.apple.com/fr-fr/guide/iphone/iphb01fc3c85/ios).

## Données et carte

Les conférences, messages, événements et alertes sont enregistrés dans `SYRIUS_DATA_FILE`. À défaut, le fichier `syrius.json` se trouve à côté de `PHENIX_DATA_FILE`, ou dans `/var/data`. Ce dossier doit utiliser le stockage persistant de l’hébergeur pour conserver les données entre redémarrages et déploiements. Le fichier PHENIX des utilisateurs reste séparé.

Les prises de parole et les changements de groupes sont consignés. L’audio n’est pas enregistré. Les présences et positions courantes disparaissent à la déconnexion. Une position explicitement partagée peut être conservée dans l’alerte associée. Les quantités sont limitées : 100 conférences, 2 000 messages, 1 000 événements et 200 alertes.

La carte charge les tuiles OpenStreetMap dans le navigateur, avec attribution et cache HTTP normal. Elle dispose d’un fond de plan simplifié si les tuiles sont indisponibles. Le fond simplifié est illustratif. [Conditions d’utilisation des tuiles OSM](https://operations.osmfoundation.org/policies/tiles/).

## Vérification

```sh
npm ci
npm run test:syrius
```

Les tests utilisent exclusivement des comptes et répertoires temporaires. Ils couvrent aussi un envoi continu WSS réel entre deux postes de test, la confirmation de fin de phrase, les tickets à usage unique, le refus d’une autre origine, les lots HTTPS atomiques, une latence simulée de 400 ms, la reprise d’un contexte audio interrompu et les événements tactiles de maintien. Ils vérifient l’authentification, les rôles, le contrôle CSRF et de l’origine, la création et le renommage, les groupes restreints, les présences, l’exclusivité PTT, la signalisation entre deux postes, les positions, les alertes, les archives, la révocation des droits et la persistance. Un test démarre le serveur PHENIX complet et contrôle l’intégration à ARGOS et au centre d’administration.

La vérification visuelle Safari et un essai audible réel avec deux appareils restent à effectuer : le service de prévisualisation de l’environnement de préparation est indisponible. Les tests de gestes et de reprise iPhone utilisent des événements et contextes simulés ; ils ne remplacent pas un essai sur iOS.

Cette console est indépendante du service officiel SYRIUS/RRF. Les communications ont lieu entre les comptes de ce site PHENIX.
