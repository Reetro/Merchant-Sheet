// hooks.js — All Foundry hook registrations

import { getMerchantData } from "./data.js";
import { openMerchantSheet, _openSheets } from "./store.js";
import { registerSocketlib } from "./socket.js";
import { MerchantSheetAdapter } from "./adapter.js";
import { MODULE_ID } from "./constants.js";

// ─── Init ─────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  console.log("Merchant Sheet | Initialising");
  foundry.documents.collections.Actors.registerSheet("merchant-sheet", MerchantSheetAdapter, {
    types:       ["npc"],
    makeDefault: false,
    label:       "Merchant Sheet",
  });
});

// ─── Socketlib ────────────────────────────────────────────────────────────────

Hooks.once("socketlib.ready", () => {
  registerSocketlib();
});

Hooks.once("ready", () => {
  if (typeof socketlib !== "undefined") registerSocketlib();
  console.log("Merchant Sheet | Ready");
  _dialogObserver.observe(document.body, { childList: true, subtree: true });
});

// ─── Actor directory — double-click intercept ─────────────────────────────────

Hooks.on("renderActorDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;
  root.querySelectorAll(".document[data-document-id]").forEach(el => {
    el.addEventListener("dblclick", e => {
      const actor = game.actors.get(el.dataset.documentId);
      if (!actor?.getFlag(MODULE_ID, "inventory")) return;
      e.stopPropagation();
      e.preventDefault();
      openMerchantSheet(actor);
    }, true);
  });
});

// ─── Actor directory — right-click ───────────────────────────────────────────

Hooks.on("getActorDirectoryEntryContext", (html, options) => {
  options.unshift({
    name:      "Open Shop",
    icon:      "<i class='fas fa-store'></i>",
    condition: li => {
      const actorId = li.dataset?.documentId ?? li[0]?.dataset?.documentId;
      return game.actors.get(actorId)?.getFlag(MODULE_ID, "inventory") !== undefined;
    },
    callback: li => {
      const actorId = li.dataset?.documentId ?? li[0]?.dataset?.documentId;
      const actor   = game.actors.get(actorId);
      if (actor) openMerchantSheet(actor);
    },
  });
});

// ─── Token right-click ────────────────────────────────────────────────────────

Hooks.on("getTokenContextOptions", (token, options) => {
  options.push({
    name:      "Open Shop",
    icon:      "<i class='fas fa-store'></i>",
    condition: () => game.user.isGM,
    callback:  t => {
      const actor = t.actor ?? game.actors.get(t.document.actorId);
      if (!actor) return ui.notifications.warn("Merchant Sheet: No actor found for this token.");
      openMerchantSheet(actor);
    },
  });
});

// ─── Token double-click ───────────────────────────────────────────────────────

function hookTokenDoubleClick(token) {
  if (!token) return;
  const orig = token._onClickLeft2?.bind(token);
  token._onClickLeft2 = function(event) {
    if (this.actor?.getFlag(MODULE_ID, "inventory") !== undefined) {
      openMerchantSheet(this.actor);
      return;
    }
    return orig?.call(this, event);
  };
}

Hooks.on("canvasReady", () => canvas.tokens?.placeables?.forEach(t => hookTokenDoubleClick(t)));
Hooks.on("createToken", tokenDoc => {
  const token = canvas.tokens?.get(tokenDoc.id);
  if (token) hookTokenDoubleClick(token);
});

// ─── Create Actor dialog injection ───────────────────────────────────────────

async function createMerchantActor(folder) {
  const actor = await Actor.create({
    name:   "New Merchant",
    type:   "npc",
    img:    "icons/svg/item-bag.svg",
    folder: folder ?? null,
    system: { attributes: { hp: { value: 1, max: 1 } } },
    prototypeToken: { name: "Merchant", disposition: 1 },
  });
  openMerchantSheet(actor);
}

const _dialogObserver = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const dialog = node.matches?.("dialog.create-document")
        ? node
        : node.querySelector?.("dialog.create-document");
      if (!dialog) continue;
      _injectMerchantIntoDialog(dialog);
    }
  }
});

function _injectMerchantIntoDialog(dialog) {
  const list = dialog.querySelector("ol.unlist.card, ol.unlist");
  if (!list || list.querySelector("[data-type='merchant']")) return;

  const li = document.createElement("li");
  li.dataset.type = "merchant";
  li.innerHTML = `
    <label style="cursor:pointer;">
      <i class="fas fa-store" style="font-size:32px; width:40px; text-align:center;"></i>
      <span>Merchant Sheet</span>
      <input type="radio" name="type" value="merchant">
    </label>
  `;
  list.appendChild(li);

  const okBtn = dialog.querySelector("[data-action='ok'], button[type='submit']");
  if (!okBtn) return;
  okBtn.addEventListener("click", async e => {
    const selected = dialog.querySelector("input[name='type']:checked");
    if (selected?.value !== "merchant") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const folder = dialog.querySelector("select[name='folder']")?.value || null;
    dialog.close?.();
    await createMerchantActor(folder);
  }, true);
}
