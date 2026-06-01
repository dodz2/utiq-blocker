import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // WebExtension APIs
        browser: "readonly",
        chrome: "readonly",
        // DOM
        document: "readonly",
        window: "readonly",
        Node: "readonly",
        MutationObserver: "readonly",
        Storage: "readonly",
        Document: "readonly",
        Element: "readonly",
        URL: "readonly",
        Blob: "readonly",
        Image: "readonly",
        XMLHttpRequest: "readonly",
        AudioContext: "readonly",
        Intl: "readonly",
        RTCPeerConnection: "readonly",
        Fingerprint2: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        // Timers
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Console
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["debug", "error"] }],
      "eqeqeq": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-implicit-globals": "error"
    }
  },
  {
    // Tests : autoriser les globals de test Vitest + Node
    files: ["test/**/*.js", "vitest.config.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        // Node.js
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];
