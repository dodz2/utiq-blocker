// ============================================================
// Tests unitaires — Content Script (content.js)
// Teste les fonctions pures de détection DOM et heuristique
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createBrowserMock, loadScriptInContext } from "./setup.js";

function loadContent(extraGlobals = {}) {
  const { mock } = createBrowserMock();
  return loadScriptInContext("src/content.js", mock, {
    window: { location: { hostname: "example.com" } },
    document: {
      querySelectorAll: () => [],
      cookie: "",
      location: { hostname: "example.com" },
      createElement: () => ({ textContent: "", async: false }),
      documentElement: { appendChild: () => {}, removeChild: () => {} }
    },
    localStorage: { length: 0, key: () => null, removeItem: () => {} },
    sessionStorage: { length: 0, key: () => null, removeItem: () => {} },
    ...extraGlobals
  });
}

describe("contientDomaineUtiq", () => {
  let ctx;
  beforeEach(() => { ctx = loadContent(); });

  it("détecte utiq.com dans une URL", () => {
    expect(ctx.contientDomaineUtiq("https://cdn.utiq.com/script.js")).toBe(true);
  });

  it("détecte consenthub.utiq.com", () => {
    expect(ctx.contientDomaineUtiq("https://consenthub.utiq.com/consent")).toBe(true);
  });

  it("détecte marti.utiq.com", () => {
    expect(ctx.contientDomaineUtiq("https://marti.utiq.com/api/v1")).toBe(true);
  });

  it("retourne false pour une URL non-Utiq", () => {
    expect(ctx.contientDomaineUtiq("https://example.com/page")).toBe(false);
  });

  it("retourne false pour null", () => {
    expect(ctx.contientDomaineUtiq(null)).toBe(false);
  });

  it("retourne false pour undefined", () => {
    expect(ctx.contientDomaineUtiq(undefined)).toBe(false);
  });

  it("retourne false pour une chaîne vide", () => {
    expect(ctx.contientDomaineUtiq("")).toBe(false);
  });

  it("retourne false pour un non-string", () => {
    expect(ctx.contientDomaineUtiq(42)).toBe(false);
  });

  it("détecte insensible à la casse", () => {
    expect(ctx.contientDomaineUtiq("https://CDN.UTIQ.COM/x")).toBe(true);
  });

  it("détecte dans un texte inline (pas une URL)", () => {
    expect(ctx.contientDomaineUtiq("var url = 'https://api.utiq.com/data'")).toBe(true);
  });
});

describe("estCleUtiq", () => {
  let ctx;
  beforeEach(() => { ctx = loadContent(); });

  it("détecte utiq_consent", () => {
    expect(ctx.estCleUtiq("utiq_consent")).toBe(true);
  });

  it("détecte __utiq", () => {
    expect(ctx.estCleUtiq("__utiq")).toBe(true);
  });

  it("détecte marti_session", () => {
    expect(ctx.estCleUtiq("marti_session")).toBe(true);
  });

  it("détecte consenthub", () => {
    expect(ctx.estCleUtiq("consenthub")).toBe(true);
  });

  it("détecte consentpass", () => {
    expect(ctx.estCleUtiq("consentpass")).toBe(true);
  });

  it("retourne false pour une clé non-Utiq", () => {
    expect(ctx.estCleUtiq("session_id")).toBe(false);
  });

  it("retourne false pour null", () => {
    expect(ctx.estCleUtiq(null)).toBe(false);
  });

  it("retourne false pour undefined", () => {
    expect(ctx.estCleUtiq(undefined)).toBe(false);
  });

  it("retourne false pour une chaîne vide", () => {
    expect(ctx.estCleUtiq("")).toBe(false);
  });

  it("détecte insensible à la casse", () => {
    expect(ctx.estCleUtiq("UTIQ_CONSENT")).toBe(true);
  });
});

