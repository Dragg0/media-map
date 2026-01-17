import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPostPreviewEmail } from "@/lib/email";
import crypto from "crypto";

type PostSlot = "morning" | "afternoon" | "evening";

const PRESTIGE_GENRES = [
  "Drama",
  "Crime",
  "Thriller",
  "Mystery",
  "War",
  "History",
  "Documentary",
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) {
    return true;
  }
  return false;
}

async function getTmdbPopularity(
  tmdbId: number,
  mediaType: string
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` } }
    );
    const data = await res.json();
    return data.popularity || 0;
  } catch {
    return 0;
  }
}

// Get scheduled post time based on slot (in UTC)
function getScheduledTime(slot: PostSlot): Date {
  const now = new Date();
  const scheduled = new Date(now);

  // Set to today's scheduled time in UTC
  switch (slot) {
    case "morning":
      scheduled.setUTCHours(15, 0, 0, 0); // 3pm UTC = 10am EST
      break;
    case "afternoon":
      scheduled.setUTCHours(18, 0, 0, 0); // 6pm UTC = 1pm EST
      break;
    case "evening":
      // Evening is 1am UTC next day
      scheduled.setUTCHours(25, 0, 0, 0); // This will roll over to next day 1am
      break;
  }

  return scheduled;
}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Parse slot from query params
    const url = new URL(request.url);
    const slot = (url.searchParams.get("slot") as PostSlot) || "afternoon";
    console.log(`[Prepare] Preparing ${slot} post preview`);

    // Get cards eligible for posting (haven't been posted in 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: cards, error } = await supabase
      .from("cards")
      .select("*")
      .not("calibration_sentence", "is", null)
      .not("slug", "is", null)
      .or(
        `last_posted_at.is.null,last_posted_at.lt.${thirtyDaysAgo.toISOString()}`
      )
      .limit(50);

    if (error || !cards || cards.length === 0) {
      console.log("[Prepare] No eligible cards found");
      return NextResponse.json({ message: "No eligible cards to post" });
    }

    // Filter cards based on slot
    let filteredCards = cards;

    if (slot === "morning") {
      // Morning: Classic titles (released before 2015)
      filteredCards = cards.filter((card) => {
        const year = parseInt(card.year);
        return !isNaN(year) && year < 2015;
      });
      console.log(
        `[Prepare] Morning slot: ${filteredCards.length} classic titles found`
      );
    } else if (slot === "evening") {
      // Evening: Prestige genres
      filteredCards = cards.filter((card) => {
        const genres = card.genres || [];
        return genres.some((g: string) => PRESTIGE_GENRES.includes(g));
      });
      console.log(
        `[Prepare] Evening slot: ${filteredCards.length} prestige titles found`
      );
    }

    // Fall back to all cards if slot filter yields nothing
    if (filteredCards.length === 0) {
      console.log(
        `[Prepare] No cards for ${slot} slot, falling back to all eligible cards`
      );
      filteredCards = cards;
    }

    // Get popularity scores
    const cardsWithPopularity = await Promise.all(
      filteredCards.map(async (card) => {
        const popularity = card.tmdb_id
          ? await getTmdbPopularity(card.tmdb_id, card.media_type)
          : 0;
        return { ...card, popularity };
      })
    );

    // Sort by popularity and pick top 5
    cardsWithPopularity.sort((a, b) => b.popularity - a.popularity);
    const selectedCard = cardsWithPopularity[0];
    const alternativeCards = cardsWithPopularity.slice(1, 5);

    if (!selectedCard) {
      return NextResponse.json({ message: "No card selected" });
    }

    // Generate approval token
    const approvalToken = crypto.randomUUID();
    const scheduledFor = getScheduledTime(slot);
    const tokenExpiresAt = new Date(scheduledFor.getTime() + 60 * 60 * 1000); // 1 hour after scheduled time

    // Create pending post record
    const { error: insertError } = await supabase.from("pending_posts").insert({
      slot,
      scheduled_for: scheduledFor.toISOString(),
      selected_card_id: selectedCard.id,
      alternative_card_ids: alternativeCards.map((c) => c.id),
      approval_token: approvalToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      status: "pending",
    });

    if (insertError) {
      console.error("[Prepare] Failed to create pending post:", insertError);
      return NextResponse.json(
        { error: "Failed to create pending post" },
        { status: 500 }
      );
    }

    // Send preview email
    try {
      await sendPostPreviewEmail({
        selectedCard,
        alternativeCards,
        approvalToken,
        slot,
        scheduledFor,
      });
      console.log(`[Prepare] Preview email sent for ${selectedCard.title}`);
    } catch (emailError) {
      console.error("[Prepare] Failed to send email:", emailError);
      // Don't fail the whole request if email fails - the pending post is created
    }

    return NextResponse.json({
      success: true,
      slot,
      selectedCard: selectedCard.title,
      alternatives: alternativeCards.map((c) => c.title),
      scheduledFor: scheduledFor.toISOString(),
    });
  } catch (error) {
    console.error("[Prepare] Failed to prepare post:", error);
    return NextResponse.json(
      { error: "Failed to prepare post", details: String(error) },
      { status: 500 }
    );
  }
}
