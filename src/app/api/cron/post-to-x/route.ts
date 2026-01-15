import { NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";
import { createClient } from "@supabase/supabase-js";

// Lazy initialization to avoid build-time errors
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Need service role to update last_posted_at
  );
}

// Verify this is a legitimate cron request
function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  // Vercel cron requests include this header
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) {
    return true;
  }
  return false;
}

// Get TMDB popularity score for a title
async function getTmdbPopularity(tmdbId: number, mediaType: string): Promise<number> {
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

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron or has the secret
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Get cards that have calibration sentences and haven't been posted in 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: cards, error } = await supabase
      .from("cards")
      .select("*")
      .not("calibration_sentence", "is", null)
      .not("slug", "is", null)
      .or(`last_posted_at.is.null,last_posted_at.lt.${thirtyDaysAgo.toISOString()}`)
      .limit(20);

    if (error || !cards || cards.length === 0) {
      console.log("No eligible cards found");
      return NextResponse.json({ message: "No eligible cards to post" });
    }

    // Get popularity scores and pick the most popular
    const cardsWithPopularity = await Promise.all(
      cards.map(async (card) => {
        const popularity = card.tmdb_id
          ? await getTmdbPopularity(card.tmdb_id, card.media_type)
          : 0;
        return { ...card, popularity };
      })
    );

    // Sort by popularity and pick the top one
    cardsWithPopularity.sort((a, b) => b.popularity - a.popularity);
    const selectedCard = cardsWithPopularity[0];

    if (!selectedCard) {
      return NextResponse.json({ message: "No card selected" });
    }

    // Initialize Twitter client
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
    });

    // Compose the tweet - just the calibration sentence and URL
    // X will automatically show the OG card
    const cardUrl = `https://texture.watch/card/${selectedCard.slug}`;
    const tweetText = `${selectedCard.calibration_sentence}\n\n${cardUrl}`;

    // Post to X
    const tweet = await twitterClient.v2.tweet(tweetText);

    // Update last_posted_at
    await supabase
      .from("cards")
      .update({ last_posted_at: new Date().toISOString() })
      .eq("id", selectedCard.id);

    console.log(`Posted tweet for "${selectedCard.title}": ${tweet.data.id}`);

    return NextResponse.json({
      success: true,
      title: selectedCard.title,
      tweetId: tweet.data.id,
    });
  } catch (error) {
    console.error("Failed to post to X:", error);
    return NextResponse.json(
      { error: "Failed to post", details: String(error) },
      { status: 500 }
    );
  }
}
