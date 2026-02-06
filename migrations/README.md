# Database Migrations

## Apply the Environment Column Migration

The environment filter on the Finances page requires the `environment` column to be added to the `transactions` table.

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `add_environment_to_transactions.sql`
5. Click **Run** to execute the migration
6. Verify the results in the output panel

### Option 2: Supabase CLI

```bash
# Make sure you're in the roogo-web directory
cd /Users/salif/Documents/bf226/roogo-web

# Run the migration
supabase db execute -f migrations/add_environment_to_transactions.sql
```

### What This Migration Does

- ✅ Adds an `environment` column to the `transactions` table
- ✅ Sets all existing transactions to 'sandbox' (for safety)
- ✅ Creates an index for fast filtering
- ✅ Adds a CHECK constraint to only allow 'sandbox' or 'live' values

### After Running the Migration

1. **Refresh the Finances page** - The debug indicator should show "✅ Env OK" with counts
2. **The toggle will now work** - You can filter between All, Sandbox, and Live transactions
3. **Console logs** will show the filter working in the browser dev tools

### Verification

Run this query in SQL Editor to verify:

```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE environment = 'sandbox') as sandbox_count,
  COUNT(*) FILTER (WHERE environment = 'live') as live_count
FROM transactions;
```
