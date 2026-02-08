# OTP Tracking Implementation Summary

## Changes Made

### 1. Database Migration
**File:** `supabase/migrations/20260208120000_add_otp_to_transactions.sql`

Added `otp_code` column to the transactions table to store Orange Money OTP codes (preAuthorisationCode) for debugging and cross-referencing with PawaPay.

- Column: `otp_code text`
- Index: `idx_transactions_otp_code` for faster queries
- Purpose: Track which OTP was used for each transaction

### 2. Store OTP in Database
**File:** `app/api/payments/initiate/route.ts`

Updated the transaction insert to include the OTP code:

```typescript
const { error: dbError } = await supabase.from("transactions").insert({
  deposit_id: depositId,
  amount: amount,
  currency: currency,
  status: "pending",
  type: transactionType,
  provider: payerClientCode,
  user_id: user.id,
  property_id: propertyId || null,
  payer_phone: phoneNumber,
  otp_code: preAuthorisationCode || null,  // NEW
  metadata: metadata || {},
});
```

### 3. Prepend OTP to PawaPay Reason Field
**File:** `app/api/payments/initiate/route.ts`

Modified the `customerMessage` to prepend the OTP code when available:

```typescript
const customerMessage = preAuthorisationCode 
  ? `${preAuthorisationCode} ${(description || "Roogo Payment").replace(/[^a-zA-Z0-9\s]/g, "")}`.slice(0, 22)
  : (description || "Roogo Payment")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .slice(0, 22);
```

**Result:** PawaPay transactions will now show as "123456 Roogo Payment" instead of just "Roogo Payment", making cross-referencing much easier.

### 4. Updated TypeScript Types
**File:** `app/admin/finances/actions.ts`

Added `otp_code` field to the `ExtendedTransaction` interface:

```typescript
export interface ExtendedTransaction extends AdminTransactionRow {
  user_name: string;
  property_title: string;
  environment?: "sandbox" | "live";
  otp_code?: string | null;  // NEW
}
```

## Investigation of Failed Payments

### Failed Transactions
Based on the logs provided, three transactions failed:

1. **Identifier:** `22670582834`
   - Deposit IDs:
     - `56e1e956-2a62-4c19-b7e6-c4c9364231db` (failed at 10:32:46)
     - `89d3d3c5-83f1-4947-bb95-df6f2f06f26f` (failed at 10:32:33)
     - `c32a999f-41c9-4b83-a24d-04a9f60cf808` (failed at 10:34:02)

### Key Observations
- All transactions have **NULL Financial Transaction ID** from PawaPay
- This suggests PawaPay rejected the requests **before** creating a transaction
- Amount: 100.00 XOF for all three
- Provider: ORANGE_BFA (Burkina Faso)
- Phone: 22676255784

### Likely Failure Causes
1. **Invalid/Expired OTP:** Orange Money OTPs expire after 15 minutes
2. **Insufficient Balance:** User account may lack funds
3. **Invalid Phone Number:** Format issues (though number appears valid)
4. **PawaPay API Error:** Rejected before transaction creation

### To Debug Further
Run the SQL query to check the `failure_reason` and `metadata` fields:

```sql
SELECT 
  deposit_id,
  created_at,
  status,
  failure_reason,
  provider,
  amount,
  payer_phone,
  metadata::text as metadata_json
FROM transactions 
WHERE deposit_id IN (
  '56e1e956-2a62-4c19-b7e6-c4c9364231db',
  '89d3d3c5-83f1-4947-bb95-df6f2f06f26f',
  'c32a999f-41c9-4b83-a24d-04a9f60cf808'
);
```

The `failure_reason` field should contain PawaPay's error message, and the `metadata` field contains the full PawaPay response with detailed error information.

## Next Steps

1. **Run Database Migration:**
   ```bash
   # Connect to Supabase and run the migration
   psql $DATABASE_URL -f supabase/migrations/20260208120000_add_otp_to_transactions.sql
   ```

2. **Deploy Changes:**
   - Push changes to your repository
   - Vercel will auto-deploy the updated API

3. **Test with Orange Money:**
   - Generate a new OTP: Dial `*144*4*6#`
   - Make a test payment
   - Check PawaPay dashboard - transaction should show OTP in the reason field
   - Check your database - `otp_code` column should contain the OTP

4. **Investigate Failed Transactions:**
   - Run the SQL query provided above
   - Check the `failure_reason` and `metadata` fields
   - Contact PawaPay support if needed with the specific deposit IDs

## Benefits

- **Better Debugging:** See exact OTP used for each transaction
- **Cross-Reference:** Match transactions between our DB and PawaPay dashboard by OTP
- **Audit Trail:** Track which OTP codes were used and when
- **User Support:** Users can tell us their OTP and we can find their transaction immediately
