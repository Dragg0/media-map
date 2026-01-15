import { NextResponse } from "next/server";
import { BskyAgent, RichText } from "@atproto/api";
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Fetch OG image as Buffer for Bluesky upload
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
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) {
    return true;
  }
  return false;
}

// Get TMDB popularity score for a title
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

export async function GET(request: Request) {
  // Verify the request is from cron or has the secret
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Parse slot from query params
    const url = new URL(request.url);
    const slot = (url.searchParams.get("slot") as PostSlot) || "afternoon";
    console.log(`[Bluesky] Posting for slot: ${slot}`);

    // Get cards that have calibration sentences and haven't been posted in 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: cards, error } = await supabase
      .from("cards")
      .select("*")
      .not("calibration_sentence", "is", null)
      .not("slug", "is", null)
      .or(
        `last_posted_bluesky.is.null,last_posted_bluesky.lt.${thirtyDaysAgo.toISOString()}`
      )
      .limit(50);

    if (error || !cards || cards.length === 0) {
      console.log("[Bluesky] No eligible cards found");
      return NextResponse.json({ message: "No eligible cards to post" });
    }

    // Filter cards based on slot
    let filteredCards = cards;

    if (slot === "morning") {
      filteredCards = cards.filter((card) => {
        const year = parseInt(card.year);
        return !isNaN(year) && year < 2015;
      });
      console.log(
        `[Bluesky] Morning slot: ${filteredCards.length} classic titles found`
      );
    } else if (slot === "evening") {
      filteredCards = cards.filter((card) => {
        const genres = card.genres || [];
        return genres.some((g: string) => PRESTIGE_GENRES.includes(g));
      });
      console.log(
        `[Bluesky] Evening slot: ${filteredCards.length} prestige titles found`
      );
    }

    // Fall back to all cards if slot filter yields nothing
    if (filteredCards.length === 0) {
      console.log(
        `[Bluesky] No cards for ${slot} slot, falling back to all eligible cards`
      );
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

    cardsWithPopularity.sort((a, b) => b.popularity - a.popularity);
    const selectedCard = cardsWithPopularity[0];

    if (!selectedCard) {
      return NextResponse.json({ message: "No card selected" });
    }

    // Initialize Bluesky agent
    const agent = new BskyAgent({
      service: "https://bsky.social",
    });

    // Login to Bluesky
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE!,
      password: process.env.BLUESKY_APP_PASSWORD!,
    });

    // Compose the post text
    const cardUrl = `https://texture.watch/card/${selectedCard.slug}`;
    const postText = `${selectedCard.calibration_sentence}\n\n${cardUrl}`;

    // Create rich text with link facets
    const rt = new RichText({ text: postText });
    await rt.detectFacets(agent);

    // Try to fetch and upload image
    let embed: { $type: string; images: Array<{ alt: string; image: unknown }> } | undefined;
    const imageBuffer = await fetchOgImageBuffer(selectedCard.slug);

    if (imageBuffer) {
      try {
        console.log(
          `[Bluesky] Uploading image (${imageBuffer.length} bytes)`
        );
        const uploadResponse = await agent.uploadBlob(imageBuffer, {
          encoding: "image/png",
        });
        console.log("[Bluesky] Image uploaded successfully");

        embed = {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: `${selectedCard.title} - ${selectedCard.calibration_sentence}`,
              image: uploadResponse.data.blob,
            },
          ],
        };
      } catch (uploadError) {
        console.error("[Bluesky] Failed to upload image:", uploadError);
        // Continue without image
      }
    }

    // Post to Bluesky
    const postResponse = await agent.post({
      text: rt.text,
      facets: rt.facets,
      embed,
      createdAt: new Date().toISOString(),
    });

    const postUri = postResponse.uri;
    const postId = postUri.split("/").pop();
    console.log(
      `[Bluesky] Posted "${selectedCard.title}": ${postId}${embed ? " (with image)" : " (text only)"}`
    );

    // Update last_posted_bluesky on the card
    await supabase
      .from("cards")
      .update({ last_posted_bluesky: new Date().toISOString() })
      .eq("id", selectedCard.id);

    // Log the post to the posts table
    const { error: postLogError } = await supabase.from("posts").insert({
      card_id: selectedCard.id,
      slot,
      tweet_id: postId, // Using tweet_id field for post ID
      platform: "bluesky",
      posted_at: new Date().toISOString(),
      title: selectedCard.title,
      slug: selectedCard.slug,
      calibration_sentence: selectedCard.calibration_sentence,
      year: selectedCard.year,
      poster_url: selectedCard.poster_url,
    });

    if (postLogError) {
      console.error("[Bluesky] Failed to log post:", postLogError);
    }

    return NextResponse.json({
      success: true,
      platform: "bluesky",
      slot,
      title: selectedCard.title,
      postUri,
      imageAttached: !!embed,
    });
  } catch (error) {
    console.error("[Bluesky] Failed to post:", error);
    return NextResponse.json(
      { error: "Failed to post", details: String(error) },
      { status: 500 }
    );
  }
}
