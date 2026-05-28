// ============================================================
// Utiq Blocker - Script de fond (Background Service Worker)
// Rôle : Gérer l'état de l'extension, les icônes, et la
//        communication entre le popup et les content scripts.
// ============================================================

// --- Clés de stockage pour persister les préférences ---
var STORAGE_KEY_ENABLED = "utiqBlocker_enabled";
var STORAGE_KEY_BLOCK_COUNT = "utiqBlocker_blockCount";
var STORAGE_KEY_GLOBAL_COUNT = "utiqBlocker_globalCount";

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

  // Applique l'icône correspondant à l'état initial
  var estActive = stored[STORAGE_KEY_ENABLED] !== undefined
    ? stored[STORAGE_KEY_ENABLED]
    : true;
  await mettreAJourIcone(estActive, false);
});

// --- Change l'icône de la barre d'outils selon l'état ---
async function mettreAJourIcone(estActive, menaceDetectee) {
  var cheminIcone;
  if (!estActive) {
    // Protection désactivée : icône grise
    cheminIcone = {
      16: "icons/icon-inactive.svg",
      32: "icons/icon-inactive.svg",
      48: "icons/icon-inactive.svg",
      128: "icons/icon-inactive.svg"
    };
  } else if (menaceDetectee) {
    // Protection active et menace détectée : icône orange/rouge
    cheminIcone = {
      16: "icons/icon-blocked.svg",
      32: "icons/icon-blocked.svg",
      48: "icons/icon-blocked.svg",
      128: "icons/icon-blocked.svg"
    };
  } else {
    // Protection active, rien détecté : icône verte par défaut
    cheminIcone = {
      16: "icons/icon-16.svg",
      32: "icons/icon-32.svg",
      48: "icons/icon-48.svg",
      128: "icons/icon-128.svg"
    };
  }
  await browser.action.setIcon({ path: cheminIcone });
}

// --- Gestion des messages entrants (popup et content scripts) ---
browser.runtime.onMessage.addListener(async function (message, sender) {
  switch (message.action) {

    // Le popup demande l'état actuel de la protection
    case "getStatus": {
      var stored = await browser.storage.local.get([
        STORAGE_KEY_ENABLED,
        STORAGE_KEY_GLOBAL_COUNT
      ]);

      // Récupère le compteur de blocages pour l'onglet demandé
      var tabBlockCount = 0;
      if (message.tabId) {
        try {
          var tabData = await browser.storage.local.get(
            STORAGE_KEY_BLOCK_COUNT + "_" + message.tabId
          );
          tabBlockCount = tabData[STORAGE_KEY_BLOCK_COUNT + "_" + message.tabId] || 0;
        } catch (e) {
          // Ignore silencieusement les erreurs de lecture
        }
      }

      return {
        enabled: stored[STORAGE_KEY_ENABLED] !== false,
        globalCount: stored[STORAGE_KEY_GLOBAL_COUNT] || 0,
        tabBlockCount: tabBlockCount
      };
    }

    // Le popup demande de basculer l'état activé/désactivé
    case "toggleEnabled": {
      var storedToggle = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      var nouvelEtat = !(storedToggle[STORAGE_KEY_ENABLED] !== false);
      await browser.storage.local.set({ [STORAGE_KEY_ENABLED]: nouvelEtat });

      // Active ou désactive les règles DNR selon l'état
      if (nouvelEtat) {
        await browser.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: ["utiq_rules"]
        });
      } else {
        await browser.declarativeNetRequest.updateEnabledRulesets({
          disableRulesetIds: ["utiq_rules"]
        });
      }

      await mettreAJourIcone(nouvelEtat, false);
      return { enabled: nouvelEtat };
    }

    // Un content script signale des blocages effectués dans le DOM
    case "reportBlock": {
      var count = message.count;
      var tabId = sender.tab ? sender.tab.id : message.tabId;

      if (tabId) {
        // Met à jour le compteur spécifique à cet onglet
        await browser.storage.local.set({
          [STORAGE_KEY_BLOCK_COUNT + "_" + tabId]: count
        });
      }

      // Incrémente le compteur global
      var storedGlobal = await browser.storage.local.get(STORAGE_KEY_GLOBAL_COUNT);
      var nouveauGlobal = (storedGlobal[STORAGE_KEY_GLOBAL_COUNT] || 0) + 1;
      await browser.storage.local.set({ [STORAGE_KEY_GLOBAL_COUNT]: nouveauGlobal });

      // Met à jour l'icône pour signaler une menace détectée
      var etat = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      if (etat[STORAGE_KEY_ENABLED] !== false && count > 0) {
        await mettreAJourIcone(true, true);
      }

      return { success: true };
    }

    // Réinitialise le badge de menace détectée
    case "clearThreatBadge": {
      var etatThreat = await browser.storage.local.get(STORAGE_KEY_ENABLED);
      await mettreAJourIcone(etatThreat[STORAGE_KEY_ENABLED] !== false, false);
      return { success: true };
    }

    default:
      return { error: "Action inconnue" };
  }
});

// --- Nettoyage des compteurs quand un onglet est fermé ---
browser.tabs.onRemoved.addListener(async function (tabId) {
  await browser.storage.local.remove(STORAGE_KEY_BLOCK_COUNT + "_" + tabId);
});

// --- Au démarrage du service worker, synchronise l'état ---
(async function init() {
  var stored = await browser.storage.local.get(STORAGE_KEY_ENABLED);
  var estActive = stored[STORAGE_KEY_ENABLED] !== false;
  await mettreAJourIcone(estActive, false);

  // S'assure que les règles DNR reflètent l'état au démarrage
  if (!estActive) {
    try {
      await browser.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ["utiq_rules"]
      });
    } catch (e) {
      // Les règles peuvent ne pas encore exister
    }
  }
})();