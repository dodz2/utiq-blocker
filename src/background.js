// ============================================================
// Utiq Blocker - Script de fond (Background Service Worker)
// Rôle : Gérer l'état de l'extension, les icônes, et la
//        communication entre le popup et les content scripts.
// ============================================================

// --- Clés de stockage pour persister les préférences ---
var STORAGE_KEY_ENABLED = "utiqBlocker_enabled";
var STORAGE_KEY_BLOCK_COUNT = "utiqBlocker_blockCount";
var STORAGE_KEY_GLOBAL_COUNT = "utiqBlocker_globalCount";
var STORAGE_KEY_WHITELIST = "utiqBlocker_whitelist";

// --- Détection de la disponibilité de l'API updateEnabledRulesets ---
// Cette API n'existe qu'à partir de Firefox 114. Sur Firefox 113 et Android,
// on dégrade gracieusement : le blocage réseau DNR reste actif en permanence,
// et le toggle contrôle uniquement le blocage DOM + cookies + stockage.
var UPDATE_RULESETS_DISPONIBLE =
  typeof browser.declarativeNetRequest !== "undefined" &&
  typeof browser.declarativeNetRequest.updateEnabledRulesets === "function";

// --- Initialisation au moment de l'installation de l'extension ---
browser.runtime.onInstalled.addListener(async function () {
  var stored = await browser.storage.local.get([
    STORAGE_KEY_ENABLED,
    STORAGE_KEY_GLOBAL_COUNT
  ]);

  var defaults = {};
  if (stored[STORAGE_KEY_ENABLED] === undefined) {
    defaults[STORAGE_KEY_ENABLED] = true;
  }
  if (stored[STORAGE_KEY_GLOBAL_COUNT] === undefined) {
    defaults[STORAGE_KEY_GLOBAL_COUNT] = 0;
  }

  if (Object.keys(defaults).length > 0) {
    await browser.storage.local.set(defaults);
  }

  var estActive = stored[STORAGE_KEY_ENABLED] !== undefined
    ? stored[STORAGE_KEY_ENABLED]
    : true;
  await mettreAJourIcone(estActive, false);
});

// --- Change l'icône de la barre d'outils selon l'état ---
async function mettreAJourIcone(estActive, menaceDetectee) {
  var cheminIcone;
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
  } catch (e) {
    // Ignore silencieusement (Firefox Android ou version trop ancienne)
  }
}

// --- Gestion des messages entrants (popup et content scripts) ---
browser.runtime.onMessage.addListener(async function (message, sender) {
  switch (message.action) {

    case "getStatus": {
      var stored = await browser.storage.local.get([
        STORAGE_KEY_ENABLED,
        STORAGE_KEY_GLOBAL_COUNT,
        STORAGE_KEY_WHITELIST
      ]);

      var tabBlockCount = 0;
      var tabId = message.tabId;
      if (tabId) {
        try {
          var tabData = await browser.storage.local.get(
            STORAGE_KEY_BLOCK_COUNT + "_" + tabId
          );
          tabBlockCount = tabData[STORAGE_KEY_BLOCK_COUNT + "_" + tabId] || 0;
        } catch (e) {}
      }

      var hostname = message.hostname || "";
      var whitelist = stored[STORAGE_KEY_WHITELIST] || [];
      var isWhitelisted = whitelist.indexOf(hostname) !== -1;

      return {
        enabled: stored[STORAGE_KEY_ENABLED] !== false,
        globalCount: stored[STORAGE_KEY_GLOBAL_COUNT] || 0,
        tabBlockCount: tabBlockCount,
        whitelist: whitelist,
        isWhitelisted: isWhitelisted
      };
    }

    case "toggleEnabled": {
      var storedToggle = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      var nouvelEtat = !(storedToggle[STORAGE_KEY_ENABLED] !== false);
      await browser.storage.local.set({ [STORAGE_KEY_ENABLED]: nouvelEtat });

      await basculerReglesDNR(nouvelEtat);
      await mettreAJourIcone(nouvelEtat, false);
      return { enabled: nouvelEtat };
    }

    case "addToWhitelist": {
      var hostname = message.hostname;
      if (!hostname) return { error: "Hostname manquant" };

      var stored = await browser.storage.local.get(STORAGE_KEY_WHITELIST);
      var whitelist = stored[STORAGE_KEY_WHITELIST] || [];

      if (whitelist.indexOf(hostname) === -1) {
        whitelist.push(hostname);
        await browser.storage.local.set({ [STORAGE_KEY_WHITELIST]: whitelist });
      }

      return { success: true, whitelist: whitelist };
    }

    case "removeFromWhitelist": {
      var hostname = message.hostname;
      if (!hostname) return { error: "Hostname manquant" };

      var stored = await browser.storage.local.get(STORAGE_KEY_WHITELIST);
      var whitelist = stored[STORAGE_KEY_WHITELIST] || [];
      var newWhitelist = [];

      for (var i = 0; i < whitelist.length; i++) {
        if (whitelist[i] !== hostname) {
          newWhitelist.push(whitelist[i]);
        }
      }

      await browser.storage.local.set({ [STORAGE_KEY_WHITELIST]: newWhitelist });

      return { success: true, whitelist: newWhitelist };
    }

    case "reportBlock": {
      var newCount = message.count;
      var tabId = sender.tab ? sender.tab.id : message.tabId;

      var previousTabCount = 0;
      if (tabId) {
        var tabData = await browser.storage.local.get(
          STORAGE_KEY_BLOCK_COUNT + "_" + tabId
        );
        previousTabCount = tabData[STORAGE_KEY_BLOCK_COUNT + "_" + tabId] || 0;

        await browser.storage.local.set({
          [STORAGE_KEY_BLOCK_COUNT + "_" + tabId]: newCount
        });
      }

      var diff = newCount - previousTabCount;
      if (diff > 0) {
        var storedGlobal = await browser.storage.local.get(STORAGE_KEY_GLOBAL_COUNT);
        var nouveauGlobal = (storedGlobal[STORAGE_KEY_GLOBAL_COUNT] || 0) + diff;
        await browser.storage.local.set({ [STORAGE_KEY_GLOBAL_COUNT]: nouveauGlobal });
      }

      var etat = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      if (etat[STORAGE_KEY_ENABLED] !== false && newCount > 0) {
        await mettreAJourIcone(true, true);
      }

      return { success: true };
    }

    case "clearThreatBadge": {
      var etatThreat = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      await mettreAJourIcone(etatThreat[STORAGE_KEY_ENABLED] !== false, false);
      return { success: true };
    }

    default:
      return { error: "Action inconnue" };
  }
});

browser.tabs.onRemoved.addListener(async function (tabId) {
  await browser.storage.local.remove(STORAGE_KEY_BLOCK_COUNT + "_" + tabId);
});

(async function init() {
  var stored = await browser.storage.local.get(STORAGE_KEY_ENABLED);
  var estActive = stored[STORAGE_KEY_ENABLED] !== false;
  await mettreAJourIcone(estActive, false);

  if (!estActive) {
    await basculerReglesDNR(false);
  }
})();