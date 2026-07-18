// socket.js — Socketlib integration for broadcasting shop open/close

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

export function registerSocketlib() {
  if (_socket) return;
  _socket = socketlib.registerModule(MODULE_ID);
  _socket.register("remoteOpenMerchant", _remoteOpenMerchant);
  _socket.register("remoteCloseShop",    _remoteCloseShop);
  console.log("Merchant Sheet | Socketlib registered");
}

export function emitToAll(type, payload = {}) {
  if (!_socket) { console.error("Merchant Sheet | socketlib not initialised"); return; }
  if (type === "openMerchant") {
    _socket.executeForEveryone("remoteOpenMerchant", payload.actorId);
  } else if (type === "closeShop") {
    _socket.executeForEveryone("remoteCloseShop", payload.actorId);
  }
}
