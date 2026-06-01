// ============================================================
// Setup des mocks pour les tests unitaires
// Fournit des substituts pour les APIs WebExtension et DOM
// ============================================================

import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Crée un mock de l'API browser (WebExtension).
 * Enregistre les appels pour vérification dans les tests.
 */
export function createBrowserMock(overrides = {}) {
  const calls = {
    storage: { get: [], set: [], remove: [] },
    runtime: { sendMessage: [] },
    declarativeNetRequest: {
      updateSessionRules: [],
      updateDynamicRules: [],
      updateEnabledRulesets: [],
      getSessionRules: [],
      getDynamicRules: []
    },
    action: { setIcon: [] },
    tabs: { query: [], onRemoved: [] }
  };

  const storageData = {};

  const mock = {
    storage: {
      local: {
        get: async (keys) => {
          calls.storage.get.push(keys);
          const keysArr = typeof keys === "string" ? [keys] : (keys || []);
          const result = {};
          for (const k of keysArr) {
            if (k in storageData) result[k] = storageData[k];
          }
          return result;
        },
        set: async (items) => {
          calls.storage.set.push(items);
          Object.assign(storageData, items);
        },
        remove: async (keys) => {
          calls.storage.remove.push(keys);
          const keysArr = typeof keys === "string" ? [keys] : keys;
          for (const k of keysArr) delete storageData[k];
        }
      },
      onChanged: { addListener: () => {} }
    },
    runtime: {
      sendMessage: async (msg) => {
        calls.runtime.sendMessage.push(msg);
        return overrides.onSendMessage?.(msg) || {};
      },
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} }
    },
    declarativeNetRequest: {
      updateSessionRules: async (opts) => {
        calls.declarativeNetRequest.updateSessionRules.push(opts);
      },
      updateDynamicRules: async (opts) => {
        calls.declarativeNetRequest.updateDynamicRules.push(opts);
      },
      updateEnabledRulesets: async (opts) => {
        calls.declarativeNetRequest.updateEnabledRulesets.push(opts);
      },
      getSessionRules: async () => {
        return overrides.sessionRules || [];
      },
      getDynamicRules: async () => {
        return overrides.dynamicRules || [];
      }
    },
    action: {
      setIcon: async (opts) => {
        calls.action.setIcon.push(opts);
      }
    },
    tabs: {
      query: async () => [],
      onRemoved: { addListener: () => {} }
    }
  };

  return { mock, calls, storageData };
}

/**
 * Charge et évalue un fichier JS dans un contexte mocké.
 * Retourne le contexte + une fonction helper pour accéder aux variables
 * déclarées avec const/let (invisibles comme propriétés du contexte vm).
 */
export function loadScriptInContext(filePath, browserMock, extraGlobals = {}) {
  const code = readFileSync(resolve(filePath), "utf8");

  const context = createContext({
    browser: browserMock,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: class MockMutationObserver {
      observe() {}
      disconnect() {}
    },
    Storage: function Storage() {},
    Document: function Document() {},
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Math,
    Date,
    JSON,
    Error,
    TypeError,
    encodeURIComponent,
    decodeURIComponent,
    ...extraGlobals
  });

  // Setup prototypes after context creation
  runInContext(`
    Storage.prototype.setItem = function() {};
    Document.prototype.cookie = {
      set: function() {},
      get: function() { return ""; }
    };
  `, context);

  runInContext(code, context);

  // Helper pour lire les variables const/let du contexte vm
  // (const/let ne sont pas des propriétés de l'objet contexte, contrairement à var)
  context.__get = (name) => runInContext(name, context);

  return context;
}
