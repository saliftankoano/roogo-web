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

**Permissions:**

- Create properties
- Update their own properties
- Delete their own properties
- View leads for their properties

## 2. Renter (`renter`)

**Mobile App Users**

- Browse property listings
- Save favorites
- Contact property owners
- Submit lead forms

**Permissions:**

- View all active properties
- Create favorites
- Submit leads
- Update own profile

## 3. Agent (`agent`)

**Mobile App Users**

- Same as `owner` but with professional business profile
- Requires `company_name` and `facebook_url`
- Professional branding on listings

**Permissions:**

- Same as `owner`

## 4. Staff (`staff`)

**Web App Users (Admin Panel)**

- Manage all properties (approve, reject, edit, delete)
- Manage user accounts
- View analytics and reports
- Moderate content
- Handle customer support

**Permissions:**

- Full CRUD on all properties
- Approve/reject pending properties
- Manage all users
- Access admin dashboard
- View system analytics

## Setting User Type

User types are set via Clerk metadata during sign-up:

```typescript
// In Clerk sign-up flow
await clerkUser.update({
  unsafeMetadata: {
    userType: "owner", // or "renter" or "staff"
  },
});
```

For staff users, set this manually in the Clerk dashboard under the user's metadata.

## RLS Policies

Row Level Security policies should be configured to:

- Allow `owner` users to manage their own properties
- Allow `renter` users to view active properties
- Allow `staff` users to manage all properties (bypass most restrictions)

## Important Notes

- Mobile app only handles `owner` and `renter` types
- Staff users should access the web app for admin tasks
- Default type is `renter` if not specified
- User type is synced to Supabase via Clerk webhooks
- User types are consistent between Clerk and Supabase (no mapping/translation)
