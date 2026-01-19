import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Vercel cron: runs daily at 3 AM UTC
// Add to vercel.json: { "crons": [{ "path": "/api/cron/aggregate-views", "schedule": "0 3 * * *" }] }

export async function GET(request: Request) {
    // Verify cron secret (Vercel sets this header)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin.rpc('aggregate_old_views', {
        days_threshold: 30
    });

    if (error) {
        console.error('Aggregation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as { aggregated_count: number; deleted_count: number }[] | null;

    return NextResponse.json({
        success: true,
        aggregated: result?.[0]?.aggregated_count || 0,
        deleted: result?.[0]?.deleted_count || 0,
        timestamp: new Date().toISOString()
    });
}
