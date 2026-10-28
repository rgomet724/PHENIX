# SYRIUS : passage à un service radio professionnel

Évaluation du 28 octobre 2026, sur la version fusionnée dans `main` au commit `f053a457abca675b0da6f50c69b0bfaab33f3040`.

## Décision

**La console web actuelle n’est pas qualifiée pour servir de moyen radio professionnel principal.** Les tests automatisés vérifient des fonctions et des échanges simulés ; ils ne démontrent pas la disponibilité sur le terrain, la qualité de la parole sur les téléphones ni le fonctionnement écran verrouillé. Aucune garantie d’absence de coupure n’a été établie.

Le besoin exprimé impose une refonte du transport vocal et des clients mobiles, en conservant les comptes, les conférences, leurs droits et l’apparence dans l’administration centrale PHENIX. Les changements d’interface seuls ne répondent pas à ce besoin.

## Constats vérifiables dans le dépôt

| Point | État actuel et conséquence |
| --- | --- |
| Trajet du son | Envoi WSS ou HTTPS, réception SSE dans le navigateur. Ce transport ne remplace pas un moteur de téléphonie temps réel avec codec vocal, gestion de la gigue et reprise de réseau. |
| Débit | PCM16 mono à 16 kHz : 32 000 octets/s avant encodage, environ 42 667 octets/s après base64, hors métadonnées et TLS, pour chaque auditeur pendant une émission. |
| Début de phrase | L’attribution de parole attend une réponse HTTP avant la capture. Un fragment représente ensuite 160 ms et la lecture ajoute une marge de 70 ms. La latence réelle comprend aussi les trajets réseau et la planification du téléphone. |
| Parole reçue par rafales | `receive()` ferme les sources audio déjà programmées lorsque l’avance dépasse 800 ms. Ce comportement peut supprimer des portions de phrase après une arrivée en rafale ; il ne faut pas le présenter comme une compensation de réseau validée. |
| Changement de réseau | La perte du flux de présence coupe l’émission et la lecture. Il n’existe pas de qualification du passage Wi-Fi → réseau cellulaire ni de continuité garantie. |
| Écran verrouillé | Le code de la page met explicitement la radio en pause quand elle devient masquée. Retirer cet arrêt ne suffit pas à obtenir un service d’arrière-plan pris en charge par iOS. |
| Autorisation micro | Une piste autorisée est réutilisée dans la page. Fermer/recharger la page ou une intervention du système peut imposer une nouvelle ouverture. La page ne peut pas imposer une autorisation permanente à Safari. |
| Résilience serveur | Présences et attribution de parole sont en mémoire dans un seul processus Node. Un arrêt de cette instance interrompt ces liaisons ; aucun basculement entre instances n’est implémenté. |
| Hébergement | `render.yaml` décrit un service au forfait `free`. Le forfait réellement actif, sa région, son stockage et les métriques de production n’ont pas été inspectés ; ne pas les déduire de ce fichier. |
| Validation | Les 33 tests existants n’incluent pas d’essai audible sur de vrais iPhone/Android, de campagne de couverture ni d’essai d’endurance écran verrouillé. |

Références de code : [capture](../syrius/audio-worklet.js), [lecture et autorisation](../syrius/radio-audio.js), [transport](../syrius/audio-transport.js), [cycle de vie](../syrius/app.js), [serveur radio](../syrius-router.js).

La distance entre deux téléphones n’est pas une portée radio directe dans cette architecture : chaque téléphone utilise sa propre connexion Internet vers le serveur. La couverture de chacun, la latence vers le service et les changements de réseau doivent être mesurés séparément.

## Architecture à mettre en place

