import Link from "next/link";
import { items, recipes, pals, breedingCombos, dataset } from "@/lib/data";

export default function Home() {
  const stats = [
    { label: "Items", value: items.length },
    { label: "Recipes", value: recipes.length },
    { label: "Pals", value: pals.length },
    { label: "Unique combos", value: breedingCombos.length },
  ];

  return (
    <div className="space-y-14">
      <section>
        <p className="eyebrow mb-3">Palworld 1.0 · crafting &amp; breeding</p>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Break any recipe down to{" "}
          <span className="text-secondary">raw ore</span>.
          <br />
          Solve any pairing to its{" "}
          <span className="text-primary">offspring</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-fg-muted">
          Most tools stop at the top-level recipe. Palbook walks the whole
          dependency tree — every ingot, board, and fiber — and hands you one
          consolidated shopping list of base materials for the quantity you
          actually want to build.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/crafting"
            className="rounded bg-primary px-4 py-2 font-display text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Open Crafting Calculator
          </Link>
          <Link
            href="/breeding"
            className="rounded border border-border-strong px-4 py-2 font-display text-sm font-semibold text-fg transition-colors hover:bg-panel"
          >
            Open Breeding Calculator
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-panel px-5 py-6">
            <div className="font-mono text-3xl font-bold text-fg">{s.value}</div>
            <div className="eyebrow mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-secondary-dim/40 bg-panel px-5 py-4">
        <p className="eyebrow text-secondary">Data status</p>
        <p className="mt-1 text-sm text-fg-muted">
          Crafting data + icons scraped from{" "}
          <span className="font-mono text-fg">{dataset.meta.source}</span>{" "}
          (game version {dataset.meta.gameVersion}). Pal + breeding data is
          still the placeholder mock set — real ingestion is the next step.
        </p>
      </section>
    </div>
  );
}
