## Backend for Clerk privateMetadata sync

### Stack

- **Next.js (App Router, TypeScript)**
- **@clerk/backend** for token verification and user updates

### Environment

Create a `.env` file based on `.env.example`:

```
CLERK_SECRET_KEY=sk_test_xxx
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

### Verify locally

- `GET /api/health` → `{ ok: true }`
- Test POST with a valid Clerk session token.
