// Merchant Sheet — main.js
// Foundry VTT v14 | D&D 5e
// Features:
//   - Display items for sale with categories, prices, quantities
//   - Drag items from compendiums onto the sheet
//   - Right-click token to open shop for all connected players

const MODULE_ID  = "merchant-sheet";

// ─── Socketlib integration ────────────────────────────────────────────────────
// socketlib handles cross-client execution cleanly with proper permissions

let _socket;

// These functions are called on remote clients by socketlib
function _remoteOpenMerchant(actorId) {
  console.log(`Merchant Sheet | remoteOpenMerchant called for ${actorId} on ${game.user.name}`);
  const actor = game.actors.get(actorId);
  if (!actor) { console.warn(`Merchant Sheet | Actor ${actorId} not found`); return; }
  openMerchantSheet(actor);
}

function _remoteCloseShop(actorId) {
  console.log(`Merchant Sheet | remoteCloseShop called on ${game.user.name}`);
  _openSheets.forEach(sheet => sheet.close());
  _openSheets.clear();
}

function emitToAll(type, payload = {}) {
  console.log(`Merchant Sheet | emitToAll type=${type}`, payload);
  if (!_socket) {
    console.error("Merchant Sheet | socketlib not initialised");
    return;
  }
  if (type === "openMerchant") {
    console.log("Merchant Sheet | Calling executeForEveryone remoteOpenMerchant", payload.actorId);
    _socket.executeForEveryone("remoteOpenMerchant", payload.actorId);
  } else if (type === "closeShop") {
    console.log("Merchant Sheet | Calling executeForEveryone remoteCloseShop");
    _socket.executeForEveryone("remoteCloseShop", payload.actorId);
  }
}

// ─── Data Store ───────────────────────────────────────────────────────────────
// Merchant data stored on the actor's flags

function getMerchantData(actor) {
  return actor.getFlag(MODULE_ID, "inventory") || { items: [], name: actor.name, img: actor.img };
}

async function setMerchantData(actor, data) {
  await actor.setFlag(MODULE_ID, "inventory", data);
}

// ─── Category helpers ─────────────────────────────────────────────────────────

