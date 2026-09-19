"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// §13: router.refresh() on an interval while a Run is non-terminal. No websockets, no polling < 5 s.
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(
      () => {
        if (document.visibilityState === "visible") router.refresh();
      },
      Math.max(5000, everyMs),
    );
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
