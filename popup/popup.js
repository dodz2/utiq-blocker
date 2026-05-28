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

  var response = await browser.runtime.sendMessage({
    action: "getStatus",
    tabId: tabs[0].id
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

/**
 * Met à jour l'ensemble de l'interface du popup avec les données fournies.
 * @param {Object} donnees - Les données d'état reçues du background.
 * @param {boolean} donnees.enabled - Protection activée ou non.
 * @param {number} [donnees.globalCount] - Compteur global de blocages.
 * @param {number} [donnees.tabBlockCount] - Compteur de blocages sur l'onglet.
 */
function actualiserInterface(donnees) {
  var estActive = donnees.enabled !== undefined ? donnees.enabled : true;
  var globalCount = donnees.globalCount !== undefined ? donnees.globalCount : 0;
  var tabCount = donnees.tabBlockCount !== undefined ? donnees.tabBlockCount : 0;

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
}