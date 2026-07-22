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

  test("every variant points at a root base it out-ranks", () => {
    // A variant's base is the weapon's lowest tier — which is not always Common
    // (Lily's Spear starts at Rare), so we only require the variant to out-rank
    // its base and the base to be a root with its own recipe.
    for (const item of dataset.items) {
      if (item.variantOf) {
        const base = getItem(item.variantOf);
        expect(base, `${item.id} -> ${item.variantOf}`).toBeDefined();
        expect(
          base?.variantOf,
          `${item.variantOf} should be a root, not itself a variant`,
        ).toBeUndefined();
        expect(getRecipe(item.id), `${item.id} recipe`).toBeDefined();
        expect(
          (item.rarity ?? 0) > (base?.rarity ?? 0),
          `${item.id} (r${item.rarity}) should out-rank base ${base?.id} (r${base?.rarity})`,
        ).toBe(true);
      }
    }
  });

  test("the weapon catalogue was expanded to the full paldb list", () => {
    const baseWeapons = dataset.items.filter(
      (i) => i.category === "weapon" && !i.variantOf,
    );
    // paldb tags 114 pages as Weapon; allow drift but guard against regression
    // back to the original handful.
    expect(baseWeapons.length).toBeGreaterThan(100);

    // A spread of weapons across the tech tree should now be craftable.
    for (const id of ["katana", "sword", "rocket_launcher", "flamethrower"]) {
      expect(getRecipe(id), id).toBeDefined();
    }
  });

  test("the armor catalogue was scraped alongside weapons", () => {
    const baseArmor = dataset.items.filter(
      (i) => i.category === "armor" && !i.variantOf,
    );
    expect(baseArmor.length).toBeGreaterThan(100);
    // weapons must still be present in the same dataset
    expect(
      dataset.items.some((i) => i.category === "weapon" && !i.variantOf),
    ).toBe(true);
  });

  test("Armor research reduces armor material cost, but weapon research doesn't", () => {
    // Metal Armor: ingot 30, leather 10, cloth 5.
    const recipe = getRecipe("metal_armor");
    expect(recipe?.ingredients).toEqual([
      { itemId: "ingot", quantity: 30 },
      { itemId: "leather", quantity: 10 },
      { itemId: "cloth", quantity: 5 },
    ]);

    const withArmor = solveCrafting("metal_armor", 1, undefined, {
      armor: 0.15,
    });
    // floor(30*.85)=25, floor(10*.85)=8, floor(5*.85)=4
    expect(withArmor.tree.children.map((c) => c.quantity)).toEqual([25, 8, 4]);

    // Weapon research must not touch armor.
    const withWeapon = solveCrafting("metal_armor", 1, undefined, {
      weapon: 0.15,
    });
    expect(withWeapon.tree.children.map((c) => c.quantity)).toEqual([30, 10, 5]);
  });

  test("known base materials are leaves", () => {
    for (const id of ["ore", "coal", "wood", "crude_oil", "soralite"]) {
      expect(getItem(id), id).toBeDefined();
      expect(isBaseMaterial(id), id).toBe(true);
    }
  });

  test("-15% weapon research matches the in-game reduced Legendary recipe", () => {
    // User's own numbers with both weapon research levels (5% + 10% = 15%):
    //   Paloxite Ingot 140->119, World Tree Holy Water 80->68, AI Core 16->13,
    //   Ancient Civ Core 10->8, Ancient Civ Parts 10->8.
    const result = solveCrafting("drone_launcher_5", 1, undefined, {
      weapon: 0.15,
    });
    const reduced = Object.fromEntries(
      result.tree.children.map((c) => [c.itemId, c.quantity]),
    );
    expect(reduced).toEqual({
      paloxite_ingot: 119,
      world_tree_holy_water: 68,
      ai_core: 13,
      ancient_civilization_core: 8,
      ancient_civilization_parts: 8,
    });
  });

  test("AI cores needed are reduced, but each is still crafted at full cost", () => {
    // We only need 13 AI cores (not 16), and each AI core's own recipe is
    // untouched by weapon research.
    const withResearch = solveCrafting("drone_launcher_5", 1, undefined, {
      weapon: 0.15,
    });
    const aiCoreNode = withResearch.tree.children.find(
      (c) => c.itemId === "ai_core",
    )!;
    expect(aiCoreNode.quantity).toBe(13);

    // One AI core's raw cost, un-reduced, times 13 should equal the AI-core
    // contribution — i.e. the sub-recipe saw no discount.
    const oneAiCore = solveCrafting("ai_core", 13);
    for (const raw of oneAiCore.rawMaterials) {
      // every AI-core raw should appear in the drone total at >= this amount
      const inTotal = withResearch.rawMaterials.find(
        (r) => r.itemId === raw.itemId,
      );
      expect(inTotal, raw.itemId).toBeDefined();
      expect(inTotal!.quantity).toBeGreaterThanOrEqual(raw.quantity);
    }
  });
});
