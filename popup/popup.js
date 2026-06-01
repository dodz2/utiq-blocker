// ============================================================
// Utiq Blocker - Logique du Popup
// Rôle : Afficher l'état de protection, le toggle on/off,
//        et les compteurs de blocages.
// ============================================================

// Récupération des références aux éléments du DOM
const toggleCheckbox = document.getElementById("toggleEnabled");
const statusText = document.getElementById("statusText");
const tabBlockCountEl = document.getElementById("tabBlockCount");
const globalBlockCountEl = document.getElementById("globalBlockCount");
const currentHostnameEl = document.getElementById("currentHostname");
const toggleWhitelistBtn = document.getElementById("toggleWhitelistBtn");
const whitelistListEl = document.getElementById("whitelistList");
const whitelistEmptyEl = document.getElementById("whitelistEmpty");
const customDomainInput = document.getElementById("customDomainInput");
const addCustomDomainBtn = document.getElementById("addCustomDomainBtn");
const customDomainsListEl = document.getElementById("customDomainsList");
const customDomainsEmptyEl = document.getElementById("customDomainsEmpty");
const exportCSVBtn = document.getElementById("exportCSV");
const exportJSONBtn = document.getElementById("exportJSON");

let currentTab = null;
let currentHostname = "";
let isWhitelisted = false;
let whitelist = [];
let customDomains = [];

// Au chargement de la popup, récupération de l'état depuis le background
document.addEventListener("DOMContentLoaded", async function () {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  if (tabs.length === 0) {
    statusText.textContent = "Aucun onglet actif détecté.";
    return;
  }

  currentTab = tabs[0];
  currentHostname = new URL(currentTab.url).hostname;
  currentHostnameEl.textContent = currentHostname;

  const response = await browser.runtime.sendMessage({
    action: "getStatus",
    tabId: currentTab.id,
    hostname: currentHostname
  });

  if (response) {
    actualiserInterface(response);
    chargerDomainesPersonnalisés();
  }
});

// Écouteur du toggle : bascule entre protection active et inactive
toggleCheckbox.addEventListener("change", async function () {
  const response = await browser.runtime.sendMessage({
    action: "toggleEnabled"
  });

  if (response && response.enabled !== undefined) {
    toggleCheckbox.checked = response.enabled;
    if (response.enabled) {
      statusText.textContent = "Protection active — Utiq est bloqué.";
      statusText.style.color = "#4CAF50";
    } else {
      statusText.textContent = "Protection désactivée — vigilance.";
      statusText.style.color = "#FF5722";
    }
  } else {
    toggleCheckbox.checked = !toggleCheckbox.checked;
  }
});

// Écouteur pour ajouter/retirer le site actuel de la whitelist
toggleWhitelistBtn.addEventListener("click", async function () {
  let response;
  if (isWhitelisted) {
    response = await browser.runtime.sendMessage({
      action: "removeFromWhitelist",
      hostname: currentHostname
    });
  } else {
    response = await browser.runtime.sendMessage({
      action: "addToWhitelist",
      hostname: currentHostname
    });
  }

  if (response && response.whitelist) {
    whitelist = response.whitelist;
    isWhitelisted = !isWhitelisted;
    actualiserBoutonWhitelist();
    afficherListeBlanche();
  }
});

// Écouteur pour ajouter un domaine personnalisé
addCustomDomainBtn.addEventListener("click", async function () {
  const domain = customDomainInput.value.trim();
  if (!domain) return;

  const response = await browser.runtime.sendMessage({
    action: "addCustomDomain",
    domain: domain
  });

  if (response && response.domains) {
    customDomains = response.domains;
    customDomainInput.value = "";
    afficherDomainesPersonnalisés();
  }
});

// Permettre l'ajout avec la touche Entrée
customDomainInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    addCustomDomainBtn.click();
  }
});

/**
 * Met à jour l'ensemble de l'interface du popup avec les données fournies.
 * @param {Object} donnees - Les données d'état reçues du background.
 * @param {boolean} donnees.enabled - Protection activée ou non.
 * @param {number} [donnees.globalCount] - Compteur global de blocages.
 * @param {number} [donnees.tabBlockCount] - Compteur de blocages sur l'onglet.
 * @param {Array} [donnees.whitelist] - Liste des domaines en whitelist.
 * @param {boolean} [donnees.isWhitelisted] - Si le domaine actuel est whitelisté.
 */
