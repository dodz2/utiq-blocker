// ============================================================
// Utiq Blocker - Script de contenu (Content Script)
// Rôle : Détecter et neutraliser dans le DOM tous les éléments
//        liés au système de tracking Utiq (scripts, iframes,
//        pixels, cookies, stockage local).
// ============================================================

// --- Liste des domaines et sous-domaines Utiq à détecter ---
var DOMAINES_UTIQ = [
  "utiq.com",
  "consenthub.utiq.com",
  "marti.utiq.com",
  "api.utiq.com",
  "cdn.utiq.com",
  "stats.utiq.com",
  "track.utiq.com",
  "events.utiq.com",
  "telemetry.utiq.com"
];

// --- Clés de stockage et noms de cookies Utiq à neutraliser ---
var CLES_STOCKAGE_UTIQ = [
  "utiq_consent",
  "utiq_consentpass",
  "utiq_id",
  "utiq_session",
  "utiq_user",
  "utiq_token",
  "utiq_auth",
  "utiq_tracking",
  "__utiq",
  "_utiq",
  "consenthub",
  "consentpass",
  "marti_session",
  "marti_user",
  "marti_id"
];

// --- Compteur de blocages DOM pour cet onglet ---
var compteurBlocagesTab = 0;
var observateurActif = false;
var intercepteurDejaInjecte = false;

// ===============================================================
// FONCTIONS DE DÉTECTION
// ===============================================================

/**
 * Vérifie si une URL ou une chaîne de caractères contient
 * une référence à un domaine Utiq.
 * @param {string} url - L'URL ou le contenu textuel à analyser.
 * @returns {boolean} Vrai si un domaine Utiq est détecté.
 */