1. **Conserver l’administration centrale.** PHENIX reste propriétaire des utilisateurs, des droits, des conférences et de l’apparence. Aucun second centre de configuration dans SYRIUS.
2. **Remplacer le transport vocal spécifique par un moteur temps réel éprouvé.** Codec vocal adapté aux réseaux mobiles, chiffrement des communications, adaptation réseau, relais réseau, reconnexion et mesures de qualité. Comparer un service PTT professionnel et un moteur média géré avant de choisir ; un SDK WebRTC seul n’est pas une certification MCPTT ni une garantie de service.
3. **Fournir des clients mobiles natifs.** Hypothèse de travail : iPhone et Android. Sur iPhone, intégrer le framework Push to Talk, ses notifications APNs dédiées et la session audio gérée par le système. Sur Android, utiliser les services et permissions audio d’arrière-plan adaptés. Une icône de site sur l’écran d’accueil ne fournit pas ces fonctions natives.
4. **Séparer le contrôle du transport vocal.** Un gros message d’interface ou une image ne doit pas bloquer le son. Les règles d’accès restent appliquées au niveau du service vocal, y compris au changement de groupe et à la révocation d’un compte.
5. **Exploiter et surveiller le service.** Hébergement adapté, stockage persistant, supervision, alertes, procédures de reprise et engagement de disponibilité à définir. Mesurer la chaîne complète : une disponibilité serveur ne prouve pas la réception sur chaque téléphone.

L’objectif est une forte disponibilité mesurée et une reprise maîtrisée. Une absence de couverture, une panne du téléphone ou une interruption du système reste possible ; « zéro coupure possible » ne peut pas être un engagement sur la seule base du code.

## Conditions avant qualification

Les critères ci-dessous sont un cahier de recette proposé, pas des résultats obtenus ni un SLA contractuel.

- Identifier le nombre de postes simultanés, les modèles de téléphones, les opérateurs, les zones utilisées et le caractère critique des communications.
- Fixer des seuils acceptables de délai de prise de parole, délai audible, pertes, durée de reconnexion et disponibilité avant de sélectionner le fournisseur.
- Tester la parole réelle entre plusieurs téléphones sur des réseaux distincts ; mesurer les premières et dernières syllabes, pas seulement les événements réseau.
- Tester la réception après une longue attente écran verrouillé, les appels téléphoniques entrants, les casques/Bluetooth, le redémarrage et les réglages d’économie d’énergie.
- Tester les changements Wi-Fi/cellulaire, la latence variable, la perte de paquets, l’absence temporaire de couverture et le retour du réseau.
- Tester une panne du serveur, la révocation d’accès, la déconnexion et la restitution du PTT ; aucune émission ne doit continuer sans autorisation ni signaler une réussite quand la liaison est perdue.
- Réaliser une campagne d’endurance sur une journée d’usage représentative et une recette avec les utilisateurs. Conserver les mesures et les défauts constatés.
- Définir un moyen de secours si la communication est indispensable à la sécurité. La qualification du service ne remplace pas la couverture réseau.

## Accès et décisions manquants

- Nombre de postes et parc iPhone/Android à confirmer.
- Budget et niveau de service à fixer avant tout abonnement ou création de ressource payante.
- Accès au service vocal retenu et à ses métriques ; aucun service supplémentaire n’a été créé.
- Pour la distribution iPhone et APNs : identité de l’application et environnement Apple Developer adapté. Pour Android : mode de distribution et signature.
- Appareils et personnes disponibles pour les essais réels.

Ces éléments empêchent de déclarer aujourd’hui une version professionnelle livrée ou le verrouillage de l’écran validé. Ce document ne change pas le service en production et n’ajoute aucune capacité d’arrière-plan.

## Sources primaires

- [Apple : créer une application Push to Talk](https://developer.apple.com/documentation/pushtotalk/creating-a-push-to-talk-app).
- [Android : types de services de premier plan](https://developer.android.com/develop/background-work/services/fgs/service-types).
- [Apple : réglages de confidentialité Safari et exceptions par site](https://support.apple.com/fr-fr/guide/iphone/iphb01fc3c85/ios).
- [LiveKit : connectivité et changements de réseau](https://docs.livekit.io/intro/basics/connect/), exemple de moteur média à évaluer, sans choix de fournisseur à ce stade.
- [Motorola : WAVE PTX](https://www.motorolasolutions.com/fr_fr/products/broadband-push-to-talk/wave-ptx.html), exemple de service PTT professionnel à comparer.