function getCategory(type) {
  const map = {
    weapon:    "Weapons",
    equipment: "Armor & Equipment",
    consumable:"Consumables",
    tool:      "Tools",
    loot:      "Loot",
    spell:     "Spells",
    feat:      "Features",
  };
  return map[type] || "Miscellaneous";
}

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.category || getCategory(item.type);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  // Sort categories and items within each
  const sorted = {};
  for (const cat of Object.keys(groups).sort()) {
    sorted[cat] = groups[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

// ─── Merchant Sheet Application ───────────────────────────────────────────────

export class MerchantSheet extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    window: {
      title:       "Merchant",
      resizable:   true,
      minimizable: true,
    },
    position: { width: 560, height: 600 },
    classes:  ["merchant-sheet"],
  };

  static PARTS = { main: { template: false } };

  constructor(actor, options = {}) {
    // Give each merchant a unique app id based on actor id
    super(foundry.utils.mergeObject(options, {
      id: `merchant-sheet-${actor.id}`,
    }));
    this.actor      = actor;
    this._collapsed = {};
    this._isGM      = game.user.isGM;
  }

  get title() { return `Shop — ${this.actor.name}`; }

  // Always allow rendering regardless of user permission level
  _canRender(options) { return; }

  // Force insert element into document.body since isConnected is false otherwise
  async _insertElement(element, options) {
    console.log(`Merchant Sheet | _insertElement called, appending to body`);
    document.body.appendChild(element);

    // Force visibility — bypass any module that hides UI elements
    element.style.setProperty("display",     "flex",    "important");
    element.style.setProperty("visibility",  "visible", "important");
    element.style.setProperty("opacity",     "1",       "important");
    element.style.setProperty("z-index",     "999999",  "important");
    element.style.setProperty("pointer-events", "all",  "important");

    // Also inject a style tag to override any external CSS targeting this element
    const styleId = `merchant-sheet-override-${element.id}`;
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #${element.id} {
          display: flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 999999 !important;
          pointer-events: all !important;
        }
        #${element.id} * {
          visibility: visible !important;
          opacity: 1 !important;
        }
      `;
      document.head.appendChild(style);
    }

    console.log(`Merchant Sheet | _insertElement complete, isConnected:`, element.isConnected);
  }

  async _renderHTML(context, options) {
    const data     = getMerchantData(this.actor);
    const groups   = groupByCategory(data.items || []);
    const hasItems = (data.items || []).length > 0;

    const el = document.createElement("div");
    el.className  = "merchant-sheet";
    el.innerHTML  = this._buildHTML(data, groups, hasItems);
    return el;
  }

  _buildHTML(data, groups, hasItems) {
    // Header — portrait is clickable by GM to change icon
    let html = `
      <div class="merchant-header">
        <div style="position:relative; flex-shrink:0;">
          <img src="${data.img || "icons/svg/mystery-man.svg"}" alt="${data.name}"
            id="ms-portrait"
            style="cursor:${this._isGM ? "pointer" : "default"};"
            title="${this._isGM ? "Click to change portrait" : ""}">
          ${this._isGM ? `<div style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);border-radius:3px;padding:1px 3px;font-size:9px;pointer-events:none;"><i class="fas fa-camera"></i></div>` : ""}
        </div>
        <span class="merchant-name">${data.name}</span>
      </div>
      <div class="merchant-body" id="merchant-body">
    `;

    if (!hasItems) {
      html += `<div class="merchant-drop-hint">
        <i class="fas fa-shopping-bag" style="font-size:32px; opacity:0.3; display:block; margin-bottom:12px"></i>
        Drag items from the compendium here to add them to the shop
      </div>`;
    } else {
      for (const [cat, items] of Object.entries(groups)) {
        const collapsed = this._collapsed[cat];
        html += `
          <div class="merchant-category">
            <div class="category-header" data-category="${cat}">
              <span class="category-toggle">${collapsed ? "▶" : "▼"}</span>
              ${cat} <span style="opacity:0.5; margin-left:4px">(${items.length})</span>
            </div>
            <div class="category-items" style="display:${collapsed ? "none" : "block"}">
        `;
        for (const item of items) {
          html += this._buildItemRow(item);
        }
        html += `</div></div>`;
      }
    }

    html += `</div>`; // merchant-body

    // Footer
    html += `<div class="merchant-footer">
      <span>${(data.items || []).length} item${(data.items || []).length !== 1 ? "s" : ""}</span>`;

    if (this._isGM) {
      html += `<div class="gm-controls">
        <button id="ms-show-all"><i class="fas fa-eye"></i> Show to All</button>
        <button id="ms-close-all" style="background:#5a2020; border-color:#8b3333; color:#ffcccc;"><i class="fas fa-times"></i> Close Shop</button>
        <button id="ms-clear"><i class="fas fa-trash"></i> Clear Shop</button>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  _buildItemRow(item) {
    const price    = item.price ?? 0;
    const currency = item.currency ?? "gp";
    const qty      = item.quantity === -1 ? "∞" : item.quantity ?? "∞";

    return `
      <div class="merchant-item" data-item-id="${item.id}">
        <img src="${item.img || "icons/svg/item-bag.svg"}" alt="${item.name}">
        <span class="item-name">${item.name}</span>
        <span class="item-qty">${qty === "∞" ? "∞" : `×${qty}`}</span>
        <span class="item-price">${price} ${currency}</span>
        ${this._isGM ? `
          <div class="item-controls">
            <button class="edit-price" data-item-id="${item.id}" title="Edit price"><i class="fas fa-tag"></i></button>
            <button class="edit-qty"   data-item-id="${item.id}" title="Edit quantity"><i class="fas fa-hashtag"></i></button>
            <button class="delete"     data-item-id="${item.id}" title="Remove"><i class="fas fa-times"></i></button>
          </div>` : ""}
      </div>
    `;
  }

  _replaceHTML(result, content, options) {
    console.log(`Merchant Sheet | _replaceHTML called, result:`, result, `content:`, content);
    if (!content) {
      console.error(`Merchant Sheet | content element is null/undefined in _replaceHTML`);
      return;
    }
    if (!result) {
      console.error(`Merchant Sheet | result is null/undefined in _replaceHTML`);
      return;
    }
    content.replaceChildren(result);
    console.log(`Merchant Sheet | _replaceHTML complete, element in DOM:`, !!this.element?.isConnected);
  }

  _onRender(context, options) {
    const el = this.element;

    // Drop zone
    const body = el.querySelector("#merchant-body");
    if (body) {
      body.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("text/plain")) {
          e.preventDefault();
          body.classList.add("drop-zone-active");
        }
      });
      body.addEventListener("dragleave", () => body.classList.remove("drop-zone-active"));
      body.addEventListener("drop",      e => { e.preventDefault(); body.classList.remove("drop-zone-active"); this._onDrop(e); });
    }

    // Portrait click — open file picker to change icon (GM only)
    if (this._isGM) {
      el.querySelector("#ms-portrait")?.addEventListener("click", async () => {
        const picker = new FilePicker({
          type:     "image",
          current:  getMerchantData(this.actor).img || "",
          callback: async path => {
            const data = getMerchantData(this.actor);
            data.img   = path;
            await setMerchantData(this.actor, data);
            // Also update the actor and token portrait
            await this.actor.update({ img: path, "prototypeToken.texture.src": path });
            this.render();
          },
        });
        picker.render(true);
      });
    }

    // Category collapse
    el.querySelectorAll(".category-header").forEach(h => {
      h.addEventListener("click", () => {
        const cat = h.dataset.category;
        this._collapsed[cat] = !this._collapsed[cat];
        this.render();
      });
    });

    // Item click — open item sheet
    el.querySelectorAll(".merchant-item").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.closest(".item-controls")) return;
        const id   = row.dataset.itemId;
        const data = getMerchantData(this.actor);
        const item = data.items.find(i => i.id === id);
        if (item) this._showItemCard(item);
      });
    });

    // GM controls
    if (this._isGM) {
      el.querySelectorAll(".edit-price").forEach(btn => {
        btn.addEventListener("click", e => { e.stopPropagation(); this._editPrice(btn.dataset.itemId); });
      });
      el.querySelectorAll(".edit-qty").forEach(btn => {
        btn.addEventListener("click", e => { e.stopPropagation(); this._editQty(btn.dataset.itemId); });
      });
      el.querySelectorAll(".delete").forEach(btn => {
        btn.addEventListener("click", e => { e.stopPropagation(); this._removeItem(btn.dataset.itemId); });
      });
      el.querySelector("#ms-show-all")?.addEventListener("click",   () => this._broadcastToAll());
      el.querySelector("#ms-close-all")?.addEventListener("click",  () => this._closeForAll());
      el.querySelector("#ms-clear")?.addEventListener("click",      () => this._clearShop());
    }
  }

  // ─── Drop handler ────────────────────────────────────────────────────────────

  async _onDrop(event) {
    if (!this._isGM) return;

    let dragData;
    try { dragData = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch { return; }

    if (dragData.type !== "Item") return;

    let item;
    try {
      item = await fromUuid(dragData.uuid);
    } catch {
      ui.notifications.warn("Merchant Sheet: Could not find that item.");
      return;
    }
    if (!item) return;

    const data    = getMerchantData(this.actor);
    const items   = data.items || [];

    // Check for duplicate
    if (items.find(i => i.uuid === dragData.uuid)) {
      ui.notifications.warn(`Merchant Sheet: ${item.name} is already in the shop.`);
      return;
    }

    // Extract price from dnd5e item data
    const rawPrice = item.system?.price?.value ?? item.system?.cost ?? 0;
    const currency = item.system?.price?.denomination ?? "gp";

    items.push({
      id:       foundry.utils.randomID(),
      uuid:     dragData.uuid,
      name:     item.name,
      img:      item.img,
      type:     item.type,
      category: getCategory(item.type),
      price:    rawPrice,
      currency: currency,
      quantity: -1, // -1 = unlimited
    });

    await setMerchantData(this.actor, { ...data, items });
    this.render();
    ui.notifications.info(`Merchant Sheet: Added ${item.name} to shop.`);
  }

  // ─── Item card popup ──────────────────────────────────────────────────────────

  async _showItemCard(item) {
    const realItem = await fromUuid(item.uuid).catch(() => null);
    if (realItem) {
      realItem.sheet.render(true);
    } else {
      ui.notifications.warn("Merchant Sheet: Item no longer exists in compendium.");
    }
  }

  // ─── GM helpers ───────────────────────────────────────────────────────────────

  async _editPrice(itemId) {
    const data  = getMerchantData(this.actor);
    const item  = data.items.find(i => i.id === itemId);
    if (!item) return;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Set Price — ${item.name}` },
      content: `
        <div style="display:flex; flex-direction:column; gap:8px; padding:4px 0">
          <div style="display:flex; align-items:center; gap:8px">
            <label style="min-width:60px">Price</label>
            <input type="number" id="item-price" value="${item.price ?? 0}" min="0" style="flex:1">
          </div>
          <div style="display:flex; align-items:center; gap:8px">
            <label style="min-width:60px">Currency</label>
            <select id="item-currency" style="flex:1">
              <option value="cp" ${item.currency==="cp"?"selected":""}>cp</option>
              <option value="sp" ${item.currency==="sp"?"selected":""}>sp</option>
              <option value="ep" ${item.currency==="ep"?"selected":""}>ep</option>
              <option value="gp" ${item.currency==="gp"||!item.currency?"selected":""}>gp</option>
              <option value="pp" ${item.currency==="pp"?"selected":""}>pp</option>
            </select>
          </div>
        </div>
      `,
      ok: { label: "Save", callback: (event, button, dialog) => ({
        price:    +dialog.querySelector("#item-price").value,
        currency: dialog.querySelector("#item-currency").value,
      })},
    });

    if (!result) return;
    item.price    = result.price;
    item.currency = result.currency;
    await setMerchantData(this.actor, data);
    this.render();
  }

  async _editQty(itemId) {
    const data = getMerchantData(this.actor);
    const item = data.items.find(i => i.id === itemId);
    if (!item) return;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Set Quantity — ${item.name}` },
      content: `
        <div style="display:flex; align-items:center; gap:8px; padding:4px 0">
          <label style="min-width:80px">Quantity</label>
          <input type="number" id="item-qty" value="${item.quantity === -1 ? "" : item.quantity}"
            placeholder="Leave empty for unlimited" min="0" style="flex:1">
        </div>
      `,
      ok: { label: "Save", callback: (event, button, dialog) => {
        const val = dialog.querySelector("#item-qty").value;
        return val === "" ? -1 : +val;
      }},
    });

    if (result === null || result === undefined) return;
    item.quantity = result;
    await setMerchantData(this.actor, data);
    this.render();
  }

  async _removeItem(itemId) {
    const data  = getMerchantData(this.actor);
    data.items  = (data.items || []).filter(i => i.id !== itemId);
    await setMerchantData(this.actor, data);
    this.render();
  }

  async _clearShop() {
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Clear Shop" },
      content: "<p>Remove all items from this shop?</p>",
    });
    if (!confirm) return;
    const data   = getMerchantData(this.actor);
    data.items   = [];
    await setMerchantData(this.actor, data);
    this.render();
  }

  // ─── Broadcast to all players ─────────────────────────────────────────────────

  _broadcastToAll() {
    console.log(`Merchant Sheet | Show to All clicked for actor: ${this.actor.id} (${this.actor.name})`);
    console.log(`Merchant Sheet | Socket:`, _socket ? "ready" : "NOT READY");
    emitToAll("openMerchant", { actorId: this.actor.id });
    ui.notifications.info("Merchant Sheet: Shop shown to all players.");
  }

  _closeForAll() {
    emitToAll("closeShop", { actorId: this.actor.id });
    ui.notifications.info("Merchant Sheet: Shop closed for all players.");
  }
}

