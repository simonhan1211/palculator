# Palbook — Palworld 1.0 Calculator

Recursive crafting breakdowns + breeding solver for Palworld 1.0. Next.js 16 (App
Router) · React 19 · Tailwind v4.

## Status

Schema, both solvers, live calculator UIs, and **real crafting data scraped
from paldb.cc** (items, recipes, gold costs, icons). Pal/breeding data is still
the placeholder mock set.

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
- Pal + breeding-combo ingestion from paldb.cc — pending

## Run

    npm install
    npm run dev                            # http://localhost:3000
    npm test                               # vitest — solver + dataset tests
    npm run typecheck                      # tsc --noEmit
    npm run package                        # build dist/Palbook.zip (shareable)
    node scripts/ingest-paldb.mjs          # dry run: fetch + report only
    node scripts/ingest-paldb.mjs --write  # write src/data + public/icons
    node scripts/ingest-paldb.mjs --roots Drone_Launcher,Assault_Rifle

Scraped pages are cached in `.cache/paldb/` so re-runs make no requests.
Adding a new weapon/root to `--roots` pulls in its whole ingredient tree.

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
