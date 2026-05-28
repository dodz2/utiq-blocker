# 🛡️ Utiq Blocker — Reprenez le contrôle sur votre navigation

Une extension Firefox simple et efficace qui bloque le tracking Utiq (ce système de suivi imposé par certains opérateurs télécoms européens).

## 🤔 Qu'est-ce qu'Utiq et pourquoi le bloquer ?

Vous avez peut-être remarqué ces bandeaux de consentement qui reviennent sans cesse, ou vous êtes simplement soucieux de votre vie privée. Utiq est un système de tracking publicitaire soutenu par de grands opérateurs télécoms (Orange, Vodafone, Deutsche Telekom, etc.). Contrairement aux cookies classiques, il utilise votre connexion réseau pour vous identifier à votre insu.

**En un mot :** C'est un mouchard puissant qui contourne vos réglages de confidentialité habituels.

Cette extension fait le ménage : elle bloque les requêtes, nettoie les traces dans votre navigateur et empêche les scripts Utiq de s'exécuter.

## ✨ Ce que l'extension fait pour vous

- **🚫 Blocage total** : Les serveurs d'Utiq sont bloqués avant même que votre navigateur n'essaie de les contacter.
- **🧹 Nettoyage automatique** : Si des traces (cookies, données locales) ont déjà été déposées, l'extension les supprime.
- **👀 Surveillance en temps réel** : Même si un site essaie d'injecter du code Utiq après le chargement, l'extension l'intercepte et le neutralise.
- **🎯 Liste blanche (Whitelist)** : Vous pouvez choisir de désactiver le blocage pour certains sites spécifiques directement depuis le popup.
- **🔒 100% Local** : Aucune donnée ne quitte votre navigateur. L'extension ne collecte rien, ne communique avec aucun serveur.

## 📥 Installation (C'est facile !)

### Méthode rapide (Temporaire)
1. Téléchargez le fichier `utiq-blocker.zip` depuis la page [Releases](https://github.com/dodz2/utiq-blocker/releases).
2. Ouvrez un nouvel onglet et tapez `about:debugging#/runtime/this-firefox`.
3. Glissez le fichier `.zip` directement dans la page.
4. C'est prêt ! L'icône apparaît dans votre barre d'outils.

*Note : Cette méthode est idéale pour tester. L'extension se désactive si vous redémarrez Firefox.*

### Méthode permanente (Pour une utilisation quotidienne)
1. Téléchargez l'archive depuis les [Releases](https://github.com/dodz2/utiq-blocker/releases).
2. Ouvrez Firefox Developer Edition ou Nightly.
3. Allez dans `about:config`, cherchez `xpinstall.signatures.required` et mettez la valeur sur `false`.
4. Allez dans `about:addons`, cliquez sur l'engrenage, puis "Installer un module depuis un fichier...".
5. Sélectionnez votre fichier `.zip`.

## 🚀 Comment ça marche ?

Une fois installé, l'extension travaille en arrière-plan :

1. **L'icône** 🛡️ dans votre barre d'outils change de couleur :
   - **Vert** : Vous êtes protégé.
   - **Orange** : Une tentative de tracking a été bloquée sur cette page.
   - **Gris** : La protection est désactivée.

2. **Le Popup** : Cliquez sur l'icône pour voir combien de traceurs ont été bloqués et activer/désactiver la protection.

3. **La Liste Blanche** : Sur un site où vous souhaitez autoriser Utiq (si jamais le site ne fonctionne pas correctement), cliquez sur "Ajouter" dans la section Liste blanche du popup.

## 🛠️ Technologies

- **Manifest V3** (La dernière norme pour les extensions).
- **JavaScript Vanilla** (Pas de frameworks lourds, pas de publicités, juste du code essentiel).

## 💌 Contribution

Les idées et rapports de bugs sont les bienvenus ! Si vous connaissez un nouveau domaine Utiq à bloquer, n'hésitez pas à ouvrir une *Issue*.

---

*Développé avec ❤️ pour une vie privée numérique respectée.*
