PORTAIL POLICE MUNICIPALE CHALON-SUR-SAÔNE — VERSION RÉCUPÉRATION RENDER

Cette version est conçue pour éviter qu'une variable Render manquante fasse tomber tout le Web Service.

RÉGLAGES DU SERVICE RENDER EXISTANT
- Runtime : Node
- Build Command : npm install
- Start Command : npm start
- Health Check Path (optionnel mais conseillé) : /healthz

VARIABLES D'ENVIRONNEMENT
- PORTAL_ADMIN_LOGIN = identifiant administrateur (exemple : admin)
- PORTAL_ADMIN_PASSWORD = mot de passe administrateur
- SESSION_SECRET = chaîne aléatoire d'au moins 32 caractères

STOCKAGE
- DATA_DIR est facultatif.
- Si vous avez un service Render PAYANT avec Persistent Disk monté sur /var/data :
    DATA_DIR=/var/data
- Si vous êtes sur le plan GRATUIT : ne définissez pas DATA_DIR. Le service peut fonctionner,
  mais Render utilise un système de fichiers éphémère : les utilisateurs, applications ajoutées
  et logos peuvent disparaître après un redémarrage / spin-down / nouveau déploiement.
  Le compte administrateur est recréé depuis les variables d'environnement au démarrage.

DIAGNOSTIC
Après déploiement, ouvrez :
  https://VOTRE-SERVICE.onrender.com/healthz

Réponse attendue :
{
  "ok": true,
  "service": "portail-pm-chalon",
  "adminConfigured": true,
  "sessionSecretConfigured": true,
  ...
}

Si adminConfigured=false : ajoutez PORTAL_ADMIN_PASSWORD dans Render > Environment puis redéployez.
Si sessionSecretConfigured=false : ajoutez SESSION_SECRET (32 caractères minimum) puis redéployez.

IMPORTANT
Cette version ne révèle jamais les valeurs de mot de passe ou de secret dans /healthz ou dans les logs.