// ─── Singleton store ──────────────────────────────────────────────────────────

const _openSheets = new Map();

async function openMerchantSheet(actor) {
  // If already open bring to front
  const existing = _openSheets.get(actor.id);
  if (existing && existing.rendered) {
    existing.bringToFront?.();
    return;
  }

  console.log(`Merchant Sheet | Opening for ${actor.name} (${game.user.name})`);
  const sheet = new MerchantSheet(actor);
  _openSheets.set(actor.id, sheet);
  sheet.addEventListener("close", () => _openSheets.delete(actor.id));

  sheet.render(true).then(() => {
    console.log(`Merchant Sheet | Render resolved for ${game.user.name}`);
    // Force element visible in case Hide Player UI or other modules are hiding it
    setTimeout(() => {
      const el = sheet.element;
      if (el) {
        el.style.display    = "";
        el.style.visibility = "visible";
        el.style.opacity    = "1";
        el.style.zIndex     = "9999";
        el.style.position   = "fixed";
        el.style.top        = "50%";
        el.style.left       = "50%";
        el.style.transform  = "translate(-50%, -50%)";
        console.log(`Merchant Sheet | Element forced visible:`, el.id, el.style.cssText);
      } else {
        console.warn(`Merchant Sheet | No element found after render`);
      }
    }, 100);
  }).catch(e => {
    console.error(`Merchant Sheet | Render error:`, e);
    _openSheets.delete(actor.id);
  });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  console.log("Merchant Sheet | Initialising");


});

