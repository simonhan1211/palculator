import { describe, expect, test } from "vitest";
import { solveCrafting, consolidate } from "./crafting";
import type { CraftingDataSource } from "./crafting";
import type {
  CraftingRecipe,
  Item,
  ItemCategory,
  ShoppingListEntry,
} from "./types";

/**
 * Fixture dataset with known hand-computed totals, injected through the
 * solver's data-source parameter so these tests stay valid no matter what the
 * real scraped dataset contains.
 */
const fixtureItems: Item[] = [
  ["ore", "Ore", "raw", true],
  ["wood", "Wood", "raw", true],
  ["coal", "Coal", "raw", true],
  ["wool", "Wool", "raw", true],
  ["sulfur", "Sulfur", "raw", true],
  ["ingot", "Ingot", "refined", false],
  ["charcoal", "Charcoal", "refined", false],
  ["refined_ingot", "Refined Ingot", "refined", false],
  ["cloth", "Cloth", "component", false],
  ["carbon_fiber", "Carbon Fiber", "component", false],
  ["circuit_board", "Circuit Board", "component", false],
  ["nail", "Nail", "component", false],
  ["gunpowder", "Gunpowder", "component", false],
  ["assault_rifle", "Assault Rifle", "weapon", false],
  ["handgun", "Handgun", "weapon", false],
  ["musket", "Musket", "weapon", false],
].map(([id, name, category, isBaseMaterial]) => ({
  id: id as string,
  name: name as string,
  category: category as ItemCategory,
  isBaseMaterial: isBaseMaterial as boolean,
}));

const fixtureRecipes: CraftingRecipe[] = [
  { out: "ingot", yield: 1, ingredients: { ore: 2 } },
  { out: "charcoal", yield: 1, ingredients: { wood: 2 } },
  { out: "refined_ingot", yield: 1, ingredients: { ingot: 2, coal: 1 } },
  { out: "cloth", yield: 1, ingredients: { wool: 2 } },
  { out: "carbon_fiber", yield: 1, ingredients: { charcoal: 3 } },
  { out: "circuit_board", yield: 1, ingredients: { ingot: 1, cloth: 2 } },
  { out: "nail", yield: 4, ingredients: { ingot: 1 } },
  { out: "gunpowder", yield: 2, ingredients: { sulfur: 2, charcoal: 1 } },
  {
    out: "assault_rifle",
    yield: 1,
    ingredients: { refined_ingot: 20, carbon_fiber: 8, circuit_board: 5, nail: 10 },
  },
  { out: "handgun", yield: 1, ingredients: { ingot: 10, nail: 6 } },
  { out: "musket", yield: 1, ingredients: { ingot: 8, wood: 10, gunpowder: 4 } },
].map(({ out, yield: outputQuantity, ingredients }) => ({
  id: `r_${out}`,
  outputItemId: out,
  outputQuantity,
  ingredients: Object.entries(ingredients).map(([itemId, quantity]) => ({
    itemId,
    quantity,
  })),
}));

const fixture: CraftingDataSource = {
  getItem: (id) => fixtureItems.find((i) => i.id === id),
  getRecipe: (id) => fixtureRecipes.find((r) => r.outputItemId === id),
};

/** Find one entry in a shopping list by item id, failing loudly if absent. */
function entry(list: ShoppingListEntry[], itemId: string): ShoppingListEntry {
  const found = list.find((e) => e.itemId === itemId);
  expect(found, `expected ${itemId} in list`).toBeDefined();
  return found!;
}

describe("solveCrafting", () => {
  test("expands assault rifle x1 into consolidated raw materials", () => {
    // Hand-computed from the fixture:
    //   refined_ingot 20 -> ingot 40 (-> ore 80) + coal 20
    //   carbon_fiber 8   -> charcoal 24 (-> wood 48)
    //   circuit_board 5  -> ingot 5 (-> ore 10) + cloth 10 (-> wool 20)
    //   nail 10          -> ceil(10/4)=3 crafts -> ingot 3 (-> ore 6)
    const result = solveCrafting("assault_rifle", 1, fixture);

    expect(entry(result.rawMaterials, "ore").quantity).toBe(96);
    expect(entry(result.rawMaterials, "coal").quantity).toBe(20);
    expect(entry(result.rawMaterials, "wood").quantity).toBe(48);
    expect(entry(result.rawMaterials, "wool").quantity).toBe(20);
    expect(result.rawMaterials).toHaveLength(4);
  });

  test("consolidates intermediates reached through multiple paths", () => {
    // ingot appears under refined_ingot (40), circuit_board (5), nail (3).
    const result = solveCrafting("assault_rifle", 1, fixture);
    expect(entry(result.intermediates, "ingot").quantity).toBe(48);
    expect(entry(result.intermediates, "nail").quantity).toBe(10);
  });

  test("rounds up crafts when a recipe yields more than one unit", () => {
    // nail yields 4 per craft: 1 nail still costs a full craft = 1 ingot = 2 ore.
    const result = solveCrafting("nail", 1, fixture);
    expect(entry(result.rawMaterials, "ore").quantity).toBe(2);
  });

  test("applies yield rounding at every level (musket's gunpowder)", () => {
    // musket x1: gunpowder 4, yield 2 -> 2 crafts -> sulfur 4, charcoal 2 -> wood 4.
    // Plus direct wood 10 and ingot 8 -> ore 16.
    const result = solveCrafting("musket", 1, fixture);
    expect(entry(result.rawMaterials, "sulfur").quantity).toBe(4);
    expect(entry(result.rawMaterials, "wood").quantity).toBe(14);
    expect(entry(result.rawMaterials, "ore").quantity).toBe(16);
  });

  test("scales linearly with requested quantity", () => {
    const result = solveCrafting("musket", 2, fixture);
    expect(entry(result.rawMaterials, "sulfur").quantity).toBe(8);
    expect(entry(result.rawMaterials, "wood").quantity).toBe(28);
    expect(entry(result.rawMaterials, "ore").quantity).toBe(32);
  });

  test("returns a raw material as a single-leaf result", () => {
    const result = solveCrafting("ore", 5, fixture);
    expect(result.tree.children).toHaveLength(0);
    expect(result.tree.isBaseMaterial).toBe(true);
    expect(result.rawMaterials).toEqual([
      expect.objectContaining({ itemId: "ore", quantity: 5 }),
    ]);
    expect(result.intermediates).toHaveLength(0);
  });

  test("builds a tree whose root echoes the request", () => {
    const result = solveCrafting("handgun", 3, fixture);
    expect(result.targetItemId).toBe("handgun");
    expect(result.targetQuantity).toBe(3);
    expect(result.tree.itemId).toBe("handgun");
    expect(result.tree.quantity).toBe(3);
    const childIds = result.tree.children.map((c) => c.itemId);
    expect(childIds).toEqual(["ingot", "nail"]);
  });

  test("throws on an unknown item id", () => {
    expect(() => solveCrafting("not_a_real_item", 1, fixture)).toThrow(
      /unknown item/i,
    );
  });

  test("throws on a non-positive quantity", () => {
    expect(() => solveCrafting("ingot", 0, fixture)).toThrow(/quantity/i);
  });

  test("detects a cycle in bad recipe data instead of hanging", () => {
    // Injected dataset where a -> b -> a. Must throw, not stack-overflow.
    expect(() =>
      solveCrafting("a", 1, {
        getItem: (id) => ({
          id,
          name: id,
          category: "misc",
          isBaseMaterial: false,
        }),
        getRecipe: (id) => ({
          id: `r_${id}`,
          outputItemId: id,
          outputQuantity: 1,
          ingredients: [{ itemId: id === "a" ? "b" : "a", quantity: 1 }],
        }),
      }),
    ).toThrow(/cycle/i);
  });
});

