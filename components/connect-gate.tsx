import Link from "next/link";

/** Shown wherever a Devin connection is required and none exists. */
export function ConnectGate({ what }: { what: string }) {
  return (
    <div className="border border-dashed border-rule rounded-md px-5 py-10 text-center">
      <p className="font-medium">Connect your Devin first.</p>
      <p className="text-ink-3 text-sm mt-1 max-w-[46ch] mx-auto">
        Overnight runs every stage in <em>your</em> Devin organization, against repositories your Devin can reach. {what}
      </p>
      <Link
        href="/settings"
        className="inline-flex items-center h-10 px-4 mt-5 rounded-md text-sm font-medium bg-ink text-paper hover:bg-accent-ink transition-colors duration-150"
      >
        Connect Devin in Settings
      </Link>
    </div>
  );
}
