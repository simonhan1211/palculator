"use client";

import { useEffect, useMemo, useState } from "react";
import { craftableItems, getItem, getRecipe } from "@/lib/data";
import { solveCrafting } from "@/lib/crafting";
import type { CraftNode } from "@/lib/types";

/** Rarity tint per tier: common, uncommon, rare, epic, legendary. */
const RARITY_COLORS = ["#2b3d4e", "#59c46b", "#4aa8ff", "#b06bff", "#f2c94c"];
const TIER_LABELS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

/** Research tracks that reduce production cost, keyed by item category. */
const RESEARCH_TRACKS = [
  { key: "weapon", label: "Weapon" },
  { key: "armor", label: "Armor" },
  { key: "pal_gear", label: "Pal Gear" },
] as const;
type ResearchKey = (typeof RESEARCH_TRACKS)[number]["key"];
/** Cumulative reduction at research level 0/1/2 (−5% then +10%). */
const LEVEL_REDUCTION = [0, 0.05, 0.15];
const LEVEL_LABELS = ["None", "Lv 1  −5%", "Lv 2  −15%"];
const RESEARCH_STORAGE_KEY = "palcalc.research";

function ItemIcon({
  itemId,
  size = 32,
  className = "",
}: {
  itemId: string;
  size?: number;
  className?: string;
}) {
  const item = getItem(itemId);
  const borderColor = RARITY_COLORS[item?.rarity ?? 0];
  if (!item?.iconUrl) {
    return (
      <span
        className={`inline-block rounded border bg-panel-2 ${className}`}
        style={{ width: size, height: size, borderColor }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.iconUrl}
      alt={item.name}
      width={size}
      height={size}
      className={`rounded border bg-panel-2 ${className}`}
      style={{ borderColor }}
    />
  );
}

/** One node of the paldb-style production tree: icon with a quantity badge. */
function TreeNode({ node }: { node: CraftNode }) {
  return (
    <li>
      <div
        title={node.itemName}
        className="relative rounded border border-border bg-panel p-1"
      >
        <ItemIcon itemId={node.itemId} size={40} className="border-0" />
        <span
          className={`absolute -left-1 -top-2 rounded bg-bg px-0.5 font-mono text-xs ${
            node.isBaseMaterial ? "text-secondary" : "text-[#7fb2ff]"
          }`}
        >
          {node.quantity}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.itemId} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CraftingPage() {
  const allCraftable = craftableItems();
  const baseItems = allCraftable
    .filter((i) => !i.variantOf)
    .sort((a, b) => a.name.localeCompare(b.name));
  const [baseId, setBaseId] = useState("drone_launcher");
  const [tier, setTier] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [research, setResearch] = useState<Record<ResearchKey, number>>({
    weapon: 0,
    armor: 0,
    pal_gear: 0,
  });

  // Research level is the player's account state, so persist it across visits.
  // Loaded after mount to keep the static-export first render deterministic.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RESEARCH_STORAGE_KEY);
      if (saved) setResearch((r) => ({ ...r, ...JSON.parse(saved) }));
    } catch {
      // ignore unreadable/corrupt storage
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(research));
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [research]);

  // The selected base item plus its rarity-tier variants, lowest tier first.
  const tiers = useMemo(
    () =>
      allCraftable
        .filter((i) => i.id === baseId || i.variantOf === baseId)
        .sort((a, b) => (a.rarity ?? 0) - (b.rarity ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseId],
  );
  const selected = tiers[Math.min(tier, tiers.length - 1)];
  const itemId = selected.id;

  const recipe = getRecipe(itemId);
  const item = getItem(itemId);

  const reductions = useMemo(
    () => ({
      weapon: LEVEL_REDUCTION[research.weapon] ?? 0,
      armor: LEVEL_REDUCTION[research.armor] ?? 0,
      pal_gear: LEVEL_REDUCTION[research.pal_gear] ?? 0,
    }),
    [research],
  );

  // Which research track (if any) actually affects the selected item.
  const activeTrack: ResearchKey | null =
    item?.category === "weapon" ||
    item?.category === "armor" ||
    item?.category === "pal_gear"
      ? item.category
      : null;
  const activeReduction = activeTrack ? reductions[activeTrack] : 0;

  const result = useMemo(
    () => solveCrafting(itemId, Math.max(1, quantity), undefined, reductions),
    [itemId, quantity, reductions],
  );
  const rawSorted = [...result.rawMaterials].sort(
    (a, b) => b.quantity - a.quantity,
  );
  const crafts = Math.ceil(Math.max(1, quantity) / (recipe?.outputQuantity ?? 1));

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Crafting calculator</p>
        <h1 className="font-display text-3xl font-bold">Recipe breakdown</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Pick an item and how many you want. The full dependency tree is
          expanded recursively and every raw material is consolidated into one
          shopping list. Data + icons: paldb.cc.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={baseId}
          onChange={(e) => {
            setBaseId(e.target.value);
            setTier(0);
          }}
          className="h-10 w-72 rounded border border-border bg-panel-2 px-3 text-sm text-fg"
        >
          {baseItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <span className="eyebrow">Qty</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              setQuantity(Number.isNaN(parsed) ? 1 : parsed);
            }}
            className="h-10 w-20 rounded border border-border bg-panel-2 px-3 font-mono text-sm text-fg"
          />
        </div>
        <span className="eyebrow ml-auto">
          {allCraftable.length} craftable items loaded
        </span>
      </div>

      {/* Rarity tier picker — only for gear that has scraped tier variants */}
      {tiers.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Tier</span>
          {tiers.map((t, i) => {
            const rarity = t.rarity ?? 0;
            const active = i === Math.min(tier, tiers.length - 1);
            return (
              <button
                key={t.id}
                onClick={() => setTier(i)}
                className={`h-9 rounded border px-3 font-mono text-xs uppercase tracking-wider transition-colors ${
                  active ? "bg-panel" : "bg-panel-2 opacity-60 hover:opacity-100"
                }`}
                style={{
                  borderColor: active ? RARITY_COLORS[rarity] : undefined,
                  color: rarity > 0 ? RARITY_COLORS[rarity] : undefined,
                }}
              >
                {TIER_LABELS[rarity] ?? `Tier ${i + 1}`}
              </button>
            );
          })}
        </div>
      )}

      {/* Research reductions — the player's technology levels per gear class */}
      <div className="panel flex flex-wrap items-start gap-x-8 gap-y-4 p-4">
        <div className="flex flex-col">
          <span className="eyebrow text-primary">Research reductions</span>
          <span className="mt-1 max-w-[16rem] text-xs text-fg-faint">
            Cuts materials for producing the matching gear class. Doesn&apos;t
            apply to sub-materials.
          </span>
        </div>
        {RESEARCH_TRACKS.map((track) => {
          const isActive = activeTrack === track.key;
          return (
            <div key={track.key} className="flex flex-col gap-1.5">
              <span
                className={`text-xs font-medium ${
                  isActive ? "text-primary" : "text-fg-muted"
                }`}
              >
                {track.label}
                {isActive && (
                  <span className="ml-1 text-fg-faint">• applies here</span>
                )}
              </span>
              <div className="flex gap-1">
                {LEVEL_LABELS.map((lbl, lvl) => {
                  const on = research[track.key] === lvl;
                  return (
                    <button
                      key={lvl}
                      onClick={() =>
                        setResearch((r) => ({ ...r, [track.key]: lvl }))
                      }
                      className={`h-8 whitespace-nowrap rounded border px-2 font-mono text-[11px] transition-colors ${
                        on
                          ? "border-primary bg-panel text-primary"
                          : "border-border bg-panel-2 text-fg-muted hover:text-fg"
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Card 1 — direct top-level recipe as shown in-game */}
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow text-primary">Direct recipe</p>
            {activeReduction > 0 && (
              <span className="rounded border border-primary/40 px-2 py-0.5 font-mono text-[11px] text-primary">
                −{Math.round(activeReduction * 100)}%{" "}
                {RESEARCH_TRACKS.find((t) => t.key === activeTrack)?.label}{" "}
                research
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ItemIcon itemId={itemId} size={48} />
            <div>
              <h2 className="font-display text-xl font-semibold">
                {item?.name}
              </h2>
              <p className="eyebrow mt-0.5">{recipe?.workbench}</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {result.tree.children.map((child, i) => {
              const base = recipe?.ingredients[i];
              const full = base ? base.quantity * crafts : child.quantity;
              const reduced = full !== child.quantity;
              return (
                <li
                  key={child.itemId}
                  className="flex items-center gap-3 py-2"
                >
                  <ItemIcon itemId={child.itemId} />
                  <span className="text-sm text-fg">{child.itemName}</span>
                  <span className="ml-auto font-mono text-sm">
                    {reduced && (
                      <span className="mr-2 text-fg-faint line-through">
                        ×{full}
                      </span>
                    )}
                    <span
                      className={reduced ? "text-primary" : "text-fg-muted"}
                    >
                      ×{child.quantity}
                    </span>
                  </span>
                </li>
              );
            })}
            {recipe?.goldCost != null && (
              <li className="flex items-center gap-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded border border-border bg-panel-2 text-secondary">
                  ¤
                </span>
                <span className="text-sm text-fg">Gold Coin</span>
                <span className="ml-auto font-mono text-sm text-secondary">
                  ×{(recipe.goldCost * Math.max(1, quantity)).toLocaleString()}
                </span>
              </li>
            )}
          </ul>
        </section>

        {/* Card 2 — consolidated raw materials from the recursive solver */}
        <section className="panel p-5">
          <p className="eyebrow mb-3 text-secondary">Raw material breakdown</p>
          <h2 className="font-display text-xl font-semibold">
            Everything to gather
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {rawSorted.map((raw) => (
              <li key={raw.itemId} className="flex items-center gap-3 py-2">
                <ItemIcon itemId={raw.itemId} />
                <span className="text-sm text-fg">{raw.itemName}</span>
                <span className="ml-auto font-mono text-sm text-secondary">
                  ×{raw.quantity}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Production tree — full expansion, paldb-style */}
      <section className="panel p-5">
        <p className="eyebrow mb-3 text-primary">Production tree</p>
        <div className="overflow-x-auto pb-2">
          <div className="ptree inline-block min-w-full">
            <ul>
              <TreeNode node={result.tree} />
            </ul>
          </div>
        </div>
      </section>

      {/* Intermediate crafts — everything made along the way */}
      <section className="panel p-5">
        <p className="eyebrow mb-3 text-primary">Intermediate crafts</p>
        <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {result.intermediates.map((mid) => (
            <li
              key={mid.itemId}
              className="flex items-center gap-3 border-b border-border py-2"
            >
              <ItemIcon itemId={mid.itemId} />
              <span className="text-sm text-fg">{mid.itemName}</span>
              <span className="ml-auto font-mono text-sm text-fg-muted">
                ×{mid.quantity}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
