import type { Run, Stage } from "@/lib/db/schema";
import { ROLES } from "@/lib/flow/roles";
import { env } from "@/lib/env";

// A time map of the night: created → deadline (+ grace), each Stage as a bar where it actually ran,
// an amber "now" marker. Pure SVG, server-rendered, scales with the container.

const W = 640;
const H = 26 + 14; // bar area + axis
const PAD = 2;

const barClass: Record<Stage["status"], string> = {
  pending: "fill-rule",
  starting: "fill-accent/60",
  running: "fill-accent",
  done: "fill-ink",
  failed: "fill-bad",
  skipped: "fill-rule",
};

export function NightStrip({ run, stages, now = new Date() }: { run: Run; stages: Stage[]; now?: Date }) {
  const start = run.createdAt.getTime();
  const grace = env.deadlineGraceMin * 60_000;
  const lastEnd = Math.max(...stages.map((s) => (s.finishedAt ?? s.startedAt ?? run.createdAt).getTime()), now.getTime());
  const end = Math.max(run.deadlineAt.getTime() + grace, lastEnd) + 60_000;
  const span = Math.max(end - start, 60_000);
  const x = (t: number) => PAD + ((Math.min(Math.max(t, start), end) - start) / span) * (W - PAD * 2);

  const ranStages = stages.filter((s) => s.startedAt);
  const nowX = x(now.getTime());
  const deadlineX = x(run.deadlineAt.getTime());
  const graceEndX = x(run.deadlineAt.getTime() + grace);
  const hours = hourTicks(start, end);
  const terminal = !["queued", "running"].includes(run.status);

  return (
    <figure className="mt-5" aria-label="Timeline of the run">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-bad/40" strokeWidth="1.2" />
          </pattern>
        </defs>

        {/* night band */}
        <rect x={PAD} y={4} width={W - PAD * 2} height={20} rx={3} className="fill-paper-2" />
        {/* grace zone */}
        <rect x={deadlineX} y={4} width={Math.max(0, graceEndX - deadlineX)} height={20} fill="url(#hatch)" />

        {/* stage bars */}
        {ranStages.map((s) => {
          const s0 = x(s.startedAt!.getTime());
          const s1 = x((s.finishedAt ?? (s.status === "running" || s.status === "starting" ? now : s.updatedAt)).getTime());
          const w = Math.max(3, s1 - s0);
          return (
            <g key={s.id}>
              <rect x={s0} y={7} width={w} height={14} rx={2} className={barClass[s.status] + (s.status === "running" ? " pulse-bar" : "")} />
              {w > 46 && (
                <text x={s0 + 5} y={17.5} className="fill-paper font-mono" fontSize="9">
                  {ROLES[s.role].title}
                </text>
              )}
            </g>
          );
        })}

        {/* deadline */}
        <line x1={deadlineX} x2={deadlineX} y1={2} y2={26} className="stroke-bad" strokeWidth="1.2" strokeDasharray="2 2" />
        {/* now */}
        {!terminal && (
          <g>
            <line x1={nowX} x2={nowX} y1={0} y2={27} className="stroke-accent" strokeWidth="1.5" />
            <circle cx={nowX} cy={1.5} r={2.2} className="fill-accent" />
          </g>
        )}

        {/* axis */}
        {hours.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={26} y2={29} className="stroke-rule" strokeWidth="1" />
            <text x={x(t)} y={38} textAnchor="middle" className="fill-ink-3 font-mono" fontSize="9">
              {hhmm(t)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-3">
        <span>
          <i className="inline-block w-2 h-2 rounded-sm bg-ink align-middle mr-1.5" />
          done
        </span>
        <span>
          <i className="inline-block w-2 h-2 rounded-sm bg-accent align-middle mr-1.5" />
          working
        </span>
        <span>
          <i className="inline-block w-2 h-2 rounded-sm bg-bad align-middle mr-1.5" />
          failed
        </span>
        <span>
          <i className="inline-block w-3 h-0 border-t border-dashed border-bad align-middle mr-1.5" />
          deadline, hatched = grace
        </span>
      </figcaption>
    </figure>
  );
}

function hourTicks(start: number, end: number): number[] {
  const span = end - start;
  const stepH = span > 12 * 3.6e6 ? 3 : span > 6 * 3.6e6 ? 2 : span > 2 * 3.6e6 ? 1 : 0.5;
  const step = stepH * 3.6e6;
  const first = Math.ceil(start / step) * step;
  const out: number[] = [];
  for (let t = first; t <= end; t += step) out.push(t);
  return out.slice(0, 14);
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + "Z";
