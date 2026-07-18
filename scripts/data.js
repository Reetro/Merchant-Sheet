// data.js — Data store and category helpers

import { MODULE_ID } from "./constants.js";

export function getMerchantData(actor) {
  return actor.getFlag(MODULE_ID, "inventory") || { items: [], name: actor.name, img: actor.img };
}

export async function setMerchantData(actor, data) {
  await actor.setFlag(MODULE_ID, "inventory", data);
}

export function getCategory(type) {
  const map = {
    weapon:     "Weapons",
    equipment:  "Armor & Equipment",
    consumable: "Consumables",
    tool:       "Tools",
    loot:       "Loot",
    spell:      "Spells",
    feat:       "Features",
  };
  return map[type] || "Miscellaneous";
}

export function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.category || getCategory(item.type);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  const sorted = {};
  for (const cat of Object.keys(groups).sort()) {
    sorted[cat] = groups[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}
