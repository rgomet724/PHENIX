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

## Audio et téléphone — version 2

Le son est maintenant relayé par le serveur Express en HTTPS, en PCM16 mono à 16 kHz. Les paquets de 160 ms utilisent des requêtes authentifiées et le flux SSE existant. Aucun relais TURN ni connexion directe entre appareils n’est nécessaire. Aucun audio n’est enregistré. Utiliser une seule instance Node pour les présences et alternats.

Après avoir rejoint un groupe, toucher **Activer le micro et le son**, puis autoriser le microphone. Maintenir PTT pour parler. Dans **Audio**, les tests du haut-parleur et du microphone permettent de vérifier les autorisations ; le test micro reste local. Le microphone disponible est désactivé hors émission ; quitter le groupe ou masquer la page ferme sa capture. Une émission dure au maximum 60 secondes.

Sur téléphone : navigation inférieure Radio, Groupes, Messages, Carte et Plus ; grand PTT et administration adaptée. **Plus → Installer sur mon téléphone** fournit l’installation sur l’écran d’accueil. Le manifeste ouvre l’application dans une fenêtre autonome. La connexion Internet et l’application visible sont nécessaires ; la réception écran verrouillé n’est pas garantie. Le service worker ne conserve que la page hors connexion, jamais les données de session ou les flux radio.

Le relais utilise environ 43 ko/s par auditeur pendant une émission, hors en-têtes et TLS. La cadence et les files sont bornées pour éviter l’accumulation de son sur les connexions lentes. Cette architecture convient à de petits groupes.

## Données et carte

Les conférences, messages, événements et alertes sont enregistrés dans `SYRIUS_DATA_FILE`. À défaut, le fichier `syrius.json` se trouve à côté de `PHENIX_DATA_FILE`, ou dans `/var/data`. Ce dossier doit utiliser le stockage persistant de l’hébergeur pour conserver les données entre redémarrages et déploiements. Le fichier PHENIX des utilisateurs reste séparé.

Les prises de parole et les changements de groupes sont consignés. L’audio n’est pas enregistré. Les présences et positions courantes disparaissent à la déconnexion. Une position explicitement partagée peut être conservée dans l’alerte associée. Les quantités sont limitées : 100 conférences, 2 000 messages, 1 000 événements et 200 alertes.

La carte charge les tuiles OpenStreetMap dans le navigateur, avec attribution et cache HTTP normal. Elle dispose d’un fond de plan simplifié si les tuiles sont indisponibles. Le fond simplifié est illustratif. [Conditions d’utilisation des tuiles OSM](https://operations.osmfoundation.org/policies/tiles/).

## Vérification

```sh
npm ci
npm run test:syrius
```

Les tests utilisent exclusivement des comptes et répertoires temporaires. Ils vérifient l’authentification, les rôles, le contrôle CSRF et de l’origine, la création et le renommage, les groupes restreints, les présences, l’exclusivité PTT, la signalisation entre deux postes, les positions, les alertes, les archives, la révocation des droits et la persistance. Un test démarre le serveur PHENIX complet et contrôle l’intégration à ARGOS et au centre d’administration.

La vérification visuelle et un essai audio réel avec deux appareils restent à effectuer dans un navigateur : le service de prévisualisation de l’environnement de préparation était indisponible.

Cette console est indépendante du service officiel SYRIUS/RRF. Les communications ont lieu entre les comptes de ce site PHENIX.
