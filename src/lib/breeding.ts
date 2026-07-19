import type { BreedingResult, Pal } from "./types";
import { pals, palById, breedingCombos } from "./data";

/**
 * STEP 4 (breeding half) — Offspring solver.
 *
 * Palworld breeding resolution order:
 *   1. Unique-combo table: if (A,B) — order-independent — is in breedingCombos,
 *      return that child with source "unique".
 *   2. Power formula: target = floor((powerA + powerB) / 2). The offspring is
 *      the Pal whose breedPower is nearest to `target`; exact-distance ties go
 *      to the lower paldeck number. Return with source "formula".
 */

/** Order-independent key for a parent pair. */
function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}+${bId}` : `${bId}+${aId}`;
}

const uniqueComboByPair = new Map(
  breedingCombos.map((c) => [pairKey(c.parentAId, c.parentBId), c.childId]),
);

export function resolveOffspring(
  parentAId: string,
  parentBId: string,
): BreedingResult {
  const parentA = palById.get(parentAId);
  const parentB = palById.get(parentBId);
  if (!parentA) throw new Error(`Unknown pal id: "${parentAId}".`);
  if (!parentB) throw new Error(`Unknown pal id: "${parentBId}".`);

  const uniqueChildId = uniqueComboByPair.get(pairKey(parentAId, parentBId));
  if (uniqueChildId) {
    return { parentAId, parentBId, childId: uniqueChildId, source: "unique" };
  }

  const target = Math.floor((parentA.breedPower + parentB.breedPower) / 2);
  let best: Pal = pals[0];
  for (const candidate of pals) {
    const candidateDistance = Math.abs(candidate.breedPower - target);
    const bestDistance = Math.abs(best.breedPower - target);
    if (
      candidateDistance < bestDistance ||
      (candidateDistance === bestDistance &&
        candidate.paldeckNumber < best.paldeckNumber)
    ) {
      best = candidate;
    }
  }

  return { parentAId, parentBId, childId: best.id, source: "formula" };
}

/**
 * Reverse lookup: given a target child, return every viable parent pair.
 * Iterates all unordered pairs (including self-pairs) and keeps those that
 * resolve to the target. Unique combos resolve first inside resolveOffspring,
 * so a pair claimed by a unique combo can never appear under a formula child.
 */
export function findParentCombos(childId: string): Array<[Pal, Pal]> {
  const results: Array<[Pal, Pal]> = [];
  for (let i = 0; i < pals.length; i++) {
    for (let j = i; j < pals.length; j++) {
      const offspring = resolveOffspring(pals[i].id, pals[j].id);
      if (offspring.childId === childId) {
        results.push([pals[i], pals[j]]);
      }
    }
  }
  return results;
}
