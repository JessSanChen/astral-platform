import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { BUILD_COMMIT } from "@/lib/build";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Headings and the wordmark. The optical-size axis lets the same family look
// right both as a large headline and as a small section title.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Astral",
  description: "Transcript generation platform for biosecurity research.",
  // Which commit is being served. See lib/build.ts.
  other: { "astral-build": BUILD_COMMIT },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
