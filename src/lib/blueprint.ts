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

export function rollModuleBlueprint(): TypeCode[] {
  const slots: TypeCode[] = [];

  // Reading — 15 slots
  const vocabTotal = weightedPick([4, 5], [60, 40]);
  let csVoc = weightedPick([3, 4], [70, 30]);
  csVoc = Math.min(csVoc, vocabTotal);
  const csWim = vocabTotal - csVoc;

  const iiLog = weightedPick([2, 3], [50, 50]);

  const evidenceTotal = weightedPick([2, 3, 4], [20, 50, 30]);
  const iiDat = randInt(1, Math.min(2, evidenceTotal));
  const iiQuo = randInt(0, Math.max(0, evidenceTotal - iiDat));
  const iiStr = evidenceTotal - iiDat - iiQuo;

  const analysisTotal = 15 - vocabTotal - iiLog - evidenceTotal;
  if (analysisTotal < 0) throw new Error("Reading budget exceeded");

  const analysisCounts: Record<string, number> = {
    "CS-PUR": 0, "CS-STR": 0, "CS-FUN": 0, "CS-DUL": 0, "II-DET": 0,
  };
  const analysisCodes = ["CS-PUR", "CS-STR", "CS-FUN", "CS-DUL", "II-DET"] as const;
  for (let i = 0; i < analysisTotal; i++) {
    const chosen = weightedPick([...analysisCodes], [20, 20, 20, 10, 30]);
    analysisCounts[chosen] += 1;
  }

  for (let i = 0; i < csVoc; i++) slots.push("CS-VOC");
  for (let i = 0; i < csWim; i++) slots.push("CS-WIM");
  for (const code of analysisCodes) {
    for (let i = 0; i < analysisCounts[code]; i++) slots.push(code);
  }
  for (let i = 0; i < iiDat; i++) slots.push("II-DAT");
  for (let i = 0; i < iiQuo; i++) slots.push("II-QUO");
  for (let i = 0; i < iiStr; i++) slots.push("II-STR");
  for (let i = 0; i < iiLog; i++) slots.push("II-LOG");

  // Writing — 12 slots
  const seMix = weightedPick([5, 6], [50, 50]);
  const eiTotal = 12 - seMix;
  const eiTrn = randInt(2, Math.min(5, eiTotal - 1));
  const eiSyn = eiTotal - eiTrn;

  for (let i = 0; i < seMix; i++) slots.push("SE-MIX");
  for (let i = 0; i < eiTrn; i++) slots.push("EI-TRN");
  for (let i = 0; i < eiSyn; i++) slots.push("EI-SYN");

  return slots;
}
