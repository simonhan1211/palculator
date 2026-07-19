import type {
  Item,
  CraftingRecipe,
  Pal,
  BreedingCombo,
  PalworldDataset,
} from "./types";

import itemsRaw from "@/data/items.json";
import recipesRaw from "@/data/recipes.json";
import palsRaw from "@/data/pals.json";
import breedingRaw from "@/data/breeding.json";
import metaRaw from "@/data/meta.json";

// JSON is validated structurally by these casts; the ingestion script is
// responsible for emitting conformant data. Keep the casts narrow.
export const items = itemsRaw as Item[];
export const recipes = recipesRaw as CraftingRecipe[];
export const pals = palsRaw as Pal[];
export const breedingCombos = breedingRaw as BreedingCombo[];

export const dataset: PalworldDataset = {
  items,
  recipes,
  pals,
  breedingCombos,
  meta: metaRaw as PalworldDataset["meta"],
};

// ---------------------------------------------------------------------------
// Lookup maps — built once at module load.
// ---------------------------------------------------------------------------

/** itemId -> Item */
export const itemById = new Map<string, Item>(items.map((i) => [i.id, i]));

/** palId -> Pal */
export const palById = new Map<string, Pal>(pals.map((p) => [p.id, p]));

/**
 * outputItemId -> CraftingRecipe. If multiple recipes exist for one item, the
 * one flagged `preferred` wins; otherwise the first encountered is kept.
 */
export const recipeByOutput = new Map<string, CraftingRecipe>();
for (const r of recipes) {
  const existing = recipeByOutput.get(r.outputItemId);
  if (!existing || r.preferred) recipeByOutput.set(r.outputItemId, r);
}

// ---------------------------------------------------------------------------
// Helpers the crafting solver (Step 3) builds on.
// ---------------------------------------------------------------------------

/**
 * Authoritative base-case check for the recursion: an item is a raw base
 * material when no recipe produces it. Falls back to the Item.isBaseMaterial
 * annotation for items that may be missing from the item table.
 */
export function isBaseMaterial(itemId: string): boolean {
  if (recipeByOutput.has(itemId)) return false;
  return itemById.get(itemId)?.isBaseMaterial ?? true;
}

export function getItem(itemId: string): Item | undefined {
  return itemById.get(itemId);
}

export function getRecipe(itemId: string): CraftingRecipe | undefined {
  return recipeByOutput.get(itemId);
}

/** All items that can be crafted (have a recipe) — for the crafting search. */
export function craftableItems(): Item[] {
  return items.filter((i) => recipeByOutput.has(i.id));
}
