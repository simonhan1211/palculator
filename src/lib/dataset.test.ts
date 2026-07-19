import { describe, expect, test } from "vitest";
import { craftableItems, getItem, getRecipe, isBaseMaterial } from "./data";
import { solveCrafting } from "./crafting";
import { dataset } from "./data";

/**
 * Integration tests over the real scraped dataset (src/data/*.json).
 * These assert structural invariants plus a few values verified by hand
 * against paldb.cc, so a bad ingestion run fails loudly.
 */
describe("scraped dataset", () => {
  test("comes from paldb.cc, not the mock", () => {
    expect(dataset.meta.source).toBe("paldb.cc");
  });

  test("every craftable item solves without throwing", () => {
    for (const item of craftableItems()) {
      const result = solveCrafting(item.id, 1);
      expect(result.rawMaterials.length).toBeGreaterThan(0);
      for (const raw of result.rawMaterials) {
        expect(isBaseMaterial(raw.itemId), `${raw.itemId} should be base`).toBe(
          true,
        );
      }
    }
  });

  test("drone launcher matches the paldb.cc production table", () => {
    const recipe = getRecipe("drone_launcher");
    expect(recipe?.workbench).toBe("Ancient Workbench");
    expect(recipe?.goldCost).toBe(3500000);
    expect(recipe?.ingredients).toEqual([
      { itemId: "paloxite_ingot", quantity: 70 },
      { itemId: "world_tree_holy_water", quantity: 40 },
      { itemId: "ai_core", quantity: 8 },
      { itemId: "ancient_civilization_core", quantity: 5 },
    ]);
  });

  test("drone launcher tree reproduces the site's second level", () => {
    // paldb.cc shows Paloxite Ingot x70 expanding to Soralite 70,
    // Paloxite 140, World Tree Holy Water 70.
    const result = solveCrafting("drone_launcher", 1);
    const ingotNode = result.tree.children.find(
      (c) => c.itemId === "paloxite_ingot",
    );
    expect(ingotNode?.quantity).toBe(70);
    expect(
      ingotNode?.children.map((c) => `${c.itemId}:${c.quantity}`),
    ).toEqual([
      "soralite:70",
      "paloxite:140",
      "world_tree_holy_water:70",
    ]);
  });

  test("every item has a local icon", () => {
    for (const item of dataset.items) {
      expect(item.iconUrl, `${item.id} icon`).toMatch(/^\/icons\//);
    }
  });

  test("rarity tiers exist as variant items with their own recipes", () => {
    // paldb.cc/en/Drone_Launcher shows five production cards, one per tier.
    // The legendary variant (internal code DroneLauncher_5, bg_rarity4).
    const legendary = getItem("drone_launcher_5");
    expect(legendary?.rarity).toBe(4);
    expect(legendary?.variantOf).toBe("drone_launcher");
    expect(legendary?.name).toBe("Drone Launcher (Legendary)");

    const recipe = getRecipe("drone_launcher_5");
    expect(recipe?.ingredients).toEqual([
      { itemId: "paloxite_ingot", quantity: 140 },
      { itemId: "world_tree_holy_water", quantity: 80 },
      { itemId: "ai_core", quantity: 16 },
      { itemId: "ancient_civilization_core", quantity: 10 },
      { itemId: "ancient_civilization_parts", quantity: 10 },
    ]);
  });

  test("every variant points at an existing common base item", () => {
    for (const item of dataset.items) {
      if (item.variantOf) {
        const base = getItem(item.variantOf);
        expect(base, `${item.id} -> ${item.variantOf}`).toBeDefined();
        expect(base?.rarity ?? 0).toBe(0);
        expect(item.rarity).toBeGreaterThan(0);
        expect(getRecipe(item.id), `${item.id} recipe`).toBeDefined();
      }
    }
  });

  test("known base materials are leaves", () => {
    for (const id of ["ore", "coal", "wood", "crude_oil", "soralite"]) {
      expect(getItem(id), id).toBeDefined();
      expect(isBaseMaterial(id), id).toBe(true);
    }
  });
});
