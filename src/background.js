// ============================================================
// Utiq Blocker - Script de fond (Background Service Worker)
// Rôle : Gérer l'état de l'extension, les icônes, et la
//        communication entre le popup et les content scripts.
// ============================================================

// --- Clés de stockage pour persister les préférences ---
const STORAGE_KEY_ENABLED = "utiqBlocker_enabled";
const STORAGE_KEY_BLOCK_COUNT = "utiqBlocker_blockCount";
const STORAGE_KEY_GLOBAL_COUNT = "utiqBlocker_globalCount";
const STORAGE_KEY_WHITELIST = "utiqBlocker_whitelist";
const STORAGE_KEY_CUSTOM_DOMAINS = "utiqBlocker_customDomains";
const DYNAMIC_RULE_ID_START = 1000;
const STORAGE_KEY_HISTORY = "utiqBlocker_history";
const HISTORY_MAX_DAYS = 7;

// Mutex par tab pour sérialiser les reportBlock concurrents (all_frames)
const _tabMutexes = new Map();

// --- Détection de la disponibilité de l'API updateEnabledRulesets ---
// Cette API n'existe qu'à partir de Firefox 114. Sur Firefox 113 et Android,
// on dégrade gracieusement : le blocage réseau DNR reste actif en permanence,
// et le toggle contrôle uniquement le blocage DOM + cookies + stockage.
const UPDATE_RULESETS_DISPONIBLE =
  typeof browser.declarativeNetRequest !== "undefined" &&
  typeof browser.declarativeNetRequest.updateEnabledRulesets === "function";

// --- Initialisation au moment de l'installation de l'extension ---
browser.runtime.onInstalled.addListener(async function (details) {
  const stored = await browser.storage.local.get([
    STORAGE_KEY_ENABLED,
    STORAGE_KEY_GLOBAL_COUNT,
    STORAGE_KEY_CUSTOM_DOMAINS
  ]);

  const defaults = {};
  if (stored[STORAGE_KEY_ENABLED] === undefined) {
    defaults[STORAGE_KEY_ENABLED] = true;
  }
  if (stored[STORAGE_KEY_GLOBAL_COUNT] === undefined) {
    defaults[STORAGE_KEY_GLOBAL_COUNT] = 0;
  }
  if (stored[STORAGE_KEY_CUSTOM_DOMAINS] === undefined) {
    defaults[STORAGE_KEY_CUSTOM_DOMAINS] = [];
  }

  if (Object.keys(defaults).length > 0) {
    await browser.storage.local.set(defaults);
  }

  // Ouvre la page d'onboarding au premier install
  if (details.reason === "install") {
    await browser.tabs.create({
      url: browser.runtime.getURL("onboarding/onboarding.html")
    });
  }

  // L'icône et les règles DNR sont mises à jour par l'IIFE d'init ci-dessous
});

// --- Change l'icône de la barre d'outils selon l'état ---
async function mettreAJourIcone(estActive, menaceDetectee) {
  let cheminIcone;
  if (!estActive) {
    cheminIcone = {
      16: "icons/icon-inactive.svg",
      32: "icons/icon-inactive.svg",
      48: "icons/icon-inactive.svg",
      128: "icons/icon-inactive.svg"
    };
  } else if (menaceDetectee) {
    cheminIcone = {
      16: "icons/icon-blocked.svg",
      32: "icons/icon-blocked.svg",
      48: "icons/icon-blocked.svg",
      128: "icons/icon-blocked.svg"
    };
  } else {
    cheminIcone = {
      16: "icons/icon-16.svg",
      32: "icons/icon-32.svg",
      48: "icons/icon-48.svg",
      128: "icons/icon-128.svg"
    };
  }
  await browser.action.setIcon({ path: cheminIcone });
}

/**
 * Active ou désactive les règles DNR en fonction de l'état.
 * Utilise updateEnabledRulesets si disponible (Firefox 114+),
 * sinon ne fait rien (dégradation gracieuse : les règles restent actives
 * et le blocage DOM prend le relais).
 */
async function basculerReglesDNR(activer) {
  if (!UPDATE_RULESETS_DISPONIBLE) return;
  try {
    if (activer) {
      await browser.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ["utiq_rules"]
      });
    } else {
      await browser.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ["utiq_rules"]
      });
    }
  } catch (_e) {
    // Ignore silencieusement (Firefox Android ou version trop ancienne)
  }
}