function actualiserInterface(donnees) {
  const estActive = donnees.enabled !== undefined ? donnees.enabled : true;
  const globalCount = donnees.globalCount !== undefined ? donnees.globalCount : 0;
  const tabCount = donnees.tabBlockCount !== undefined ? donnees.tabBlockCount : 0;

  whitelist = donnees.whitelist || [];
  isWhitelisted = donnees.isWhitelisted || false;

  // Mise à jour du toggle
  toggleCheckbox.checked = estActive;

  // Mise à jour du texte d'état
  if (estActive) {
    statusText.textContent = "Protection active — Utiq est bloqué.";
    statusText.style.color = "#4CAF50";
  } else {
    statusText.textContent = "Protection désactivée — vigilance.";
    statusText.style.color = "#FF5722";
  }

  // Mise à jour des compteurs
  tabBlockCountEl.textContent = tabCount;
  globalBlockCountEl.textContent = globalCount;

  // Mise à jour de la whitelist
  actualiserBoutonWhitelist();
  afficherListeBlanche();
}

function actualiserBoutonWhitelist() {
  if (isWhitelisted) {
    toggleWhitelistBtn.textContent = "Retirer";
    toggleWhitelistBtn.classList.add("remove");
  } else {
    toggleWhitelistBtn.textContent = "Ajouter";
    toggleWhitelistBtn.classList.remove("remove");
  }
}

function afficherListeBlanche() {
  whitelistListEl.innerHTML = "";

  if (whitelist.length === 0) {
    whitelistListEl.appendChild(whitelistEmptyEl);
    whitelistEmptyEl.style.display = "block";
    return;
  }

  whitelistEmptyEl.style.display = "none";

  for (let i = 0; i < whitelist.length; i++) {
    const item = document.createElement("div");
    item.className = "whitelist-item";

    const span = document.createElement("span");
    span.className = "whitelist-item-host";
    span.textContent = whitelist[i];

    const btn = document.createElement("button");
    btn.className = "whitelist-remove-btn";
    btn.textContent = "×";
    btn.dataset.hostname = whitelist[i];

    btn.addEventListener("click", async function () {
      const hostname = this.dataset.hostname;
      const response = await browser.runtime.sendMessage({
        action: "removeFromWhitelist",
        hostname: hostname
      });
      if (response && response.whitelist) {
        whitelist = response.whitelist;
        if (hostname === currentHostname) {
          isWhitelisted = false;
          actualiserBoutonWhitelist();
        }
        afficherListeBlanche();
      }
    });

    item.appendChild(span);
    item.appendChild(btn);
    whitelistListEl.appendChild(item);
  }
}

async function chargerDomainesPersonnalisés() {
  const response = await browser.runtime.sendMessage({
    action: "getCustomDomains"
  });
  if (response && response.domains) {
    customDomains = response.domains;
    afficherDomainesPersonnalisés();
  }
}

function afficherDomainesPersonnalisés() {
  customDomainsListEl.innerHTML = "";

  if (customDomains.length === 0) {
    customDomainsListEl.appendChild(customDomainsEmptyEl);
    customDomainsEmptyEl.style.display = "block";
    return;
  }

  customDomainsEmptyEl.style.display = "none";

  for (let i = 0; i < customDomains.length; i++) {
    const item = document.createElement("div");
    item.className = "whitelist-item";

    const span = document.createElement("span");
    span.className = "whitelist-item-host";
    span.textContent = customDomains[i];

    const btn = document.createElement("button");
    btn.className = "whitelist-remove-btn";
    btn.textContent = "×";
    btn.dataset.domain = customDomains[i];

    btn.addEventListener("click", async function () {
      const domain = this.dataset.domain;
      const response = await browser.runtime.sendMessage({
        action: "removeCustomDomain",
        domain: domain
      });
      if (response && response.domains) {
        customDomains = response.domains;
        afficherDomainesPersonnalisés();
      }
    });

    item.appendChild(span);
    item.appendChild(btn);
    customDomainsListEl.appendChild(item);
  }
}

// ============================================================
// EXPORT DES DONNÉES DE BLOCAGE (CSV / JSON)
// ============================================================

/**
 * Récupère l'historique des blocages depuis le background
 * et déclenche un téléchargement dans le format demandé.
 * @param {string} format - "csv" ou "json"
 */
async function exporterDonnees(format) {
  const response = await browser.runtime.sendMessage({ action: "getHistory" });
  if (!response || !response.history || response.history.length === 0) {
    return;
  }

  const history = response.history;
  let content, mimeType, extension;

  if (format === "csv") {
    const lignes = ["date,domaine,blocages"];
    for (const entry of history) {
      lignes.push(entry.date + "," + entry.domain + "," + entry.count);
    }
    content = lignes.join("\n");
    mimeType = "text/csv";
    extension = "csv";
  } else {
    content = JSON.stringify(history, null, 2);
    mimeType = "application/json";
    extension = "json";
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "utiq-blocker-blocages." + extension;
  a.click();
  URL.revokeObjectURL(url);
}

exportCSVBtn.addEventListener("click", function () { exporterDonnees("csv"); });
exportJSONBtn.addEventListener("click", function () { exporterDonnees("json"); });
