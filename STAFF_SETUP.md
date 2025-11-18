# Setting Up Staff Users

Staff users have admin access to manage all properties and users through the web app.

## How to Create a Staff User

### Option 1: Via Clerk Dashboard (Recommended)

1. Go to your Clerk Dashboard
2. Navigate to **Users**
3. Select the user you want to make staff
4. Click on **Metadata** tab
5. Add to `unsafeMetadata`:
   ```json
   {
     "userType": "staff"
   }
   ```
6. Save changes
7. The webhook will automatically sync this to Supabase with `user_type = 'staff'`

### Option 2: During Sign-Up (Web App)

In your web app sign-up flow:

```typescript
await clerkUser.update({
  unsafeMetadata: {
    userType: "staff",
  },
});
```

### Option 3: Manually in Supabase (Not Recommended)

You can manually update an existing user in Supabase:

```sql
UPDATE users
SET user_type = 'staff'
WHERE email = 'admin@example.com';
```

**Warning:** This won't update Clerk. The webhook will overwrite this on the next Clerk user update.

## Staff Permissions

Staff users can:

- ✅ View all properties (regardless of status)
- ✅ Create properties for any agent
- ✅ Edit any property
- ✅ Delete any property
- ✅ Approve/reject pending properties
- ✅ View all users
- ✅ Update user profiles
- ✅ Delete property images
- ✅ Access admin dashboard

## Testing

To test staff permissions:

1. Create a test staff user in Clerk
2. Set `userType: "staff"` in metadata
3. Wait for webhook to sync
4. Log in to web app
5. Verify you can access admin features

## Security Notes

- Staff users bypass most RLS restrictions
- Only assign staff role to trusted team members
- Monitor staff actions via audit logs
- Consider implementing an activity log for staff actions
- Use `privateMetadata` instead of `unsafeMetadata` for production (requires Clerk backend API)
