# Staff Setup Guide

To grant a user staff (admin) permissions in Roogo, follow these steps.

## Method 1: Automatic (Recommended)

1.  Ask the user to sign up/in to the web app.
2.  Direct them to `/staff/join`.
3.  Provide them with the `STAFF_REGISTRATION_SECRET` found in your environment variables.
4.  Once they enter the code, the system will automatically:
    *   Update their Clerk `publicMetadata` with `{ "userType": "staff" }`.
    *   Update their role in the Supabase `users` table to `staff`.

## Method 2: Manual (Clerk Dashboard)

1.  Go to the [Clerk Dashboard](https://dashboard.clerk.com).
2.  Select your application and go to **Users**.
3.  Search for the user you want to promote.
4.  Scroll down to the **Metadata** section.
5.  Click **Edit** next to **Public**.
6.  Add or update the following JSON:
    ```json
    {
      "userType": "staff"
    }
    ```
7.  Click **Save**.

## Security Notes

*   **Public Metadata**: Used for fields that need to be read by the frontend but only modified by the backend (like roles/user types).
*   **Private Metadata**: Used for fields that should NOT be visible to the frontend at all (like sensitive internal IDs or internal notes).
*   **Unsafe Metadata**: **DO NOT USE** for permissions. Users can modify this themselves.
