import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

// Use service role to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:14',message:'POST request received',data:{},timestamp:Date.now(),hypothesisId:'H1,H2,H3,H4,H5',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    const { userId } = await auth();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:21',message:'Auth result',data:{userId,hasUser:!!userId},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is staff, owner, or founder
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("clerk_id", userId)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:37',message:'User lookup result',data:{hasUser:!!user,userType:user?.user_type,hasError:!!userError,errorCode:userError?.code,errorMessage:userError?.message},timestamp:Date.now(),hypothesisId:'H2',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    if (
      userError ||
      !user ||
      !["staff", "owner", "founder"].includes(user.user_type)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { property_id, date, start_time, end_time, capacity } = body;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:53',message:'Request body parsed',data:{property_id,date,start_time,end_time,capacity,hasPropertyId:!!property_id,hasDate:!!date},timestamp:Date.now(),hypothesisId:'H3,H5',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    if (!property_id || !date || !start_time || !end_time || !capacity) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:64',message:'Before DB insert',data:{property_id,date,start_time,end_time,capacity},timestamp:Date.now(),hypothesisId:'H4,H5',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    const { data, error } = await supabaseAdmin
      .from("open_house_slots")
      .insert({
        property_id,
        date,
        start_time,
        end_time,
        capacity,
      })
      .select()
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:82',message:'DB insert result',data:{success:!error,hasData:!!data,errorCode:error?.code,errorMessage:error?.message,errorDetails:error?.details,errorHint:error?.hint},timestamp:Date.now(),hypothesisId:'H4,H5',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("Error creating slot:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/8d4160e4-1a58-4ce5-b197-c68afdfbc381',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:95',message:'Catch block error',data:{errorMessage:error instanceof Error ? error.message : 'Unknown error',errorName:error instanceof Error ? error.name : 'Unknown'},timestamp:Date.now(),hypothesisId:'H1,H2,H3,H4,H5',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is staff, owner, or founder
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("clerk_id", userId)
      .single();

    if (
      userError ||
      !user ||
      !["staff", "owner", "founder"].includes(user.user_type)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const slotId = searchParams.get("id");

    if (!slotId) {
      return NextResponse.json({ error: "Missing slot ID" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("open_house_slots")
      .delete()
      .eq("id", slotId);

    if (error) {
      console.error("Error deleting slot:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
