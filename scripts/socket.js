// socket.js — Socketlib integration for broadcasting shop open/close/scroll/item

import { MODULE_ID } from "./constants.js";
import { getMerchantData } from "./data.js";

// Local alias
const getMerchantDataLocal = (actor) => actor.getFlag(MODULE_ID, "inventory") || { items: [] };

function _getSetting(key) {
  try { return game.settings.get(MODULE_ID, key); } catch { return true; }
}

let _socket;

export function getSocket() { return _socket; }

function _remoteOpenMerchant(actorId) {
  const { openMerchantSheet } = globalThis.__merchantSheet;
  const actor = game.actors.get(actorId);
  if (!actor) { console.warn(`Merchant Sheet | Actor ${actorId} not found`); return; }
  openMerchantSheet(actor);
}

function _remoteCloseShop() {
  const { _openSheets } = globalThis.__merchantSheet;
  _openSheets.forEach(sheet => {
    sheet.closeItemPanel?.();
    sheet.close();
  });
  _openSheets.clear();
}

function _remoteScrollShop({ actorId, scrollTop }) {
  if (!_getSetting("syncScroll")) return;
  const { _openSheets } = globalThis.__merchantSheet;
  const sheet = _openSheets.get(actorId);
  if (!sheet) return;
  const body = sheet.element?.querySelector("#merchant-body");
  if (body) {
    body.scrollTop = scrollTop;
    // In fullscreen the merchant-body may fill the whole window
    // so also set scrollTop on the element itself as a fallback
    if (_getSetting("playerFullscreen")) {
      sheet.element.scrollTop = scrollTop;
    }
  }
}

function _remoteSyncShop({ actorId }) {
  const { _openSheets } = globalThis.__merchantSheet;
  const sheet = _openSheets.get(actorId);
  if (sheet) sheet.render();
}

async function _remotePurchaseItem({ actorId, itemId, buyerName }) {
  // Only GM reduces stock — players just re-render their own sheet
  const { _openSheets } = globalThis.__merchantSheet;
  const actor = game.actors.get(actorId);
  if (!actor) return;

  if (game.user.isGM) {
    // Reduce stock by 1
    const data  = actor.getFlag("merchant-sheet", "inventory");
    if (!data) return;
    const item = data.items?.find(i => i.id === itemId);
    if (!item) return;

    if (item.quantity !== -1 && _getSetting("enableQuantity")) {
      item.quantity = Math.max(0, item.quantity - 1);
      await actor.setFlag("merchant-sheet", "inventory", data);
    }

    ui.notifications.info(`Merchant Sheet: ${buyerName} purchased ${item.name}.`);

    // Broadcast sync so all clients including the buying player see the updated stock
    emitToAll("syncShop", { actorId });
  }

  // Non-GM clients wait for syncShop from GM before re-rendering
  // This ensures they read the authoritative updated stock value
}

async function _remoteShowItem({ actorId, itemId }) {
  const { _openSheets } = globalThis.__merchantSheet;
  const sheet = _openSheets.get(actorId);
  if (!sheet) return;

  // Highlight the row
  const row = sheet.element?.querySelector(`[data-item-id="${itemId}"]`);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.style.transition = "background 0.2s";
    row.style.background = "rgba(255,215,0,0.25)";
    setTimeout(() => row.style.background = "", 2000);
  }

  // Open item in split screen
  const data = getMerchantDataLocal(sheet.actor);
  const item = data.items?.find(i => i.id === itemId);
  if (!item) return;
  sheet._showItemCard(item);
}

function _remoteCloseItem({ actorId }) {
  const { _openSheets } = globalThis.__merchantSheet;
  const sheet = _openSheets.get(actorId);
  if (!sheet) return;
  sheet.closeItemPanel();
}

export function registerSocketlib() {
  if (_socket) return;
  _socket = socketlib.registerModule(MODULE_ID);
  _socket.register("remoteOpenMerchant",  _remoteOpenMerchant);
  _socket.register("remoteCloseShop",     _remoteCloseShop);
  _socket.register("remoteScrollShop",    _remoteScrollShop);
  _socket.register("remoteShowItem",      _remoteShowItem);
  _socket.register("remoteCloseItem",     _remoteCloseItem);
  _socket.register("remotePurchaseItem",  _remotePurchaseItem);
  _socket.register("remoteSyncShop",      _remoteSyncShop);
  console.log("Merchant Sheet | Socketlib registered");
}

export function emitToAll(type, payload = {}) {
  if (!_socket) { console.error("Merchant Sheet | socketlib not initialised"); return; }
  if (type === "openMerchant") {
    _socket.executeForEveryone("remoteOpenMerchant", payload.actorId);
  } else if (type === "closeShop") {
    _socket.executeForEveryone("remoteCloseShop", payload.actorId);
  } else if (type === "scrollShop") {
    _socket.executeForOthers("remoteScrollShop", payload);
  } else if (type === "showItem") {
    _socket.executeForOthers("remoteShowItem", payload);
  } else if (type === "closeItem") {
    _socket.executeForOthers("remoteCloseItem", payload);
  } else if (type === "purchaseItem") {
    _socket.executeForEveryone("remotePurchaseItem", payload);
  } else if (type === "syncShop") {
    _socket.executeForOthers("remoteSyncShop", payload);
  }
}
