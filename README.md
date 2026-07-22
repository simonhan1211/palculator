# Palbook — Palworld 1.0 Calculator

Recursive crafting breakdowns + breeding solver for Palworld 1.0. Next.js 16 (App
Router) · React 19 · Tailwind v4.

## Status

Schema, both solvers, live calculator UIs, and **real crafting data scraped
from paldb.cc** — the full weapon and armor catalogues (747 items / 694 recipes
/ 114 base weapons + 106 base armor, all tiers and materials), gold costs, and
icons. Pal/breeding data is still the placeholder mock set.

- Project scaffold, dark "schematic" theme, navigation — done
- Data schemas (`src/lib/types.ts`) — done
- `solveCrafting()` recursive material logic (`src/lib/crafting.ts`) — done,
  tested on injected fixtures (`src/lib/crafting.test.ts`) + real-data
  integration tests (`src/lib/dataset.test.ts`)
- `resolveOffspring()` / `findParentCombos()` (`src/lib/breeding.ts`) — done,
  tested (`src/lib/breeding.test.ts`)
- Live crafting UI with icon production tree (paldb-style), raw-material
  shopping list, intermediates — done
- paldb.cc ingestion (`scripts/ingest-paldb.mjs`): recursive scrape from root
  items, validation, icon download — done
- Rarity tiers (Common → Legendary) scraped as variant items with their own
  recipes, selectable in the crafting UI — done
- Research reductions: per-category (Weapon / Armor / Pal Gear) technology
  levels (−5% / −15%) that cut a gear item's direct material cost, applied at
  the production step only (sub-recipes stay full price), persisted per player
  in localStorage — done
- Pal + breeding-combo ingestion from paldb.cc — pending

### Research reductions

Palworld's technology tree reduces "materials required for producing" a gear
class. Level 1 is −5%, level 2 adds another −10% (−15% total). In the crafting
UI, pick your level for Weapon / Armor / Pal Gear; the reduction applies only
when the target item is that category, floored per-craft, never below 1, and
never to the sub-materials it consumes (so you craft fewer AI Cores, but each
AI Core still costs full price). Weapon and Armor items classify cleanly from
paldb (both scraped and verified in the app); pal gear is detected via the Pal
Gear Workbench and glider tag — verify when you first scrape that category.

## Run

    npm install
    npm run dev                            # http://localhost:3000
    npm test                               # vitest — solver + dataset tests
    npm run typecheck                      # tsc --noEmit
    npm run package                        # build dist/Palbook.zip (shareable)
    node scripts/ingest-paldb.mjs                   # dry run: fetch + report
    node scripts/ingest-paldb.mjs --write           # write src/data + icons
    node scripts/ingest-paldb.mjs --roots Katana,Sword
    node scripts/ingest-paldb.mjs --category Weapon,Armor --write

Scraped pages are cached in `.cache/paldb/` so re-runs make no requests.
`--roots` pulls specific items (plus their whole ingredient trees);
`--category <types>` pulls every page the paldb index tags with those types
(comma-separated, e.g. `Weapon,Armor`) as roots. Each run rewrites the dataset
from its roots, so scrape all wanted classes together. The current dataset is
**Weapon + Armor** — 114 base weapons (including tools paldb tags as weapons:
axes, pickaxes, fishing rods, torch, detector) and 106 base armor pieces, plus
every tier variant and material they need. Add pal gear by including its type in
the list once its paldb tag is confirmed.

## Data model (the review target)

The crafting graph is a DAG of items. A recipe edge goes from `outputItemId`
(parent) to each `ingredients[].itemId` (child). A raw base material is any item
no recipe produces — that's the recursion's base case.

- Item — `id`, `name`, `category`, `isBaseMaterial`.
- CraftingRecipe — `outputItemId`, `outputQuantity` (yield per craft, so crafts
  needed = ceil(qty / outputQuantity)), `ingredients[]`, `workbench`.
- Pal — `id`, `paldeckNumber`, `elements[]`, `breedPower` (combi rank).
- BreedingCombo — order-independent parentA + parentB -> child; overrides the
  average-breed-power formula.

Solver output types (`CraftNode`, `ShoppingListEntry`, `CraftingResult`) are
already defined so the UI contract is fixed before implementation.

## Data provenance

Crafting items, recipes, gold costs, and icons are scraped from
[paldb.cc](https://paldb.cc) (`dataset.meta.source` = `paldb.cc`; the original
mock files are kept in `src/data/mock-backup/`). Icons are game assets served
by paldb's CDN and downloaded to `public/icons/` — fine for a personal
project, but review rights before publishing this anywhere.

Pal breed powers and unique combos (`src/data/pals.json`, `breeding.json`) are
still hand-written placeholders; scraping those from paldb.cc is the next
ingestion step, so treat breeding output as illustrative only.
