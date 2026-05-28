# Utiq Blocker — Extension Firefox

Extension Firefox open-source qui détecte, neutralise et bloque le système de tracking Utiq (operator-based tracking / telco tracking).

## Qu'est-ce qu'Utiq ?

Utiq (anciennement « Martens & Heads ») est un système de tracking publicitaire basé sur les opérateurs télécoms européens (Orange, Vodafone, Deutsche Telekom, Telefónica). Il utilise des signaux réseau pour identifier les utilisateurs à des fins de ciblage publicitaire, en contournant les protections classiques basées sur les cookies tiers.

Cette extension rend ce tracking totalement inopérant en bloquant à la fois les requêtes réseau vers les domaines Utiq et en neutralisant leurs composants dans le DOM des pages web.

## Fonctionnalités

- **Blocage réseau** : Toutes les requêtes vers les domaines et sous-domaines Utiq sont bloquées via l'API `declarativeNetRequest` (Manifest V3)
- **Neutralisation DOM** : Suppression des scripts, iframes, pixels de tracking et éléments HTML injectés par Utiq
- **Protection du stockage** : Neutralisation des cookies, entrées `localStorage` et `sessionStorage` déposées par Utiq
- **Surveillance continue** : Un `MutationObserver` détecte et supprime les éléments Utiq injectés dynamiquement
- **Interception d'API** : Blocage en temps réel des tentatives d'écriture via `localStorage.setItem()` et `document.cookie`
- **Popup de contrôle** : Interface indiquant l'état de protection avec toggle on/off et compteurs de blocages
- **Icône dynamique** : L'icône de la barre d'outils change selon l'état (vert = actif, gris = inactif, orange = menace détectée)
- **Persistance** : Les préférences utilisateur sont sauvegardées entre les sessions via l'API `storage`
- **100% local** : Aucune donnée ne quitte le navigateur, tout le traitement est effectué localement

## Domaines Utiq bloqués

L'extension bloque tous les sous-domaines connus d'Utiq, notamment :

| Domaine | Rôle |
|---------|------|
| `utiq.com` | Domaine principal |
| `consenthub.utiq.com` | Portail de gestion des consentements |
| `docs.utiq.com` | Documentation technique |
| `marti.utiq.com` | Plateforme de gestion des données (Marti) |
| `api.utiq.com` | API de tracking |
| `cdn.utiq.com` | CDN de distribution de scripts |
| `stats.utiq.com` | Statistiques et analytics |
| `track.utiq.com` | Endpoint de tracking |
| `events.utiq.com` | Collecte d'événements |
| `telemetry.utiq.com` | Télémétrie |

## Architecture du projet

```
utiq-blocker/
├── manifest.json          # Configuration Manifest V3
├── src/
│   ├── background.js      # Service Worker (gestion état, icônes, communication)
│   └── content.js         # Content Script (neutralisation DOM et stockage)
├── popup/
│   ├── popup.html         # Interface utilisateur du popup
│   ├── popup.css          # Styles du popup
│   └── popup.js           # Logique du popup
├── rules/
│   └── rules.json         # Règles declarativeNetRequest
├── icons/
│   ├── icon-16.svg        # Icône 16x16 (verte, par défaut)
│   ├── icon-32.svg        # Icône 32x32
│   ├── icon-48.svg        # Icône 48x48
│   ├── icon-128.svg       # Icône 128x128
│   ├── icon-active.svg    # Icône état actif (verte)
│   ├── icon-inactive.svg  # Icône état inactif (grise)
│   └── icon-blocked.svg   # Icône menace détectée (orange)
├── README.md              # Documentation
└── TODO.md                # Feuille de route du projet
```

## Installation

> ⚠️ **Important** : N'utilisez PAS le bouton « Download ZIP » de GitHub. Téléchargez le fichier `utiq-blocker.zip` depuis la page [Releases](https://github.com/dodz2/utiq-blocker/releases).

### Méthode 1 : Chargement temporaire (about:debugging)

1. Téléchargez `utiq-blocker.zip` depuis [les Releases](https://github.com/dodz2/utiq-blocker/releases/latest)
2. Ouvrez Firefox
3. Dans la barre d'adresse, tapez `about:debugging#/runtime/this-firefox`
4. Glissez-déposez le fichier `.zip` dans la page
5. L'extension est immédiatement fonctionnelle

> **Note** : Les extensions chargées en mode temporaire sont supprimées au redémarrage de Firefox.

### Méthode 2 : Installation permanente (Firefox Developer Edition / Nightly)

1. Ouvrez Firefox Developer Edition ou Nightly
2. Dans la barre d'adresse, tapez `about:config`
3. Recherchez `xpinstall.signatures.required` et passez-la à `false`
4. Allez dans `about:addons`, cliquez sur l'engrenage → **« Installer un module depuis un fichier... »**
5. Archivez le projet en `.zip` (en sélectionnant directement les fichiers, sans dossier parent)
6. Sélectionnez l'archive `.zip`

### Méthode 3 : Soumission sur addons.mozilla.org (AMO)

Pour distribuer l'extension publiquement :

1. Archivez le projet en `.zip` (fichiers à la racine de l'archive)
2. Rendez-vous sur [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
3. Cliquez sur **« Soumettre un nouveau module »**
4. Téléversez l'archive `.zip`
5. Remplissez les informations demandées (description, captures d'écran, notes de version)
6. Soumettez pour révision par l'équipe Mozilla

## Utilisation

1. Après installation, l'icône Utiq Blocker apparaît dans la barre d'outils
2. Cliquez sur l'icône pour ouvrir le popup de contrôle
3. Le popup affiche :
   - L'état de la protection (activée/désactivée)
   - Un toggle pour activer/désactiver la protection
   - Le nombre de blocages sur la page courante
   - Le nombre total de blocages depuis l'installation
4. L'icône change de couleur selon l'état :
   - **Vert** : Protection active, aucune menace détectée
   - **Orange** : Protection active, menace Utiq détectée et bloquée
   - **Gris** : Protection désactivée

## Prérequis techniques

- Firefox 109 ou version ultérieure
- Manifest V3 (pas de compatibilité avec les navigateurs ne supportant que Manifest V2)

## Technologies utilisées

- **JavaScript vanilla** — Aucune dépendance externe, aucun bundler, aucun framework
- **Manifest V3** — Dernière version du standard WebExtensions
- **declarativeNetRequest** — API de blocage réseau déclarative (remplace webRequest en MV3)
- **MutationObserver** — API DOM pour la détection d'injections dynamiques
- **Storage API** — Persistance locale des préférences utilisateur

## Confidentialité

Cette extension ne collecte, ne transmet et ne partage **aucune donnée utilisateur**. Tout le traitement est effectué localement dans votre navigateur. Aucune connexion à un serveur externe n'est établie par l'extension elle-même.

## Licence

Ce projet est open-source. Voir le fichier `LICENSE` pour plus d'informations.

## Contribution

Les contributions sont les bienvenues. Pour ajouter de nouveaux domaines Utiq à bloquer, modifiez les fichiers suivants :
- `rules/rules.json` : pour le blocage réseau
- `src/content.js` : pour la neutralisation DOM (tableau `DOMAINES_UTIQ`)

---

Développé pour la protection de la vie privée des utilisateurs contre le tracking opérateur (telco tracking).