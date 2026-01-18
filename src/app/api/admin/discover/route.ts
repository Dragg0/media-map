import { NextResponse } from "next/server";
import { BskyAgent } from "@atproto/api";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
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

// Search phrases that indicate someone is describing the viewing experience
const SEARCH_PHRASES = [
  "felt like watching",
  "feels like watching",
  "felt like a",
  "hits like",
  "vibes like",
  "same energy as",
  "gave me vibes",
  "reminded me of",
  "left me feeling",
  "wasn't ready for",
  "can't stop thinking about",
  "this movie made me",
  "this show made me",
  "comfort watch",
  "devastated by",
];

interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    handle: string;
    displayName?: string;
  };
  record: {
    text: string;
    createdAt: string;
  };
  indexedAt: string;
}

// GET: Fetch pending discovered posts
export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: posts, error } = await supabase
    .from("discovered_posts")
    .select("*")
    .eq("status", "pending")
    .order("relevance_score", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }

  return NextResponse.json({ posts: posts || [] });
}

// POST: Run a discovery search
export async function POST() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Initialize Bluesky agent
    const agent = new BskyAgent({ service: "https://bsky.social" });
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE!,
      password: process.env.BLUESKY_APP_PASSWORD!,
    });

    const discoveredPosts: Array<{
      uri: string;
      url: string;
      handle: string;
      displayName: string;
      content: string;
      searchPhrase: string;
    }> = [];

    // Search for each phrase
    for (const phrase of SEARCH_PHRASES.slice(0, 5)) { // Limit to 5 phrases per run
      try {
        const searchResult = await agent.app.bsky.feed.searchPosts({
          q: phrase,
          limit: 10,
        });

        for (const post of searchResult.data.posts) {
          const postData = post as unknown as BlueskyPost;
          const text = postData.record?.text || '';

          // Skip if too short or doesn't actually contain movie/TV context
          if (text.length < 30) continue;

          // Convert URI to URL
          const uriParts = postData.uri.split('/');
          const postId = uriParts[uriParts.length - 1];
          const url = `https://bsky.app/profile/${postData.author.handle}/post/${postId}`;

          discoveredPosts.push({
            uri: postData.uri,
            url,
            handle: postData.author.handle,
            displayName: postData.author.displayName || postData.author.handle,
            content: text,
            searchPhrase: phrase,
          });
        }
      } catch (searchError) {
        console.error(`Search failed for phrase "${phrase}":`, searchError);
      }
    }

    if (discoveredPosts.length === 0) {
      return NextResponse.json({ message: "No posts found", processed: 0 });
    }

    // Use AI to filter and score posts
    const anthropic = new Anthropic();
    const scoredPosts: Array<{
      post: typeof discoveredPosts[0];
      score: number;
      detectedTitle: string | null;
    }> = [];

    for (const post of discoveredPosts) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{
            role: "user",
            content: `Analyze this social media post. Is it describing the VIEWING EXPERIENCE of a specific movie or TV show (how it felt to watch, emotional impact, comparisons to other media)?

Post: "${post.content}"

Respond in JSON format:
{
  "isRelevant": true/false,
  "score": 0-100 (how well it describes the viewing experience),
  "detectedTitle": "Movie or Show Name" or null if unclear
}

Only mark isRelevant:true if the post is genuinely describing what it's like to watch something, not just mentioning a title.`
          }]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.isRelevant && parsed.score >= 50) {
            scoredPosts.push({
              post,
              score: parsed.score,
              detectedTitle: parsed.detectedTitle,
            });
          }
        }
      } catch (aiError) {
        console.error("AI scoring failed for post:", aiError);
      }
    }

    // Insert scored posts into database (skip duplicates)
    let inserted = 0;
    for (const { post, score, detectedTitle } of scoredPosts) {
      const { error: insertError } = await supabase
        .from("discovered_posts")
        .upsert({
          platform: "bluesky",
          post_uri: post.uri,
          post_url: post.url,
          author_handle: post.handle,
          author_display_name: post.displayName,
          content: post.content,
          detected_title: detectedTitle,
          relevance_score: score / 100,
          search_phrase: post.searchPhrase,
          status: "pending",
        }, {
          onConflict: "post_uri",
          ignoreDuplicates: true,
        });

      if (!insertError) inserted++;
    }

    return NextResponse.json({
      searched: discoveredPosts.length,
      relevant: scoredPosts.length,
      inserted,
    });

  } catch (error) {
    console.error("Discovery failed:", error);
    return NextResponse.json(
      { error: "Discovery failed", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH: Update post status (liked, quoted, dismissed)
export async function PATCH(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, status } = await request.json();

  if (!id || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from("discovered_posts")
    .update({
      status,
      acted_on_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
