import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;

  if (!token) return false;

  const supabase = getSupabase();
  const { data: session } = await supabase
    .from("admin_sessions")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  return !!session;
}

export async function GET(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const limit = parseInt(url.searchParams.get("limit") || "20");

  let query = supabase
    .from("cards")
    .select("id, title, slug, year, calibration_sentence, poster_url, genres, media_type")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data: cards, error } = await query;

  if (error) {
    console.error("Failed to fetch cards:", error);
    return NextResponse.json(
      { error: "Failed to fetch cards" },
      { status: 500 }
    );
  }

  return NextResponse.json({ cards: cards || [] });
}
