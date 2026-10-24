/**
 * Required and optional marks for the listing form (PRDs « Champs obligatoires
 * bien visibles » and « Champs facultatifs marqués », 2026-10-24). Same
 * convention as the mobile app: a red star for required, a light
 * « (facultatif) » for optional, and one legend line per step.
 */
export function RequiredMark() {
  return <span className="text-red-500"> *</span>;
}

export function OptionalMark() {
  return (
    <span className="text-xs font-medium text-neutral-400"> (facultatif)</span>
  );
}

export function RequiredLegend() {
  return (
    <p className="-mt-4 text-xs font-medium text-neutral-500">
      <span className="text-sm font-bold text-red-500">*</span> Champ obligatoire
    </p>
  );
}
