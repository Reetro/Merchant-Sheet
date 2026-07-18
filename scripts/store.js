// store.js — Singleton sheet store and openMerchantSheet function

import { MerchantSheet } from "./sheet.js";
import { MODULE_ID } from "./constants.js";

export const _openSheets = new Map();

export async function openMerchantSheet(actor) {
  const existing = _openSheets.get(actor.id);
  if (existing && existing.rendered) {
    existing.bringToFront?.();
    return;
  }

  // Set sheetClass so Foundry routes this actor to our adapter on next open (GM only)
  if (game.user.isGM) {
    const current = actor.getFlag("core", "sheetClass");
    if (current !== "merchant-sheet.MerchantSheetAdapter") {
      actor.setFlag("core", "sheetClass", "merchant-sheet.MerchantSheetAdapter").catch(() => {});
    }
  }

  const sheet = new MerchantSheet(actor);
  _openSheets.set(actor.id, sheet);
  sheet.addEventListener("close", () => _openSheets.delete(actor.id));

  sheet.render(true).catch(e => {
    console.error("Merchant Sheet | Render error:", e);
    _openSheets.delete(actor.id);
  });
}

// Expose to global scope so socket.js remote functions can access it
// (socketlib calls registered functions in a context where imports aren't available)
Hooks.once("ready", () => {
  globalThis.__merchantSheet = { openMerchantSheet, _openSheets };
});
