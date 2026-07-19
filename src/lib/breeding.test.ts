import { describe, expect, test } from "vitest";
import { resolveOffspring, findParentCombos } from "./breeding";
import type { Pal } from "./types";

/** True when `pairs` contains the unordered pair (aId, bId). */
function hasPair(pairs: Array<[Pal, Pal]>, aId: string, bId: string): boolean {
  return pairs.some(
    ([a, b]) =>
      (a.id === aId && b.id === bId) || (a.id === bId && b.id === aId),
  );
}

describe("resolveOffspring", () => {
  test("unique combo overrides the power formula", () => {
    const result = resolveOffspring("relaxaurus", "sparkit");
    expect(result.childId).toBe("relaxaurus_lux");
    expect(result.source).toBe("unique");
  });

  test("unique combos are order-independent", () => {
    const result = resolveOffspring("sparkit", "relaxaurus");
    expect(result.childId).toBe("relaxaurus_lux");
    expect(result.source).toBe("unique");
  });

  test("formula picks the pal with breedPower nearest floor of the average", () => {
    // lamball 1350 + lifmunk 1315 -> floor(2665/2) = 1332.
    // Nearest breedPower: cattiva 1330 (diff 2).
    const result = resolveOffspring("lamball", "lifmunk");
    expect(result.childId).toBe("cattiva");
    expect(result.source).toBe("formula");
  });

  test("breaks exact-distance ties by lower paldeck number", () => {
    // lamball 1350 + cattiva 1330 -> target 1340: both parents are 10 away.
    // lamball is paldeck #1, cattiva #2 -> lamball wins.
    const result = resolveOffspring("lamball", "cattiva");
    expect(result.childId).toBe("lamball");
    expect(result.source).toBe("formula");
  });

  test("throws on an unknown pal id", () => {
    expect(() => resolveOffspring("lamball", "missingno")).toThrow(
      /unknown pal/i,
    );
  });
});

describe("findParentCombos", () => {
  test("includes the unique combo that produces the child", () => {
    const pairs = findParentCombos("mau_cryst");
    expect(hasPair(pairs, "mau", "pengullet")).toBe(true);
  });

  test("includes formula pairs that resolve to the child", () => {
    // lamball + lifmunk -> cattiva by formula (see resolveOffspring test).
    const pairs = findParentCombos("cattiva");
    expect(hasPair(pairs, "lamball", "lifmunk")).toBe(true);
  });

  test("excludes pairs claimed by a unique combo for another child", () => {
    // (mau, pengullet) is the unique combo for mau_cryst, so it must never be
    // listed as a formula pair for any other child.
    const pairs = findParentCombos("mau");
    expect(hasPair(pairs, "mau", "pengullet")).toBe(false);
  });

  test("returns each unordered pair at most once", () => {
    const pairs = findParentCombos("cattiva");
    const keys = pairs.map(([a, b]) => [a.id, b.id].sort().join("+"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
