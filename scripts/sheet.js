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
    this._splitMode = false; // true when item panel is open
  }

  get title() { return `Shop — ${this.actor.name}`; }

  _canRender(options) { return; }

  async _insertElement(element, options) {
    document.body.appendChild(element);

    // Only players get fullscreen — GM keeps normal windowed view
    if (!this._isGM) {
      element.style.setProperty("position",      "fixed",    "important");
      element.style.setProperty("top",           "0",        "important");
      element.style.setProperty("left",          "0",        "important");
      element.style.setProperty("width",         "100vw",    "important");
      element.style.setProperty("height",        "100vh",    "important");
      element.style.setProperty("transform",     "none",     "important");
      element.style.setProperty("border-radius", "0",        "important");
      element.style.setProperty("transition",    "height 0.4s cubic-bezier(0.4,0,0.2,1)", "important");
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
          z-index: 999998 !important;
          pointer-events: all !important;
        }
        #${element.id} * { visibility: visible !important; }
      `;
      document.head.appendChild(style);
    }
  }

  // Shrink shop to top half and show item in bottom half
  showItemSplitScreen(itemElement) {
    const shopEl = this.element;
    if (!shopEl) return;

    this._splitMode = true;
    // Only resize for players — GM keeps windowed view
    if (!this._isGM) {
      shopEl.style.setProperty("height", "50vh", "important");
    }

    // Remove any existing item panel cleanly (no animation delay for switching)
    const existingPanel = document.getElementById("ms-item-panel");
    if (existingPanel) existingPanel.remove();

    // Create item panel — fullscreen split for players, floating popup for GM
    const panel = document.createElement("div");
    panel.id = "ms-item-panel";
    if (this._isGM) {
      const shopEl = this.element;
      const rect   = shopEl?.getBoundingClientRect() ?? { left: 0, bottom: 400, width: 560 };
      panel.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.bottom + 8}px;
        width: ${rect.width}px;
        height: 400px;
        z-index: 999999;
        background: var(--color-bg-primary, #1a1a1a);
        border: 1px solid var(--color-border-dark, #444);
        border-radius: 6px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        overflow: auto;
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        display: flex;
        flex-direction: column;
      `;
    } else {
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
    }

    // Item content
    const content = document.createElement("div");
    content.style.cssText = "flex:1; overflow:auto; padding: 8px;";
    content.appendChild(itemElement);
    panel.appendChild(content);

    document.body.appendChild(panel);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this._isGM) {
          panel.style.opacity   = "1";
          panel.style.transform = "translateY(0)";
        } else {
          panel.style.bottom = "0";
        }
      });
    });

    // Re-render shop footer to show close item button
    this.render();
  }

  closeItemPanel() {
    const panel = document.getElementById("ms-item-panel");
    if (panel) {
      if (this._isGM) {
        panel.style.opacity   = "0";
        panel.style.transform = "translateY(-8px)";
        setTimeout(() => panel.remove(), 300);
      } else {
        panel.style.bottom = "-50vh";
        setTimeout(() => panel.remove(), 400);
      }
    }
    this._splitMode = false;
    const shopEl = this.element;
    if (shopEl && !this._isGM) shopEl.style.setProperty("height", "100vh", "important");
    this.render();
    // Broadcast to players if GM is closing
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
      html += `<div class="gm-controls">`;
      if (this._itemPanelOpen) {
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

    // Reapply split mode height after every render — players only
    if (!this._isGM) {
      if (this._splitMode) {
        el.style.setProperty("height", "50vh", "important");
      } else {
        el.style.setProperty("height", "100vh", "important");
      }
    }

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
      // Scroll sync — GM scrolling broadcasts to all players
      if (this._isGM) {
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
        // Broadcast to all other clients to open the same item
        emitToAll("showItem", { actorId: this.actor.id, itemId: item.id });
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
    this.render();
    ui.notifications.info(`Merchant Sheet: Added ${item.name} to shop.`);
  }

  // ─── Item card ────────────────────────────────────────────────────────────────

  async _showItemCard(item) {
    let doc = null;

    if (item.uuid) {
      doc = await fromUuid(item.uuid).catch(() => null);
    }
    if (!doc) {
      for (const pack of game.packs.filter(p => p.metadata.type === "Item")) {
        try {
          const index = await pack.getIndex({ fields: ["name"] });
          const entry = index.find(e => e.name.toLowerCase() === item.name.toLowerCase());
          if (entry) { doc = await pack.getDocument(entry._id); break; }
        } catch { continue; }
      }
    }

    if (!doc) {
      ui.notifications.warn(`Merchant Sheet: Could not find "${item.name}" in any compendium.`);
      return;
    }

    // Render the item sheet into a detached element then show in split panel
    const sheet = doc.sheet;
    await sheet.render(true);

    // Give the sheet a moment to render then grab its element
    setTimeout(() => {
      const sheetEl = sheet.element;
      if (!sheetEl) return;

      // Clone the rendered content for our panel
      const clone = sheetEl.cloneNode(true);
      clone.style.cssText = "position:relative; width:100%; height:100%; box-shadow:none; border:none;";

      // Close the floating sheet window
      sheet.close({ force: true });

      this.showItemSplitScreen(clone);
    }, 100);
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
