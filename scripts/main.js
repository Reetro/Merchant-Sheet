// Merchant Sheet — main.js
// Foundry VTT v14 | D&D 5e
// Features:
//   - Display items for sale with categories, prices, quantities
//   - Drag items from compendiums onto the sheet
//   - Right-click token to open shop for all connected players

const MODULE_ID  = "merchant-sheet";
const SOCKET_KEY = `module.${MODULE_ID}`;

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
    id:    "merchant-sheet",
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
    super(options);
    this.actor         = actor;
    this._collapsed    = {};
    this._isGM         = game.user.isGM;
  }

  get title() { return `Shop — ${this.actor.name}`; }

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
    // Header
    let html = `
      <div class="merchant-header">
        <img src="${data.img || "icons/svg/mystery-man.svg"}" alt="${data.name}">
        <span class="merchant-name">${data.name}</span>
        <span class="merchant-gold"><i class="fas fa-coins"></i> Open Shop</span>
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
        <button id="ms-broadcast"><i class="fas fa-broadcast-tower"></i> Show to All</button>
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
    content.replaceChildren(result);
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
      el.querySelector("#ms-broadcast")?.addEventListener("click", () => this._broadcastToAll());
      el.querySelector("#ms-clear")?.addEventListener("click",     () => this._clearShop());
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
    // Emit socket event so all connected clients open this merchant
    game.socket.emit(SOCKET_KEY, {
      action:  "openMerchant",
      actorId: this.actor.id,
    });
    // Also open locally if not already
    ui.notifications.info("Merchant Sheet: Shop displayed to all players.");
  }
}

// ─── Singleton store ──────────────────────────────────────────────────────────

const _openSheets = new Map();

function openMerchantSheet(actor) {
  if (_openSheets.has(actor.id) && !_openSheets.get(actor.id).closed) {
    _openSheets.get(actor.id).bringToTop?.();
    return;
  }
  const sheet = new MerchantSheet(actor);
  sheet.render(true);
  sheet.addEventListener("close", () => _openSheets.delete(actor.id));
  _openSheets.set(actor.id, sheet);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  console.log("Merchant Sheet | Initialising");
});

Hooks.once("ready", () => {
  console.log("Merchant Sheet | Ready");

  // Socket listener — open shop on all clients when GM broadcasts
  game.socket.on(SOCKET_KEY, data => {
    if (data.action === "openMerchant") {
      const actor = game.actors.get(data.actorId);
      if (actor) openMerchantSheet(actor);
    }
  });
});

// ─── Token right-click context menu ──────────────────────────────────────────

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
