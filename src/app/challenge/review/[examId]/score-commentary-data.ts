export type ScoreCommentaryBucket = {
  identity: string;
  range: string;
  message: string;
  meaning: string;
  priorities: string[];
  routine: string;
  avoid: string;
  cta: string;
};

const BUCKETS: ScoreCommentaryBucket[] = [
  {
    identity: "Foundation Builder",
    range: "Equivalent SAT score ~= 200-380",
    message: "The test feels fast because sentence meaning is not automatic yet.",
    meaning:
      "Most misses are likely coming from vocabulary, long sentence parsing, and core grammar. When those basics are shaky, timing strategy cannot help much yet.",
    priorities: [
      "Read 15-20 minutes of short nonfiction each day, then rewrite one long sentence in simpler English.",
      "Learn 10 academic words in context with a spaced-repetition deck and one original sentence for each word.",
      "Master four grammar rules first: comma splices, subject-verb agreement, apostrophes, and pronoun consistency.",
    ],
    routine:
      "For the next 30 days, do 8-10 untimed Reading and Writing questions per session with explanations open. Redo missed questions two days later before adding speed.",
    avoid:
      "Do not take full timed modules yet. They will mostly measure panic and reading speed, not growth.",
    cta: "Accuracy before speed.",
  },
  {
    identity: "Pattern Catcher",
    range: "Equivalent SAT score ~= 400-500",
    message:
      "You understand many direct questions, but traps still pull you off the exact task.",
    meaning:
      "Your score is being held down by near-miss questions: inference, transitions, synthesis, and rules where two answers look reasonable.",
    priorities: [
      "Run a two-week grammar sprint covering punctuation, modifiers, parallelism, pronouns, and verb tense logic.",
      "Before looking at choices, cover them and predict what the answer must do in your own words.",
      "Drill one skill type at a time: transitions one day, synthesis the next, and inference after that.",
    ],
    routine:
      "Complete 20 filtered official Question Bank questions four days a week. Review every miss by writing the clue you should have noticed.",
    avoid:
      "Do not bounce between random resources. At this level, mixed practice hides the pattern you need to fix.",
    cta: "Name the task before choosing.",
  },
  {
    identity: "Score Climber",
    range: "Equivalent SAT score ~= 500-650",
    message: "You know the test, but points leak from precision questions.",
    meaning:
      "Your mistakes are probably concentrated, not random. The biggest gains will come from finding the exact question types and habits that keep repeating.",
    priorities: [
      "Keep an error log with question type, why the wrong answer tempted you, and the exact clue for the right answer.",
      "For Command of Evidence, underline the claim first, then test each choice against only that claim.",
      "For Cross-Text and inference, reject any answer that needs outside assumptions or sounds stronger than the passage.",
    ],
    routine:
      "Take one timed module per week. Spend the other sessions on filtered drills from your two weakest tags until the miss pattern changes.",
    avoid:
      "Do not mark an answer right just because it is true. It must answer the exact question.",
    cta: "Turn mistakes into patterns.",
  },
  {
    identity: "High Scorer",
    range: "Equivalent SAT score ~= 650-750",
    message: "Your next points come from attention, not more volume.",
    meaning:
      "You already know the common patterns. The remaining misses usually come from fatigue, overreading, or one word in the question goal that you skimmed.",
    priorities: [
      "After each miss, explain why all three wrong answers are wrong, not only why the right one works.",
      "Paraphrase every rhetorical synthesis goal before reading the choices.",
      "Practice pacing with a planned review pass for 2-3 flagged questions instead of rushing every item equally.",
    ],
    routine:
      "Do 2-3 full Bluebook tests under exact conditions across the next month. Spend at least twice the test time reviewing each one.",
    avoid:
      "Do not grind huge question sets. For you, shallow volume creates confidence without fixing precision.",
    cta: "Review deeper, not longer.",
  },
  {
    identity: "Ceiling Chaser",
    range: "Equivalent SAT score ~= 750-800",
    message: "The remaining gap is variance control.",
    meaning:
      "You are near ceiling. Misses now usually come from a qualifier, a rare grammar edge case, or a mental shortcut that worked on easier questions.",
    priorities: [
      "Track the exact shortcut behind each miss: rushed comparison, skipped qualifier, extreme wording, or grammar edge case.",
      "Drill only the hardest official questions in the skill type that still leaks.",
      "Rehearse test-day routine: sleep, light food, hydration, pacing target, and a calm review pass.",
    ],
    routine:
      "Run official tests under exact timing, then rebuild each miss from first read to final click so you can spot the same shortcut next time.",
    avoid: "Do not chase obscure content. Your goal is repeatability, not more facts.",
    cta: "Make perfect feel routine.",
  },
];

export function getScoreCommentaryBucket(score: number): ScoreCommentaryBucket {
  if (score <= 14) return BUCKETS[0];
  if (score <= 27) return BUCKETS[1];
  if (score <= 42) return BUCKETS[2];
  if (score <= 50) return BUCKETS[3];
  return BUCKETS[4];
}
