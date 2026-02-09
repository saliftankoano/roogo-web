# Founder Access Fix - Feb 8, 2026

## Problem
Founders were getting **403 Forbidden** errors when trying to update property status in the admin panel, even though they have full admin access.

## Root Cause
The authorization checks in property endpoints were only allowing `"staff"` users, not `"founder"` users.

This was inconsistent with other admin endpoints like:
- `app/admin/annonces/[id]/actions.ts` - correctly checks for staff OR founder
- `app/admin/finances/actions.ts` - correctly checks for founders only

## Changes Made

### 1. Property Status Update
**File:** `app/api/properties/[id]/status/route.ts`

**Before:**
```typescript
if (
  userError ||
  !user ||
  !["staff"].includes(user.user_type)
) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**After:**
```typescript
if (
  userError ||
  !user ||
  !["staff", "founder"].includes(user.user_type)
) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### 2. Property Creation
**File:** `app/api/properties/route.ts`

**Before:**
```typescript
const isStaff = user.user_type === "staff";
if (user.user_type !== "owner" && !isStaff) {
  return errorResponse("Only property owners or staff can create listings", 403, req);
}
```

**After:**
```typescript
const isStaffOrFounder = user.user_type === "staff" || user.user_type === "founder";
if (user.user_type !== "owner" && !isStaffOrFounder) {
  return errorResponse("Only property owners, staff, or founders can create listings", 403, req);
}
```

## Access Matrix After Fix

| Action | Owner | Agent | Renter | Staff | Founder |
|--------|-------|-------|--------|-------|---------|
| Create property | ✅ | ❌ | ❌ | ✅ | ✅ |
| Update property status | ❌ | ❌ | ❌ | ✅ | ✅ |
| View all transactions | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage agents | ❌ | ❌ | ❌ | ❌ | ✅ |

## Testing
After deployment, verify that founders can:
1. Update property status (En attente → En ligne, etc.)
2. Create properties on behalf of others (for testing)
3. Access all admin functions without 403 errors

## Deployment
Changes will take effect immediately after:
```bash
git push
```

Vercel will auto-deploy within 1-2 minutes.
