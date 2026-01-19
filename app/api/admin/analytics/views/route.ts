import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = parseInt(searchParams.get('limit') || '5');

    // 1. Get Trending Properties (using RPC)
    const { data: trending, error: trendingError } = await supabaseAdmin.rpc('get_trending_properties', {
      hours_window: hours,
      result_limit: limit,
    });

    if (trendingError) {
      console.error("Error fetching trending:", trendingError);
      throw trendingError;
    }

    // Enhance trending data with property details
    const enhancedTrending = await Promise.all(
      (trending || []).map(async (item: { property_id: string; view_count: number; unique_viewers: number }) => {
        const { data: prop } = await supabaseAdmin
          .from('properties')
          .select('title, price, address, property_images(url)')
          .eq('id', item.property_id)
          .single();

        let imageUrl = null;
        if (prop?.property_images && Array.isArray(prop.property_images) && prop.property_images.length > 0) {
           imageUrl = (prop.property_images[0] as { url: string }).url;
        }

        return {
          ...item,
          title: prop?.title || 'Unknown Property',
          price: prop?.price || 0,
          address: prop?.address || '',
          imageUrl
        };
      })
    );

    // 2. Get Overall View Stats (Last 30 days daily counts)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: dailyStats, error: statsError } = await supabaseAdmin
      .from('property_views_daily')
      .select('view_date, total_views, unique_viewers')
      .gte('view_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('view_date', { ascending: true });

    if (statsError) console.error("Error fetching daily stats:", statsError);

    // 3. Get Recent Platform Breakdown (Last 24h from raw table)
    const { data: platforms } = await supabaseAdmin
      .from('property_views')
      .select('device_platform')
      .gte('viewed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    const platformBreakdown = platforms?.reduce((acc: Record<string, number>, curr: { device_platform: string | null }) => {
      const p = curr.device_platform || 'unknown';
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    // 4. Get Geographic Stats (Top cities last 30 days)
    const { data: geoStats } = await supabaseAdmin
       .from('property_views_geo_daily')
       .select('viewer_city, view_count')
       .gte('view_date', thirtyDaysAgo.toISOString().split('T')[0]);
       
    const cityStats: Record<string, number> = {};
    if (geoStats) {
        geoStats.forEach((row: { viewer_city: string | null; view_count: number }) => {
            const city = row.viewer_city || 'Unknown';
            cityStats[city] = (cityStats[city] || 0) + row.view_count;
        });
    }
    
    const topCities = Object.entries(cityStats)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return NextResponse.json({
      trending: enhancedTrending,
      dailyStats: dailyStats || [],
      platformBreakdown,
      topCities
    });
    
  } catch (error) {
    console.error("Analytics API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
