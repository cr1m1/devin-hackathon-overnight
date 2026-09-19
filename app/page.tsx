import { ConnectGate } from "@/components/connect-gate";
import { NewRunForm } from "@/components/new-run-form";
import { currentConnection } from "@/lib/connections";
import { TEMPLATES } from "@/lib/flow/templates";
import { ROLES } from "@/lib/flow/roles";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const chain = TEMPLATES.build.stages.map((r) => ROLES[r].title);
  const c = await currentConnection();
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold">What should be done by morning?</h1>
        <p className="text-ink-2 mt-2 max-w-[56ch]">
          Describe the goal, pick the repository, set a deadline. Overnight plans the work, implements it, reviews it and validates it in separate Devin sessions, then leaves you a
          report and a pull request.
        </p>
      </div>
      {c ? <NewRunForm chain={chain} /> : <ConnectGate what="It takes one minute: an organization id and a service-user key." />}
    </div>
  );
}
