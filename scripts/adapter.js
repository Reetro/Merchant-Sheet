// adapter.js — MerchantSheetAdapter registered with Foundry's sheet system

import { openMerchantSheet } from "./store.js";

// Extends ActorSheetV2 (v14 correct class) so Foundry routes double-clicks
// on merchant actors to our custom MerchantSheet instead of the default NPC sheet.

export class MerchantSheetAdapter extends foundry.applications.sheets.ActorSheetV2 {
  async render(options = {}) {
    openMerchantSheet(this.document);
  }

  async _renderHTML() { return document.createElement("div"); }
  _replaceHTML() {}
}
