/**
 * TS port of blueprint.py — picks the 27 question-type slots for a
 * single SAT Reading+Writing module.
 *
 * Reading (CS + II) = 15 slots; Writing (SE + EI) = 12 slots.
 */

export type TypeCode =
  | "CS-VOC" | "CS-WIM"
  | "CS-PUR" | "CS-STR" | "CS-FUN" | "CS-DUL"
  | "II-DET" | "II-DAT" | "II-QUO" | "II-STR" | "II-LOG"
  | "SE-MIX" | "EI-TRN" | "EI-SYN";

export type Difficulty = "standard" | "harder";

function weightedPick<T>(choices: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < choices.length; i++) {
    r -= weights[i];
    if (r <= 0) return choices[i];
  }
  return choices[choices.length - 1];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Weights re-derived from the December 2025 Asia + US SAT papers.
 * Must stay in sync with factory/pool/blueprint.py.
 */
export function rollModuleBlueprint(): TypeCode[] {
  const slots: TypeCode[] = [];

  // Reading — 15 slots
  const vocabTotal = weightedPick([3, 4, 5], [15, 60, 25]);
  const csWimShare = vocabTotal >= 1 ? weightedPick([0, 1], [90, 10]) : 0;
  const csWim = Math.min(csWimShare, vocabTotal);
  const csVoc = vocabTotal - csWim;

  const iiLog = weightedPick([1, 2], [40, 60]);

  const evidenceTotal = weightedPick([2, 3, 4], [35, 50, 15]);
  // Guarantee ≥1 II-DAT, capped at 2.
  const iiDat = Math.min(2, Math.max(1, randInt(1, 2)));
  const iiDatFinal = Math.min(iiDat, evidenceTotal);
  const remainingEvidence = evidenceTotal - iiDatFinal;
  const iiQuo = remainingEvidence > 0
    ? Math.min(weightedPick([0, 1], [60, 40]), remainingEvidence)
    : 0;
  const iiStr = remainingEvidence - iiQuo;

  const analysisTotal = 15 - vocabTotal - iiLog - evidenceTotal;
  if (analysisTotal < 0) {
    // Defensive reroll — weighted picks can occasionally overshoot.
    return rollModuleBlueprint();
  }

  const analysisCounts: Record<string, number> = {
    "CS-PUR": 0, "CS-STR": 0, "CS-FUN": 0, "CS-DUL": 0, "II-DET": 0,
  };
  const analysisCodes = ["CS-PUR", "CS-STR", "CS-FUN", "CS-DUL", "II-DET"] as const;
  for (let i = 0; i < analysisTotal; i++) {
    const chosen = weightedPick([...analysisCodes], [25, 10, 20, 10, 35]);
    analysisCounts[chosen] += 1;
  }

  for (let i = 0; i < csVoc; i++) slots.push("CS-VOC");
  for (let i = 0; i < csWim; i++) slots.push("CS-WIM");
  for (const code of analysisCodes) {
    for (let i = 0; i < analysisCounts[code]; i++) slots.push(code);
  }
  for (let i = 0; i < iiDatFinal; i++) slots.push("II-DAT");
  for (let i = 0; i < iiQuo; i++) slots.push("II-QUO");
  for (let i = 0; i < iiStr; i++) slots.push("II-STR");
  for (let i = 0; i < iiLog; i++) slots.push("II-LOG");

  // Writing — 12 slots
  const seMix = weightedPick([5, 6], [50, 50]);
  const eiTotal = 12 - seMix;
  const eiTrnRoll = weightedPick([2, 3, 4], [25, 45, 30]);
  const eiTrn = Math.min(eiTrnRoll, eiTotal - 2); // guarantee ei_syn >= 2
  const eiSyn = eiTotal - eiTrn;

  for (let i = 0; i < seMix; i++) slots.push("SE-MIX");
  for (let i = 0; i < eiTrn; i++) slots.push("EI-TRN");
  for (let i = 0; i < eiSyn; i++) slots.push("EI-SYN");

  return slots;
}

/**
 * For each slot in a 27-slot blueprint, randomly assign either "standard"
 * or "harder" difficulty such that exactly `hardCount` of the 27 slots are
 * "harder". Used to build the module-1 / module-2 mixes:
 *   - module 1 and easier module 2: hardCount = 7  (20 std + 7 hard)
 *   - harder module 2:              hardCount = 20 (20 hard + 7 std)
 */
export function assignDifficultyMix(
  slots: TypeCode[],
  hardCount: number,
): Difficulty[] {
  const n = slots.length;
  if (hardCount < 0 || hardCount > n) {
    throw new Error(`hardCount ${hardCount} out of range for ${n} slots`);
  }
  const indexes = Array.from({ length: n }, (_, i) => i);
  // Fisher–Yates shuffle.
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  const harderSet = new Set(indexes.slice(0, hardCount));
  return slots.map((_, i): Difficulty => (harderSet.has(i) ? "harder" : "standard"));
}