// Register socketlib socket — must be in the "socketlib.ready" hook
// Register socketlib — handles both cases:
// 1. socketlib.ready fires before our ready hook
// 2. Our ready hook fires before socketlib.ready

function _registerSocketlib() {
  if (_socket) return; // already registered
  _socket = socketlib.registerModule(MODULE_ID);
  _socket.register("remoteOpenMerchant", _remoteOpenMerchant);
  _socket.register("remoteCloseShop",    _remoteCloseShop);
  game.modules.get(MODULE_ID)._socket = _socket;
  console.log("Merchant Sheet | Socketlib registered successfully");
}

Hooks.once("socketlib.ready", () => {
  console.log("Merchant Sheet | socketlib.ready fired");
  _registerSocketlib();
});

Hooks.once("ready", () => {
  // If socketlib.ready already fired _socket is set, otherwise try now
  if (!_socket) {
    if (typeof socketlib !== "undefined") {
      console.log("Merchant Sheet | Registering socketlib in ready hook");
      _registerSocketlib();
    } else {
      console.error("Merchant Sheet | socketlib is not available — is it installed and enabled?");
    }
  }
  console.log("Merchant Sheet | Ready — socket status:", _socket ? "registered" : "FAILED");
});

// ─── Actor directory right-click ──────────────────────────────────────────────

