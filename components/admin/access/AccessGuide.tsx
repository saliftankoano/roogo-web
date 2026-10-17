"use client";

// "Qui peut faire quoi": renders lib/access/matrix.ts. No rule is written
// here; change the matrix (and its test) instead.

import Link from "next/link";
import { useRef } from "react";
import {
  CheckCircleIcon,
  ClockCountdownIcon,
  EyeIcon,
  KeyIcon,
  MinusCircleIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  APP_USERS,
  AREAS,
  LAST_REVIEWED,
  LEVELS,
  LEVEL_CARDS,
  LEVEL_NAMES,
  LEVEL_SHORT,
  PLANNED,
  PLANNED_SOURCE,
  STAFF_JOIN,
  UNLEVELED,
  type Access,
  type Enforcement,
  type Level,
  type Rule,
} from "@/lib/access/matrix";
import { CreamBackdrop, SectionLabel, useEntrance } from "@/components/admin/team/ui";

const ACCESS_STYLE: Record<Access, { label: string; Icon: typeof CheckCircleIcon; className: string }> = {
  oui: { label: "Oui", Icon: CheckCircleIcon, className: "bg-[#E3F1E6] text-[#245C33]" },
  lecture: { label: "Lecture", Icon: EyeIcon, className: "bg-[#E1EFF8] text-[#1F5F80]" },
  non: { label: "Non", Icon: MinusCircleIcon, className: "bg-[#EEEBE7] text-[#4A4540]" },
};

const ENFORCEMENT_LABEL: Record<Enforcement, string> = {
  serveur: "Serveur",
  page: "Page",
  menu: "Menu",
};

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function frenchDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function AccessBadge({ access, note, strong }: { access: Access; note?: string; strong?: boolean }) {
  const { label, Icon, className } = ACCESS_STYLE[access];
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-0.5">
      <span className={cn("inline-flex h-7 items-center gap-1 rounded-full pl-1.5 pr-2.5 text-[13px] font-extrabold", className, strong && "ring-2 ring-[#C96A2E]/40")}>
        <Icon size={16} weight="fill" aria-hidden="true" />
        {label}
      </span>
      {note && <span className="text-xs leading-snug text-[#6B625B]">{note}</span>}
    </span>
  );
}

