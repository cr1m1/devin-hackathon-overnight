import { NewRunForm } from "@/components/new-run-form";
import { TEMPLATES } from "@/lib/flow/templates";
import { ROLES } from "@/lib/flow/roles";

export default function NewRunPage() {
  const chain = TEMPLATES.build.stages.map((r) => ROLES[r].title);
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold">What should be done by morning?</h1>
        <p className="text-ink-2 mt-2 max-w-[56ch]">
          Describe the goal, pick the repository, set a deadline. Overnight plans the work, implements it, reviews it and validates it in separate Devin sessions, then leaves you a
          report and a pull request.
        </p>
      </div>
      <NewRunForm chain={chain} />
    </div>
  );
}