// Intercept double-click on actor in directory
Hooks.on("renderActorDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;
  root.querySelectorAll(".document[data-document-id]").forEach(el => {
    el.addEventListener("dblclick", e => {
      const actorId = el.dataset.documentId;
      const actor   = game.actors.get(actorId);
      if (!actor?.getFlag("merchant-sheet", "inventory")) return;
      e.stopPropagation();
      e.preventDefault();
      openMerchantSheet(actor);
    }, true); // capture phase so we fire before Foundry's handler
  });
});

Hooks.on("getActorDirectoryEntryContext", (html, options) => {
  options.unshift({
    name:      "Open Shop",
    icon:      "<i class='fas fa-store'></i>",
    condition: li => {
      const actorId = li.dataset?.documentId ?? li[0]?.dataset?.documentId;
      const actor   = game.actors.get(actorId);
      return actor?.getFlag("merchant-sheet", "inventory") !== undefined;
    },
    callback: li => {
      const actorId = li.dataset?.documentId ?? li[0]?.dataset?.documentId;
      const actor   = game.actors.get(actorId);
      if (actor) openMerchantSheet(actor);
    },
  });
});

Hooks.on("getTokenContextOptions", (token, options) => {
  options.push({
    name:  "Open Shop",
    icon:  "<i class='fas fa-store'></i>",
    condition: () => game.user.isGM,
    callback: t => {
      const actor = t.actor ?? game.actors.get(t.document.actorId);
      if (!actor) return ui.notifications.warn("Merchant Sheet: No actor found for this token.");
      openMerchantSheet(actor);
    },
  });
});

