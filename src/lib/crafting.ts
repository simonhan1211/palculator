import type {
  CraftingRecipe,
  CraftingResult,
  CraftNode,
  Item,
  ShoppingListEntry,
} from "./types";
import { getItem, getRecipe } from "./data";

/**
 * STEP 3 — Recursive crafting solver.
 *
 * The expanded tree is built by depth-first recursion:
 *   - Base case: no recipe produces the item -> leaf CraftNode.
 *   - Otherwise a craft yields `outputQuantity` units, so the number of crafts
 *     is ceil(quantity / outputQuantity) and each child's required quantity is
 *     crafts * ingredient.quantity.
 * A single walk of the tree then accumulates the two flat lists: every
 * craftable node into `intermediates`, every leaf into `rawMaterials`, both
 * consolidated by item id so `ore` reached through Ingot -> Refined Ingot AND
 * through Nail collapses into one line.
 */

/**
 * Data source the solver reads from. Defaults to the app dataset; tests can
 * inject a custom source (e.g. to prove the cycle guard fires on bad data).
 */
export interface CraftingDataSource {
  getItem: (itemId: string) => Item | undefined;
  getRecipe: (itemId: string) => CraftingRecipe | undefined;
}

const appData: CraftingDataSource = { getItem, getRecipe };

export function solveCrafting(
  itemId: string,
  quantity: number,
  source: CraftingDataSource = appData,
): CraftingResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive number, got ${quantity}.`);
  }

  const tree = expand(itemId, quantity, source, new Set());

  const intermediates: ShoppingListEntry[] = [];
  const rawMaterials: ShoppingListEntry[] = [];
  collect(tree, source, intermediates, rawMaterials, true);

  return {
    targetItemId: itemId,
    targetQuantity: quantity,
    tree,
    intermediates: consolidate(intermediates),
    rawMaterials: consolidate(rawMaterials),
  };
}

/** Consolidate a list of entries by itemId, summing quantities. */
export function consolidate(
  entries: ShoppingListEntry[],
): ShoppingListEntry[] {
  const byId = new Map<string, ShoppingListEntry>();
  for (const entry of entries) {
    const existing = byId.get(entry.itemId);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      byId.set(entry.itemId, { ...entry });
    }
  }
  return [...byId.values()];
}

/** Expand a single item into its full CraftNode tree (helper for solveCrafting). */
export function buildCraftTree(itemId: string, quantity: number): CraftNode {
  return expand(itemId, quantity, appData, new Set());
}

function expand(
  itemId: string,
  quantity: number,
  source: CraftingDataSource,
  path: Set<string>,
): CraftNode {
  const item = source.getItem(itemId);
  if (!item) {
    throw new Error(`Unknown item id: "${itemId}".`);
  }

  const recipe = source.getRecipe(itemId);
  if (!recipe) {
    return {
      itemId,
      itemName: item.name,
      quantity,
      isBaseMaterial: true,
      children: [],
    };
  }

  if (path.has(itemId)) {
    throw new Error(
      `Cycle detected in recipe data at "${itemId}" (path: ${[...path].join(" -> ")}).`,
    );
  }
  path.add(itemId);

  const crafts = Math.ceil(quantity / recipe.outputQuantity);
  const children = recipe.ingredients.map((ingredient) =>
    expand(ingredient.itemId, crafts * ingredient.quantity, source, path),
  );

  path.delete(itemId);

  return {
    itemId,
    itemName: item.name,
    quantity,
    isBaseMaterial: false,
    children,
  };
}

function collect(
  node: CraftNode,
  source: CraftingDataSource,
  intermediates: ShoppingListEntry[],
  rawMaterials: ShoppingListEntry[],
  isRoot: boolean,
): void {
  const category = source.getItem(node.itemId)?.category ?? "misc";
  const entry: ShoppingListEntry = {
    itemId: node.itemId,
    itemName: node.itemName,
    quantity: node.quantity,
    category,
  };

  if (node.isBaseMaterial) {
    rawMaterials.push(entry);
  } else if (!isRoot) {
    // The requested target itself is neither a raw material nor something the
    // player needs to "also craft along the way", so it stays out of both lists.
    intermediates.push(entry);
  }

  for (const child of node.children) {
    collect(child, source, intermediates, rawMaterials, false);
  }
}
