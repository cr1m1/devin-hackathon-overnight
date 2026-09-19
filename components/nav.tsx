"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const items = [
  { href: "/", label: "New run" },
  { href: "/runs", label: "Runs" },
  { href: "/inbox", label: "Inbox" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-rule">
      <div className="max-w-[720px] mx-auto px-5 h-14 flex items-center justify-between gap-6">
        <Link href="/" className="font-semibold tracking-tight text-base">
          Overnight<span className="text-accent">.</span>
        </Link>
        <nav className="flex gap-5 text-sm">
          {items.map((it) => {
            const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={clsx("py-1 border-b-2 -mb-[1px] transition-colors duration-150", active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
