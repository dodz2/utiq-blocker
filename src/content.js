// ============================================================
// Utiq Blocker - Script de contenu (Content Script)
// Rôle : Détecter et neutraliser dans le DOM tous les éléments
//        liés au système de tracking Utiq (scripts, iframes,
//        pixels, cookies, stockage local).
// ============================================================

// --- Liste des domaines et sous-domaines Utiq à détecter ---
const DOMAINES_UTIQ = [
  "utiq.com",
  "consenthub.utiq.com",
  "docs.utiq.com",
  "marti.utiq.com",
  "api.utiq.com",
  "cdn.utiq.com",
  "stats.utiq.com",
  "track.utiq.com",
  "events.utiq.com",
  "telemetry.utiq.com"
];

// --- Clés de stockage et noms de cookies Utiq à neutraliser ---
const CLES_STOCKAGE_UTIQ = [
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
let compteurBlocagesTab = 0;
let observateurActif = false;
let observateurInstance = null;
let intercepteurDejaInjecte = false;
let protectionActive = true;
const hostnameActuel = window.location.hostname;

// --- Patterns heuristiques pour détecter les scripts de tracking ---
// Organisés en catégories pour réduire les faux positifs.
// Un script est suspect s'il contient :
//   - Au moins 1 pattern de la catégorie A (spécifique Utiq), OU
//   - Au moins 1 pattern de A + aucun match A, mais 4+ patterns de B+C combinés, OU
//   - Au moins 2 patterns de B ET au moins 1 de C (fingerprinting + exfiltration)

// Catégorie A : Signatures directes ou quasi-directes d'Utiq
const PATTERNS_UTIQ_DIRECTS = [
  /utiq/i,
  /consenthub/i,
  /consentpass/i,
  /marti[_\-](session|user|id|sdk)/i,
  /__utiqBlocker/i
];

// Catégorie B : Fingerprinting télécom/périphérique (techniques Utiq-like)
const PATTERNS_FINGERPRINTING = [
  /navigator\.connection\s*\.\s*(effectiveType|rtt|downlink|saveData)/i,
  /navigator\.userAgentData\s*\.\s*getHighEntropyValues/i,
  /canvas\.(toDataURL|getContext)\b.*(?:getImageData|toDataURL)/si,
  /AudioContext\b.*create(?:Oscillator|Analyser)/i,
  /RTCPeerConnection\b.*localDescription/i,
  /screen\.(colorDepth|pixelDepth)\b.*navigator\.(plugins|language)/si,
  /Intl\.DateTimeFormat\b.*resolvedOptions\b/i,
  /new\s+Fingerprint2|fingerprintjs|clientjs\.getFingerprint/i
];

// Catégorie C : Patterns d'exfiltration de données (envoi réseau)
const PATTERNS_EXFILTRATION = [
  /navigator\.(sendBeacon|beacon)\b/i,
  /XMLHttpRequest\.prototype\.open\b.*(?:POST|PUT)/i,
  /fetch\s*\(\s*['"].*(?:collect|track|telemetry|beacon|pixel|log)/i,
  /Image\s*\(\s*\).*\.src\s*=.*(?:\?|&)(?:data|payload|fingerprint|cid)/i,
  /document\.cookie\s*=\s*['"][^'"]*(?:fingerprint|cid|tracker|session)/i
];

// --- Seuil de détection pour les patterns génériques (B+C combinés) ---
const SEUIL_HEURISTIQUE_GENERIQUE = 4;

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
  const urlMinuscule = url.toLowerCase();
  for (let i = 0; i < DOMAINES_UTIQ.length; i++) {
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
  const cleMinuscule = cle.toLowerCase();
  for (let i = 0; i < CLES_STOCKAGE_UTIQ.length; i++) {
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

/**
 * Analyse le contenu d'un script pour détecter des comportements
 * de tracking heuristiques (fingerprinting, APIs télécom, etc.)
 *
 * Logique de détection en 3 niveaux :
 *   1. Signature directe Utiq (catégorie A) → suspect immédiatement
 *   2. Fingerprinting (B) + exfiltration (C) combinés → suspect
 *   3. Accumulation de patterns B+C ≥ seuil → suspect
 *
 * @param {string} contenu - Le contenu textuel du script.
 * @returns {boolean} Vrai si le script est suspect.
 */
function analyserScriptHeuristique(contenu) {
  if (!contenu || typeof contenu !== "string") return false;

  // Niveau 1 : Signature directe Utiq → suspect immédiatement
  for (let a = 0; a < PATTERNS_UTIQ_DIRECTS.length; a++) {
    if (PATTERNS_UTIQ_DIRECTS[a].test(contenu)) {
      return true;
    }
  }

  // Compte les matches dans chaque catégorie
  let scoreFingerprinting = 0;
  for (let b = 0; b < PATTERNS_FINGERPRINTING.length; b++) {
    if (PATTERNS_FINGERPRINTING[b].test(contenu)) {
      scoreFingerprinting++;
    }
  }

  let scoreExfiltration = 0;
  for (let c = 0; c < PATTERNS_EXFILTRATION.length; c++) {
    if (PATTERNS_EXFILTRATION[c].test(contenu)) {
      scoreExfiltration++;
    }
  }

  // Niveau 2 : Fingerprinting ET exfiltration combinés
  if (scoreFingerprinting >= 2 && scoreExfiltration >= 1) {
    return true;
  }

  // Niveau 3 : Accumulation générique au-dessus du seuil
  if ((scoreFingerprinting + scoreExfiltration) >= SEUIL_HEURISTIQUE_GENERIQUE) {
    return true;
  }

  return false;
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
  const scripts = document.querySelectorAll("script[src]");
  for (let i = 0; i < scripts.length; i++) {
    if (contientDomaineUtiq(scripts[i].src)) {
      supprimerElementUtiq(scripts[i], "script src");
    }
  }

  // Suppression des scripts inline contenant des URLs Utiq ou comportement suspect
  const scriptsInline = document.querySelectorAll("script:not([src])");
  for (let j = 0; j < scriptsInline.length; j++) {
    const contenuScript = scriptsInline[j].textContent;
    if (contientDomaineUtiq(contenuScript) || analyserScriptHeuristique(contenuScript)) {
      supprimerElementUtiq(scriptsInline[j], "script inline suspect");
    }
  }

  // Suppression des iframes pointant vers Utiq
  const iframes = document.querySelectorAll("iframe[src]");
  for (let k = 0; k < iframes.length; k++) {
    if (contientDomaineUtiq(iframes[k].src)) {
      supprimerElementUtiq(iframes[k], "iframe");
    }
  }

  // Suppression des images de tracking Utiq (pixels, balises img)
  const images = document.querySelectorAll("img[src]");
  for (let m = 0; m < images.length; m++) {
    const img = images[m];
    if (contientDomaineUtiq(img.src)) {
      supprimerElementUtiq(img, "pixel image");
    }
  }

  // Suppression des liens preload/prefetch vers Utiq
  const liens = document.querySelectorAll("link[href]");
  for (let n = 0; n < liens.length; n++) {
    if (contientDomaineUtiq(liens[n].href)) {
      supprimerElementUtiq(liens[n], "link preload");
    }
  }

  // Suppression des objets et embeds Utiq
  const objets = document.querySelectorAll("object[data], embed[src]");
  for (let p = 0; p < objets.length; p++) {
    const source = objets[p].getAttribute("data") || objets[p].getAttribute("src");
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
  const cookies = document.cookie.split(";");
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    const nomCookie = cookie.split("=")[0].trim();

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
    const clesASupprimer = [];
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (estCleUtiq(cle)) {
        clesASupprimer.push(cle);
      }
    }
    for (let j = 0; j < clesASupprimer.length; j++) {
      localStorage.removeItem(clesASupprimer[j]);
      compteurBlocagesTab++;
      console.debug("[Utiq Blocker] Clé localStorage neutralisée :", clesASupprimer[j]);
    }
  } catch (erreur) {
    // localStorage peut être inaccessible (iframe sandbox, etc.)
  }

  // sessionStorage
  try {
    const clesSessionASupprimer = [];
    for (let k = 0; k < sessionStorage.length; k++) {
      const cleSession = sessionStorage.key(k);
      if (estCleUtiq(cleSession)) {
        clesSessionASupprimer.push(cleSession);
      }
    }
    for (let m = 0; m < clesSessionASupprimer.length; m++) {
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

  const observateur = new MutationObserver(function (mutations) {
    let doitNettoyer = false;

    for (let i = 0; i < mutations.length; i++) {
      const noeudsAjoutes = mutations[i].addedNodes;
      for (let j = 0; j < noeudsAjoutes.length; j++) {
        const noeud = noeudsAjoutes[j];
        if (noeud.nodeType !== Node.ELEMENT_NODE) continue;

        const element = noeud;
        const tag = element.tagName;

        // Vérifie les scripts injectés
        if (tag === "SCRIPT") {
          if (element.src && contientDomaineUtiq(element.src)) {
            supprimerElementUtiq(element, "script injecté");
            doitNettoyer = true;
          } else if (!element.src && analyserScriptHeuristique(element.textContent)) {
            supprimerElementUtiq(element, "script injecté suspect");
            doitNettoyer = true;
          }
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

  // Stocke l'instance pour pouvoir l'arrêter plus tard
  observateurInstance = observateur;
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
  const code = "window.__utiqBlocker_enabled = " + (actif ? "true" : "false") + ";";
  const el = document.createElement("script");
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

  const script = document.createElement("script");
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

/**
 * Vérifie si le domaine actuel est dans la whitelist.
 * Met à jour la variable protectionActive en conséquence.
 */
async function verifierWhitelist() {
  try {
    const response = await browser.runtime.sendMessage({
      action: "getStatus",
      tabId: null,
      hostname: hostnameActuel
    });
    if (response && response.isWhitelisted) {
      protectionActive = false;
    } else {
      protectionActive = response ? response.enabled !== false : true;
    }
  } catch (e) {
    protectionActive = true;
  }
}

// ===============================================================
// INITIALISATION PRINCIPALE
// ===============================================================

/**
 * Point d'entrée : vérifie l'état du toggle et la whitelist
 * puis exécute la neutralisation uniquement si la protection
 * est activée et que le domaine n'est pas en whitelist.
 * Écoute aussi les changements de préférences pour réagir
 * au toggle en temps réel (même sans updateEnabledRulesets).
 */
async function initialiserUtiqBlocker() {
  // Vérifie d'abord si la protection est activée et la whitelist
  await verifierWhitelist();

  if (protectionActive) {
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
      window.location.hostname +
      " (whitelist ou toggle)"
    );
  }

  // Écoute les changements de préférences (toggle popup ou whitelist)
  browser.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (!changes.utiqBlocker_enabled && !changes.utiqBlocker_whitelist) return;

    // Revérifie l'état et la whitelist
    verifierWhitelist().then(function() {
      injecterScriptFlag(protectionActive);

      if (protectionActive) {
        console.debug("[Utiq Blocker] Protection réactivée via toggle/whitelist");
        nettoyerElementsUtiq();
        nettoyerCookiesUtiq();
        nettoyerStockageLocalUtiq();
        injecterScriptIntercepteurPage();
        demarrerSurveillanceDOM();
        rapporterBlocages();
      } else {
        console.debug("[Utiq Blocker] Protection désactivée via toggle/whitelist");
        // Arrête l'observateur DOM pour éviter les fuites de ressources
        if (observateurInstance) {
          observateurInstance.disconnect();
          observateurInstance = null;
          observateurActif = false;
        }
      }
    });
  });
}

// Démarrage automatique (run_at: document_start dans le manifest)
initialiserUtiqBlocker();