/**
 * Vérifie si l'API DNR dynamique est disponible.
 */
function isDynamicDNRDisponible() {
  return typeof browser.declarativeNetRequest !== "undefined" &&
         typeof browser.declarativeNetRequest.updateDynamicRules === "function";
}

/**
 * Vérifie si l'API DNR session rules est disponible.
 */
function isSessionDNRDisponible() {
  return typeof browser.declarativeNetRequest !== "undefined" &&
         typeof browser.declarativeNetRequest.updateSessionRules === "function";
}

/**
 * Met à jour les règles de session DNR pour autoriser les requêtes
 * Utiq sur les domaines whitelistés. Ces règles "allow" à priorité
 * élevée surclassent les règles "block" statiques de rules.json.
 * Appelée à chaque modification de la whitelist.
 */
async function mettreAJourReglesWhitelist() {
  if (!isSessionDNRDisponible()) return;

  try {
    const stored = await browser.storage.local.get(STORAGE_KEY_WHITELIST);
    const whitelist = stored[STORAGE_KEY_WHITELIST] || [];

    // Récupère les règles de session existantes de notre extension
    const existingRules = await browser.declarativeNetRequest.getSessionRules();
    const existingIds = existingRules
      .filter(function(rule) { return rule.id >= 2000; })
      .map(function(rule) { return rule.id; });

    // Supprime les anciennes règles de whitelist
    if (existingIds.length > 0) {
      await browser.declarativeNetRequest.updateSessionRules({
        removeRuleIds: existingIds
      });
    }

    // Crée une règle "allow" par domaine whitelisté
    if (whitelist.length > 0) {
      const newRules = [];
      for (let i = 0; i < whitelist.length; i++) {
        newRules.push({
          id: 2000 + i,
          priority: 10,
          action: { type: "allow" },
          condition: {
            initiatorDomains: [whitelist[i]],
            resourceTypes: [
              "main_frame", "sub_frame", "script", "image",
              "xmlhttprequest", "ping", "stylesheet", "font",
              "object", "media", "websocket", "other"
            ]
          }
        });
      }

      await browser.declarativeNetRequest.updateSessionRules({
        addRules: newRules
      });
    }
  } catch (_e) {
    // Silencieux (version Firefox trop ancienne ou Android)
  }
}

/**
 * Récupère la liste des domaines personnalisés depuis le stockage.
 */
async function getCustomDomains() {
  const stored = await browser.storage.local.get(STORAGE_KEY_CUSTOM_DOMAINS);
  return stored[STORAGE_KEY_CUSTOM_DOMAINS] || [];
}

/**
 * Met à jour les règles DNR dynamiques en fonction des domaines personnalisés.
 */
async function mettreAJourReglesDynamiques() {
  if (!isDynamicDNRDisponible()) return;

  try {
    const customDomains = await getCustomDomains();
    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(function(rule) { return rule.id; });

    // Supprime toutes les règles dynamiques existantes de notre extension
    if (existingIds.length > 0) {
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds
      });
    }

    // Ajoute les nouvelles règles pour chaque domaine personnalisé
    if (customDomains.length > 0) {
      const newRules = [];
      for (let i = 0; i < customDomains.length; i++) {
        newRules.push({
          id: DYNAMIC_RULE_ID_START + i,
          priority: 1,
          action: { type: "block" },
          condition: {
            urlFilter: "||" + customDomains[i] + "/",
            resourceTypes: ["main_frame", "sub_frame", "script", "image", "xmlhttprequest", "ping", "stylesheet", "font", "object", "media", "websocket", "other"]
          }
        });
      }

      await browser.declarativeNetRequest.updateDynamicRules({
        addRules: newRules
      });
    }
  } catch (_e) {
    console.error("[Utiq Blocker] Erreur mise à jour règles dynamiques:", _e);
  }
}

/**
 * Enregistre un événement de blocage dans l'historique.
 * Nettoie automatiquement les entrées de plus de 7 jours.
 */