function Files({ rule }: { rule: Rule }) {
  return (
    <details className="group mt-2 text-xs text-[#6B625B]">
      <summary className="inline-flex min-h-8 cursor-pointer items-center font-bold text-[#8A4924] hover:text-[#C96A2E]">
        Où c’est vérifié
      </summary>
      <p className="m-0 mt-1">
        Contrôle : {rule.enforcedBy.map((e) => ENFORCEMENT_LABEL[e]).join(", ")}
      </p>
      <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
        {rule.files.map((file) => (
          <li key={file} className="break-all font-mono text-[11px]">
            {file}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SameForAll({ rule }: { rule: Rule }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F6F1EA] px-2 py-0.5 text-[11px] font-bold text-[#6B625B]">
      Le titre ne change rien ici aujourd’hui
      <span className="sr-only">{`, ${ACCESS_STYLE[rule.access.fondateur].label} pour tous les niveaux`}</span>
    </span>
  );
}

function RuleCard({ rule, viewerLevel }: { rule: Rule; viewerLevel: Level }) {
  return (
    <li className="rounded-2xl border border-[#EDE4D8] bg-white p-4">
      <h3 className="m-0 text-[15px] font-extrabold leading-snug">{rule.action}</h3>
      {rule.detail && <p className="m-0 mt-1 text-sm leading-relaxed text-[#4A4540]">{rule.detail}</p>}
      {!rule.titleMatters ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Tous les niveaux :</span>
          <AccessBadge access={rule.access.fondateur} note={rule.notes?.fondateur} />
          <SameForAll rule={rule} />
        </div>
      ) : (
        <dl className="m-0 mt-3 divide-y divide-[#F1EBE3]">
          {LEVELS.map((level) => (
            <div
              key={level}
              className={cn(
                "flex items-start justify-between gap-3 py-2",
                level === viewerLevel && "-mx-2 rounded-xl bg-[#FBF3EA] px-2",
              )}
            >
              <dt className="min-w-0 text-sm font-semibold">
                {LEVEL_NAMES[level]}
                {level === viewerLevel && <span className="ml-1 text-xs font-bold text-[#A8521D]">(vous)</span>}
              </dt>
              <dd className="m-0 shrink-0 text-right">
                <AccessBadge access={rule.access[level]} note={rule.notes?.[level]} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Files rule={rule} />
    </li>
  );
}

function RuleTable({ rules, viewerLevel }: { rules: Rule[]; viewerLevel: Level }) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[#EDE4D8] bg-white text-left">
      <colgroup>
        <col className="w-[34%]" />
        {LEVELS.map((level) => (
          <col key={level} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="border-b border-[#EDE4D8] px-4 py-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6B625B]">
            Action
          </th>
          {LEVELS.map((level) => (
            <th
              key={level}
              scope="col"
              className={cn(
                "border-b border-[#EDE4D8] px-3 py-3 text-xs font-extrabold uppercase tracking-[0.04em] text-[#6B625B]",
                level === viewerLevel && "bg-[#FBF3EA] text-[#A8521D]",
              )}
            >
              <abbr title={LEVEL_NAMES[level]} className="no-underline">
                {LEVEL_SHORT[level]}
              </abbr>
              {level === viewerLevel && <span className="block text-[10px] normal-case tracking-normal">vous</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rules.map((rule, index) => (
          <tr key={rule.id} className="align-top">
            <th
              scope="row"
              className={cn("px-4 py-3.5 font-normal", index < rules.length - 1 && "border-b border-[#F1EBE3]")}
            >
              <span className="block text-[15px] font-extrabold leading-snug">{rule.action}</span>
              {rule.detail && <span className="mt-1 block text-[13px] leading-relaxed text-[#4A4540]">{rule.detail}</span>}
              {!rule.titleMatters && (
                <span className="mt-2 block">
                  <SameForAll rule={rule} />
                </span>
              )}
              <Files rule={rule} />
            </th>
            {LEVELS.map((level) => (
              <td
                key={level}
                className={cn(
                  "px-3 py-3.5",
                  index < rules.length - 1 && "border-b border-[#F1EBE3]",
                  level === viewerLevel && "bg-[#FBF3EA]",
                )}
              >
                <AccessBadge access={rule.access[level]} note={rule.notes?.[level]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AccessGuide({
  viewerLevel,
  canSeeTeam,
  levelsEnforced,
}: {
  viewerLevel: Level;
  canSeeTeam: boolean;
  levelsEnforced: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEntrance(rootRef, "[data-enter]", []);

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 pb-16 text-[#1F1A16]">
      <CreamBackdrop />

      <header data-enter className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#1F1A16] px-3 text-sm font-extrabold text-white">
            <ShieldCheckIcon size={16} weight="bold" aria-hidden="true" />
            Votre niveau : {LEVEL_NAMES[viewerLevel]}
          </span>
          {canSeeTeam && (
            <Link
              href="/admin/equipe"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#EDE4D8] bg-white px-3 text-sm font-bold text-[#8A4924] hover:text-[#C96A2E]"
            >
              <UsersThreeIcon size={16} aria-hidden="true" />
              L’équipe
            </Link>
          )}
          {canSeeTeam && (
            <Link
              href="/admin/equipe/niveaux"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#EDE4D8] bg-white px-3 text-sm font-bold text-[#8A4924] hover:text-[#C96A2E]"
            >
              <KeyIcon size={16} aria-hidden="true" />
              Niveaux d’accès
            </Link>
          )}
        </div>
        <h1 className="m-0 text-[28px] font-extrabold leading-tight lg:text-[34px]">Qui peut faire quoi</h1>
        <p className="m-0 max-w-[68ch] text-[15px] leading-relaxed text-[#4A4540]">
          Les droits de chaque niveau dans l’administration Roogo, tels que l’appli les applique aujourd’hui. Ce qui est prévu mais
          pas encore en place est rangé à part, en bas de la page.
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-sm text-[#4A4540]" aria-label="Légende">
          <li className="flex items-center gap-2"><AccessBadge access="oui" /> peut le faire</li>
          <li className="flex items-center gap-2"><AccessBadge access="lecture" /> peut voir, pas changer</li>
          <li className="flex items-center gap-2"><AccessBadge access="non" /> pas d’accès</li>
        </ul>
        <p className="m-0 max-w-[68ch] text-[13px] leading-relaxed text-[#6B625B]">
          « Serveur » veut dire que le serveur refuse l’action : c’est la vraie protection. « Page » : la page renvoie ailleurs.
          « Menu » : le lien est caché.
        </p>
      </header>

      <section data-enter aria-labelledby="niveaux" className="flex flex-col gap-3">
        <SectionLabel>
          <span id="niveaux">Les cinq niveaux de l’équipe</span>
        </SectionLabel>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-5">
          {LEVEL_CARDS.map((card) => {
            const mine = card.level === viewerLevel;
            return (
              <li
                key={card.level}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border bg-white p-4",
                  mine ? "border-[#C96A2E] shadow-[0_0_0_3px_rgba(201,106,46,0.15)]" : "border-[#EDE4D8]",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-base font-extrabold">{LEVEL_NAMES[card.level]}</h3>
                  {mine && (
                    <span className="inline-flex h-6 items-center rounded-full bg-[#C96A2E] px-2 text-[11px] font-extrabold text-white">
                      Votre niveau
                    </span>
                  )}
                </div>
                <p className="m-0 text-sm leading-relaxed text-[#4A4540]">{card.summary}</p>
                <p className="m-0 mt-auto text-xs leading-snug text-[#6B625B]">{card.source}</p>
              </li>
            );
          })}
        </ul>
        <div className="rounded-2xl border border-[#EDE4D8] bg-white/70 p-4 text-sm leading-relaxed text-[#4A4540]">
          <p className="m-0 font-extrabold text-[#1F1A16]">Comment un niveau est donné</p>
          <p className="m-0 mt-1">
            Le titre de chacun est son niveau d’accès. Le Fondateur donne tous les niveaux, dans Niveaux d’accès ou dans L’équipe. Un
            Directeur donne Assistant(e) commercial(e), Conseiller(ère) et Stagiaire, dans Niveaux d’accès, jamais Directeur. Personne
            ne change son propre niveau. Le niveau Fondateur vient du type de compte et ne se donne pas dans l’appli.
          </p>
        </div>
        <div role="note" className="flex gap-3 rounded-2xl bg-[#FCEFD4] p-4 text-sm leading-relaxed text-[#6E4300]">
          <WarningIcon size={20} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="m-0">
            <span className="font-extrabold">{UNLEVELED.title}. </span>
            {levelsEnforced ? UNLEVELED.whenOn : UNLEVELED.whileOff}
          </p>
        </div>
      </section>

      <nav data-enter aria-label="Domaines" className="flex flex-wrap gap-2">
        {AREAS.map((area) => (
          <a
            key={area.id}
            href={`#${area.id}`}
            className="inline-flex min-h-9 items-center rounded-full border border-[#EDE4D8] bg-white px-3 text-sm font-bold text-[#4A4540] hover:border-[#C96A2E] hover:text-[#A8521D]"
          >
            {area.title}
          </a>
        ))}
        <a
          href="#prevu"
          className="inline-flex min-h-9 items-center rounded-full border border-dashed border-[#C9B8A6] bg-white/60 px-3 text-sm font-bold text-[#6B625B] hover:text-[#A8521D]"
        >
          Prévu, pas encore appliqué
        </a>
      </nav>

      {AREAS.map((area) => (
        <section key={area.id} id={area.id} aria-labelledby={`${area.id}-title`} className="flex scroll-mt-28 flex-col gap-3">
          <div>
            <h2 id={`${area.id}-title`} className="m-0 text-xl font-extrabold lg:text-[22px]">
              {area.title}
            </h2>
            <p className="m-0 mt-1 max-w-[72ch] text-sm leading-relaxed text-[#6B625B]">{area.intro}</p>
          </div>
          <div className="hidden lg:block">
            <RuleTable rules={area.rules} viewerLevel={viewerLevel} />
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:hidden">
            {area.rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} viewerLevel={viewerLevel} />
            ))}
          </ul>
        </section>
      ))}

      <section id="devenir-staff" aria-labelledby="devenir-staff-title" className="scroll-mt-28 rounded-2xl border border-[#EDE4D8] bg-white p-5">
        <h2 id="devenir-staff-title" className="m-0 flex items-center gap-2 text-xl font-extrabold">
          <KeyIcon size={22} aria-hidden="true" className="text-[#8A4924]" />
          Comment on devient staff
        </h2>
        <ol className="m-0 mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#4A4540]">
          {STAFF_JOIN.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div role="note" className="mt-4 flex gap-3 rounded-xl bg-[#FCEFD4] p-3.5 text-sm leading-relaxed text-[#6E4300]">
          <WarningIcon size={20} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="m-0">
            <span className="font-extrabold">Le risque. </span>
            {STAFF_JOIN.risk}
          </p>
        </div>
      </section>

      <section aria-labelledby="app-users-title" className="flex flex-col gap-3">
        <h2 id="app-users-title" className="m-0 text-xl font-extrabold">
          Les utilisateurs de l’appli
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
          {APP_USERS.map((user) => (
            <li key={user.name} className="rounded-2xl border border-[#EDE4D8] bg-white p-4 text-sm leading-relaxed text-[#4A4540]">
              <p className="m-0 font-extrabold text-[#1F1A16]">{user.name}</p>
              <p className="m-0 mt-1">{user.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="prevu" aria-labelledby="prevu-title" className="flex scroll-mt-28 flex-col gap-3">
        <div>
          <h2 id="prevu-title" className="m-0 flex items-center gap-2 text-xl font-extrabold">
            <ClockCountdownIcon size={22} aria-hidden="true" className="text-[#8A4924]" />
            Prévu mais pas encore appliqué
          </h2>
          <p className="m-0 mt-1 max-w-[72ch] text-sm leading-relaxed text-[#6B625B]">
            Ces règles sont approuvées mais l’appli ne les applique pas encore. En attendant, chacun s’en tient à la règle prévue. Source :{" "}
            {PLANNED_SOURCE}
          </p>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {PLANNED.map((item) => (
            <li key={item.id} className="rounded-2xl border border-dashed border-[#C9B8A6] bg-white/70 p-4 text-sm leading-relaxed">
              <p className="m-0 font-extrabold">{item.topic}</p>
              <p className="m-0 mt-1.5 text-[#4A4540]">
                <span className="font-bold text-[#1F1A16]">Prévu : </span>
                {item.planned}
              </p>
              <p className="m-0 mt-1 text-[#4A4540]">
                <span className="font-bold text-[#1F1A16]">Aujourd’hui : </span>
                {item.today}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-[#EDE4D8] pt-4 text-xs leading-relaxed text-[#6B625B]">
        <p className="m-0">Dernière revue : {frenchDate(LAST_REVIEWED)}.</p>
        <p className="m-0 mt-1">
          Cette page est générée depuis <span className="font-mono">lib/access/matrix.ts</span>. Un test vérifie qu’elle reste fidèle au
          code : si une règle change dans le code, la page doit changer avec elle.
        </p>
      </footer>
    </div>
  );
}
