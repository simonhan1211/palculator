/**
 * Palworld 1.0 Calculator — Data Schemas
 * ---------------------------------------
 * These types define the contract that both the crafting recursion and the
 * breeding solver depend on. The ingestion script (scripts/ingest.mjs) must
 * emit JSON that conforms to these shapes.
 *
 * Design note: the crafting graph is modeled as a directed acyclic graph of
 * items. An edge from a recipe's `outputItemId` to each `ingredients[].itemId`
 * is a parent -> child dependency. A "raw base material" is simply a node with
 * no recipe producing it (a leaf). The recursion terminates on those leaves.
 */

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemCategory =
  | "raw" // gathered/mined leaf material (ore, wood, paldium, etc.)
  | "refined" // smelted/processed intermediate (ingot, refined ingot)
  | "component" // crafted sub-part (circuit board, nail, carbon fiber)
  | "weapon"
  | "armor"
  | "pal_gear" // gliders, harnesses, saddles, grappling gear
  | "ammo"
  | "structure"
  | "consumable"
  | "misc";

export interface Item {
  /** Stable slug used as the primary key everywhere, e.g. "paldium_fragment". */
  id: string;
  /** Display name, e.g. "Paldium Fragment". */
  name: string;
  category: ItemCategory;
  /**
   * True when the item is a terminal raw material with no crafting recipe.
   * This is a convenience annotation — the authoritative base-case check is
   * "does any recipe list this item as its output?" (see data.ts:isBaseMaterial).
   */
  isBaseMaterial: boolean;
  description?: string;
  /** The game's internal id (e.g. "WorldTreeIngot"), when known. */
  code?: string;
  iconUrl?: string;
  /** Rarity tier: 0 common, 1 uncommon, 2 rare, 3 epic, 4 legendary. */
  rarity?: number;
  /** For tier variants (uncommon+), the id of the common base item. */
  variantOf?: string;
  /** Max stack size, useful for later "how many stacks" math. */
  stackSize?: number;
  /** How a raw material is obtained: e.g. ["mining", "pal_drop:digtoise"]. */
  sources?: string[];
}

// ---------------------------------------------------------------------------
// Crafting recipes  (the parent/child dependency map)
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  /** The child material consumed. Must match an Item.id. */
  itemId: string;
  /** Quantity consumed to produce `outputQuantity` units of the parent. */
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  /** The item this recipe produces (the parent node). Must match an Item.id. */
  outputItemId: string;
  /** Units yielded per single craft. Usually 1; ammo/materials can be >1. */
  outputQuantity: number;
  /** Direct child dependencies — the top-level recipe as shown in-game. */
  ingredients: RecipeIngredient[];
  /** Crafting station required, e.g. "Primitive Workbench", "Weapon Workbench". */
  workbench?: string;
  /** Technology level/points needed to unlock, for gating in the UI later. */
  requiredTechLevel?: number;
  craftTimeSeconds?: number;
  /** Gold consumed per craft, for recipes that charge coins on top of items. */
  goldCost?: number;
  /**
   * When an item has more than one valid recipe, mark the canonical one.
   * The solver defaults to the preferred recipe (or the first found).
   */
  preferred?: boolean;
}

// ---------------------------------------------------------------------------
// Recursive crafting output  (produced by the Step 3 solver)
// ---------------------------------------------------------------------------

/** One node in the fully-expanded crafting tree. */
export interface CraftNode {
  itemId: string;
  itemName: string;
  /** Total quantity of this item needed at this position in the tree. */
  quantity: number;
  isBaseMaterial: boolean;
  /** Expanded children — empty for raw base materials. */
  children: CraftNode[];
}

/** One line of the consolidated raw-material "shopping list". */
export interface ShoppingListEntry {
  itemId: string;
  itemName: string;
  quantity: number;
  category: ItemCategory;
}

export interface CraftingResult {
  /** The requested item + quantity, echoed back. */
  targetItemId: string;
  targetQuantity: number;
  /** Full expanded dependency tree (for the "tree" visualization). */
  tree: CraftNode;
  /** Flattened intermediate craftables (ingots, components) with totals. */
  intermediates: ShoppingListEntry[];
  /** The consolidated raw base materials — the headline output. */
  rawMaterials: ShoppingListEntry[];
}

// ---------------------------------------------------------------------------
// Pals & breeding
// ---------------------------------------------------------------------------

export type PalElement =
  | "neutral"
  | "fire"
  | "water"
  | "grass"
  | "electric"
  | "ice"
  | "ground"
  | "dark"
  | "dragon";

export interface Pal {
  /** Stable slug, e.g. "lamball". */
  id: string;
  /** Paldeck number, e.g. 1 for Lamball. */
  paldeckNumber: number;
  name: string;
  elements: PalElement[];
  /**
   * The "combi rank" / breeding power. Palworld resolves an ordinary pairing to
   * the Pal whose power is nearest to floor((powerA + powerB) / 2). Unique
   * combos in `BreedingCombo[]` override this formula.
   */
  breedPower: number;
  rarity?: number;
  iconUrl?: string;
}

/**
 * A special-cased breeding combination that overrides the average-power rule.
 * Breeding is commutative, so (A,B) and (B,A) are the same combo.
 */
export interface BreedingCombo {
  parentAId: string;
  parentBId: string;
  childId: string;
}

/** Result of resolving two parents to an offspring. */
export interface BreedingResult {
  parentAId: string;
  parentBId: string;
  childId: string;
  /** Whether this came from the unique-combo table or the power formula. */
  source: "unique" | "formula";
}

// ---------------------------------------------------------------------------
// The full dataset the app loads at build/runtime.
// ---------------------------------------------------------------------------

export interface PalworldDataset {
  items: Item[];
  recipes: CraftingRecipe[];
  pals: Pal[];
  breedingCombos: BreedingCombo[];
  /** Provenance so the UI can show whether data is real or mocked. */
  meta: {
    source: "mock" | "paldex" | string;
    gameVersion: string;
    generatedAt: string;
  };
}
