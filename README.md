## Backend for Clerk privateMetadata sync

### Stack

- **Next.js (App Router, TypeScript)**
- **@clerk/backend** for token verification and user updates

### Environment

Create a `.env` file with the following variables:

```
# Clerk Configuration
CLERK_SECRET_KEY=sk_test_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Supabase Configuration (use either naming convention)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Or use these variable names (both work):
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# CORS Configuration
CORS_ORIGIN=http://localhost:19006
```

### Development

```bash
npm install
npm run dev
```

Local server runs at `http://localhost:3000`.

### Endpoints

- **GET `/api/health`** → `{"ok": true}`

- **POST `/api/clerk/users/me/metadata`**
  - **Headers**: `Authorization: Bearer <Clerk session token>`, `Content-Type: application/json`
  - **Body**:
    ```json
    { "privateMetadata": { "userType": "agent" } }
    ```
  - **Responses**:
    - `200` → `{ "ok": true }`
    - `400/401` → `{ "error": "message" }`
  - **CORS**: Allows `POST, OPTIONS`, headers `Content-Type, Authorization`, origin `CORS_ORIGIN`.

- **POST `/api/clerk/webhook`**
  - **Headers**: `svix-id`, `svix-timestamp`, `svix-signature` (from Clerk webhooks)
  - **Body**: Clerk webhook payload
  - **Purpose**: Automatically syncs user data between Clerk and Supabase
  - **Events**: `user.created`, `user.updated`, `user.deleted`
  - **User Type Mapping**:
    - Clerk `"owner"` → Supabase `"agent"`
    - Clerk `"renter"` → Supabase `"buyer"`
  - **Security**: Uses `svix` library to verify webhook signatures

### Security

- Uses `CLERK_SECRET_KEY` server-side only.
- Validates payload; only `privateMetadata.userType` of `agent` or `regular` is accepted.

### Client Contract (Expo)

Call after signup/SSO:

```http
POST {EXPO_PUBLIC_API_URL}/api/clerk/users/me/metadata
Authorization: Bearer <token>
Content-Type: application/json

{ "privateMetadata": { "userType": "agent" } }
```

### Webhook Setup

1. **Configure Clerk Webhook**:
   - Go to your Clerk Dashboard → Webhooks
   - Create a new webhook endpoint: `https://your-domain.com/api/clerk/webhook`
   - Select events: `user.created`, `user.updated`, `user.deleted`
   - Copy the webhook signing secret to `CLERK_WEBHOOK_SECRET`

2. **Supabase Configuration**:
   - Get your Supabase URL and service role key from your project settings
   - Add them to your `.env` file

3. **Test Webhook**:
   - Create a test user in Clerk
   - Check your Supabase `users` table for the new record
   - Update user details in Clerk and verify sync

### Verify locally

- `GET /api/health` → `{ ok: true }`
- Test POST with a valid Clerk session token.
- Test webhook by creating/updating users in Clerk Dashboard.

## Payment Testing Scenarios (Web + Mobile)

Use this section as the source of truth when testing payments locally.

### Where each variable lives

- **Backend repo (`roogo-web/.env.local`)** controls payment provider mode:
  - `PAWAPAY_LOCAL_MODE=sandbox|live`
  - `DEV_PRICING_OVERRIDE=true|false`
- **Mobile repo (`roogo/.env.local`)** controls mobile UI pricing display + backend target:
  - `EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000`
  - `EXPO_PUBLIC_DEV_PRICING_OVERRIDE=true|false`

### Important behavior

- Mobile app always pays through backend routes, so **sandbox vs live is decided by backend env**.
- `DEV_PRICING_OVERRIDE` changes pricing response used for payment amount calculation in local testing.
- After changing env vars, **restart dev servers** (`roogo-web` and mobile app packager).

### Scenario Matrix

#### 1) Sandbox + Normal Pricing

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=sandbox
DEV_PRICING_OVERRIDE=false
```

Result:
- PawaPay sandbox
- normal pricing locally
- no real money charged

#### 2) Sandbox + Dev Pricing

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=sandbox
DEV_PRICING_OVERRIDE=true
```

Result:
- PawaPay sandbox
- lowered local test pricing
- no real money charged

#### 3) Live + Dev Pricing (recommended low-cost real flow test)

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=live
DEV_PRICING_OVERRIDE=true
```

Result:
- PawaPay live
- lowered local test pricing (for example 100 XOF)
- real money charged with low cost

#### 4) Live + Normal Pricing

Backend (`roogo-web/.env.local`):

```bash
PAWAPAY_LOCAL_MODE=live
DEV_PRICING_OVERRIDE=false
```

Result:
- PawaPay live
- normal pricing locally
- real money charged at normal price

### Mobile-specific checklist

In `roogo/.env.local`:

```bash
EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:3000
EXPO_PUBLIC_DEV_PRICING_OVERRIDE=true
```

Notes:
- `EXPO_PUBLIC_API_URL` must point to your local backend when testing from a physical device.
- Mobile `EXPO_PUBLIC_DEV_PRICING_OVERRIDE` changes what user sees in mobile UI, but payment environment still comes from backend `PAWAPAY_LOCAL_MODE`.
