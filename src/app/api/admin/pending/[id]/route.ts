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

// GET: Fetch a single pending post with full card data
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabase();

  const { data: post, error } = await supabase
    .from("pending_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

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

  return NextResponse.json({
    ...post,
    selected_card: selectedCard,
    alternative_cards: alternativeCards || [],
  });
}

// PATCH: Update pending post (change selected card, approve, skip)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();

  // Validate the post exists
  const { data: existingPost, error: fetchError } = await supabase
    .from("pending_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existingPost) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Build update object
  const updates: Record<string, unknown> = {};

  if (body.selected_card_id) {
    updates.selected_card_id = body.selected_card_id;
  }

  if (body.status) {
    updates.status = body.status;
    if (body.status === "approved") {
      updates.approved_at = new Date().toISOString();
      updates.approved_via = "admin";
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updatedPost, error: updateError } = await supabase
    .from("pending_posts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to update pending post:", updateError);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedPost);
}
