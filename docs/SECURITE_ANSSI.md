# PHENIX / ARGOS - durcissement ANSSI côté navigateur

Référence : ANSSI, **« Recommandations pour la mise en œuvre d'un site web : maîtriser les standards de sécurité côté navigateur »**, ANSSI-PA-009, version 2.0, 28 avril 2021.

Ce document décrit les **mesures mises en œuvre dans le code** et les **travaux restant à faire**. Ce n'est ni une certification ANSSI ni la preuve de conformité complète au référentiel.

## Mesures intégrées

| Recommandations | Mesure | Limites |
| --- | --- | --- |
| R1-R2 | Helmet active HSTS en production (31536000 s, sous-domaines inclus). | TLS 1.2/1.3, certificats et redirection HTTPS relèvent aussi de l'hébergeur / proxy Render. Vérifier qu'aucun sous-domaine n'est encore en HTTP avant HSTS. |
| R13-R18, R20, R37 | Politique CSP stricte sur l'accueil ARGOS, l'administration centrale et le Dashboard : `script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self'`, `default-src 'self'`. | PHENIX historique contient du code inline et conserve une CSP transitoire. SYRIUS possède sa CSP spécifique, notamment pour audio/WebSocket et cartes. |
| R21 | `Referrer-Policy: no-referrer` via Helmet global ; SYRIUS utilise une stratégie spécifique. | Vérifier les pages qui nécessiteraient une exception documentaire. |
| R23, R29-R33 | ARGOS n'enregistre plus son jeton d'authentification dans `sessionStorage` et n'expose plus le jeton Bearer dans la réponse de connexion. La session reste dans un cookie `HttpOnly`, `Secure` en production, `SameSite=Strict`. | Certains fichiers historiques non utilisés par le portail actif contiennent encore l'ancien mécanisme. Faire l'inventaire avant suppression. |
| R38, R40 | Les mutations du portail nécessitent désormais un jeton CSRF lié cryptographiquement à la session, transmis dans `x-portal-csrf`. Contrôle général des origines complètes (schéma et domaine) et rejet des mutations signalées `cross-site` par Fetch Metadata. | Tester chaque application métier et les consommateurs API externes explicitement autorisés avant fusion. |
| Hygiène / exploitation | Sessions PHENIX limitées à 24 heures glissantes par défaut (maximum 7 jours via `SESSION_MAX_AGE_MS`), révocation des anciennes sessions d'un an, IP remontée par Express plutôt que par une valeur `X-Forwarded-For` brute. | Les utilisateurs avec une session ancienne devront se reconnecter après déploiement. |
| R6, surface d'attaque | La sonde publique ARGOS n'expose plus les chemins de fichiers, le nombre de comptes ou l'état détaillé des secrets. | Vérifier les tableaux de supervision qui consommaient ces champs. |
| R3 / R11-R12 / R44 / maintenance | `npm ci` pour le déploiement reproductible, audits des dépendances et tests de non-régression dans GitHub Actions. | Surveillance CT, SRI, audits applicatifs et déploiement TLS restent à compléter. |

## Validation avant mise en production

1. Vérifier le résultat de GitHub Actions « Security checks » : tests de sécurité navigateur, Dashboard, SYRIUS et `npm audit --omit=dev --audit-level=high`.
2. Ouvrir ARGOS et tester connexion, rechargement de page, déconnexion et opérations administratives dans le navigateur.
3. Vérifier les connexions à PHENIX, SYRIUS, Dashboard, ATLAS et Arrêtés municipaux, les cartes, les photos, les sons et l'audio WebSocket. Contrôler les erreurs CSP dans la console navigateur.
4. Vérifier en production la terminaison HTTPS, TLS 1.2/1.3, la bonne chaîne de certificats, HSTS et les redirections depuis HTTP. Les ports entrants et la configuration du proxy ne peuvent pas être audités dans le seul dépôt.
5. Mettre en place une surveillance des Certificate Transparency logs (R3), des contrôles SRI pour les éventuelles ressources tierces statiques et des revues d'habilitation / journalisation.
6. Migrer les scripts, attributs `on*` et styles inline de PHENIX vers des fichiers et gestionnaires DOM pour pouvoir supprimer `'unsafe-inline'` sur toutes les pages (R4, R5, R7, R9, R10, R15). Vérifier l'encodage des données non fiables (XSS) indépendamment de la CSP.
7. Évaluer la sensibilité des informations en caches locaux, IndexedDB et service workers, notamment en mode hors ligne (R23-R24) ; ne jamais y placer les données personnelles sans analyse de risques.
8. Confirmer dans le paramétrage de l'hébergeur la présence d'un `SESSION_SECRET` aléatoire de 32 octets minimum. Ne jamais versionner de secrets de production.

## Repli

Les changements sont isolés dans une branche dédiée. Si une page présente une erreur CSP, inspecter son blocage exact plutôt que de réintroduire globalement `'unsafe-eval'`. La sécurité et le bon fonctionnement doivent être validés ensemble.

Certaines recommandations ANSSI concernent le développement sécurisé, l'hébergement, la surveillance opérationnelle et les audits humains ; elles ne peuvent pas toutes être déclarées appliquées au seul moyen de modifications GitHub.
