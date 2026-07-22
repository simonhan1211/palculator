/**
 * paldb.cc ingestion — real Palworld item + recipe data.
 * -------------------------------------------------------
 * Recursively scrapes item pages starting from ROOT_SLUGS, following every
 * ingredient link until it reaches leaf materials, then emits items.json +
 * recipes.json in the src/lib/types.ts schema and downloads icons.
 *
 *   node scripts/ingest-paldb.mjs             # dry run: fetch + report only
 *   node scripts/ingest-paldb.mjs --write     # also write src/data + icons
 *   node scripts/ingest-paldb.mjs --roots Drone_Launcher,Assault_Rifle
 *
 * Pages are cached under .cache/paldb/ so re-runs cost zero requests.
 * robots.txt allows crawling; we still keep a polite delay between fetches.
 */

import { load } from "cheerio";
import { mkdir, readFile, writeFile, cp, access } from "node:fs/promises";
import path from "node:path";

const BASE = "https://paldb.cc/en/";
const CACHE_DIR = ".cache/paldb";
const ICON_DIR = "public/icons";
const DATA_DIR = "src/data";
const FETCH_DELAY_MS = 400;
const USER_AGENT =
  "PalculatorIngest/1.0 (personal project; single polite crawl)";

const DEFAULT_ROOTS = [
  "Drone_Launcher",
  "Assault_Rifle",
  "Handgun",
  "Musket",
];

const args = process.argv.slice(2);
const WRITE = args.includes("--write");

/** Read a `--flag value` or `--flag=value` argument. */
function argValue(name) {
  const found = args.find((a) => a === name || a.startsWith(`${name}=`));
  if (!found) return null;
  return found.includes("=")
    ? found.slice(found.indexOf("=") + 1)
    : (args[args.indexOf(found) + 1] ?? null);
}

const rootsArg = argValue("--roots");
const ROOT_SLUGS = rootsArg ? rootsArg.split(",") : DEFAULT_ROOTS;
// --category <desc> pulls every page the site's index tags with that type
// (e.g. "Weapon", "Armor") as a root, so the whole class is scraped at once.
const CATEGORY = argValue("--category");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugToId = (slug) => slug.toLowerCase();

/**
 * Encode a decoded slug for a paldb URL. encodeURIComponent leaves parentheses
 * and a few other marks literal, but paldb's routes require them percent-encoded
 * (e.g. Fishing_Rod_(Chillet) -> Fishing_Rod_%28Chillet%29).
 */