function contientDomaineUtiq(url) {
  if (!url || typeof url !== "string") return false;
  var urlMinuscule = url.toLowerCase();
  for (var i = 0; i < DOMAINES_UTIQ.length; i++) {
    if (urlMinuscule.indexOf(DOMAINES_UTIQ[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Vérifie si une clé correspond à un motif de stockage Utiq.
 * @param {string} cle - La clé à vérifier.
 * @returns {boolean} Vrai si la clé correspond à Utiq.
 */
function estCleUtiq(cle) {
  if (!cle || typeof cle !== "string") return false;
  var cleMinuscule = cle.toLowerCase();
  for (var i = 0; i < CLES_STOCKAGE_UTIQ.length; i++) {
    if (cleMinuscule.indexOf(CLES_STOCKAGE_UTIQ[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Supprime un élément du DOM et incrémente le compteur de blocages.
 * @param {Element} element - L'élément DOM à supprimer.
 * @param {string} raison - Description de la raison du blocage.
 */
function supprimerElementUtiq(element, raison) {
  if (!element || !element.parentNode) return;
  try {
    element.parentNode.removeChild(element);
    compteurBlocagesTab++;
    console.debug(
      "[Utiq Blocker] Élément neutralisé (" + raison + ") :",
      element
    );
  } catch (erreur) {
    // L'élément a peut-être déjà été supprimé
  }
}

// ===============================================================
// NETTOYAGE DES ÉLÉMENTS DOM
// ===============================================================

/**
 * Parcourt l'ensemble du DOM et supprime tous les éléments
 * HTML faisant référence à un domaine Utiq.
 */
function nettoyerElementsUtiq() {
  // Suppression des balises <script src="...utiq...">
  var scripts = document.querySelectorAll("script[src]");
  for (var i = 0; i < scripts.length; i++) {
    if (contientDomaineUtiq(scripts[i].src)) {
      supprimerElementUtiq(scripts[i], "script src");
    }
  }

  // Suppression des scripts inline contenant des URLs Utiq
  var scriptsInline = document.querySelectorAll("script:not([src])");
  for (var j = 0; j < scriptsInline.length; j++) {
    if (contientDomaineUtiq(scriptsInline[j].textContent)) {
      supprimerElementUtiq(scriptsInline[j], "script inline");
    }
  }

  // Suppression des iframes pointant vers Utiq
  var iframes = document.querySelectorAll("iframe[src]");
  for (var k = 0; k < iframes.length; k++) {
    if (contientDomaineUtiq(iframes[k].src)) {
      supprimerElementUtiq(iframes[k], "iframe");
    }
  }

  // Suppression des images de tracking Utiq (pixels, balises img)
  var images = document.querySelectorAll("img[src]");
  for (var m = 0; m < images.length; m++) {
    var img = images[m];
    if (contientDomaineUtiq(img.src)) {
      supprimerElementUtiq(img, "pixel image");
    }
  }

  // Suppression des liens preload/prefetch vers Utiq
  var liens = document.querySelectorAll("link[href]");
  for (var n = 0; n < liens.length; n++) {
    if (contientDomaineUtiq(liens[n].href)) {
      supprimerElementUtiq(liens[n], "link preload");
    }
  }

  // Suppression des objets et embeds Utiq
  var objets = document.querySelectorAll("object[data], embed[src]");
  for (var p = 0; p < objets.length; p++) {
    var source = objets[p].getAttribute("data") || objets[p].getAttribute("src");
    if (contientDomaineUtiq(source)) {
      supprimerElementUtiq(objets[p], "object/embed");
    }
  }
}

// ===============================================================
// NETTOYAGE DU STOCKAGE (cookies, localStorage, sessionStorage)
// ===============================================================

/**
 * Supprime les cookies dont le nom correspond à un motif Utiq.
 * Parcourt document.cookie et expire chaque cookie identifié.
 */
function nettoyerCookiesUtiq() {
  var cookies = document.cookie.split(";");
  for (var i = 0; i < cookies.length; i++) {
    var cookie = cookies[i].trim();
    var nomCookie = cookie.split("=")[0].trim();

    if (estCleUtiq(nomCookie)) {
      // Suppression par expiration passée sur le chemin racine
      document.cookie =
        nomCookie +
        "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      // Suppression également sur le domaine courant
      document.cookie =
        nomCookie +
        "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" +
        window.location.hostname + ";";
      compteurBlocagesTab++;
      console.debug("[Utiq Blocker] Cookie neutralisé :", nomCookie);
    }
  }
}

/**
 * Nettoie le localStorage et le sessionStorage de toutes
 * les entrées dont la clé correspond à un motif Utiq.
 */
function nettoyerStockageLocalUtiq() {
  // localStorage
  try {
    var clesASupprimer = [];
    for (var i = 0; i < localStorage.length; i++) {
      var cle = localStorage.key(i);
      if (estCleUtiq(cle)) {
        clesASupprimer.push(cle);
      }
    }
    for (var j = 0; j < clesASupprimer.length; j++) {
      localStorage.removeItem(clesASupprimer[j]);
      compteurBlocagesTab++;
      console.debug("[Utiq Blocker] Clé localStorage neutralisée :", clesASupprimer[j]);
    }
  } catch (erreur) {
    // localStorage peut être inaccessible (iframe sandbox, etc.)
  }

  // sessionStorage
  try {
    var clesSessionASupprimer = [];
    for (var k = 0; k < sessionStorage.length; k++) {
      var cleSession = sessionStorage.key(k);
      if (estCleUtiq(cleSession)) {
        clesSessionASupprimer.push(cleSession);
      }
    }
    for (var m = 0; m < clesSessionASupprimer.length; m++) {
      sessionStorage.removeItem(clesSessionASupprimer[m]);
      compteurBlocagesTab++;
      console.debug("[Utiq Blocker] Clé sessionStorage neutralisée :", clesSessionASupprimer[m]);
    }
  } catch (erreur) {
    // sessionStorage peut être inaccessible
  }
}

// ===============================================================
// SURVEILLANCE CONTINUE DU DOM (MutationObserver)
// ===============================================================

/**
 * Démarre un MutationObserver pour détecter et neutraliser
 * les éléments Utiq injectés dynamiquement après le chargement.
 */
function demarrerSurveillanceDOM() {
  if (observateurActif) return;
  observateurActif = true;

  var observateur = new MutationObserver(function (mutations) {
    var doitNettoyer = false;

    for (var i = 0; i < mutations.length; i++) {
      var noeudsAjoutes = mutations[i].addedNodes;
      for (var j = 0; j < noeudsAjoutes.length; j++) {
        var noeud = noeudsAjoutes[j];
        if (noeud.nodeType !== Node.ELEMENT_NODE) continue;

        var element = noeud;
        var tag = element.tagName;

        // Vérifie les scripts injectés
        if (tag === "SCRIPT" && element.src && contientDomaineUtiq(element.src)) {
          supprimerElementUtiq(element, "script injecté");
          doitNettoyer = true;
        }

        // Vérifie les iframes injectées
        if (tag === "IFRAME" && element.src && contientDomaineUtiq(element.src)) {
          supprimerElementUtiq(element, "iframe injectée");
          doitNettoyer = true;
        }

        // Vérifie les images injectées
        if (tag === "IMG" && element.src && contientDomaineUtiq(element.src)) {
          supprimerElementUtiq(element, "image injectée");
          doitNettoyer = true;
        }
      }
    }

    // Si un élément a été supprimé, on nettoie aussi le stockage
    if (doitNettoyer) {
      nettoyerCookiesUtiq();
      nettoyerStockageLocalUtiq();
      rapporterBlocages();
    }
  });

  // Observation de tout le document, y compris les sous-arbres
  observateur.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// ===============================================================
// INJECTION D'UN SCRIPT DANS LE CONTEXTE DE LA PAGE
// pour intercepter les APIs de stockage au niveau page
// ===============================================================

/**
 * Injecte un script dans le contexte de la page pour définir
 * le flag __utiqBlocker_enabled que le script intercepteur lira.
 * @param {boolean} actif - True si la protection est active.
 */
function injecterScriptFlag(actif) {
  var code = "window.__utiqBlocker_enabled = " + (actif ? "true" : "false") + ";";
  var el = document.createElement("script");
  el.textContent = code;
  el.async = false;
  if (document.documentElement) {
    try {
      document.documentElement.appendChild(el);
      el.parentNode.removeChild(el);
    } catch (e) {}
  }
}

/**
 * Injecte un script dans le contexte de la page web (pas dans
 * le contexte isolé du content script) pour intercepter
 * localStorage.setItem et document.cookie.
 * Le script vérifie window.__utiqBlocker_enabled avant de bloquer,
 * permettant au content script de contrôler l'activation.
 */
function injecterScriptIntercepteurPage() {
  // Évite d'injecter le patch plusieurs fois (empilement inutile)
  if (intercepteurDejaInjecte) return;
  intercepteurDejaInjecte = true;
  var codeInjection = "(" + function () {
    var CLES_UTIQ = [
      "utiq_consent", "utiq_consentpass", "utiq_id", "utiq_session",
      "utiq_user", "utiq_token", "utiq_auth", "utiq_tracking",
      "__utiq", "_utiq", "consenthub", "consentpass",
      "marti_session", "marti_user", "marti_id"
    ];

    function estMotifUtiq(cle) {
      if (!cle || typeof cle !== "string") return false;
      var c = cle.toLowerCase();
      for (var i = 0; i < CLES_UTIQ.length; i++) {
        if (c.indexOf(CLES_UTIQ[i]) !== -1) return true;
      }
      return false;
    }

    function estBlocageActif() {
      return window.__utiqBlocker_enabled !== false;
    }

    try {
      var setItemOriginal = Storage.prototype.setItem;
      Storage.prototype.setItem = function (cle, valeur) {
        if (estBlocageActif() && estMotifUtiq(cle)) {
          console.debug("[Utiq Blocker] localStorage.setItem bloqué :", cle);
          return;
        }
        return setItemOriginal.call(this, cle, valeur);
      };
    } catch (e) {}

    try {
      var descCookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
      if (descCookie && descCookie.set) {
        Object.defineProperty(Document.prototype, "cookie", {
          get: descCookie.get,
          set: function (valeur) {
            if (estBlocageActif() && estMotifUtiq(valeur)) {
              console.debug("[Utiq Blocker] document.cookie bloqué :", valeur);
              return;
            }
            descCookie.set.call(this, valeur);
          },
          configurable: true
        });
      }
    } catch (e) {}
  }.toString() + ")();";

  var script = document.createElement("script");
  script.textContent = codeInjection;
  script.async = false;

  if (document.documentElement) {
    try {
      document.documentElement.appendChild(script);
      script.parentNode.removeChild(script);
    } catch (e) {}
  }
}

// ===============================================================
// COMMUNICATION AVEC LE BACKGROUND SCRIPT
// ===============================================================

/**
 * Envoie le compteur de blocages actuel au background script
 * pour mise à jour du compteur global et de l'icône.
 */
function rapporterBlocages() {
  try {
    browser.runtime.sendMessage({
      action: "reportBlock",
      count: compteurBlocagesTab
    });
  } catch (erreur) {
    // Le contexte peut ne pas être prêt (page en cours de fermeture)
  }
}

// ===============================================================
// INITIALISATION PRINCIPALE
// ===============================================================

/**
 * Point d'entrée : vérifie l'état du toggle puis exécute la
 * neutralisation uniquement si la protection est activée.
 * Écoute aussi les changements de préférences pour réagir
 * au toggle en temps réel (même sans updateEnabledRulesets).
 */
function initialiserUtiqBlocker() {
  // Vérifie d'abord si la protection est activée
  browser.storage.local.get("utiqBlocker_enabled").then(function (stored) {
    var estActive = stored.utiqBlocker_enabled !== false;

    if (estActive) {
      nettoyerElementsUtiq();
      nettoyerCookiesUtiq();
      nettoyerStockageLocalUtiq();
      injecterScriptIntercepteurPage();
      demarrerSurveillanceDOM();
      rapporterBlocages();
      console.debug(
        "[Utiq Blocker] Protection initialisée sur " +
        window.location.hostname +
        " (" + compteurBlocagesTab + " blocages initiaux)"
      );
    } else {
      // Injecte le flag false pour que le script intercepteur
      // (s'il a déjà été injecté sur un rechargement) laisse passer
      injecterScriptFlag(false);
      console.debug(
        "[Utiq Blocker] Protection désactivée sur " +
        window.location.hostname
      );
    }
  });

  // Écoute les changements de préférences (toggle popup)
  browser.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (!changes.utiqBlocker_enabled) return;

    var nouvelEtat = changes.utiqBlocker_enabled.newValue !== false;
    // Met à jour le flag dans le contexte de la page
    injecterScriptFlag(nouvelEtat);

    if (nouvelEtat) {
      console.debug("[Utiq Blocker] Protection réactivée via toggle");
      nettoyerElementsUtiq();
      nettoyerCookiesUtiq();
      nettoyerStockageLocalUtiq();
      injecterScriptIntercepteurPage();
      demarrerSurveillanceDOM();
      rapporterBlocages();
    } else {
      console.debug("[Utiq Blocker] Protection désactivée via toggle");
    }
  });
}

// Démarrage automatique (run_at: document_start dans le manifest)
initialiserUtiqBlocker();