import Link from "next/link";

type PromoService = "challenge" | "insight" | "genius";

const PROMOS: Record<
  PromoService,
  { eyebrow: string; title: string; body: string; cta: string; href: string }
> = {
  challenge: {
    eyebrow: "The Challenge! Series",
    title: "Walk into the SAT already knowing the room.",
    body: "The Challenge! Series gives you full, timed practice tests that score the way the real exam does, so test day holds no surprises.",
    cta: "Explore The Challenge! Series",
    href: "/challenge",
  },
  insight: {
    eyebrow: "The Insight! Report",
    title: "Wondering whether your SAT score is enough?",
    body: "The Insight! Report weighs your scores against real admissions data and tells you your honest chances at each college on your list.",
    cta: "See your admission chances",
    href: "/prediction",
  },
  genius: {
    eyebrow: "The Genius! Editor",
    title: "Make your application essays unmistakably yours.",
    body: "The Genius! Editor turns your own stories into a board of essay angles only you could write, so your application sounds like nobody else.",
    cta: "Explore The Genius! Editor",
    href: "/genius",
  },
};

export default function CrossSellCard({
  service,
}: {
  service: PromoService;
}) {
  const promo = PROMOS[service];
  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-[#3b82f6]">
        {promo.eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-bold text-gray-900">{promo.title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-gray-700">{promo.body}</p>
      <Link
        href={promo.href}
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2563eb]"
      >
        {promo.cta}
      </Link>
    </section>
  );
}