function encodeSlug(slug) {
  return encodeURIComponent(slug).replace(
    /[()!'*~]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

let lastFetch = 0;
async function politeFetch(url) {
  const wait = lastFetch + FETCH_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function fetchPage(slug) {
  const cachePath = path.join(CACHE_DIR, `${slug}.html`);
  if (await fileExists(cachePath)) {
    return readFile(cachePath, "utf8");
  }
  const res = await politeFetch(BASE + encodeSlug(slug));
  const html = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, html, "utf8");
  return html;
}

/** Load the site's autocomplete index: slug -> { label, desc }. */
async function fetchIndex() {
  const cachePath = path.join(CACHE_DIR, "autocomplete_en.json");
  let raw;
  if (await fileExists(cachePath)) {
    raw = await readFile(cachePath, "utf8");
  } else {
    const res = await politeFetch("https://paldb.cc/json/autocomplete_en.json");
    raw = await res.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, raw, "utf8");
  }
  const map = new Map();
  for (const entry of JSON.parse(raw)) {
    // Index values are percent-encoded (e.g. Fishing_Rod_%28Chillet%29). Store
    // the decoded slug so it matches ingredient hrefs (also decoded) and gets
    // re-encoded exactly once when fetched.
    map.set(decodeURIComponent(entry.value), {
      label: entry.label,
      desc: entry.desc,
    });
  }
  return map;
}

/** Map a paldb type label onto our ItemCategory. */
function categoryFor(desc, isLeaf) {
  const d = (desc ?? "").toLowerCase();
  if (d.includes("weapon")) return "weapon";
  // paldb tags helmets/body armor as "Armor"; gliders as "Glider" (a pal gear).
  if (d.includes("armor") || d.includes("shield")) return "armor";
  if (d.includes("glider")) return "pal_gear";
  if (d.includes("ammo")) return "ammo";
  if (d.includes("food") || d.includes("ingredient")) return "consumable";
  if (d.includes("material")) return isLeaf ? "raw" : "component";
  return "misc";
}

/** One ingredient span inside a Materials cell. */
function parseIngredientSpan($, span) {
  const a = $(span).find("a.itemname").first();
  if (!a.length) return null; // gold-cost span has no item link
  const href = a.attr("href");
  if (!href) return null;
  const qtyText = $(span).find("small.itemQuantity").first().text();
  const quantity = Number.parseInt(qtyText.replace(/\D/g, ""), 10);
  const hover = a.attr("data-hover") ?? "";
  const codeMatch = hover.match(/\?s=\w+%2F(\w+)/);
  const rarityMatch = ($(span).find("img").first().attr("class") ?? "").match(
    /bg_rarity(\d)/,
  );
  return {
    slug: decodeURIComponent(href),
    name: a.text().trim(),
    iconUrl: $(span).find("img").first().attr("src") ?? null,
    code: codeMatch ? codeMatch[1] : undefined,
    rarity: rarityMatch ? Number(rarityMatch[1]) : undefined,
    quantity: Number.isNaN(quantity) ? 1 : quantity,
  };
}

/**
 * Parse one item page. Tiered gear repeats the item card once per rarity
 * (common + the "cache-N" tab panes), each with its own Production card whose
 * product icon carries a bg_rarityN class and whose product code gets a _N
 * suffix (e.g. DroneLauncher_5 = legendary). Every Production card producing
 * this page's item is returned as one variant.
 */
function parseItemPage(slug, html) {
  const $ = load(html);

  // Stats rows are <div>Code</div><div>DroneLauncher</div> pairs.
  const code =
    $("div")
      .filter(
        (_, el) =>
          $(el).children().length === 0 && $(el).text().trim() === "Code",
      )
      .first()
      .next("div")
      .text()
      .trim() || undefined;

  const iconUrl =
    $('meta[property="og:image"]').attr("content") ??
    $("img[src*='itemicon']").first().attr("src") ??
    null;

  const variants = [];
  $("h5.card-title")
    .filter((_, el) => $(el).text().trim() === "Production")
    .each((_, el) => {
      const card = $(el).closest(".card-body");
      const workbench =
        card.find("a.itemname").first().text().trim() || undefined;
      const row = card.find("table tbody tr").first();
      const cells = row.find("td");

      // Product cell: confirm this card produces the page's own item.
      const productA = cells.eq(1).find("a.itemname").first();
      if (decodeURIComponent(productA.attr("href") ?? "") !== slug) return;
      const rarityMatch = (cells.eq(1).find("img").first().attr("class") ?? "")
        .match(/bg_rarity(\d)/);
      const rarity = rarityMatch ? Number(rarityMatch[1]) : 0;
      const hoverMatch = (productA.attr("data-hover") ?? "").match(
        /\?s=\w+%2F(\w+)/,
      );
      const prodCode = hoverMatch ? hoverMatch[1] : undefined;
      // Tier variants alter the page's own internal code: either a _2.._5
      // suffix (DroneLauncher_5 = legendary) or an incremented trailing digit
      // (AssaultRifle_Default1 -> AssaultRifle_Default5). The bg_rarityN class
      // alone is NOT a tier marker — single-recipe materials can be innately
      // uncommon+, so an unrecognized code difference falls back to card order.
      let tier = 0;
      if (code && prodCode && prodCode !== code) {
        const suffix = prodCode.match(new RegExp(`^${code}_(\\d+)$`));
        const baseNum = code.match(/^(.*?)(\d+)$/);
        const bumped = baseNum
          ? prodCode.match(new RegExp(`^${baseNum[1]}(\\d+)$`))
          : null;
        if (suffix) tier = Number(suffix[1]) - 1;
        else if (bumped) tier = Number(bumped[1]) - Number(baseNum[2]);
        else tier = variants.length;
      } else if (!code || !prodCode) {
        tier = variants.length;
      }
      if (tier < 0 || variants.some((v) => v.tier === tier)) return;

      const ingredients = [];
      let goldCost;
      cells
        .eq(0)
        .find("span")
        .each((_, span) => {
          // Only direct child spans that wrap an item link; the gold-cost span
          // wraps a plain status icon instead.
          if ($(span).parents("span").length) return;
          const ing = parseIngredientSpan($, span);
          if (ing) {
            ingredients.push(ing);
          } else if ($(span).find("img[src*='icon_status']").length) {
            const digits = $(span).text().replace(/\D/g, "");
            if (digits) goldCost = Number.parseInt(digits, 10);
          }
        });

      const outQtyText = cells.eq(1).find("small.itemQuantity").first().text();
      const outputQuantity =
        Number.parseInt(outQtyText.replace(/\D/g, ""), 10) || 1;

      if (ingredients.length > 0) {
        variants.push({
          tier,
          rarity,
          code: prodCode,
          workbench,
          ingredients,
          outputQuantity,
          goldCost,
        });
      }
    });
  variants.sort((a, b) => a.tier - b.tier);

  return { slug, code, iconUrl, variants };
}

async function downloadIcon(iconUrl, itemId) {
  const ext = path.extname(new URL(iconUrl).pathname) || ".webp";
  const dest = path.join(ICON_DIR, `${itemId}${ext}`);
  if (!(await fileExists(dest))) {
    // The CDN 403s some files unless the request looks like a browser hit
    // coming from the site itself.
    const res = await fetch(iconUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        referer: "https://paldb.cc/",
      },
    });
    if (!res.ok) throw new Error(`${res.status} for ${iconUrl}`);
    await mkdir(ICON_DIR, { recursive: true });
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    await sleep(FETCH_DELAY_MS);
  }
  return `/icons/${itemId}${ext}`;
}

