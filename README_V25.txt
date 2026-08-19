PHENIX V25 - MESSAGERIE AMELIOREE

- clic sur la bulle lorsqu'il y a un message non lu : ouverture directe de la discussion concernée
- bouton retour vers la liste des discussions
- discussion générale + discussions privées
- badge de messages non lus par discussion
- aucun rôle (admin / opérateur / superviseur) affiché à côté des noms
- notification bureau si PHENIX est ouvert en arrière-plan
- clic sur la notification bureau : ouverture de la discussion
- son de notification conservé et désactivable

Pour activer les notifications Windows :
ouvrez la messagerie puis cliquez sur le bouton 🖥️ et autorisez les notifications du navigateur.

Si PHENIX est complètement fermé, cette version ne peut pas notifier. Il faudrait des notifications push.

Fichiers à remplacer :
- server.js
- public/index.html

Aucune nouvelle variable Render. SESSION_SECRET reste obligatoire.
