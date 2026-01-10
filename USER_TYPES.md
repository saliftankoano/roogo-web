# User Types in Roogo

This application supports three distinct user types, each with different permissions and capabilities.

## User Types

| User Type | Description                             | Primary Interface |
| --------- | --------------------------------------- | ----------------- |
| `owner`   | Property owners who list properties     | Mobile App        |
| `renter`  | People looking to rent/buy properties   | Mobile App        |
| `agent`   | Real estate agents with company info    | Mobile App        |
| `staff`   | Internal team members with admin access | Web App           |

**Note:** User types are consistent across Clerk metadata and Supabase database - no mapping needed!

## 1. Owner (`owner`)

**Mobile App Users**

- Can create and manage property listings
- Upload property images
- View leads and inquiries
- Manage their own properties

## 2. Renter (`renter`)

**Mobile App Users**

- Browse property listings
- Save favorites
- Contact property owners
- Submit lead forms

## 3. Agent (`agent`)

**Mobile App Users**

- Same as `owner` but with professional business profile
- Requires `company_name` and `facebook_url`
- Professional branding on listings

## 4. Staff (`staff`)

**Web App Users (Admin Panel)**

- Manage all properties (approve, reject, edit, delete)
- Manage user accounts
- View analytics and reports
- Moderate content
- Handle customer support

## Setting User Type (Security)

User types MUST be set via **Public Metadata** for security. This prevents users from changing their own type via the client-side SDK.

```typescript
// In Clerk sign-up flow (Backend / API only)
await clerkUser.update({
  publicMetadata: {
    userType: "owner", // or "renter", "staff", "agent"
  },
});
```

For staff users, this is handled automatically via the `/api/auth/verify-staff-code` route when they enter the secret code.

## RLS Policies

Row Level Security policies should be configured to:

- Allow `owner` users to manage their own properties
- Allow `renter` users to view active properties
- Allow `staff` users to manage all properties (bypass most restrictions)

## Important Notes

- Mobile app handles `owner`, `renter`, and `agent` types.
- Staff users access the web app for admin tasks.
- Default type is `renter` if not specified.
- User type is synced to Supabase via Clerk webhooks.
- **NEVER** use `unsafeMetadata` for `userType` as it can be modified by the user in the browser console.
