export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-1" aria-busy="true" aria-live="polite">
      <p className="sr-only">Chargement des commentaires et des messages</p>
      <div className="h-11 w-72 animate-pulse rounded-full bg-white/70" />
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/70" />
        ))}
      </div>
      <div className="mt-5 h-12 animate-pulse rounded-full bg-white/70" />
      <div className="mt-3 grid gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-[22px] bg-white/70" />
        ))}
      </div>
    </div>
  );
}
