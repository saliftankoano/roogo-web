# Payment Failure Tracking Improvements - Feb 8, 2026

## Problem Statement
Payment failures were difficult to debug because:
1. OTP codes were not stored in the database
2. PawaPay dashboard transactions couldn't be easily cross-referenced
3. Failure reasons were not being captured with full details
4. No audit trail for debugging with users

## Solutions Implemented

### 1. OTP Tracking in Database
**Migration:** `supabase/migrations/20260208120000_add_otp_to_transactions.sql`

Added `otp_code` column to store Orange Money OTP codes:
- Enables cross-referencing with PawaPay dashboard
- Users can tell us their OTP and we can find their transaction immediately
- Creates audit trail for debugging

**Files Modified:**
- `app/api/payments/initiate/route.ts` - Store OTP when creating transaction
- `app/admin/finances/actions.ts` - Added OTP to TypeScript types

### 2. OTP in PawaPay Reason Field
**File:** `app/api/payments/initiate/route.ts`

Modified `customerMessage` sent to PawaPay to include OTP:
- **Before:** "Roogo Payment"
- **After:** "123456 Roogo Payment" (when OTP is provided)

This makes it easy to find transactions in PawaPay dashboard by searching for the OTP code.

### 3. Enhanced Failure Reason Capture

#### In Callback Route (`app/api/pawapay/callback/route.ts`)
When PawaPay sends failure notifications:
- Captures full failure object (not just a string)
- Stores structured error information
- Logs complete payload when transaction not found

**Before:**
```typescript
failure_reason: failureReason || null
```

**After:**
```typescript
// Extract detailed failure information
let detailedFailureReason = null;
if (dbStatus === "failed" && failureReason) {
  if (typeof failureReason === 'object') {
    detailedFailureReason = JSON.stringify(failureReason);
  } else {
    detailedFailureReason = String(failureReason);
  }
}
// ... then store detailedFailureReason
```

#### In Initiate Route (`app/api/payments/initiate/route.ts`)
When PawaPay API call fails immediately:
- Extracts error code and message from nested response
- Formats as: "ERROR_CODE: Human readable message"
- Stores full response in metadata

**Before:**
```typescript
failure_reason: result.message || "API call failed"
```

**After:**
```typescript
let detailedFailure = result.message || "API call failed";
if (result.details?.failureReason) {
  const fr = result.details.failureReason;
  detailedFailure = `${fr.failureCode || 'ERROR'}: ${fr.failureMessage || result.message || 'Unknown error'}`;
} else if (result.details?.errorMessage) {
  detailedFailure = result.details.errorMessage;
}
```

### 4. Improved Error Logging

#### Transaction Insert Failures
Now logs complete error details:
- Error code
- Error details
- Error hints
- User ID, amount, provider

This helps identify database issues vs payment provider issues.

#### Callback Handling
When transaction not found:
- Logs full PawaPay payload
- Returns 200 OK to prevent retries
- Includes warning message

#### Status Route
Enhanced error logging for query failures.

## How to Use This System

### For Support/Debugging
1. **User reports failed payment:**
   - Ask for their OTP code
   - Query: `SELECT * FROM transactions WHERE otp_code = 'their-otp'`

2. **Analyzing failures:**
   - Check `failure_reason` column for human-readable error
   - Check `metadata` column for full PawaPay response
   - Cross-reference with PawaPay dashboard using OTP

3. **Finding patterns:**
   ```sql
   -- Most common failure reasons
   SELECT 
     failure_reason, 
     COUNT(*) as occurrences,
     provider
   FROM transactions 
   WHERE status = 'failed' 
     AND created_at > NOW() - INTERVAL '7 days'
   GROUP BY failure_reason, provider
   ORDER BY occurrences DESC;
   ```

### For Development
1. **Testing:**
   - Generate OTP: `*144*4*6#`
   - Make payment with invalid OTP to test failure handling
   - Verify `failure_reason` is populated

2. **Monitoring:**
   - Check Vercel logs for detailed error information
   - All errors now include context for debugging

## Investigating Recent Failures (Feb 8, 10:32-10:34)

Three transactions failed with identifier `22670582834`:
- Deposit IDs: 
  - `56e1e956-2a62-4c19-b7e6-c4c9364231db`
  - `89d3d3c5-83f1-4947-bb95-df6f2f06f26f`
  - `c32a999f-41c9-4b83-a24d-04a9f60cf808`

**To diagnose, run:**
```sql
SELECT 
  deposit_id,
  created_at,
  status,
  failure_reason,
  otp_code,
  amount,
  provider,
  payer_phone,
  metadata->'failureReason' as pawa_failure,
  metadata
FROM transactions 
WHERE deposit_id IN (
  '56e1e956-2a62-4c19-b7e6-c4c9364231db',
  '89d3d3c5-83f1-4947-bb95-df6f2f06f26f',
  'c32a999f-41c9-4b83-a24d-04a9f60cf808'
);
```

**Expected Results:**
- `failure_reason`: Should contain error like "INVALID_OTP: The provided OTP is invalid or expired"
- `metadata`: Should contain full PawaPay response
- `otp_code`: May be NULL if these were made before OTP tracking

## Next Actions

1. **Deploy Changes:**
   ```bash
   git add .
   git commit -m "Add OTP tracking and enhanced payment failure logging"
   git push
   ```

2. **Run Migration:**
   - Supabase will auto-run the migration, or
   - Manually run via Supabase dashboard

3. **Test:**
   - Make a test payment with Orange Money
   - Verify OTP appears in database and PawaPay dashboard
   - Test with expired OTP to verify failure logging

4. **Investigate Failed Transactions:**
   - Run the SQL query above
   - Check PawaPay dashboard
   - Document findings

## Benefits

✅ **Better Debugging:** Full error details captured  
✅ **Easy Cross-Reference:** OTP in both DB and PawaPay  
✅ **User Support:** Quick lookup by OTP code  
✅ **Audit Trail:** Complete record of all payment attempts  
✅ **Pattern Analysis:** Identify common failure reasons
