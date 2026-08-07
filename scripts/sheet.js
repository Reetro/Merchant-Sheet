// sheet.js — MerchantSheet ApplicationV2 class

import { getMerchantData, setMerchantData, getCategory, groupByCategory } from "./data.js";
import { emitToAll } from "./socket.js";
import { getSetting } from "./settings.js";

// ─── Helper — get the current player's assigned actor ─────────────────────────
// game.user.character resolves only when the player has Owner permission
// Fall back to looking up by actorId directly if character is null

function _getPlayerActor() {
  if (game.user.character) return game.user.character;
  // If actorId is set but character is null the player may lack Owner permission
  // Look up directly by id
  if (game.user.actorId) return game.actors.get(game.user.actorId) ?? null;
  return null;
}

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
    super(foundry.utils.mergeObject(options, {
      id: `merchant-sheet-${actor.id}`,
    }));
    this.actor      = actor;
    this._collapsed = {};
    this._isGM      = game.user.isGM;
    this._splitMode = false; // true when item panel is open
  }

  get title() { return `Shop — ${this.actor.name}`; }

  _canRender(options) { return; }

  // Prevent Foundry's position system from overriding our fullscreen CSS for players
  setPosition(position = {}) {
    if (!this._isGM && getSetting("playerFullscreen")) return this.position;
    return super.setPosition(position);
  }

  async _insertElement(element, options) {
    document.body.appendChild(element);

    // Only players get fullscreen — GM keeps normal windowed view
    // Respects the playerFullscreen setting
    if (!this._isGM && getSetting("playerFullscreen")) {
      element.style.setProperty("position",      "fixed",    "important");
      element.style.setProperty("top",           "0",        "important");
      element.style.setProperty("left",          "0",        "important");
      element.style.setProperty("width",         "100vw",    "important");
      element.style.setProperty("height",        "100vh",    "important");
      element.style.setProperty("transform",     "none",     "important");
      element.style.setProperty("border-radius", "0",        "important");
      element.style.setProperty("transition",    "height 0.4s cubic-bezier(0.4,0,0.2,1)", "important");
    }

    // Only inject override styles when playerFullscreen is enabled
    // When off leave Foundry's normal window management completely intact
    if (!this._isGM && getSetting("playerFullscreen")) {
      const styleId = `ms-override-${element.id}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          #${element.id} {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            z-index: 999998 !important;
            pointer-events: all !important;
          }
          #${element.id} * { visibility: visible !important; }
        `;
        document.head.appendChild(style);
      }
    }
  }

  // Shrink shop to top half and show item in bottom half
  showItemSplitScreen(itemElement) {
    this._splitMode = true;

    // Remove any existing item panel cleanly
    const existingPanel = document.getElementById("ms-item-panel");
    if (existingPanel) existingPanel.remove();

    // Create item panel
    const panel = document.createElement("div");
    panel.id = "ms-item-panel";
    panel.style.cssText = `
      position: fixed;
      left: 0;
      bottom: -50vh;
      width: 100vw;
      height: 50vh;
      z-index: 999999;
      background: var(--color-bg-primary, #1a1a1a);
      border-top: 2px solid var(--color-border-dark, #444);
      overflow: auto;
      transition: bottom 0.4s cubic-bezier(0.4,0,0.2,1);
      display: flex;
      flex-direction: column;
    `;

    // Item content
    const content = document.createElement("div");
    content.style.cssText = "flex:1; overflow:auto; padding: 8px;";
    content.appendChild(itemElement);
    panel.appendChild(content);

    document.body.appendChild(panel);

    // Shrink the merchant sheet to top half — only when playerFullscreen is on
    const shopEl = this.element;
    if (shopEl && (!this._isGM) && getSetting("playerFullscreen")) {
      shopEl.style.setProperty("height",     "50vh", "important");
      shopEl.style.setProperty("overflow-y", "auto", "important");
    }

    // Animate panel in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.bottom = "0";
      });
    });

    // Re-render footer to show Close Item button
    this.render();
  }

  closeItemPanel() {
    if (this._isGM) {
      // Close the tracked native item sheet
      this._gmItemSheet?.close?.();
      this._gmItemSheet = null;
    } else {
      // Slide player panel down
      const panel = document.getElementById("ms-item-panel");
      if (panel) {
        panel.style.bottom = "-50vh";
        setTimeout(() => panel.remove(), 400);
      }
      const shopEl = this.element;
      if (shopEl && getSetting("playerFullscreen")) shopEl.style.setProperty("height", "100vh", "important");
    }
    this._splitMode = false;
    this.render();
    if (this._isGM) emitToAll("closeItem", { actorId: this.actor.id });
  }

  get _itemPanelOpen() {
    return this._splitMode;
  }

  async _renderHTML(context, options) {
    const data     = getMerchantData(this.actor);
    const groups   = groupByCategory(data.items || []);
    const hasItems = (data.items || []).length > 0;
    const el       = document.createElement("div");
    el.className   = "merchant-sheet";
    el.innerHTML   = this._buildHTML(data, groups, hasItems);
    return el;
  }

  _replaceHTML(result, content, options) {
    if (!content || !result) return;
    content.replaceChildren(result);
  }

  _buildHTML(data, groups, hasItems) {
    let html = `
      <div class="merchant-header">
        <div style="position:relative; flex-shrink:0;">
          <img src="${data.img || "icons/svg/mystery-man.svg"}" alt="${data.name}"
            id="ms-portrait"
            style="cursor:${this._isGM ? "pointer" : "default"};"
            title="${this._isGM ? "Click to change portrait" : ""}">
          ${this._isGM ? `<div style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);border-radius:3px;padding:1px 3px;font-size:9px;pointer-events:none;"><i class="fas fa-camera"></i></div>` : ""}
        </div>
        <span class="merchant-name" id="ms-shop-name" title="${this._isGM ? "Double-click to rename" : ""}" style="cursor:${this._isGM ? "pointer" : "default"}">${data.name}</span>
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

    html += `</div>`;
    html += `<div class="merchant-footer">
      <span>${(data.items || []).length} item${(data.items || []).length !== 1 ? "s" : ""}</span>`;

    if (this._isGM) {
      html += `<div class="gm-controls">`;
      if (this._itemPanelOpen && getSetting("playerFullscreen")) {
        html += `<button id="ms-close-item" style="background:#1a2a40; border-color:#2d4480; color:#ccd9ff;"><i class="fas fa-compress-alt"></i> Close Item</button>`;
      }
      html += `
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
    const enableQty  = getSetting("enableQuantity");
    const qty        = !enableQty && !this._isGM ? "" : item.quantity === -1 ? "∞" : item.quantity ?? "∞";
    const outOfStock = enableQty && item.quantity === 0 && !this._isGM && getSetting("allowPurchases");

    // Check if player can afford this item
    let canAfford = true;
    let hasCharacter = true;
    if (!this._isGM && getSetting("allowPurchases")) {
      const actor = _getPlayerActor();
      if (!actor) {
        hasCharacter = false;
        canAfford    = false;
      } else {
        const currencies = actor.system?.currency ?? {};
        const RATES = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
        const totalCp = Object.entries(currencies).reduce((sum, [k, v]) => sum + (v || 0) * (RATES[k] || 0), 0);
        const costCp  = price * (RATES[currency] || 100);
        canAfford = totalCp >= costCp;
      }
    }

    const showBuy = !this._isGM && getSetting("allowPurchases");
    const buyDisabled = outOfStock || !canAfford;
    const buyTitle = !hasCharacter ? "No character assigned" : outOfStock ? "Out of stock" : !canAfford ? "Cannot afford" : `Buy for ${price} ${currency}`;

    return `
      <div class="merchant-item" data-item-id="${item.id}" ${outOfStock ? 'style="opacity:0.5"' : ''}>
        <img src="${item.img || "icons/svg/item-bag.svg"}" alt="${item.name}">
        <span class="item-name">${item.name}</span>
        ${(getSetting("enableQuantity") || this._isGM) ? `<span class="item-qty">${qty === "∞" ? "∞" : `×${qty}`}</span>` : ""}
        <span class="item-price">${price} ${currency}</span>
        ${showBuy ? `
          <button class="buy-item" data-item-id="${item.id}"
            title="${buyTitle}"
            ${buyDisabled ? "disabled" : ""}
            style="
              background:${buyDisabled ? "rgba(255,255,255,0.05)" : "#1a3a20"};
              border:1px solid ${buyDisabled ? "#444" : "#2d6b35"};
              color:${buyDisabled ? "#666" : "#ccffcc"};
              padding:3px 10px; border-radius:3px; cursor:${buyDisabled ? "not-allowed" : "pointer"};
              font-size:12px; white-space:nowrap;
            ">
            <i class="fas fa-coins"></i> Buy
          </button>` : ""}
        ${this._isGM ? `
          <div class="item-controls">
            <button class="edit-price" data-item-id="${item.id}" title="Edit price"><i class="fas fa-tag"></i></button>
            ${getSetting("enableQuantity") ? `<button class="edit-qty" data-item-id="${item.id}" title="Edit quantity"><i class="fas fa-hashtag"></i></button>` : ""}
            <button class="refresh-icon" data-item-id="${item.id}" title="Refresh icon from compendium"><i class="fas fa-sync"></i></button>
            <button class="delete"     data-item-id="${item.id}" title="Remove"><i class="fas fa-times"></i></button>
          </div>` : ""}
      </div>
    `;
  }

  _onRender(context, options) {
    const el = this.element;

    // Enforce fullscreen and split state for players after every render
    // Only when playerFullscreen setting is enabled
    if (!this._isGM && getSetting("playerFullscreen")) {
      el.style.setProperty("position",      "fixed",  "important");
      el.style.setProperty("top",           "0",      "important");
      el.style.setProperty("left",          "0",      "important");
      el.style.setProperty("width",         "100vw",  "important");
      el.style.setProperty("transform",     "none",   "important");
      el.style.setProperty("border-radius", "0",      "important");
      el.style.setProperty("transition",    "height 0.4s cubic-bezier(0.4,0,0.2,1)", "important");
      el.style.setProperty("height", this._splitMode ? "50vh" : "100vh", "important");
    }

    // Portrait click (GM only)
    if (this._isGM) {
      // Shop name rename on double-click
      el.querySelector("#ms-shop-name")?.addEventListener("dblclick", async () => {
        const data = getMerchantData(this.actor);
        const result = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Rename Shop" },
          content: `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
              <label style="min-width:60px">Name</label>
              <input type="text" id="shop-name" value="${data.name}" style="flex:1" autofocus>
            </div>`,
          ok: { label: "Save", callback: (e, b, d) => d.element.querySelector("#shop-name").value.trim() },
        });
        if (!result) return;
        data.name = result;
        await setMerchantData(this.actor, data);
        await this.actor.update({ name: result });
        this._syncAndRender();
      });
      el.querySelector("#ms-portrait")?.addEventListener("click", async () => {
        const picker = new FilePicker({
          type:     "image",
          current:  getMerchantData(this.actor).img || "",
          callback: async path => {
            const data = getMerchantData(this.actor);
            data.img   = path;
            await setMerchantData(this.actor, data);
            await this.actor.update({ img: path, "prototypeToken.texture.src": path });
            this._syncAndRender();
          },
        });
        picker.render(true);
      });
    }

    // Drop zone
    const body = el.querySelector("#merchant-body");
    if (body) {
      // Scroll sync — GM scrolling broadcasts to all players
      if (this._isGM && getSetting("syncScroll")) {
        let _scrollTimeout;
        body.addEventListener("scroll", () => {
          clearTimeout(_scrollTimeout);
          _scrollTimeout = setTimeout(() => {
            emitToAll("scrollShop", { actorId: this.actor.id, scrollTop: body.scrollTop });
          }, 50);
        });
      }

      body.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("text/plain")) {
          e.preventDefault();
          body.classList.add("drop-zone-active");
        }
      });
      body.addEventListener("dragleave", () => body.classList.remove("drop-zone-active"));
      body.addEventListener("drop", e => {
        e.preventDefault();
        body.classList.remove("drop-zone-active");
        this._onDrop(e);
      });
    }

    // Category collapse
    el.querySelectorAll(".category-header").forEach(h => {
      h.addEventListener("click", () => {
        this._collapsed[h.dataset.category] = !this._collapsed[h.dataset.category];
        this.render();
      });
    });

    // Item double-click — open item sheet on all screens
    el.querySelectorAll(".merchant-item").forEach(row => {
      row.addEventListener("dblclick", e => {
        if (e.target.closest(".item-controls")) return;
        const data = getMerchantData(this.actor);
        const item = data.items.find(i => i.id === row.dataset.itemId);
        if (!item) return;
        // Open locally
        this._showItemCard(item);
        // Broadcast to all other clients if sync is enabled
        if (this._isGM && getSetting("syncItemView")) {
          emitToAll("showItem", { actorId: this.actor.id, itemId: item.id });
        }
      });
    });

    // Buy button handler (players only)
    if (!this._isGM && getSetting("allowPurchases")) {
      el.querySelectorAll(".buy-item:not([disabled])").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          this._purchaseItem(btn.dataset.itemId);
        });
        btn.addEventListener("dblclick", e => {
          e.stopPropagation();
          e.preventDefault();
        });
      });
    }

    // GM controls
    if (this._isGM) {
      el.querySelectorAll(".edit-price").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._editPrice(btn.dataset.itemId); }));
      el.querySelectorAll(".edit-qty").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._editQty(btn.dataset.itemId); }));
      el.querySelectorAll(".refresh-icon").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._refreshItemIcon(btn.dataset.itemId); }));
      el.querySelectorAll(".delete").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._removeItem(btn.dataset.itemId); }));
      el.querySelector("#ms-close-item")?.addEventListener("click", () => this.closeItemPanel());
      el.querySelector("#ms-show-all")?.addEventListener("click",   () => this._broadcastToAll());
      el.querySelector("#ms-close-all")?.addEventListener("click",  () => this._closeForAll());
      el.querySelector("#ms-clear")?.addEventListener("click",      () => this._clearShop());
    }
  }

  // ─── Drop ─────────────────────────────────────────────────────────────────────

  async _onDrop(event) {
    if (!this._isGM) return;
    let dragData;
    try { dragData = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
    if (dragData.type !== "Item") return;

    const item = await fromUuid(dragData.uuid).catch(() => null);
    if (!item) { ui.notifications.warn("Merchant Sheet: Could not find that item."); return; }

    const data  = getMerchantData(this.actor);
    const items = data.items || [];
    if (items.find(i => i.uuid === dragData.uuid)) {
      ui.notifications.warn(`Merchant Sheet: ${item.name} is already in the shop.`);
      return;
    }

    items.push({
      id:       foundry.utils.randomID(),
      uuid:     dragData.uuid,
      name:     item.name,
      img:      item.img,
      type:     item.type,
      category: getCategory(item.type),
      price:    item.system?.price?.value ?? item.system?.cost ?? 0,
      currency: item.system?.price?.denomination ?? "gp",
      quantity: -1,
    });

    await setMerchantData(this.actor, { ...data, items });
    this._syncAndRender();
    ui.notifications.info(`Merchant Sheet: Added ${item.name} to shop.`);
  }

  // ─── Item card ────────────────────────────────────────────────────────────────

  async _findItemDoc(item) {
    if (item.uuid) {
      const doc = await fromUuid(item.uuid).catch(() => null);
      if (doc) return doc;
    }
    for (const pack of game.packs.filter(p => p.metadata.type === "Item")) {
      try {
        const index = await pack.getIndex({ fields: ["name"] });
        const entry = index.find(e => e.name.toLowerCase() === item.name.toLowerCase());
        if (entry) { return await pack.getDocument(entry._id); }
      } catch { continue; }
    }
    return null;
  }

  async _showItemCard(item) {
    const doc = await this._findItemDoc(item);
    if (!doc) {
      ui.notifications.warn(`Merchant Sheet: Could not find "${item.name}" in any compendium.`);
      return;
    }

    if (this._isGM) {
      // GM gets a normal draggable Foundry item sheet
      doc.sheet.render(true);
      // Track that an item is open so the Close Item button appears
      this._gmItemSheet = doc.sheet;
      this._splitMode   = true;
      this.render();
    } else {
      // Players get split screen only if playerFullscreen is enabled
      // Otherwise open as a normal draggable sheet
      if (getSetting("playerFullscreen")) {
        const sheet = doc.sheet;
        await sheet.render(true);
        setTimeout(() => {
          const sheetEl = sheet.element;
          if (!sheetEl) return;
          const clone = sheetEl.cloneNode(true);
          clone.style.cssText = "position:relative; width:100%; height:100%; box-shadow:none; border:none;";
          sheet.close({ force: true });
          this.showItemSplitScreen(clone);
        }, 100);
      } else {
        doc.sheet.render(true);
      }
    }
  }

  // ─── GM helpers ───────────────────────────────────────────────────────────────

  async _editPrice(itemId) {
    const data = getMerchantData(this.actor);
    const item = data.items.find(i => i.id === itemId);
    if (!item) return;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Set Price — ${item.name}` },
      content: `
        <div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
          <div style="display:flex;align-items:center;gap:8px">
            <label style="min-width:60px">Price</label>
            <input type="number" id="item-price" value="${item.price ?? 0}" min="0" style="flex:1">
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="min-width:60px">Currency</label>
            <select id="item-currency" style="flex:1">
              <option value="cp" ${item.currency==="cp"?"selected":""}>cp</option>
              <option value="sp" ${item.currency==="sp"?"selected":""}>sp</option>
              <option value="ep" ${item.currency==="ep"?"selected":""}>ep</option>
              <option value="gp" ${item.currency==="gp"||!item.currency?"selected":""}>gp</option>
              <option value="pp" ${item.currency==="pp"?"selected":""}>pp</option>
            </select>
          </div>
        </div>`,
      ok: { label: "Save", callback: (e, b, d) => ({
        price:    +d.element.querySelector("#item-price").value,
        currency: d.element.querySelector("#item-currency").value,
      })},
    });
    if (!result) return;
    item.price    = result.price;
    item.currency = result.currency;
    await setMerchantData(this.actor, data);
    this._syncAndRender();
  }

  async _editQty(itemId) {
    const data = getMerchantData(this.actor);
    const item = data.items.find(i => i.id === itemId);
    if (!item) return;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Set Quantity — ${item.name}` },
      content: `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <label style="min-width:80px">Quantity</label>
          <input type="number" id="item-qty" value="${item.quantity === -1 ? "" : item.quantity}"
            placeholder="Leave empty for unlimited" min="0" style="flex:1">
        </div>`,
      ok: { label: "Save", callback: (e, b, d) => {
        const val = d.element.querySelector("#item-qty").value;
        return val === "" ? -1 : +val;
      }},
    });
    if (result === null || result === undefined) return;
    item.quantity = result;
    await setMerchantData(this.actor, data);
    this._syncAndRender();
  }

  async _refreshItemIcon(itemId) {
    const data = getMerchantData(this.actor);
    const item = data.items.find(i => i.id === itemId);
    if (!item) return;

    let newImg = null;

    // Try UUID first
    if (item.uuid) {
      const doc = await fromUuid(item.uuid).catch(() => null);
      if (doc) newImg = doc.img;
    }

    // Fall back to compendium name search
    if (!newImg) {
      for (const pack of game.packs.filter(p => p.metadata.type === "Item")) {
        try {
          const index = await pack.getIndex({ fields: ["name", "img"] });
          const entry = index.find(e => e.name.toLowerCase() === item.name.toLowerCase());
          if (entry?.img) { newImg = entry.img; break; }
        } catch { continue; }
      }
    }

    if (!newImg) {
      ui.notifications.warn(`Merchant Sheet: Could not find updated icon for "${item.name}".`);
      return;
    }

    item.img = newImg;
    await setMerchantData(this.actor, data);
    this._syncAndRender();
    ui.notifications.info(`Merchant Sheet: Icon updated for "${item.name}".`);
  }

  async _removeItem(itemId) {
    const data = getMerchantData(this.actor);
    data.items  = (data.items || []).filter(i => i.id !== itemId);
    await setMerchantData(this.actor, data);
    this._syncAndRender();
  }

  async _clearShop() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Clear Shop" },
      content: "<p>Remove all items from this shop?</p>",
    });
    if (!confirmed) return;
    const data = getMerchantData(this.actor);
    data.items  = [];
    await setMerchantData(this.actor, data);
    this._syncAndRender();
  }

  async _purchaseItem(itemId) {
    const actor = _getPlayerActor();
    if (!actor) {
      ui.notifications.warn("Merchant Sheet: No character assigned. Go to the player list, right-click your name, and assign a character.");
      return;
    }

    const data  = getMerchantData(this.actor);
    const item  = data.items?.find(i => i.id === itemId);
    if (!item) return;

    const price    = item.price ?? 0;
    const currency = item.currency ?? "gp";

    // Currency conversion rates in cp
    const RATES = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
    const costCp  = price * (RATES[currency] || 100);

    // Check affordability across all denominations
    const currencies = foundry.utils.deepClone(actor.system?.currency ?? {});
    const totalCp = Object.entries(currencies).reduce((sum, [k, v]) => sum + (v || 0) * (RATES[k] || 0), 0);

    if (totalCp < costCp) {
      ui.notifications.warn(`Merchant Sheet: You cannot afford ${item.name}.`);
      return;
    }

    // Deduct gold — spend from smallest denomination first then work up
    let remaining = costCp;
    for (const denom of ["cp", "sp", "ep", "gp", "pp"]) {
      if (remaining <= 0) break;
      const available = (currencies[denom] || 0) * RATES[denom];
      const spend     = Math.min(available, remaining);
      const spendCoins = Math.floor(spend / RATES[denom]);
      currencies[denom] = (currencies[denom] || 0) - spendCoins;
      remaining -= spendCoins * RATES[denom];
    }

    // If there is a remainder (e.g. buying a 1gp item with only sp)
    // break a higher denomination to make change
    if (remaining > 0) {
      for (const denom of ["pp", "gp", "ep", "sp", "cp"]) {
        if (currencies[denom] > 0 && RATES[denom] > remaining) {
          currencies[denom] -= 1;
          const change = RATES[denom] - remaining;
          // Add change back in cp
          currencies["cp"] = (currencies["cp"] || 0) + Math.floor(change);
          remaining = 0;
          break;
        }
      }
    }

    if (remaining > 0) {
      ui.notifications.warn(`Merchant Sheet: Could not complete transaction.`);
      return;
    }

    // Apply currency changes to actor
    await actor.update({ "system.currency": currencies });

    // Add item to actor inventory — stack if a matching item already exists
    let itemData = null;
    if (item.uuid) {
      const doc = await fromUuid(item.uuid).catch(() => null);
      if (doc) itemData = doc.toObject();
    }
    if (!itemData) {
      itemData = {
        name:   item.name,
        type:   item.type || "loot",
        img:    item.img  || "icons/svg/item-bag.svg",
        system: { quantity: 1 },
      };
    }

    // Look for an existing matching item in the actor's inventory
    // Match by UUID source first, then fall back to name + type
    const MAX_STACK = 9999;
    const existing = actor.items.find(i => {
      if (item.uuid) {
        const sourceId = i.flags?.core?.sourceId ?? i._stats?.compendiumSource;
        if (sourceId === item.uuid) return true;
      }
      return i.name === item.name && i.type === (itemData.type || "loot");
    });

    if (existing) {
      const currentQty = existing.system?.quantity ?? 1;
      if (currentQty < MAX_STACK) {
        await existing.update({ "system.quantity": currentQty + 1 });
      } else {
        // Stack is maxed — create a new item with quantity 1
        itemData.system = itemData.system || {};
        itemData.system.quantity = 1;
        await actor.createEmbeddedDocuments("Item", [itemData]);
      }
    } else {
      // No existing item — create new
      itemData.system = itemData.system || {};
      itemData.system.quantity = 1;
      await actor.createEmbeddedDocuments("Item", [itemData]);
    }

    // Reduce stock via socket so GM's shop updates too
    emitToAll("purchaseItem", { actorId: this.actor.id, itemId, buyerName: actor.name });

    ui.notifications.info(`Merchant Sheet: ${actor.name} purchased ${item.name} for ${price} ${currency}.`);

    // Re-render to update buy button affordability — preserve scroll position
    const body = this.element?.querySelector("#merchant-body");
    const scrollTop = body?.scrollTop ?? 0;
    await this.render();
    requestAnimationFrame(() => {
      const newBody = this.element?.querySelector("#merchant-body");
      if (newBody) newBody.scrollTop = scrollTop;
    });
  }

  // Re-render locally and broadcast sync to all connected clients
  _syncAndRender() {
    this.render();
    emitToAll("syncShop", { actorId: this.actor.id });
  }

  _broadcastToAll() {
    emitToAll("openMerchant", { actorId: this.actor.id });
    ui.notifications.info("Merchant Sheet: Shop shown to all players.");
  }

  _closeForAll() {
    // Close item panel first
    this.closeItemPanel();
    emitToAll("closeShop", { actorId: this.actor.id });
    this.close();
    ui.notifications.info("Merchant Sheet: Shop closed for all players.");
  }
}