describe("research reductions", () => {
  // assault_rifle (a weapon) direct recipe:
  //   refined_ingot 20, carbon_fiber 8, circuit_board 5, nail 10
  test("reduces a weapon's direct ingredients by the weapon research %", () => {
    const result = solveCrafting("assault_rifle", 1, fixture, { weapon: 0.15 });
    // floor(20*.85)=17, floor(8*.85)=6, floor(5*.85)=4, floor(10*.85)=8
    expect(result.tree.children.map((c) => c.quantity)).toEqual([17, 6, 4, 8]);
  });

  test("floors per-craft, then scales by quantity", () => {
    const result = solveCrafting("assault_rifle", 2, fixture, { weapon: 0.15 });
    // per-craft floor(20*.85)=17, x2 crafts = 34 (NOT floor(40*.85)=34 here,
    // but carbon_fiber: floor(8*.85)=6 x2=12, not floor(16*.85)=13)
    expect(result.tree.children[0].quantity).toBe(34);
    expect(result.tree.children[1].quantity).toBe(12);
  });

  test("cascades reduced amounts downstream at full (un-reduced) cost", () => {
    // With -15%, nail drops 10->8 (2 crafts not 3), so ore falls 96 -> 80.
    const result = solveCrafting("assault_rifle", 1, fixture, { weapon: 0.15 });
    expect(entry(result.rawMaterials, "ore").quantity).toBe(80);
  });

  test("does not reduce a component's own recipe (AI-core rule)", () => {
    // refined_ingot is category 'refined', not a weapon — weapon research
    // must leave its ingredients (ingot 2, coal 1 per craft) untouched.
    const result = solveCrafting("refined_ingot", 10, fixture, { weapon: 0.15 });
    expect(result.tree.children.map((c) => c.quantity)).toEqual([20, 10]);
  });

  test("only the matching category's research applies", () => {
    // Armor research must not touch a weapon.
    const result = solveCrafting("assault_rifle", 1, fixture, { armor: 0.15 });
    expect(result.tree.children.map((c) => c.quantity)).toEqual([20, 8, 5, 10]);
  });

  test("no reductions object leaves quantities at full", () => {
    const result = solveCrafting("assault_rifle", 1, fixture);
    expect(result.tree.children.map((c) => c.quantity)).toEqual([20, 8, 5, 10]);
  });

  test("never reduces a required ingredient below 1", () => {
    const source: CraftingDataSource = {
      getItem: (id) => ({
        id,
        name: id,
        category: id === "gun" ? "weapon" : "raw",
        isBaseMaterial: id !== "gun",
      }),
      getRecipe: (id) =>
        id === "gun"
          ? {
              id: "r_gun",
              outputItemId: "gun",
              outputQuantity: 1,
              ingredients: [{ itemId: "screw", quantity: 1 }],
            }
          : undefined,
    };
    // floor(1 * 0.85) = 0, but a required ingredient must stay >= 1.
    const result = solveCrafting("gun", 1, source, { weapon: 0.15 });
    expect(result.tree.children[0].quantity).toBe(1);
  });
});

describe("consolidate", () => {
  test("merges duplicate item ids by summing quantities", () => {
    const merged = consolidate([
      { itemId: "ore", itemName: "Ore", quantity: 2, category: "raw" },
      { itemId: "wood", itemName: "Wood", quantity: 1, category: "raw" },
      { itemId: "ore", itemName: "Ore", quantity: 3, category: "raw" },
    ]);
    expect(merged).toHaveLength(2);
    expect(entry(merged, "ore").quantity).toBe(5);
    expect(entry(merged, "wood").quantity).toBe(1);
  });
});
