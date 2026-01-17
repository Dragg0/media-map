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

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Get pending posts with their selected cards
  const { data: pendingPosts, error } = await supabase
    .from("pending_posts")
    .select("*")
    .in("status", ["pending", "approved"])
    .order("scheduled_for", { ascending: true })
    .limit(10);

  if (error) {
    console.error("Failed to fetch pending posts:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending posts" },
      { status: 500 }
    );
  }

  // Fetch card details for each pending post
  const postsWithCards = await Promise.all(
    (pendingPosts || []).map(async (post) => {
      // Fetch selected card
      const { data: selectedCard } = await supabase
        .from("cards")
        .select("*")
        .eq("id", post.selected_card_id)
        .single();

      // Fetch alternative cards
      const { data: alternativeCards } = await supabase
        .from("cards")
        .select("*")
        .in("id", post.alternative_card_ids || []);

      return {
        ...post,
        selected_card: selectedCard,
        alternative_cards: alternativeCards || [],
      };
    })
  );

  return NextResponse.json({ posts: postsWithCards });
}
