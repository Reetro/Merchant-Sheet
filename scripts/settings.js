// settings.js — Module settings for Merchant Sheet

const MODULE_ID = "merchant-sheet";

export function registerSettings() {
  game.settings.register(MODULE_ID, "syncItemView", {
    name:    "Sync Item View",
    hint:    "When enabled double-clicking an item on the GM screen opens that item on all connected player screens simultaneously. When disabled item viewing is local only.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "allowPurchases", {
    name:    "Allow Player Purchases",
    hint:    "When enabled players can buy items directly from the merchant shop. Gold is automatically deducted from their assigned character. Items with limited stock reduce by 1 on purchase.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "playerFullscreen", {
    name:    "Player Fullscreen",
    hint:    "When enabled the merchant shop fills the entire screen for non-GM players when opened via Show to All. When disabled players can drag and resize the shop window normally.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "syncScroll", {
    name:    "Sync Scrolling",
    hint:    "When enabled the GM's scrolling in the merchant shop is broadcast to all connected players in real time. When disabled each player can scroll independently.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: false,
  });
}

export function getSetting(key) {
  try { return game.settings.get(MODULE_ID, key); }
  catch { return false; }
}
