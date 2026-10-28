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

Pour sélectionner les agents : **Admin → Agents** sur la ligne de la conférence, puis **Privée · choisir les agents**. Rechercher un nom ou un identifiant, cocher les agents et enregistrer. Les choix sont conservés en changeant de recherche et incluent les agents hors ligne. La sélection reste modifiable plus tard. Les comptes dont l’accès SYRIUS est désactivé restent visibles et doivent d’abord être activés dans l’administration centrale pour un nouvel ajout.

Le mode privé est enregistré séparément de la liste des agents : retirer le dernier agent ne rend pas le groupe public. Sans agent sélectionné, seuls les administrateurs SYRIUS y accèdent. Les anciens groupes avec des membres sélectionnés restent privés ; aucune migration manuelle n’est nécessaire. Une appartenance existante reste modifiable après désactivation du compte, sans lui rendre l’accès à SYRIUS. Le retour à un groupe ouvert exige le choix explicite **Tous les agents autorisés sur SYRIUS**.

La tuile SYRIUS est ajoutée à la réponse du portail ARGOS. Les tuiles déjà enregistrées sont conservées. Les droits centraux et les règles de visibilité de la tuile restent appliqués.

## Utilisation

1. Ouvrir `/syrius/` et utiliser les identifiants PHENIX. Une session PHENIX existante fonctionne aussi.
2. Sélectionner puis rejoindre une conférence.
3. Maintenir **PTT** ou **Espace** pour parler et relâcher pour rendre la parole.
4. Autoriser le microphone à la demande du navigateur. Si la lecture audio est bloquée, cliquer sur **Activer l’écoute audio**.
5. Utiliser la messagerie ou le journal de la conférence. Les messages se conservent lors d’un renommage.
6. Utiliser **Partager ma position** pour la diffuser aux seuls postes de la conférence rejointe. Le partage s’arrête en quittant le groupe ou en cliquant à nouveau sur le bouton.

Le profil permet de choisir l’indicatif et la disponibilité du poste. La déconnexion ferme la session PHENIX commune. Les alertes sont adressées aux utilisateurs de la conférence sur ce site.

## Audio et téléphone — version 2.2 (essai renforcé)

Le micro est traité en PCM16 mono à 16 kHz, puis la voix est sous-échantillonnée à 8 kHz et compandée en µ-law 8 bits. Les fragments représentent 120 ms de parole, contre 160 ms précédemment. Ce choix privilégie une qualité de voix téléphonique et un débit réduit plutôt qu’une voix large bande. Pour une même durée, les échantillons compressés occupent quatre fois moins d’octets que le PCM16 précédent : environ 10,7 ko/s en base64, hors métadonnées et TLS. Le test de codec mesure la durée conservée et l’erreur de quantification sur un signal de référence.

Le serveur relaie maintenant la voix dans les deux sens sur une connexion WSS, séparément des mises à jour de l’interface. Les anciens postes conservent un secours SSE et une conversion PCM16. Le secours d’envoi HTTPS regroupe jusqu’à quatre fragments par requête. Aucun relais TURN ni variable supplémentaire n’est nécessaire. Aucun audio n’est enregistré. Les présences et alternats nécessitent toujours un seul processus Node : ce changement n’ajoute pas de redondance serveur.

La lecture utilise une réserve adaptative selon les variations d’arrivée et ne vide plus toute la parole en attente à 800 ms de réserve. Les dernières syllabes du locuteur précédent peuvent se terminer avant la phrase suivante. Au-delà d’un retard extrême, seuls les fragments non encore joués sont supprimés pour éviter une file de plusieurs secondes ; cela peut encore entraîner une perte de parole. Un contexte réellement suspendu par le téléphone est vidé pour ne pas rejouer d’anciennes paroles au réveil.

