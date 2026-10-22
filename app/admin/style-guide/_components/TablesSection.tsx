import { BuildingsIcon } from "@phosphor-icons/react/dist/ssr";

import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Chip } from "@/components/admin/team/ui";
import type { TaskTone } from "@/lib/team-tasks/core";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/format";
import { GuideSection, GuideSubsection, Mono } from "./primitives";

type ListingStatus = "en_ligne" | "en_attente" | "expired" | "locked" | "finalized";

// Listing statuses as Chips, one colour per meaning (see Badges et statuts).
const STATUS_CHIP: Record<ListingStatus, { label: string; tone: TaskTone }> = {
  en_ligne: { label: "En ligne", tone: "green" },
  en_attente: { label: "En attente", tone: "orange" },
  expired: { label: "Expirée", tone: "grey" },
  locked: { label: "Réservée", tone: "blue" },
  finalized: { label: "Louée", tone: "dark" },
};

type Row = {
  ref: string;
  title: string;
  zone: string;
  rent: number;
  status: ListingStatus;
  updated: string;
};

const rows: Row[] = [
  { ref: "RG-00417", title: "Villa 4 pièces", zone: "Ouaga 2000", rent: 350000, status: "en_ligne", updated: "08/10/2026" },
  { ref: "RG-00412", title: "Studio meublé", zone: "Pissy", rent: 75000, status: "en_attente", updated: "07/10/2026" },
  { ref: "RG-00398", title: "Boutique 24 m²", zone: "Gounghin", rent: 60000, status: "expired", updated: "30/09/2026" },
  { ref: "RG-00391", title: "Appartement 2 pièces", zone: "Koulouba", rent: 120000, status: "locked", updated: "28/09/2026" },
  { ref: "RG-00377", title: "Villa 6 pièces avec piscine", zone: "Ouaga 2000", rent: 1500000, status: "finalized", updated: "21/09/2026" },
];

function ListingRows({ data }: { data: Row[] }) {
  return (
    <>
      {data.map((row) => (
        <TableRow key={row.ref}>
          <TableCell className="font-mono text-xs text-ink-muted">{row.ref}</TableCell>
          <TableCell className="font-semibold text-ink">{row.title}</TableCell>
          <TableCell>{row.zone}</TableCell>
          <TableCell numeric>{formatNumber(row.rent)} F</TableCell>
          <TableCell>
            <Chip tone={STATUS_CHIP[row.status].tone}>{STATUS_CHIP[row.status].label}</Chip>
          </TableCell>
          <TableCell className="text-ink-muted">{row.updated}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

function Head() {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead>Réf.</TableHead>
        <TableHead>Bien</TableHead>
        <TableHead>Zone</TableHead>
        <TableHead numeric>Loyer / mois</TableHead>
        <TableHead>Statut</TableHead>
        <TableHead>Mis à jour</TableHead>
      </TableRow>
    </TableHeader>
  );
}

export function TablesSection() {
  return (
    <GuideSection
      id="tableaux"
      number="09"
      title="Tableaux"
      intro="components/ui/table.tsx: en-tête en surtitre, lignes séparées par un filet chaud, survol crème. Les montants sont alignés à droite avec des chiffres tabulaires, les statuts sont des Chip, et le tableau défile horizontalement sur mobile au lieu de casser la page."
    >
      <GuideSubsection
        title="Standard avec zébrage"
        note="zebra alterne un fond papier une ligne sur deux. Survolez une ligne."
      >
        <Table zebra>
          <Head />
          <TableBody>
            <ListingRows data={rows} />
          </TableBody>
        </Table>
        <p className="text-xs text-ink-muted">
          Colonne numérique: <Mono>{"<TableCell numeric>"}</Mono> ajoute{" "}
          <Mono>text-right font-semibold tabular-nums</Mono>.
        </p>
      </GuideSubsection>

      <GuideSubsection title="Compact" note='density="compact" réduit le padding des cellules de moitié.'>
        <Table density="compact">
          <Head />
          <TableBody>
            <ListingRows data={rows.slice(0, 3)} />
          </TableBody>
        </Table>
      </GuideSubsection>

      <GuideSubsection title="Vide" note="<TableEmpty colSpan> accueille un EmptyState compact avec une action.">
        <Table>
          <Head />
          <TableBody>
            <TableEmpty colSpan={6}>
              <EmptyState
                compact
                icon={<BuildingsIcon size={40} />}
                title="Aucune annonce ne correspond"
                description="Élargissez la zone ou retirez le filtre de statut."
                action={
                  <Button variant="outline" size="sm">
                    Réinitialiser les filtres
                  </Button>
                }
              />
            </TableEmpty>
          </TableBody>
        </Table>
      </GuideSubsection>
    </GuideSection>
  );
}
