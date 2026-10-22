import { TimerIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { businessDurationLabel, type ResponseSummary } from "@/lib/social/sla";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « lun. 19 oct. » (Ouagadougou = UTC). */
function mondayLabel(iso: string): string {
  const d = new Date(iso);
  return `lun. ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * « Délai de réponse » (Directeur and Fondateur): this week's replies per staff
 * member, median and longest delay and how many came after 24 business hours,
 * plus the team's share answered on time. Delays are business hours (Monday to
 * Friday, Ouagadougou time), like the deadline on the cards.
 */
export function ResponseTimes({ summary }: { summary: ResponseSummary }) {
  const pct = summary.onTimePct;
  return (
    <section aria-labelledby="delai-reponse" className="mt-4 rounded-[22px] bg-white/90 p-3.5 ring-1 ring-[rgba(74,52,36,0.08)] md:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="delai-reponse" className="flex items-center gap-1.5 text-[16px] font-bold text-[#1F1A16]">
            <TimerIcon size={18} weight="bold" className="size-[18px] shrink-0 text-[#A8521D]" />
            Délai de réponse
          </h2>
          <p className="mt-0.5 text-[12px] text-neutral-600">Cette semaine (depuis {mondayLabel(summary.weekStart)}), en heures ouvrées du lundi au vendredi.</p>
        </div>
        {pct !== null && (
          <p className="flex min-w-0 shrink-0 items-baseline gap-1.5">
            <span className={cn("text-[26px] font-extrabold leading-none tracking-tight", pct >= 90 ? "text-emerald-700" : pct >= 70 ? "text-[#A8521D]" : "text-[#8E2A1E]")}>
              {pct} %
            </span>
            <span className="text-[12px] leading-tight text-neutral-600">
              en moins de 24 h ouvrées
              <br />
              <span className="whitespace-nowrap">
                ({summary.onTime} sur {summary.measured})
              </span>
            </span>
          </p>
        )}
      </div>

      {summary.staff.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-[#FBF7F2] px-3 py-3 text-[13px] text-neutral-600">Aucune réponse mesurée cette semaine pour le moment.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {summary.staff.map((s) => (
            <li key={s.staffId} className="min-w-0 rounded-2xl bg-[#FBF7F2] p-2.5">
              <p className="truncate text-[14px] font-bold text-[#1F1A16]">{s.name}</p>
              <dl className="mt-1.5 grid grid-cols-4 gap-1.5 text-center">
                <Stat label="Réponses" value={String(s.replies)} />
                <Stat label="Médiane" value={businessDurationLabel(s.medianMs)} />
                <Stat label="Max" value={businessDurationLabel(s.maxMs)} />
                <Stat label="En retard" value={String(s.late)} tone={s.late > 0 ? "late" : undefined} />
              </dl>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-[11px] leading-snug text-neutral-500">
        Compté depuis le commentaire ou le dernier message de la personne jusqu&apos;à la réponse envoyée depuis Roogo ou « Marquer comme répondu ». Seule la dernière réponse de chaque élément est mesurée.
        {summary.external > 0 &&
          ` ${summary.external} réponse${summary.external > 1 ? "s" : ""} faite${summary.external > 1 ? "s" : ""} directement sur Facebook ou Instagram ${summary.external > 1 ? "ne sont" : "n'est"} pas comptée${summary.external > 1 ? "s" : ""} : Meta ne donne ni l'heure ni la personne.`}
      </p>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "late" }) {
  return (
    <div className={cn("min-w-0 rounded-xl px-1 py-1.5", tone === "late" ? "bg-[#FBE3DF] text-[#8E2A1E]" : "bg-white text-[#1F1A16]")}>
      <dt className={cn("truncate text-[10px] font-semibold uppercase tracking-wide", tone === "late" ? "text-[#8E2A1E]" : "text-neutral-500")}>{label}</dt>
      <dd className="mt-0.5 whitespace-nowrap text-[13px] font-bold leading-tight">{value}</dd>
    </div>
  );
}