Les numéros d’ordre empêchent une ancienne copie SSE de suivre une copie WSS plus récente. Le groupe attendu est celui choisi par l’utilisateur, sans attendre une mise à jour d’écran plus lente que la voix. Les réponses d’attribution de parole et les états SSE portent une révision pour ignorer un état devenu obsolète. La connexion WSS est sondée et reconnectée automatiquement ; une émission interrompue n’est jamais relancée automatiquement.

Après avoir rejoint un groupe, toucher **Activer le micro et le son**. Le micro disponible est réutilisé entre les écrans et les groupes. Si le contexte audio est fermé mais que sa piste micro reste disponible, le graphe est reconstruit sans nouvelle demande `getUserMedia`. Si iOS arrête la piste ou révoque son autorisation, une nouvelle activation peut rester nécessaire. Le site ne peut pas imposer une permission permanente au navigateur.

Dans **Audio**, l’option **Essayer de continuer l’écoute écran verrouillé** est activée par défaut et mémorisée sur cet appareil. Le site ne coupe plus volontairement la lecture quand la page passe en arrière-plan. Il renseigne la session média et ses commandes lecture/pause, et déclare un type de session audio adapté lorsque le navigateur expose cette API optionnelle. Aucune boucle silencieuse ni demande automatique de micro n’est utilisée. L’émission PTT s’arrête en arrière-plan. Les commandes système restent conditionnées à la prise en charge du navigateur.

**Ce mode reste un essai web : il ne garantit pas la réception écran verrouillé ni l’absence de coupure.** Une page peut toujours être suspendue par iOS, Android ou leurs réglages d’économie d’énergie. Les tests de cycle de vie sont simulés, sans appareil physique. Le changement ne constitue pas une application native Push to Talk et ne qualifie pas le service pour un usage radio professionnel principal.

Sur téléphone : Radio, Groupes, Messages, Carte et Plus restent disponibles. **Plus → Installer sur mon téléphone** fournit une icône et une fenêtre autonome ; il s’agit toujours d’un site web. Les tests micro et haut-parleur restent accessibles dans **Audio**. Le maintien PTT est limité à 60 secondes et sa surface bloque le geste de sélection de Safari.

Le bouton **Désactiver mon microphone**, la déconnexion ou la fermeture de la page ferment la piste. L’arrêt de parole, la perte d’accès et le changement de groupe restent contrôlés par le serveur. Les tickets WSS sont à usage unique, liés à la session et au poste SSE, et expirent après 30 secondes. Une confirmation de fin de phrase précède la libération de l’alternat ; aucun accusé par fragment ne ralentit l’émission.

Références : [Audio Session](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type), [Media Session](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API).

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
# Facultatif : essai réseau local d’environ 30 secondes, avec sept destinataires
npm run test:syrius:soak
```

Les tests utilisent exclusivement des comptes et répertoires temporaires. Ils couvrent aussi la compression et la compatibilité PCM, les rafales et variations d’arrivée, la reconstruction du contexte sans nouvelle ouverture de micro, les commandes média et le cycle de vie simulé, la réception WSS avec secours SSE, et un envoi continu WSS réel entre deux postes de test, la confirmation de fin de phrase, les tickets à usage unique, le refus d’une autre origine, les lots HTTPS atomiques, une latence simulée de 400 ms, la reprise d’un contexte audio interrompu et les événements tactiles de maintien. Ils vérifient l’authentification, les rôles, le contrôle CSRF et de l’origine, la création et le renommage, les groupes restreints, les présences, l’exclusivité PTT, la signalisation entre deux postes, les positions, les alertes, les archives, la révocation des droits et la persistance. Un test démarre le serveur PHENIX complet et contrôle l’intégration à ARGOS et au centre d’administration.

La vérification visuelle Safari et un essai audible réel avec deux appareils restent à effectuer : le service de prévisualisation de l’environnement de préparation est indisponible. Les tests de gestes et de reprise iPhone utilisent des événements et contextes simulés ; ils ne remplacent pas un essai sur iOS.

Cette console est indépendante du service officiel SYRIUS/RRF. Les communications ont lieu entre les comptes de ce site PHENIX.