// ─── Token double-click opens merchant sheet ──────────────────────────────────

function hookTokenDoubleClick(token) {
  if (!token) return;
  const orig = token._onClickLeft2?.bind(token);
  token._onClickLeft2 = function(event) {
    const actor = this.actor;
    if (actor?.getFlag("merchant-sheet", "inventory") !== undefined) {
      openMerchantSheet(actor);
      return;
    }
    return orig?.call(this, event);
  };
}

Hooks.on("canvasReady", () => {
  canvas.tokens?.placeables?.forEach(t => hookTokenDoubleClick(t));
});

Hooks.on("createToken", (tokenDoc) => {
  const token = canvas.tokens?.get(tokenDoc.id);
  if (token) hookTokenDoubleClick(token);
});

// ─── Inject into Create Actor dialog ─────────────────────────────────────────
// v14 uses getDocumentTypeIcons or renders via ApplicationV2 — intercept both

function injectMerchantOption(html) {
  // Try both jQuery and native element
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  // Look for the list of actor types
  const list = root.querySelector("ul, .document-type-list, .type-list, form ul");
  if (!list) return;

  // Avoid duplicate injection
  if (list.querySelector("[data-type='merchant-sheet']")) return;

  const li = document.createElement("li");
  li.dataset.type = "merchant-sheet";
  li.style.cssText = "display:flex; align-items:center; gap:12px; padding:8px 10px; cursor:pointer; border-radius:4px; list-style:none;";
  li.innerHTML = `
    <img src="icons/svg/item-bag.svg" style="width:40px; height:40px; border-radius:4px; border:1px solid #555; flex-shrink:0;">
    <span style="font-size:14px; flex:1;">Merchant Sheet</span>
    <input type="radio" name="type" value="merchant-sheet" style="flex-shrink:0;">
  `;

  li.addEventListener("click", () => {
    root.querySelectorAll("input[name='type']").forEach(r => r.checked = false);
    li.querySelector("input").checked = true;
    root.querySelectorAll("li").forEach(l => l.style.background = "");
    li.style.background = "rgba(255,255,255,0.08)";
  });

  list.appendChild(li);
}

// Hook for legacy Dialog
Hooks.on("renderDialog", (dialog, html) => {
  if (!dialog.title?.includes("Create")) return;
  if (!dialog.title?.includes("Actor")) return;
  injectMerchantOption(html instanceof jQuery ? html[0] : html);
  interceptCreateButton(dialog, html instanceof jQuery ? html[0] : html);
});

// Hook for ApplicationV2 in v14
Hooks.on("renderActorDirectory", () => {});
Hooks.on("renderApplication", (app, html) => {
  const title = app.title || app.options?.window?.title || "";
  if (!title.includes("Create") || !title.includes("Actor")) return;
  injectMerchantOption(html instanceof jQuery ? html[0] : html);
  interceptCreateButton(app, html instanceof jQuery ? html[0] : html);
});

function interceptCreateButton(app, root) {
  const btn = root?.querySelector("button[type='submit'], [data-action='create'], .create, footer button");
  if (!btn) return;
  btn.addEventListener("click", async e => {
    const selected = root.querySelector("input[name='type']:checked");
    if (selected?.value !== "merchant-sheet") return;
    e.preventDefault();
    e.stopPropagation();
    app.close?.();

    const actor = await Actor.create({
      name:   "New Merchant",
      type:   "npc",
      img:    "icons/svg/item-bag.svg",
      system: { attributes: { hp: { value: 1, max: 1 } } },
      prototypeToken: { name: "Merchant", disposition: 1 },
    });

    openMerchantSheet(actor);
  }, true);
}
