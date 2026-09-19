import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { HealthBanner } from "@/components/health-banner";
import "./globals.css";

const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Overnight", template: "%s · Overnight" },
  description: "Evening — a task. Morning — a pull request.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf9f6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <HealthBanner />
        <Nav />
        <main className="flex-1 w-full max-w-[720px] mx-auto px-5 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
