export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-1" aria-busy="true" aria-live="polite">
      <p className="sr-only">Chargement des statistiques</p>
      <div className="h-11 w-72 animate-pulse rounded-full bg-white/70" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[24px] bg-white/70" />
        <div className="h-64 animate-pulse rounded-[24px] bg-white/70" />
      </div>
      <div className="mt-4 h-96 animate-pulse rounded-[24px] bg-white/70" />
    </div>
  );
}
