// sheet.js — MerchantSheet ApplicationV2 class

import { getMerchantData, setMerchantData, getCategory, groupByCategory } from "./data.js";
import { emitToAll } from "./socket.js";

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
  }

  get title() { return `Shop — ${this.actor.name}`; }

  _canRender(options) { return; }

  async _insertElement(element, options) {
    document.body.appendChild(element);

    // Players get fullscreen shop — GM gets normal windowed view
    if (!this._isGM) {
      element.style.setProperty("position",      "fixed",  "important");
      element.style.setProperty("top",           "0",      "important");
      element.style.setProperty("left",          "0",      "important");
      element.style.setProperty("width",         "100vw",  "important");
      element.style.setProperty("height",        "100vh",  "important");
      element.style.setProperty("transform",     "none",   "important");
      element.style.setProperty("border-radius", "0",      "important");
    }

    // Force visibility in case other modules hide UI
    const styleId = `ms-override-${element.id}`;
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
        #${element.id} * { visibility: visible !important; }
      `;
      document.head.appendChild(style);
    }
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

    html += `</div>`;
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

  _onRender(context, options) {
    const el = this.element;

    // Portrait click (GM only)
    if (this._isGM) {
      el.querySelector("#ms-portrait")?.addEventListener("click", async () => {
        const picker = new FilePicker({
          type:     "image",
          current:  getMerchantData(this.actor).img || "",
          callback: async path => {
            const data = getMerchantData(this.actor);
            data.img   = path;
            await setMerchantData(this.actor, data);
            await this.actor.update({ img: path, "prototypeToken.texture.src": path });
            this.render();
          },
        });
        picker.render(true);
      });
    }

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

    // Item click
    el.querySelectorAll(".merchant-item").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.closest(".item-controls")) return;
        const data = getMerchantData(this.actor);
        const item = data.items.find(i => i.id === row.dataset.itemId);
        if (item) this._showItemCard(item);
      });
    });

    // GM controls
    if (this._isGM) {
      el.querySelectorAll(".edit-price").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._editPrice(btn.dataset.itemId); }));
      el.querySelectorAll(".edit-qty").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._editQty(btn.dataset.itemId); }));
      el.querySelectorAll(".delete").forEach(btn =>
        btn.addEventListener("click", e => { e.stopPropagation(); this._removeItem(btn.dataset.itemId); }));
      el.querySelector("#ms-show-all")?.addEventListener("click",  () => this._broadcastToAll());
      el.querySelector("#ms-close-all")?.addEventListener("click", () => this._closeForAll());
      el.querySelector("#ms-clear")?.addEventListener("click",     () => this._clearShop());
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
    this.render();
    ui.notifications.info(`Merchant Sheet: Added ${item.name} to shop.`);
  }

  // ─── Item card ────────────────────────────────────────────────────────────────

  async _showItemCard(item) {
    if (item.uuid) {
      const real = await fromUuid(item.uuid).catch(() => null);
      if (real) { real.sheet.render(true); return; }
    }
    for (const pack of game.packs.filter(p => p.metadata.type === "Item")) {
      try {
        const index = await pack.getIndex({ fields: ["name"] });
        const entry = index.find(e => e.name.toLowerCase() === item.name.toLowerCase());
        if (entry) {
          const doc = await pack.getDocument(entry._id);
          if (doc) { doc.sheet.render(true); return; }
        }
      } catch { continue; }
    }
    ui.notifications.warn(`Merchant Sheet: Could not find "${item.name}" in any compendium.`);
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
        price:    +d.querySelector("#item-price").value,
        currency: d.querySelector("#item-currency").value,
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
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <label style="min-width:80px">Quantity</label>
          <input type="number" id="item-qty" value="${item.quantity === -1 ? "" : item.quantity}"
            placeholder="Leave empty for unlimited" min="0" style="flex:1">
        </div>`,
      ok: { label: "Save", callback: (e, b, d) => {
        const val = d.querySelector("#item-qty").value;
        return val === "" ? -1 : +val;
      }},
    });
    if (result === null || result === undefined) return;
    item.quantity = result;
    await setMerchantData(this.actor, data);
    this.render();
  }

  async _removeItem(itemId) {
    const data = getMerchantData(this.actor);
    data.items  = (data.items || []).filter(i => i.id !== itemId);
    await setMerchantData(this.actor, data);
    this.render();
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
    this.render();
  }

  _broadcastToAll() {
    emitToAll("openMerchant", { actorId: this.actor.id });
    ui.notifications.info("Merchant Sheet: Shop shown to all players.");
  }

  _closeForAll() {
    emitToAll("closeShop", { actorId: this.actor.id });
    this.close();
    ui.notifications.info("Merchant Sheet: Shop closed for all players.");
  }
}