describe("analyserScriptHeuristique", () => {
  let ctx;
  beforeEach(() => { ctx = loadContent(); });

  // --- Niveau 1 : Signatures directes Utiq ---
  describe("niveau 1 — signatures directes Utiq", () => {
    it("détecte 'utiq' dans le contenu", () => {
      expect(ctx.analyserScriptHeuristique("var x = 'utiq_consent';")).toBe(true);
    });

    it("détecte 'consenthub'", () => {
      expect(ctx.analyserScriptHeuristique("fetch('https://consenthub.example.com')")).toBe(true);
    });

    it("détecte 'consentpass'", () => {
      expect(ctx.analyserScriptHeuristique("let token = consentpass.getToken()")).toBe(true);
    });

    it("détecte 'marti_session'", () => {
      expect(ctx.analyserScriptHeuristique("localStorage.setItem('marti_session', val)")).toBe(true);
    });

    it("détecte 'marti-sdk'", () => {
      expect(ctx.analyserScriptHeuristique("import { MartiSDK } from 'marti-sdk'")).toBe(true);
    });
  });

  // --- Niveau 2 : Fingerprinting + exfiltration combinés ---
  describe("niveau 2 — fingerprinting + exfiltration", () => {
    it("détecte 2 patterns B + 1 pattern C", () => {
      const script = `
        var conn = navigator.connection.effectiveType;
        var fp = new Fingerprint2();
        navigator.sendBeacon('https://collect.example.com', data);
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(true);
    });

    it("ne détecte PAS un script avec seulement fingerprinting (B) sans exfiltration (C)", () => {
      const script = `
        var conn = navigator.connection.effectiveType;
        var data = navigator.userAgentData.getHighEntropyValues();
        // pas d'envoi réseau
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(false);
    });

    it("ne détecte PAS un script avec seulement exfiltration (C) sans fingerprinting (B)", () => {
      const script = `
        navigator.sendBeacon('https://collect.example.com', data);
        // pas de fingerprinting
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(false);
    });
  });

  // --- Niveau 3 : Accumulation générique ---
  describe("niveau 3 — accumulation générique (seuil = 4)", () => {
    it("détecte un script avec 4+ patterns B+C combinés", () => {
      const script = `
        var conn = navigator.connection.effectiveType;
        var fp = fingerprintjs();
        var xhr = new XMLHttpRequest();
        xhr.prototype.open("POST", url);
        var img = new Image(); img.src = "https://x.com/?fingerprint=abc";
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(true);
    });

    it("ne détecte PAS un script avec seulement 2 patterns (sous le seuil)", () => {
      // Seulement 1 pattern B (navigator.connection) et 1 pattern C (sendBeacon)
      // Total = 2, sous le seuil de 4
      const script = `
        var conn = navigator.connection.effectiveType;
        // un seul pattern C
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(false);
    });
  });

  // --- Faux positifs éliminés ---
  describe("faux positifs éliminés", () => {
    it("ne détecte PAS un script légitime avec localStorage + cookies + i18n", () => {
      const script = `
        localStorage.setItem("theme", "dark");
        document.cookie = "session=abc123";
        var lang = navigator.language;
        var date = new Intl.DateTimeFormat('fr').format(new Date());
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(false);
    });

    it("ne détecte PAS un script d'analytics classique", () => {
      const script = `
        var ga = { send: function(e, a, b) {} };
        ga.send("event", "click", "button");
        localStorage.setItem("ga_client_id", "12345");
        document.cookie = "_ga=GA1.2.12345";
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(false);
    });

    it("ne détecte PAS un script avec canvas légitime (graphiques)", () => {
      const script = `
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "red";
        ctx.fillRect(0, 0, 100, 100);
        var data = canvas.toDataURL("image/png");
      `;
      expect(ctx.analyserScriptHeuristique(script)).toBe(false);
    });
  });

  // --- Cas limites ---
  describe("cas limites", () => {
    it("retourne false pour null", () => {
      expect(ctx.analyserScriptHeuristique(null)).toBe(false);
    });

    it("retourne false pour undefined", () => {
      expect(ctx.analyserScriptHeuristique(undefined)).toBe(false);
    });

    it("retourne false pour une chaîne vide", () => {
      expect(ctx.analyserScriptHeuristique("")).toBe(false);
    });

    it("retourne false pour un non-string", () => {
      expect(ctx.analyserScriptHeuristique(123)).toBe(false);
    });
  });
});

describe("constantes de détection", () => {
  let ctx;
  beforeEach(() => { ctx = loadContent(); });

  it("DOMAINES_UTIQ contient 9 domaines", () => {
    expect(ctx.__get("DOMAINES_UTIQ")).toHaveLength(9);
  });

  it("CLES_STOCKAGE_UTIQ contient 15 clés", () => {
    expect(ctx.__get("CLES_STOCKAGE_UTIQ")).toHaveLength(15);
  });

  it("PATTERNS_UTIQ_DIRECTS contient 5 patterns", () => {
    expect(ctx.__get("PATTERNS_UTIQ_DIRECTS")).toHaveLength(5);
  });

  it("PATTERNS_FINGERPRINTING contient 8 patterns", () => {
    expect(ctx.__get("PATTERNS_FINGERPRINTING")).toHaveLength(8);
  });

  it("PATTERNS_EXFILTRATION contient 5 patterns", () => {
    expect(ctx.__get("PATTERNS_EXFILTRATION")).toHaveLength(5);
  });

  it("SEUIL_HEURISTIQUE_GENERIQUE vaut 4", () => {
    expect(ctx.__get("SEUIL_HEURISTIQUE_GENERIQUE")).toBe(4);
  });
});