async function enregistrerHistorique(domain, count) {
  if (count <= 0) return;
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY_HISTORY);
    const history = stored[STORAGE_KEY_HISTORY] || [];
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    // Cherche une entrée existante pour ce domaine aujourd'hui
    const existing = history.find(function(e) {
      return e.date === dateStr && e.domain === domain;
    });
    if (existing) {
      existing.count += count;
    } else {
      history.push({ date: dateStr, domain: domain, count: count });
    }

    // Nettoie les entrées de plus de 7 jours
    const cutoff = new Date(now.getTime() - HISTORY_MAX_DAYS * 86400000);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const cleaned = history.filter(function(e) { return e.date >= cutoffStr; });

    await browser.storage.local.set({ [STORAGE_KEY_HISTORY]: cleaned });
  } catch (_e) { /* storage non disponible */ }
}

/**
 * Logique de traitement d'un reportBlock (sérialisée par tab via mutex).
 * Stocke le compteur par frame, calcule le total du tab, met à jour le global.
 */
async function traiterReportBlock(sender, message) {
  const newCount = message.count;
  const frameId = sender.frameId !== undefined ? sender.frameId : 0;
  const frameKey = STORAGE_KEY_BLOCK_COUNT + "_" + sender.tab.id + "_" + frameId;

  // Lit l'ancien compteur de cette frame
  const frameData = await browser.storage.local.get(frameKey);
  const previousFrameCount = frameData[frameKey] || 0;

  // Écrase le compteur de cette frame (pas du tab)
  await browser.storage.local.set({ [frameKey]: newCount });

  // Calcule la somme de TOUTES les frames du tab
  const allData = await browser.storage.local.get(null);
  const tabPrefix = STORAGE_KEY_BLOCK_COUNT + "_" + sender.tab.id + "_";
  let totalTabCount = 0;
  for (const key in allData) {
    if (key.indexOf(tabPrefix) === 0) {
      totalTabCount += allData[key] || 0;
    }
  }

  // Met à jour le global avec le diff
  const oldTabTotal = totalTabCount - newCount + previousFrameCount;
  const diff = totalTabCount - oldTabTotal;
  if (diff > 0) {
    const storedGlobal = await browser.storage.local.get(STORAGE_KEY_GLOBAL_COUNT);
    const nouveauGlobal = (storedGlobal[STORAGE_KEY_GLOBAL_COUNT] || 0) + diff;
    await browser.storage.local.set({ [STORAGE_KEY_GLOBAL_COUNT]: nouveauGlobal });
  }

  const etat = await browser.storage.local.get(STORAGE_KEY_ENABLED);
  if (etat[STORAGE_KEY_ENABLED] !== false && newCount > 0) {
    await mettreAJourIcone(true, true);
  }

  // Enregistre dans l'historique (try/catch pour URL non disponible)
  let domain = "unknown";
  try {
    if (sender.tab && sender.tab.url) {
      domain = new URL(sender.tab.url).hostname;
    }
  } catch (_e) { /* URL invalide ou non disponible */ }
  await enregistrerHistorique(domain, totalTabCount);
}

