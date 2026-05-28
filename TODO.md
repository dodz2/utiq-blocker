# Utiq Blocker - Feuille de Route (TODO)

## Étape 1 : Initialisation et Configuration
- [x] 1.1 Créer le fichier `manifest.json` en version Manifest V3 avec les permissions nécessaires (`declarativeNetRequest`, `storage`, `activeTab`, `scripting`, `host_permissions`).
- [x] 1.2 Mettre en place la structure des dossiers (`/icons`, `/src`, `/rules`, `/popup`).

## Étape 2 : Création des ressources graphiques (Icônes)
- [x] 2.1 Générer ou créer des icônes SVG/PNG basiques et propres pour les tailles 16x16, 32x32, 48x48, 128x128.
- [x] 2.2 Créer les icônes d'état (actif, inactif, bloqué) pour le changement dynamique de l'action de l'extension.

## Étape 3 : Implémentation du blocage réseau (declarativeNetRequest)
- [x] 3.1 Créer le fichier `rules/rules.json` contenant les règles de blocage pour les domaines et sous-domaines d'Utiq (ex: `*.utiq.com`, `consenthub.utiq.com`, etc.).
- [x] 3.2 Vérifier que le fichier `rules.json` est bien référencé dans le `manifest.json`.

## Étape 4 : Script de fond (Background Script / Service Worker)
- [x] 4.1 Créer le fichier `src/background.js`.
- [x] 4.2 Implémenter l'écouteur d'installation pour initialiser les paramètres par défaut dans le `storage`.
- [x] 4.3 Mettre en place la logique pour changer l'icône de l'extension en fonction de l'état (activé/désactivé).
- [x] 4.4 Ajouter un écouteur de messages pour communiquer avec le content script et le popup (mise à jour des compteurs de blocage).

## Étape 5 : Script de contenu (Content Script) pour la neutralisation DOM
- [x] 5.1 Créer le fichier `src/content.js`.
- [x] 5.2 Implémenter la détection et la suppression des scripts, iframes, et pixels contenant des références à Utiq.
- [x] 5.3 Implémenter le nettoyage des cookies et du `localStorage`/`sessionStorage` liés à Utiq.
- [x] 5.4 Mettre en place un MutationObserver pour surveiller les ajouts d'éléments Utiq dans le DOM de manière asynchrone.
- [x] 5.5 Envoyer des messages au background script à chaque fois qu'un élément est bloqué pour mettre à jour le compteur du popup.

## Étape 6 : Interface Utilisateur (Popup)
- [x] 6.1 Créer la structure HTML du popup dans `popup/popup.html`.
- [x] 6.2 Ajouter des styles CSS purs (sans framework) dans `popup/popup.css` pour une interface claire et moderne.
- [x] 6.3 Créer la logique JavaScript dans `popup/popup.js` pour gérer le toggle on/off, enregistrer la préférence dans le `storage`, et afficher le compteur de blocages sur la page actuelle.

## Étape 7 : Tests, Vérifications et Auto-validation
- [x] 7.1 Vérifier la cohérence de tous les fichiers (chemins, dépendances).
- [x] 7.2 S'assurer qu'il n'y a pas d'erreurs de console ou de dépendances externes.
- [x] 7.3 Valider que l'extension est "production-ready".

## Étape 8 : Documentation
- [x] 8.1 Créer le fichier `README.md` exhaustif avec les instructions d'installation et de fonctionnement.
- [x] 8.2 Générer le récapitulatif final de tous les fichiers créés.

## Étape 9 : Publication GitHub
- [x] 9.1 Initialiser le dépôt Git.
- [x] 9.2 Créer le fichier `.gitignore`.
- [x] 9.3 Faire le premier commit avec `feat: initial release - Utiq Blocker Firefox Extension`.
- [x] 9.4 Préparer les commandes Git / GitHub CLI (et instructions de token) pour le push distant.
