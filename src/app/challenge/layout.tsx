import Link from "next/link";

export default function ChallengeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="bg-[#3b82f6] text-white py-4 shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center text-xl font-bold tracking-wide hover:opacity-90 transition"
            >
              <span className="mr-2 text-sm opacity-80">←</span>EduFinder
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col bg-gray-100">{children}</div>

      <footer className="bg-[#1f2937] text-white text-center py-6">
        <p>&copy; 2026 EduFinder by Waystar</p>
      </footer>
    </>
  );
}