function validate(items, recipes) {
  const errors = [];
  const itemIds = new Set(items.map((i) => i.id));
  const recipeByOutput = new Map(recipes.map((r) => [r.outputItemId, r]));

  // isBaseMaterial and recipe presence must agree — a mismatch means the
  // base/tier classification of a production card went wrong.
  for (const i of items) {
    if (i.isBaseMaterial === recipeByOutput.has(i.id))
      errors.push(
        `item ${i.id}: isBaseMaterial=${i.isBaseMaterial} but hasRecipe=${recipeByOutput.has(i.id)}`,
      );
  }

  for (const r of recipes) {
    if (!itemIds.has(r.outputItemId))
      errors.push(`recipe ${r.id}: unknown output ${r.outputItemId}`);
    for (const ing of r.ingredients) {
      if (!itemIds.has(ing.itemId))
        errors.push(`recipe ${r.id}: unknown ingredient ${ing.itemId}`);
      if (!(ing.quantity > 0))
        errors.push(`recipe ${r.id}: bad quantity for ${ing.itemId}`);
    }
  }

  // Cycle check via DFS over the recipe DAG.
  const visiting = new Set();
  const done = new Set();
  const visit = (id, trail) => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    visiting.add(id);
    for (const ing of recipeByOutput.get(id)?.ingredients ?? []) {
      visit(ing.itemId, [...trail, id]);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const r of recipes) visit(r.outputItemId, []);

  return errors;
}

