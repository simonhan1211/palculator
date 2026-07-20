import type {
  CraftingRecipe,
  CraftingResult,
  CraftNode,
  Item,
  ItemCategory,
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

/**
 * Palworld research reduces "materials required for producing" a whole gear
 * class by a percentage (as a fraction, e.g. 0.15 for -15%). Each category has
 * its own research track. The reduction applies only at the step that produces
 * a weapon/armor/pal-gear item — never to the sub-recipes of its ingredients
 * (a production good like AI Core is still crafted at full cost).
 */
export interface ResearchReductions {
  weapon?: number;
  armor?: number;
  pal_gear?: number;
}

/** The research reduction that applies when producing `category`, else 0. */
function reductionFor(
  category: ItemCategory,
  reductions: ResearchReductions,
): number {
  if (category === "weapon" || category === "armor" || category === "pal_gear") {
    return reductions[category] ?? 0;
  }
  return 0;
}

const appData: CraftingDataSource = { getItem, getRecipe };

export function solveCrafting(
  itemId: string,
  quantity: number,
  source: CraftingDataSource = appData,
  reductions: ResearchReductions = {},
): CraftingResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive number, got ${quantity}.`);
  }

  const tree = expand(itemId, quantity, source, new Set(), reductions);

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
  return expand(itemId, quantity, appData, new Set(), {});
}

function expand(
  itemId: string,
  quantity: number,
  source: CraftingDataSource,
  path: Set<string>,
  reductions: ResearchReductions,
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
  const reduction = reductionFor(item.category, reductions);
  const children = recipe.ingredients.map((ingredient) => {
    // Research reduces the per-craft ingredient cost (what the crafting menu
    // shows), floored, but never below 1 for a required ingredient.
    const perCraft =
      reduction > 0
        ? Math.max(1, Math.floor(ingredient.quantity * (1 - reduction)))
        : ingredient.quantity;
    return expand(ingredient.itemId, crafts * perCraft, source, path, reductions);
  });

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
