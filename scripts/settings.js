// settings.js — Module settings for Merchant Sheet

const MODULE_ID = "merchant-sheet";

export function registerSettings() {
  game.settings.register(MODULE_ID, "playerFullscreen", {
    name:    "Player Fullscreen",
    hint:    "When enabled the merchant shop fills the entire screen for non-GM players when opened via Show to All. When disabled players can drag and resize the shop window normally.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "syncScroll", {
    name:    "Sync Scrolling",
    hint:    "When enabled the GM's scrolling in the merchant shop is broadcast to all connected players in real time. When disabled each player can scroll independently.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });
}

export function getSetting(key) {
  try { return game.settings.get(MODULE_ID, key); }
  catch { return true; }
}
