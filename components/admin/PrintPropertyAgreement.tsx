"use client";
import { Button } from "@/components/ui/Button";
export function PrintPropertyAgreement() {
  return (
    <div className="print:hidden">
      <Button onClick={() => window.print()}>
        Imprimer / enregistrer en PDF
      </Button>
    </div>
  );
}
