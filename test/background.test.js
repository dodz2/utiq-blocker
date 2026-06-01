// ============================================================
// Tests unitaires — Background Service Worker (background.js)
// Teste la logique de gestion d'état, whitelist et DNR
// ============================================================

import { describe, it, expect } from "vitest";
import { createBrowserMock, loadScriptInContext } from "./setup.js";

async function loadBackground(overrides = {}) {
  const { mock, calls, storageData } = createBrowserMock(overrides);

  // Applique les overrides sur le mock AVANT de charger le script
  if (overrides.browser) {
    for (const [key, val] of Object.entries(overrides.browser)) {
      mock[key] = val;
    }
  }

  const ctx = loadScriptInContext("src/background.js", mock);

  // L'IIFE async d'init schedule des microtasks.
  // On attend un tick pour qu'ils s'exécutent, puis on reset les compteurs.
  await new Promise(resolve => setTimeout(resolve, 10));
  calls.storage.get.length = 0;
  calls.storage.set.length = 0;
  calls.storage.remove.length = 0;
  calls.action.setIcon.length = 0;
  calls.declarativeNetRequest.updateSessionRules.length = 0;
  calls.declarativeNetRequest.updateDynamicRules.length = 0;
  calls.declarativeNetRequest.updateEnabledRulesets.length = 0;

  return { ctx, mock, calls, storageData };
}

describe("détection des APIs DNR", () => {
  it("isDynamicDNRDisponible retourne true si l'API existe", async () => {
    const { ctx } = await loadBackground();
    expect(ctx.isDynamicDNRDisponible()).toBe(true);
  });

  it("isDynamicDNRDisponible retourne false si l'API manque", async () => {
    const { ctx } = await loadBackground({
      browser: {
        declarativeNetRequest: { updateEnabledRulesets: async () => {} }
      }
    });
    expect(ctx.isDynamicDNRDisponible()).toBe(false);
  });

  it("isSessionDNRDisponible retourne true si l'API existe", async () => {
    const { ctx } = await loadBackground();
    expect(ctx.isSessionDNRDisponible()).toBe(true);
  });

  it("isSessionDNRDisponible retourne false si l'API manque", async () => {
    const { ctx } = await loadBackground({
      browser: {
        declarativeNetRequest: { updateEnabledRulesets: async () => {} }
      }
    });
    expect(ctx.isSessionDNRDisponible()).toBe(false);
  });
});

describe("mettreAJourReglesWhitelist", () => {
  it("ne fait rien si l'API session rules n'est pas disponible", async () => {
    const { ctx, calls } = await loadBackground({
      browser: {
        declarativeNetRequest: { updateEnabledRulesets: async () => {} }
      }
    });
    await ctx.mettreAJourReglesWhitelist();
    expect(calls.declarativeNetRequest.updateSessionRules).toHaveLength(0);
  });

  it("supprime les anciennes règles et crée des règles allow pour la whitelist", async () => {
    const { ctx, calls, storageData } = await loadBackground({
      sessionRules: [
        { id: 2000, action: { type: "allow" } },
        { id: 999, action: { type: "block" } }
      ]
    });

    storageData["utiqBlocker_whitelist"] = ["example.com", "test.org"];

    await ctx.mettreAJourReglesWhitelist();

    expect(calls.declarativeNetRequest.updateSessionRules).toHaveLength(2);
    const removeCall = calls.declarativeNetRequest.updateSessionRules[0];
    expect(removeCall.removeRuleIds).toEqual([2000]);

    const addCall = calls.declarativeNetRequest.updateSessionRules[1];
    expect(addCall.addRules).toHaveLength(2);
    expect(addCall.addRules[0].id).toBe(2000);
    expect(addCall.addRules[0].priority).toBe(10);
    expect(addCall.addRules[0].action.type).toBe("allow");
    expect(addCall.addRules[0].condition.initiatorDomains).toEqual(["example.com"]);
    expect(addCall.addRules[1].id).toBe(2001);
    expect(addCall.addRules[1].condition.initiatorDomains).toEqual(["test.org"]);
  });

  it("ne crée pas de règles si la whitelist est vide", async () => {
    const { ctx, calls } = await loadBackground();
    await ctx.mettreAJourReglesWhitelist();
    expect(calls.declarativeNetRequest.updateSessionRules).toHaveLength(0);
  });
});