async function main() {
  const index = await fetchIndex();

  let roots = ROOT_SLUGS;
  if (CATEGORY) {
    // Accept a comma-separated list so several classes land in one dataset
    // (e.g. --category Weapon,Armor) rather than each run clobbering the last.
    const wanted = new Set(CATEGORY.split(",").map((c) => c.trim()));
    roots = [...index.entries()]
      .filter(([, meta]) => wanted.has(meta.desc))
      .map(([slug]) => slug);
    console.log(
      `Categories [${[...wanted].join(", ")}]: ${roots.length} root pages from index.`,
    );
  }
  console.log(`Roots: ${roots.length} item(s)  (write=${WRITE})`);

  /** slug -> parsed page (or { error }) */
  const seen = new Map();
  /** slug -> { name, iconUrl, code } captured from ingredient links, which
   * are cheaper and more reliable than re-deriving them from the target page. */
  const linkMeta = new Map();
  const queue = [...roots];

  while (queue.length > 0) {
    const slug = queue.shift();
    if (seen.has(slug)) continue;
    process.stdout.write(`  fetch ${slug} ... `);
    let parsed;
    try {
      parsed = parseItemPage(slug, await fetchPage(slug));
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      seen.set(slug, { slug, error: String(err) });
      continue;
    }
    seen.set(slug, parsed);
    const ingredients = parsed.variants.flatMap((v) => v.ingredients);
    console.log(
      parsed.variants.length > 0
        ? `${parsed.variants.length} tier(s), ${ingredients.length} ingredient refs`
        : "leaf (no production)",
    );
    for (const ing of ingredients) {
      if (!linkMeta.has(ing.slug)) linkMeta.set(ing.slug, ing);
      if (!seen.has(ing.slug) && !queue.includes(ing.slug)) queue.push(ing.slug);
    }
  }

  // Second pass: assemble schema objects.
  const items = [];
  const recipes = [];
  const failures = [];

  const TIER_NAMES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const toRecipe = (outputItemId, v) => ({
    id: `r_${outputItemId}`,
    outputItemId,
    outputQuantity: v.outputQuantity,
    ingredients: v.ingredients.map((ing) => ({
      itemId: slugToId(ing.slug),
      quantity: ing.quantity,
    })),
    workbench: v.workbench,
    goldCost: v.goldCost,
  });

  for (const [slug, page] of seen) {
    if (!page || page.error) {
      failures.push(slug);
      continue;
    }
    const id = slugToId(slug);
    const meta = index.get(slug);
    const fromLink = linkMeta.get(slug);
    const isLeaf = page.variants.length === 0;
    const name = meta?.label ?? fromLink?.name ?? slug.replaceAll("_", " ");
    const base = page.variants.find((v) => v.tier === 0);
    // Saddles/harnesses/grappling gear are tagged inconsistently on paldb, but
    // they are all crafted at the Pal Gear Workbench — a reliable signal.
    let category = categoryFor(meta?.desc, isLeaf);
    if (base?.workbench && /pal gear/i.test(base.workbench)) {
      category = "pal_gear";
    }

    items.push({
      id,
      name,
      category,
      isBaseMaterial: isLeaf,
      code: page.code ?? fromLink?.code,
      iconUrl: (fromLink?.iconUrl ?? page.iconUrl) || undefined,
      // Innate display rarity (uncommon+ materials get a colored border).
      rarity: base?.rarity ?? fromLink?.rarity ?? undefined,
    });
    if (base) recipes.push(toRecipe(id, base));

    // Higher tiers become variant items whose id suffix matches the game's
    // internal code suffix (tier 1 -> _2 ... tier 4 -> _5).
    for (const v of page.variants.filter((v) => v.tier > 0)) {
      const vid = `${id}_${v.tier + 1}`;
      items.push({
        id: vid,
        name: `${name} (${TIER_NAMES[v.rarity] ?? `Tier ${v.tier + 1}`})`,
        category,
        isBaseMaterial: false,
        code: v.code,
        rarity: v.rarity,
        variantOf: id,
      });
      recipes.push(toRecipe(vid, v));
    }
  }

  const errors = validate(items, recipes);
  console.log(
    `\nParsed ${items.length} items, ${recipes.length} recipes, ` +
      `${failures.length} failures, ${errors.length} validation errors.`,
  );
  for (const f of failures) console.log(`  FAILED: ${f}`);
  for (const e of errors) console.log(`  INVALID: ${e}`);

  if (!WRITE) {
    console.log("\nDry run — pass --write to emit data + icons.");
    return;
  }
  if (errors.length > 0 || failures.length > 0) {
    console.error("\nRefusing to write: fix failures/errors first.");
    process.exitCode = 1;
    return;
  }

  // Back up the curated mock data once, then overwrite with real data.
  const backupDir = path.join(DATA_DIR, "mock-backup");
  if (!(await fileExists(backupDir))) {
    await mkdir(backupDir, { recursive: true });
    for (const f of ["items.json", "recipes.json"]) {
      await cp(path.join(DATA_DIR, f), path.join(backupDir, f));
    }
  }

  // Download icons and point items at the local copies.
  for (const item of items) {
    if (item.iconUrl?.startsWith("http")) {
      process.stdout.write(`  icon ${item.id} ... `);
      try {
        item.iconUrl = await downloadIcon(item.iconUrl, item.id);
        console.log("ok");
      } catch (err) {
        console.log(`FAILED (${err.message})`);
        delete item.iconUrl;
      }
    }
  }
  // Tier variants share the base item's artwork.
  const iconById = new Map(items.map((i) => [i.id, i.iconUrl]));
  for (const item of items) {
    if (item.variantOf && !item.iconUrl) {
      item.iconUrl = iconById.get(item.variantOf);
    }
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  recipes.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(
    path.join(DATA_DIR, "items.json"),
    JSON.stringify(items, null, 2) + "\n",
  );
  await writeFile(
    path.join(DATA_DIR, "recipes.json"),
    JSON.stringify(recipes, null, 2) + "\n",
  );
  await writeFile(
    path.join(DATA_DIR, "meta.json"),
    JSON.stringify(
      {
        source: "paldb.cc",
        gameVersion: "1.0",
        generatedAt: new Date().toISOString(),
        category: CATEGORY ?? undefined,
        roots,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `\nWrote ${DATA_DIR}/items.json, recipes.json, meta.json and icons.`,
  );
}

await main();
