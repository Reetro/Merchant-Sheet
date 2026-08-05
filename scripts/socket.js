// socket.js — Socketlib integration for broadcasting shop open/close/scroll/item

import { MODULE_ID } from "./constants.js";

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
  _openSheets.forEach(sheet => sheet.close());
  _openSheets.clear();
}

function _remoteScrollShop({ actorId, scrollTop }) {
  const { _openSheets } = globalThis.__merchantSheet;
  const sheet = _openSheets.get(actorId);
  if (!sheet) return;
  const body = sheet.element?.querySelector("#merchant-body");
  if (body) body.scrollTop = scrollTop;
}

function _remoteShowItem({ actorId, itemId }) {
  const { _openSheets } = globalThis.__merchantSheet;
  const sheet = _openSheets.get(actorId);
  if (!sheet) return;
  // Highlight the item row on the player screen
  const row = sheet.element?.querySelector(`[data-item-id="${itemId}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.style.transition = "background 0.2s";
  row.style.background = "rgba(255,215,0,0.25)";
  setTimeout(() => row.style.background = "", 2000);
}

export function registerSocketlib() {
  if (_socket) return;
  _socket = socketlib.registerModule(MODULE_ID);
  _socket.register("remoteOpenMerchant", _remoteOpenMerchant);
  _socket.register("remoteCloseShop",    _remoteCloseShop);
  _socket.register("remoteScrollShop",   _remoteScrollShop);
  _socket.register("remoteShowItem",     _remoteShowItem);
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
  }
}
