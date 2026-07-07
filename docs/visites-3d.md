# Visites 3D — service, réservation & services externes

Service de scan 3D à domicile (visites virtuelles Kuula), migré du site Kazedra vers Roogo en juillet 2026. Page publique : `/visites-3d` (marketing + réservation self-serve avec paiement Mobile Money obligatoire).

---

## Tarification

**Tarif unique : 15 000 FCFA / pièce** (aucun minimum, pas de formule ni de réduction).

- Unité : par pièce (espace à capturer — chambre, salon, salle, bar, zone privée…).
- Le total est calculé dynamiquement à la réservation selon le nombre de pièces saisi par le client.
- Zone couverte : **Ouagadougou uniquement**. Hors zone (ex. Bobo-Dioulasso) → traitement bespoke par l'équipe avec frais de déplacement (CTA "nous contacter" sur la page).
- Paiement : **Mobile Money (Orange ou Moov) au moment de la réservation**, via PawaPay. Le créneau est maintenu 8 minutes pendant le paiement ; passé ce délai sans confirmation, il redevient disponible.
- Livrable : lien Kuula hébergé, accessible sans installation, partageable sans limite.

Le tarif vit dans `lib/visites-3d.ts` (`PRICE_PER_ROOM = 15_000`, `computePrice(roomCount)`). Le serveur recalcule systématiquement le montant à partir du `room_count` validé côté API — le client ne fournit jamais le total.

---

## Créneaux horaires

Blocs de 2 heures, tous les jours, entre 7h et 17h : 07:00–09:00, 09:00–11:00, 11:00–13:00, 13:00–15:00, 15:00–17:00.

Définis dans `lib/visites-3d.ts` (`SLOTS`) **et** dans le `check` SQL (`supabase/migrations/045_visites_3d_bookings.sql`). Toute modification doit être appliquée aux deux endroits.

---

## Supabase — table `bookings`

La table `bookings` (dédiée aux visites 3D — rien à voir avec `open_house_bookings` / `daily_booking_requests`) a été créée à l'origine par les migrations du repo kazedra sur **ce même projet Supabase**. La migration `045_visites_3d_bookings.sql` reproduit son état final (idempotent) et supprime la colonne `with_roogo` (ancien tarif duo abandonné).

Points importants :

- Colonnes : id, date, slot, name, company, phone, email, address, room_count, total_amount, notes, status, payment_deposit_id, payment_status, payment_provider, held_until, created_at.
- Index unique partiel `bookings_active_slot_uniq` sur `(date, slot)` où `status <> 'cancelled'` — source de vérité contre les double-réservations.
- Index unique `bookings_payment_deposit_id_uniq` — un depositId PawaPay ne peut matcher qu'une ligne (critique pour le routage du webhook partagé).
- Vue `booking_slots_view` (date, slot) — lecture seule pour le rôle `anon` (requête de disponibilité, sans PII).
- RLS active, accès refusé — seules les routes API (service role) écrivent.

### Statuts

- `pending_payment` — réservation créée, en attente de PawaPay. Bloque le créneau tant que `held_until > now()` (8 min).
- `confirmed` — paiement réussi, réservation active.
- `cancelled` — n'occupe plus le créneau (échec, expiration, annulation). Re-réservable.
- `completed` — la visite a eu lieu.

---

## Routes API

- `GET /api/visites-3d/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` — disponibilité (lecture anon de la vue).
- `POST /api/visites-3d/initiate` — valide le formulaire, nettoie les holds expirés, insère `pending_payment` avec `held_until=now()+8min`, appelle PawaPay `/v2/deposits`, renvoie `{ depositId }`. Rate-limité (paymentLimiter). 409 `slot_taken` si collision.
- `POST /api/visites-3d/status` — poll client (3 s × 20). DB d'abord (court-circuit terminal), sinon `GET /v2/deposits/{id}` + synchronisation.
- **Webhook** : les visites 3D partagent `POST /api/pawapay/callback` avec les transactions loyer/annonces. Le handler cherche d'abord dans `transactions` ; si introuvable, il bascule sur `bookings` via `lib/visit3d-callback.ts` (les depositId sont uniques dans les deux tables — pas de collision possible). Sur `COMPLETED` frais : SMS client + équipe, event PostHog `visit3d_payment_completed`.
- SMS non-bloquant : le poll et le webhook peuvent tous deux détecter le `COMPLETED` ; chacun n'envoie le SMS que si l'état précédent n'était pas déjà `completed`.

Toutes les routes `/api/visites-3d/*` et la page `/visites-3d` sont publiques (`middleware.ts` → `isPublicRoute`).

---

## PawaPay

Même compte marchand que le reste de Roogo (config via `lib/pawapay-config.ts`, mode sandbox/live via `PAWAPAY_LOCAL_MODE`, prod force le live). Numéros de test : `docs/pawapay-test-numbers.md`.

**Orange Money — pré-autorisation obligatoire** : le client compose `*144*4*6#` pour obtenir un code, saisi dans le modal de paiement (`preAuthorisationCode` joint à `/v2/deposits`). Moov : simple confirmation USSD.

Côté dashboard PawaPay, l'URL de webhook doit pointer sur `https://www.roogobf.com/api/pawapay/callback` (l'ancienne URL kazedra.com est obsolète depuis la migration).

### Hold de 8 minutes

Assez long pour taper le code USSD, assez court pour libérer les créneaux abandonnés sans cron. Auto-nettoyage dans `/api/visites-3d/initiate` : avant chaque INSERT, toute ligne `pending_payment` expirée est flippée en `cancelled`. Si des holds s'accumulent en trafic faible, envisager un cron qui exécute le même UPDATE toutes les 5 minutes.

---

## Africa's Talking — SMS

SDK npm `africastalking`, helper `lib/africastalking.ts`. Le SDK route selon `AT_USERNAME` : `sandbox` = aucun SMS réel ; username live = SMS facturés (~0,052 USD/SMS au Burkina, ≈ 2 SMS soit ~0,10 USD par réservation). Le helper logge le mode actif et avertit si la combinaison `NODE_ENV`/username paraît suspecte.

Variables : `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` (optionnel), `TEAM_PHONE` (+226XXXXXXXX, notifications équipe).

Templates (sans accents — encodage GSM-7, évite le split en 2 SMS) :

- Client : `Roogo a confirme votre visite 3D le {date} a {slot}. Nous vous appellerons la veille pour finaliser l'acces au bien. Merci !`
- Équipe : `Nouvelle reservation 3D: {nom} ({societe}) / {tel} / {date} {slot} / {adresse} / {tarif}`

Un échec SMS ne bloque jamais la confirmation (paiement déjà encaissé, ligne déjà `confirmed`) — erreurs loggées, rattrapage manuel via Supabase.

---

## Kuula — hébergement des visites

- Collection de démonstration embarquée sur `/visites-3d` : `https://kuula.co/share/collection/7MDZD?logo=1&info=1&fs=1&vr=0&thumbs=1&inst=fr`
- Intégration `<iframe>` (plus sûr que le `<script>` officiel dans Next.js). Le composant `components/virtual-tour/KuulaEmbed.tsx` sert aux visites par annonce.
- À surveiller : limites du plan gratuit (nombre de scans, résolution) — passer sur un plan payant avant d'y arriver.