// --- Gestion des messages entrants (popup et content scripts) ---
browser.runtime.onMessage.addListener(async function (message, sender) {
  switch (message.action) {

    case "getStatus": {
      const stored = await browser.storage.local.get([
        STORAGE_KEY_ENABLED,
        STORAGE_KEY_GLOBAL_COUNT,
        STORAGE_KEY_WHITELIST
      ]);

      let tabBlockCount = 0;
      const tabId = message.tabId;
      if (tabId) {
        try {
          // Somme des compteurs de TOUTES les frames de l'onglet
          const allData = await browser.storage.local.get(null);
          const tabPrefix = STORAGE_KEY_BLOCK_COUNT + "_" + tabId + "_";
          for (const key in allData) {
            if (key.indexOf(tabPrefix) === 0) {
              tabBlockCount += allData[key] || 0;
            }
          }
        } catch (_e) { /* tab data non disponible */ }
      }

      const hostname = message.hostname || "";
      const whitelist = stored[STORAGE_KEY_WHITELIST] || [];
      const isWhitelisted = whitelist.indexOf(hostname) !== -1;

      return {
        enabled: stored[STORAGE_KEY_ENABLED] !== false,
        globalCount: stored[STORAGE_KEY_GLOBAL_COUNT] || 0,
        tabBlockCount: tabBlockCount,
        whitelist: whitelist,
        isWhitelisted: isWhitelisted
      };
    }

    case "toggleEnabled": {
      const storedToggle = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      const nouvelEtat = !(storedToggle[STORAGE_KEY_ENABLED] !== false);
      await browser.storage.local.set({ [STORAGE_KEY_ENABLED]: nouvelEtat });

      await basculerReglesDNR(nouvelEtat);
      await mettreAJourIcone(nouvelEtat, false);
      return { enabled: nouvelEtat };
    }

    case "addToWhitelist": {
      const hostname = message.hostname;
      if (!hostname) return { error: "Hostname manquant" };

      const stored = await browser.storage.local.get(STORAGE_KEY_WHITELIST);
      const whitelist = stored[STORAGE_KEY_WHITELIST] || [];

      if (whitelist.indexOf(hostname) === -1) {
        whitelist.push(hostname);
        await browser.storage.local.set({ [STORAGE_KEY_WHITELIST]: whitelist });
        await mettreAJourReglesWhitelist();
      }

      return { success: true, whitelist: whitelist };
    }

    case "removeFromWhitelist": {
      const hostname = message.hostname;
      if (!hostname) return { error: "Hostname manquant" };

      const stored = await browser.storage.local.get(STORAGE_KEY_WHITELIST);
      const whitelist = stored[STORAGE_KEY_WHITELIST] || [];
      const newWhitelist = [];

      for (let i = 0; i < whitelist.length; i++) {
        if (whitelist[i] !== hostname) {
          newWhitelist.push(whitelist[i]);
        }
      }

      await browser.storage.local.set({ [STORAGE_KEY_WHITELIST]: newWhitelist });
      await mettreAJourReglesWhitelist();

      return { success: true, whitelist: newWhitelist };
    }

    case "getCustomDomains": {
      const customDomains = await getCustomDomains();
      return { success: true, domains: customDomains };
    }

    case "addCustomDomain": {
      const domain = message.domain;
      if (!domain) return { error: "Domaine manquant" };

      const customDomains = await getCustomDomains();

      if (customDomains.indexOf(domain) === -1) {
        customDomains.push(domain);
        await browser.storage.local.set({ [STORAGE_KEY_CUSTOM_DOMAINS]: customDomains });
        await mettreAJourReglesDynamiques();
      }

      return { success: true, domains: customDomains };
    }

    case "removeCustomDomain": {
      const domain = message.domain;
      if (!domain) return { error: "Domaine manquant" };

      const customDomains = await getCustomDomains();
      const newDomains = [];

      for (let j = 0; j < customDomains.length; j++) {
        if (customDomains[j] !== domain) {
          newDomains.push(customDomains[j]);
        }
      }

      await browser.storage.local.set({ [STORAGE_KEY_CUSTOM_DOMAINS]: newDomains });
      await mettreAJourReglesDynamiques();

      return { success: true, domains: newDomains };
    }

    case "reportBlock": {
      const tabId = sender.tab ? sender.tab.id : null;
      if (!tabId) return { success: true };

      // Sérialise les reportBlock concurrents du même onglet via un mutex
      const prev = _tabMutexes.get(tabId) || Promise.resolve();
      const current = prev.then(() => traiterReportBlock(sender, message));
      _tabMutexes.set(tabId, current.catch(() => {}));
      await current;
      return { success: true };
    }

    case "getHistory": {
      const histStored = await browser.storage.local.get(STORAGE_KEY_HISTORY);
      return { success: true, history: histStored[STORAGE_KEY_HISTORY] || [] };
    }

    case "clearThreatBadge": {
      const etatThreat = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      await mettreAJourIcone(etatThreat[STORAGE_KEY_ENABLED] !== false, false);
      return { success: true };
    }

    default:
      return { error: "Action inconnue" };
  }
});

browser.tabs.onRemoved.addListener(async function (tabId) {
  // Supprime les compteurs de TOUTES les frames de cet onglet
  const allData = await browser.storage.local.get(null);
  const tabPrefix = STORAGE_KEY_BLOCK_COUNT + "_" + tabId + "_";
  const keysToRemove = [];
  for (const key in allData) {
    if (key.indexOf(tabPrefix) === 0) {
      keysToRemove.push(key);
    }
  }
  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
});

(async function init() {
  const stored = await browser.storage.local.get(STORAGE_KEY_ENABLED);
  const estActive = stored[STORAGE_KEY_ENABLED] !== false;
  await mettreAJourIcone(estActive, false);

  if (!estActive) {
    await basculerReglesDNR(false);
  }

  // Initialise les règles dynamiques pour les domaines personnalisés
  await mettreAJourReglesDynamiques();

  // Reconstruit les règles de session pour la whitelist
  await mettreAJourReglesWhitelist();
})();
