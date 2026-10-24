import { Suspense } from "react";
import { PublishVideo } from "./PublishVideo";

export const metadata = { title: "Publier une vidéo | Studio" };

// Studio › Publier (PRD 2 and 3, approved 2026-10-23). Access: studio.use
// (app/admin/studio/layout.tsx); every route checks staff or founder again,
// and only a founder can « Valider ».
export default function PublishVideoPage() {
  return (
    <Suspense fallback={null}>
      <PublishVideo />
    </Suspense>
  );
}
