"use client";

import { useMemo, useState } from "react";
import { pals, palById } from "@/lib/data";
import { resolveOffspring, findParentCombos } from "@/lib/breeding";

export default function BreedingPage() {
  const [parentAId, setParentAId] = useState("relaxaurus");
  const [parentBId, setParentBId] = useState("sparkit");
  const [targetChildId, setTargetChildId] = useState("mau_cryst");

  const offspring = useMemo(
    () => resolveOffspring(parentAId, parentBId),
    [parentAId, parentBId],
  );
  const child = palById.get(offspring.childId);

  const parentPairs = useMemo(
    () => findParentCombos(targetChildId),
    [targetChildId],
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Breeding calculator</p>
        <h1 className="font-display text-3xl font-bold">Pairings &amp; offspring</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Pick two parents to see the child, or pick a target child to see every
          viable pairing. Unique combos override the breed-power formula.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Forward: parents -> child */}
        <section className="panel p-5">
          <p className="eyebrow mb-3 text-primary">Two parents → offspring</p>
          <div className="flex items-center gap-3">
            <select
              value={parentAId}
              onChange={(e) => setParentAId(e.target.value)}
              className="h-10 flex-1 rounded border border-border bg-panel-2 px-2 text-sm"
            >
              {pals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="font-display text-fg-faint">×</span>
            <select
              value={parentBId}
              onChange={(e) => setParentBId(e.target.value)}
              className="h-10 flex-1 rounded border border-border bg-panel-2 px-2 text-sm"
            >
              {pals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 rounded border border-border bg-panel-2 p-4 text-center">
            <p className="font-display text-2xl font-bold text-primary">
              {child?.name}
            </p>
            <p className="eyebrow mt-2">
              {offspring.source === "unique"
                ? "Unique combo"
                : `Breed-power formula · target ${Math.floor(
                    ((palById.get(parentAId)?.breedPower ?? 0) +
                      (palById.get(parentBId)?.breedPower ?? 0)) /
                      2,
                  )}`}
            </p>
          </div>
        </section>

        {/* Reverse: child -> viable parents */}
        <section className="panel p-5">
          <p className="eyebrow mb-3 text-secondary">Target child → parents</p>
          <select
            value={targetChildId}
            onChange={(e) => setTargetChildId(e.target.value)}
            className="h-10 w-full rounded border border-border bg-panel-2 px-2 text-sm"
          >
            {pals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-fg-muted">
            {parentPairs.length} viable pairing
            {parentPairs.length === 1 ? "" : "s"} in the current dataset:
          </p>
          <ul className="mt-1 max-h-72 divide-y divide-border overflow-y-auto">
            {parentPairs.map(([a, b]) => {
              const viaUnique =
                resolveOffspring(a.id, b.id).source === "unique";
              return (
                <li
                  key={`${a.id}+${b.id}`}
                  className="flex items-center gap-2 py-2.5 text-sm"
                >
                  <span className="text-fg">{a.name}</span>
                  <span className="text-fg-faint">×</span>
                  <span className="text-fg">{b.name}</span>
                  {viaUnique && (
                    <span className="ml-auto rounded border border-primary/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      unique
                    </span>
                  )}
                </li>
              );
            })}
            {parentPairs.length === 0 && (
              <li className="py-2.5 text-sm text-fg-faint">
                No pairing produces this pal with the current placeholder data.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
