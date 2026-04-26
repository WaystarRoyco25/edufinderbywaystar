"use client";

import { useEffect } from "react";

type Bucket = {
  range: string;
  body: string;
};

const BUCKETS: Bucket[] = [
  {
    range: "Equivalent SAT score ≈ 200–380",
    body: `At this level the test feels overwhelming, but the diagnosis is usually narrower than it appears. Almost every missed question on this paper would trace back to two root causes: limited working vocabulary (questions like the "persists / responds / arrives / agrees" item or "demonstrated most nearly means") and difficulty holding long English sentences in working memory long enough to parse them. Test strategy is not your problem yet — English fluency is. Over the next three to six months, do three things daily and very consistently. First, read fifteen to twenty minutes of short non-fiction in English every day (Smithsonian Magazine, Aeon, Scientific American's brief news pieces) and rewrite any sentence longer than twenty words in your own simpler words; this trains the exact parsing skill the SAT measures. Second, learn ten high-utility academic words a day using a spaced-repetition app like Anki rather than a paper list — example sentences matter more than definitions. Third, lock down four foundational grammar rules and nothing else for now: independent clauses joined by comma-only is wrong, subject-verb agreement, basic apostrophe placement, and pronoun consistency. Skip timed sections entirely until you are answering single questions correctly with the explanation visible. Accuracy first, speed never.`,
  },
  {
    range: "Equivalent SAT score ≈ 400–500",
    body: `You handle the most direct vocabulary and main-purpose questions, but you lose predictable ground on three fronts in this paper: late-module inference questions ("Which choice most logically completes the text?"), the harder transition questions where two of the four answers feel plausible (the Eiffel Tower or JWST/Hubble items are good examples), and the rhetorical synthesis questions that present bullet-point notes and ask you to fulfill a specific writing goal. Your highest-yield move over the next three to six months is to systematize Standard English Conventions, because that domain is purely rule-based — roughly fifteen to twenty rules cover virtually every grammar question on every form (commas around non-essential clauses, semicolons between independent clauses, colon use, possessive apostrophes, parallelism, modifier placement, pronoun-antecedent agreement, basic verb tense logic). Master those once with a focused two-week sprint and you will stop missing them forever. For Reading items, train a "predict before you peek" habit: physically cover the four choices with your hand, articulate in your own words what the blank or question demands, then reveal the options and look for the match. This single habit kills most trap answers. Your primary practice material should be the official Bluebook app practice tests and the College Board's free Question Bank — outside resources are mostly redundant at this stage.`,
  },
  {
    range: "Equivalent SAT score ≈ 500–650",
    body: `You have the easy and mid-difficulty items locked down; your remaining missed questions cluster in the harder half of each module — Command of Evidence questions where you must read data off a graph or table (the Fish Population, Brown Bears, and Mobility Patterns items), inference questions with two appealing answers, cross-text connection questions where you must compare what two researchers would say to each other, and the more demanding rhetorical synthesis prompts. The skill that will move you out of this bracket is precision in mapping what the question literally asks. On Command of Evidence, the trap is that two answers are factually true to the data but only one supports the specific claim in the prompt; underline the exact claim and test each option against it. On inference, the correct answer must follow from the passage with no outside assumption — if your justification starts with "well, it could be that...," that answer is wrong. Over the next three to six months, build an error log: copy every wrong question into a notebook, write the official explanation in your own words, and tag the question by skill type. Within two weeks, patterns emerge — you will see that you miss, say, four of every five Cross-Text Connections but only one in ten Transitions, and your study time can then concentrate where the points actually leak. Take one timed full module per week to keep pace under pressure, and spend the rest of your hours on filtered Question Bank drills.`,
  },
  {
    range: "Equivalent SAT score ≈ 650–750",
    body: `At this level your missed questions are no longer about misunderstanding the test — they are about precision under fatigue and the genuinely difficult items the College Board engineers into each form. They tend to be the hardest inference questions (where the correct answer is more modest than a flashier wrong answer that pulls you in), rhetorical synthesis questions where the correct choice fulfills a very specifically worded goal that two distractors almost satisfy, and rarer grammar conventions — comma-versus-semicolon in lists with internal punctuation, agreement when an inverted subject sits at the end of a clause, restrictive versus non-restrictive modifiers. Stop doing high-volume practice; you have already learned the patterns. Start doing slow forensic review where, for every wrong answer, you can articulate not only why the right answer is right but exactly why each of the three wrong options is wrong. Over three to six months, do two to three full Bluebook practice tests under exact test conditions and spend three times as long reviewing each test as you spent taking it. For rhetorical synthesis, paraphrase the stated goal aloud before looking at any choice — the goal in those questions is doing more work than students realize. The ceiling of fifty-plus is mostly about disciplined attention rather than additional content learning, which means sleep, pacing strategy, and emotional flatness on test day matter as much as content review.`,
  },
  {
    range: "Equivalent SAT score ≈ 750–800",
    body: `You are operating near ceiling, and the gap between fifty-one and a perfect fifty-four is variance reduction, not skill expansion. The few questions you still miss fall into two narrow categories: the hardest inference items where the test writers have engineered two near-equivalent answers that hinge on a single qualifier you skimmed past, and grammar items at the rarer end of the rule set (colons introducing lists with internal commas, dashes versus parentheses for parenthetical material, edge-case modifier attachment). Over the next three to six months, your work is consistency, not new content. Take every available official Bluebook test under timed conditions and treat each missed question as a forensic case — you should be able to reconstruct the exact mental shortcut that led you to the wrong choice, because that same shortcut will show up on test day if you do not name it. Drill exclusively the hardest difficulty tier on the Question Bank for whichever skill type still leaks. Pay close attention to variables top scorers underestimate: sleep the entire week before the test, light food on test morning, hydration, and a deliberate pacing target of about one minute per question with two or three flagged items reserved for a final review pass. The students who score 800 typically walk in slightly bored rather than nervous — your job in the final month is to manufacture that calm.`,
  },
];

function pickBucket(score: number): Bucket {
  if (score <= 14) return BUCKETS[0];
  if (score <= 27) return BUCKETS[1];
  if (score <= 42) return BUCKETS[2];
  if (score <= 50) return BUCKETS[3];
  return BUCKETS[4];
}

export default function ScoreCommentaryModal({
  score,
  total,
  onDismiss,
}: {
  score: number;
  total: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const bucket = pickBucket(score);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-commentary-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-gray-100 bg-white shadow-2xl">
        <header className="border-b border-gray-100 px-6 py-5 sm:px-8 sm:py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            {bucket.range}
          </p>
          <h2
            id="score-commentary-title"
            className="mt-1 text-2xl font-bold tracking-wide text-gray-900 sm:text-3xl"
          >
            Your Personalized Commentary
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            You answered{" "}
            <span className="font-semibold text-gray-700">
              {score} / {total}
            </span>{" "}
            questions correctly
            <span className="ml-1 text-gray-400">({pct}%)</span>
          </p>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
          <p className="text-sm leading-7 text-gray-700 sm:text-base">
            {bucket.body}
          </p>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-gray-100 bg-gray-50 px-6 py-4 sm:px-8 sm:py-5">
          <p className="text-xs text-gray-500">
            Read this before reviewing individual questions.
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700"
          >
            Continue to Explanations
          </button>
        </footer>
      </div>
    </div>
  );
}
