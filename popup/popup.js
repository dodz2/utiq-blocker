// ============================================================
// Utiq Blocker - Logique du Popup
// Rôle : Afficher l'état de protection, le toggle on/off,
//        et les compteurs de blocages.
// ============================================================

// Récupération des références aux éléments du DOM
var toggleCheckbox = document.getElementById("toggleEnabled");
var statusText = document.getElementById("statusText");
var tabBlockCountEl = document.getElementById("tabBlockCount");
var globalBlockCountEl = document.getElementById("globalBlockCount");
var currentHostnameEl = document.getElementById("currentHostname");
var toggleWhitelistBtn = document.getElementById("toggleWhitelistBtn");
var whitelistListEl = document.getElementById("whitelistList");
var whitelistEmptyEl = document.getElementById("whitelistEmpty");

var currentTab = null;
var currentHostname = "";
var isWhitelisted = false;
var whitelist = [];

// Au chargement de la popup, récupération de l'état depuis le background
document.addEventListener("DOMContentLoaded", async function () {
  var tabs = await browser.tabs.query({
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

  var response = await browser.runtime.sendMessage({
    action: "getStatus",
    tabId: currentTab.id,
    hostname: currentHostname
  });

  if (response) {
    actualiserInterface(response);
  }
});

// Écouteur du toggle : bascule entre protection active et inactive
toggleCheckbox.addEventListener("change", async function () {
  var response = await browser.runtime.sendMessage({
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
  var response;
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
  var estActive = donnees.enabled !== undefined ? donnees.enabled : true;
  var globalCount = donnees.globalCount !== undefined ? donnees.globalCount : 0;
  var tabCount = donnees.tabBlockCount !== undefined ? donnees.tabBlockCount : 0;

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

  for (var i = 0; i < whitelist.length; i++) {
    var item = document.createElement("div");
    item.className = "whitelist-item";

    var span = document.createElement("span");
    span.className = "whitelist-item-host";
    span.textContent = whitelist[i];

    var btn = document.createElement("button");
    btn.className = "whitelist-remove-btn";
    btn.textContent = "×";
    btn.dataset.hostname = whitelist[i];

    btn.addEventListener("click", async function () {
      var hostname = this.dataset.hostname;
      var response = await browser.runtime.sendMessage({
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