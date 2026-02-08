# Payment Failure Debugging Guide

## Overview
This guide explains how to investigate payment failures and what information is now tracked.

## What's Now Tracked

### 1. OTP Codes
- **Column:** `transactions.otp_code`
- **Purpose:** Track which Orange Money OTP was used
- **Usage:** Cross-reference with PawaPay dashboard

### 2. Detailed Failure Reasons
- **Column:** `transactions.failure_reason`
- **Content:** Detailed error from PawaPay including:
  - Error code (e.g., `INSUFFICIENT_FUNDS`, `INVALID_OTP`)
  - Error message (human-readable description)
  - Full PawaPay response

### 3. Complete Metadata
- **Column:** `transactions.metadata` (JSONB)
- **Content:** Full PawaPay response including all details

## How to Debug Failed Payments

### Step 1: Find the Transaction
```sql
-- By deposit_id (from logs)
SELECT * FROM transactions WHERE deposit_id = 'your-deposit-id-here';

-- By OTP code (user tells you their OTP)
SELECT * FROM transactions WHERE otp_code = '123456';

-- By phone number
SELECT * FROM transactions WHERE payer_phone LIKE '%76255784%' ORDER BY created_at DESC;

-- Recent failures
SELECT 
  deposit_id,
  created_at,
  status,
  failure_reason,
  otp_code,
  amount,
  provider,
  payer_phone
FROM transactions 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 20;
```

### Step 2: Get Failure Details
```sql
SELECT 
  deposit_id,
  created_at,
  status,
  failure_reason,
  otp_code,
  provider,
  amount,
  payer_phone,
  metadata->'failureReason' as pawa_failure_details,
  metadata->'details'->'failureReason' as nested_failure,
  metadata
FROM transactions 
WHERE deposit_id = 'your-deposit-id-here';
```

### Step 3: Cross-Reference with PawaPay
1. Go to PawaPay dashboard
2. Search by:
   - **Identifier/OTP**: Look for transactions starting with the OTP code (e.g., "123456 Roogo Payment")
   - **Financial Transaction ID**: Use the ID from `metadata.financialTransactionId`
   - **Phone Number**: Search by payer phone

## Common Failure Reasons

### 1. Invalid or Expired OTP
**Error Code:** `INVALID_PREAUTHORISATION_CODE` or `EXPIRED_OTP`
**Solution:** 
- OTPs expire after 15 minutes
- User must generate a new OTP by dialing `*144*4*6#`
- Verify OTP is 6 digits

### 2. Insufficient Balance
**Error Code:** `INSUFFICIENT_FUNDS`
**Solution:**
- User needs to top up their Orange Money account
- Check minimum balance requirements

### 3. Invalid Phone Number
**Error Code:** `INVALID_PHONE_NUMBER` or `INVALID_MSISDN`
**Solution:**
- Verify phone number format: `22676255784` (country code + 8 digits)
- Check if number is registered with Orange Money
- Confirm number is not blacklisted

### 4. Transaction Not Found (NULL Financial Transaction ID)
**Symptoms:**
- `metadata.financialTransactionId` is NULL
- PawaPay shows failure immediately
- No transaction created in PawaPay system

**Causes:**
- PawaPay rejected the request before processing
- Usually due to invalid parameters or authentication issues
- Check `failure_reason` for specific error

### 5. Rate Limiting
**Error Code:** `RATE_LIMIT_EXCEEDED`
**Solution:**
- Wait a few minutes before retrying
- Check if user is making too many attempts

## Investigation Checklist for Failed Payments

- [ ] Get the `deposit_id` from logs or user
- [ ] Query database to get full transaction record
- [ ] Check `failure_reason` column for error details
- [ ] Check `metadata` column for full PawaPay response
- [ ] Verify `otp_code` was provided (for Orange Money)
- [ ] Check if OTP has expired (compare created_at with current time)
- [ ] Verify phone number format
- [ ] Check PawaPay dashboard using OTP or Financial Transaction ID
- [ ] Review Vercel logs for any server errors during initiation
- [ ] Verify user has sufficient balance (if possible)

## SQL Query Template for Support

```sql
-- Use this when a user reports a failed payment
SELECT 
  t.deposit_id,
  t.created_at,
  t.status,
  t.failure_reason,
  t.otp_code,
  t.provider,
  t.amount,
  t.currency,
  t.payer_phone,
  t.type as transaction_type,
  u.full_name as user_name,
  u.email as user_email,
  u.phone_number as user_registered_phone,
  p.title as property_title,
  t.metadata
FROM transactions t
LEFT JOIN users u ON t.user_id = u.id
LEFT JOIN properties p ON t.property_id = p.id
WHERE 
  t.otp_code = 'USER_PROVIDED_OTP'  -- User tells you their OTP
  OR t.deposit_id = 'DEPOSIT_ID_FROM_LOGS'  -- From your logs
ORDER BY t.created_at DESC
LIMIT 5;
```

## Specific Investigation: Recent Failures (Feb 8, 2026)

The 3 failed transactions mentioned:
- `56e1e956-2a62-4c19-b7e6-c4c9364231db`
- `89d3d3c5-83f1-4947-bb95-df6f2f06f26f`
- `c32a999f-41c9-4b83-a24d-04a9f60cf808`

**To investigate, run:**

```sql
SELECT 
  deposit_id,
  created_at,
  status,
  failure_reason,
  otp_code,
  provider,
  amount,
  payer_phone,
  metadata::text as full_metadata
FROM transactions 
WHERE deposit_id IN (
  '56e1e956-2a62-4c19-b7e6-c4c9364231db',
  '89d3d3c5-83f1-4947-bb95-df6f2f06f26f',
  'c32a999f-41c9-4b83-a24d-04a9f60cf808'
);
```

Look for:
- What's in the `failure_reason` field
- What's in the `metadata` field (contains full PawaPay response)
- Whether `otp_code` is NULL (these payments were made before the OTP tracking was added)

## Enhanced Error Logging

All payment endpoints now log detailed error information:

### Initiate Route
- Logs full error details when transaction insert fails
- Logs detailed PawaPay error responses
- Captures error codes, hints, and messages

### Callback Route
- Logs detailed failure reasons when transaction not found
- Logs full PawaPay payload for debugging
- Returns 200 OK even if transaction not found (prevents PawaPay retries)

### Status Route
- Logs error codes and details when querying fails
- Helps identify database vs PawaPay issues
