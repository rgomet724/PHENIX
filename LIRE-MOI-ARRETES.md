# Installation dans PEGASE-2

Ce paquet ajoute l'application **Arrêtés municipaux** au service PEGASE-2 existant.

Fichiers à déposer directement à la racine de PHENIX :

- `portal-router.js`
- `package.json`
- `package-lock.json`
- `arretes-router.js`
- `LIRE-MOI-ARRETES.md`

`arretes-router.js` contient déjà toute l'application (interface, stockage,
compression PDF et référentiel des voies). Il n'y a aucun dossier à envoyer.

Ne remplacez pas `server.js`, `Public/`, `Portail/` ni les données existantes.

Après le déploiement, l'application répond sur :

```text
https://pegase-2.onrender.com/arretes/
```

L'accès normal doit passer par cette route SSO du portail :

```text
/portail/sso/arretes-municipaux
```

Dans l'administration ARGOS, créez une application avec :

- Nom : `ARRÊTÉS MUNICIPAUX`
- Description : `Classement et recherche des arrêtés`
- Lien : `/portail/sso/arretes-municipaux`
- Catégorie : celle de votre choix

Le stockage utilise automatiquement `/var/data/arretes` sur le disque actuel de PEGASE-2. Aucune nouvelle variable Render n'est nécessaire.
