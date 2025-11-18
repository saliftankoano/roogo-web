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
