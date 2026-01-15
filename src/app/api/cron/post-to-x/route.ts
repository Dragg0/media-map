import { NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";
import { createClient } from "@supabase/supabase-js";

// Slot types for different times of day
type PostSlot = "morning" | "afternoon" | "evening";

// Prestige genres for evening slot
const PRESTIGE_GENRES = [
  "Drama",
  "Crime",
  "Thriller",
  "Mystery",
  "War",
  "History",
  "Documentary",
];

// Lazy initialization to avoid build-time errors
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Need service role to update last_posted_at
  );
}

// Fetch OG image as Buffer for Twitter upload
async function fetchOgImageBuffer(slug: string): Promise<Buffer | null> {
  try {
    const ogImageUrl = `https://texture.watch/api/og/${slug}`;
    console.log(`Fetching OG image: ${ogImageUrl}`);

    const response = await fetch(ogImageUrl, { cache: "no-store" });

    if (!response.ok) {
      console.error(`OG image fetch failed: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("Failed to fetch OG image:", error);
    return null;
  }
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

    // Parse slot from query params (default to afternoon for backwards compatibility)
    const url = new URL(request.url);
    const slot = (url.searchParams.get("slot") as PostSlot) || "afternoon";
    console.log(`Posting for slot: ${slot}`);

    // Get cards that have calibration sentences and haven't been posted in 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: cards, error } = await supabase
      .from("cards")
      .select("*")
      .not("calibration_sentence", "is", null)
      .not("slug", "is", null)
      .or(`last_posted_at.is.null,last_posted_at.lt.${thirtyDaysAgo.toISOString()}`)
      .limit(50); // Fetch more to have variety for filtering

    if (error || !cards || cards.length === 0) {
      console.log("No eligible cards found");
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
      console.log(`Morning slot: ${filteredCards.length} classic titles found`);
    } else if (slot === "evening") {
      // Evening: Prestige genres (Drama, Crime, Thriller, etc.)
      filteredCards = cards.filter((card) => {
        const genres = card.genres || [];
        return genres.some((g: string) => PRESTIGE_GENRES.includes(g));
      });
      console.log(`Evening slot: ${filteredCards.length} prestige titles found`);
    }
    // Afternoon: Use all cards (popularity-based selection)

    // Fall back to all cards if slot filter yields nothing
    if (filteredCards.length === 0) {
      console.log(`No cards for ${slot} slot, falling back to all eligible cards`);
      filteredCards = cards;
    }

    // Get popularity scores and pick the most popular
    const cardsWithPopularity = await Promise.all(
      filteredCards.map(async (card) => {
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

    // Compose the tweet text
    const cardUrl = `https://texture.watch/card/${selectedCard.slug}`;
    const tweetText = `${selectedCard.calibration_sentence}\n\n${cardUrl}`;

    // Try to fetch and upload OG image
    let mediaId: string | null = null;
    const imageBuffer = await fetchOgImageBuffer(selectedCard.slug);

    if (imageBuffer) {
      try {
        console.log(`Uploading image to Twitter (${imageBuffer.length} bytes)`);
        mediaId = await twitterClient.v1.uploadMedia(imageBuffer, {
          mimeType: "image/png",
        });
        console.log(`Image uploaded successfully: ${mediaId}`);
      } catch (uploadError) {
        console.error("Failed to upload image to Twitter:", uploadError);
        // Continue without image - fallback to URL-only
      }
    }

    // Post to X (with media if available, URL-only as fallback)
    const tweet = mediaId
      ? await twitterClient.v2.tweet(tweetText, {
          media: { media_ids: [mediaId] },
        })
      : await twitterClient.v2.tweet(tweetText);

    console.log(
      `Posted tweet for "${selectedCard.title}": ${tweet.data.id}${mediaId ? " (with image)" : " (URL-only fallback)"}`
    );

    // Update last_posted_at
    await supabase
      .from("cards")
      .update({ last_posted_at: new Date().toISOString() })
      .eq("id", selectedCard.id);

    return NextResponse.json({
      success: true,
      slot,
      title: selectedCard.title,
      tweetId: tweet.data.id,
      imageAttached: !!mediaId,
    });
  } catch (error) {
    console.error("Failed to post to X:", error);
    return NextResponse.json(
      { error: "Failed to post", details: String(error) },
      { status: 500 }
    );
  }
}
