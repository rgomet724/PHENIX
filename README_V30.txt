PHENIX V30 - CORRECTION DEFINITIVE CORBEILLE

Cause trouvée :
l'endpoint qui reconstruit la liste des discussions (/api/messages/threads)
ne tenait pas compte du marqueur de suppression. Résultat : la conversation
disparaissait une fraction de seconde puis revenait immédiatement.

Correction :
- /api/messages/threads filtre maintenant réellement les conversations supprimées
- suppression immédiate côté interface sans effet de saut
- persistance après actualisation/reconnexion
- si un nouveau message arrive après la suppression, la conversation peut réapparaître
- l'autre participant conserve toujours ses messages

Remplacer :
- server.js
- public/index.html
