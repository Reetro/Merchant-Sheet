# Merchant Sheet

A Foundry VTT module for D&D 5e that provides a custom merchant shop interface. The GM builds a shop by dragging items from compendiums, sets prices and quantities, and can show the shop to all connected players. Players can browse items and optionally purchase them directly with gold deducted automatically.

---

## Requirements

- Foundry VTT v13 or v14
- D&D 5e system v3.0 or later
- socketlib module (required for broadcasting between clients)

---

## Installation

**Manifest URL:**
```
https://raw.githubusercontent.com/Reetro/Merchant-Sheet/main/module.json
```

---

## How to Use

### Creating a Merchant

**From the Actors directory:**
Click the **+** button in the Actors sidebar and select **Merchant Sheet** from the actor type list.

**From the Markdown Importer:**
Import a markdown file with a `## Shop` section using the Markdown Importer module. See the Markdown Importer README for the shop syntax.

### Building a Shop

Open a merchant actor. Drag items from any compendium or the Items sidebar into the shop body. Each item appears in the list with its compendium price pre-filled. The GM can then:

- **Edit price** — click the tag icon on any item row
- **Edit quantity** — click the hashtag icon to set stock (leave blank for unlimited)
- **Refresh icon** — click the sync icon to re-fetch the item icon from the compendium
- **Remove item** — click the X icon
- **Rename shop** — double-click the shop name in the header
- **Change portrait** — click the merchant portrait image

### Showing the Shop to Players

Use the three buttons in the shop footer (GM only):

- **Show to All** — opens the merchant shop on all connected player screens
- **Close Shop** — closes the shop on all player screens
- **Clear Shop** — removes all items from the shop (asks for confirmation)

### Player Experience

When the shop is open players can browse items and double-click any item to view its full compendium entry. If Allow Player Purchases is enabled a **Buy** button appears on each item row. Clicking it deducts the item's cost in gold from the player's assigned character and adds the item to their inventory. Items the player cannot afford are greyed out. Out of stock items are greyed out and cannot be purchased.

All stock changes are synced to all connected clients in real time.

---

## Settings

Open via **Settings > Module Settings > Merchant Sheet**.

| Setting | Default | Description |
|---|---|---|
| **Enable Quantity** | On | When on items display stock quantities, can run out of stock, and the GM has an edit quantity button per item. When off all items have unlimited stock, quantities are hidden from players, and the edit quantity button is hidden. |
| **Sync Item View** | Off | When on double-clicking an item on the GM screen opens that item on all connected player screens simultaneously. When off item viewing is local only. |
| **Allow Player Purchases** | On | When on players see a Buy button on each item. Gold is deducted automatically from their assigned character. Stock reduces by 1 per purchase. When off the shop is browse-only. |
| **Player Fullscreen** | Off | When on the merchant shop fills the entire screen for players when opened via Show to All. Also enables the split-screen item view where the shop shrinks to the top half and the item sheet fills the bottom. When off players get a normal draggable resizable window. |
| **Sync Scrolling** | Off | When on the GM's scroll position in the merchant body is broadcast to all connected players in real time. When off each player scrolls independently. |

---

## GM Controls Reference

| Control | How to Access | What it Does |
|---|---|---|
| Rename shop | Double-click the shop name | Opens a dialog to rename the shop |
| Change portrait | Click the merchant portrait | Opens the file picker to change the merchant image |
| Edit price | Tag icon on item row | Set price and currency for an item |
| Edit quantity | Hashtag icon on item row | Set stock quantity (blank = unlimited) |
| Refresh icon | Sync icon on item row | Re-fetches the item icon from the compendium |
| Remove item | X icon on item row | Removes the item from the shop |
| Show to All | Footer button | Opens the shop on all player screens |
| Close Shop | Footer button | Closes the shop on all player screens |
| Close Item | Footer button (Player Fullscreen only) | Closes the item panel and restores the shop to full size |
| Clear Shop | Footer button | Removes all items from the shop |

---

## Player Purchase Requirements

For the Buy button to be active a player must:

1. Have a character assigned — right-click their name in the bottom-left player list, click **User Configuration**, and assign a character
2. Have enough gold in that character's currency to cover the item price
3. Allow Player Purchases must be enabled in module settings

Currency is spent from the smallest denomination first and change is made automatically.

---

## Compatibility

- Foundry VTT v13 to v14
- D&D 5e system v3.0+
- Requires: socketlib

---

## License

MIT License
