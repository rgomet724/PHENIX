PHENIX V24 - MESSAGERIE INTERNE

Fichiers à remplacer :
- server.js à la racine du dépôt
- public/index.html
- package.json peut rester identique à la V23 ; il est inclus par sécurité.

Fonctions :
- bulle de messagerie en bas à droite pour tous les comptes sauf Dashboard
- discussion générale
- messages privés entre utilisateurs
- réponses dans la même conversation
- compteur de messages non lus
- son de notification activable/désactivable
- messages persistés dans /var/data/data.json
- conservation des 3000 derniers messages
- protections de sécurité V23 conservées

Aucune nouvelle variable Render n'est nécessaire.
SESSION_SECRET doit rester configurée.