describe("mettreAJourReglesDynamiques", () => {
  it("ne fait rien si l'API dynamique n'est pas disponible", async () => {
    const { ctx, calls } = await loadBackground({
      browser: {
        declarativeNetRequest: { updateEnabledRulesets: async () => {} }
      }
    });
    await ctx.mettreAJourReglesDynamiques();
    expect(calls.declarativeNetRequest.updateDynamicRules).toHaveLength(0);
  });

  it("crée des règles block pour les domaines personnalisés", async () => {
    const { ctx, calls, storageData } = await loadBackground();
    storageData["utiqBlocker_customDomains"] = ["tracker.example.com"];

    await ctx.mettreAJourReglesDynamiques();

    expect(calls.declarativeNetRequest.updateDynamicRules).toHaveLength(1);
    const addCall = calls.declarativeNetRequest.updateDynamicRules[0];
    expect(addCall.addRules).toHaveLength(1);
    expect(addCall.addRules[0].id).toBe(1000);
    expect(addCall.addRules[0].action.type).toBe("block");
    expect(addCall.addRules[0].condition.urlFilter).toBe("||tracker.example.com/");
  });
});

describe("basculerReglesDNR", () => {
  it("active le ruleset quand activer=true", async () => {
    const { ctx, calls } = await loadBackground();
    await ctx.basculerReglesDNR(true);
    expect(calls.declarativeNetRequest.updateEnabledRulesets).toHaveLength(1);
    expect(calls.declarativeNetRequest.updateEnabledRulesets[0]).toEqual({
      enableRulesetIds: ["utiq_rules"]
    });
  });

  it("désactive le ruleset quand activer=false", async () => {
    const { ctx, calls } = await loadBackground();
    await ctx.basculerReglesDNR(false);
    expect(calls.declarativeNetRequest.updateEnabledRulesets).toHaveLength(1);
    expect(calls.declarativeNetRequest.updateEnabledRulesets[0]).toEqual({
      disableRulesetIds: ["utiq_rules"]
    });
  });

  it("ne fait rien si l'API n'est pas disponible", async () => {
    const { ctx, calls } = await loadBackground({
      browser: {
        declarativeNetRequest: undefined
      }
    });
    await ctx.basculerReglesDNR(true);
    expect(calls.declarativeNetRequest.updateEnabledRulesets).toHaveLength(0);
  });
});

describe("mettreAJourIcone", () => {
  it("utilise l'icône inactive quand estActive=false", async () => {
    const { ctx, calls } = await loadBackground();
    await ctx.mettreAJourIcone(false, false);
    expect(calls.action.setIcon).toHaveLength(1);
    expect(calls.action.setIcon[0].path[16]).toBe("icons/icon-inactive.svg");
  });

  it("utilise l'icône bloquée quand menaceDetectee=true", async () => {
    const { ctx, calls } = await loadBackground();
    await ctx.mettreAJourIcone(true, true);
    expect(calls.action.setIcon).toHaveLength(1);
    expect(calls.action.setIcon[0].path[16]).toBe("icons/icon-blocked.svg");
  });

  it("utilise l'icône active par défaut", async () => {
    const { ctx, calls } = await loadBackground();
    await ctx.mettreAJourIcone(true, false);
    expect(calls.action.setIcon).toHaveLength(1);
    expect(calls.action.setIcon[0].path[16]).toBe("icons/icon-16.svg");
  });
});

describe("clés de stockage", () => {
  it("utilise les bonnes clés de stockage", async () => {
    const { ctx } = await loadBackground();
    expect(ctx.__get("STORAGE_KEY_ENABLED")).toBe("utiqBlocker_enabled");
    expect(ctx.__get("STORAGE_KEY_BLOCK_COUNT")).toBe("utiqBlocker_blockCount");
    expect(ctx.__get("STORAGE_KEY_GLOBAL_COUNT")).toBe("utiqBlocker_globalCount");
    expect(ctx.__get("STORAGE_KEY_WHITELIST")).toBe("utiqBlocker_whitelist");
    expect(ctx.__get("STORAGE_KEY_CUSTOM_DOMAINS")).toBe("utiqBlocker_customDomains");
  });

  it("DYNAMIC_RULE_ID_START vaut 1000", async () => {
    const { ctx } = await loadBackground();
    expect(ctx.__get("DYNAMIC_RULE_ID_START")).toBe(1000);
  });
});
