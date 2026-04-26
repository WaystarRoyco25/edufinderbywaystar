import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduFinder",
  description: "EduFinder — honest reviews and the Challenge! Series.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-gray-100 text-gray-800">
        {children}
      </body>
    </html>
  );
}
