import { NextResponse } from "next/server";
import { BskyAgent, RichText } from "@atproto/api";
import { TwitterApi } from "twitter-api-v2";

// Engagement questions to cycle through
const QUESTIONS = [
  "What film has a vibe you've never seen replicated?",
  "What movie completely changed your mood for the rest of the day?",
  "What's a film you'd describe as \"cozy chaos\"?",
  "What movie feels like late summer?",
  "What's your \"I need to feel something\" movie?",
  "What \"bad\" movie do you genuinely love watching?",
  "What classic have you never seen and at this point refuse to?",
  "What movie do you wish you could watch again for the first time?",
  "What film made you sit in silence after the credits?",
  "What movie has the most rewatchable opening scene?",
  "What's a movie that feels like a warm hug?",
  "What film genuinely unsettled you for days?",
  "What's a movie you recommend to everyone but no one watches?",
  "What film has a soundtrack you still listen to?",
  "What movie perfectly captures a feeling you can't put into words?",
];

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

// Fetch question image as Buffer
async function fetchQuestionImageBuffer(question: string): Promise<Buffer | null> {
  try {
    const encodedQuestion = encodeURIComponent(question);
    const imageUrl = `https://texture.watch/api/og/question?text=${encodedQuestion}`;
    console.log(`[Question] Fetching image: ${imageUrl}`);

    const response = await fetch(imageUrl, { cache: "no-store" });

    if (!response.ok) {
      console.error(`[Question] Image fetch failed: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("[Question] Failed to fetch image:", error);
    return null;
  }
}

// Pick a random question
function pickQuestion(): string {
  const index = Math.floor(Math.random() * QUESTIONS.length);
  return QUESTIONS[index];
}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const question = pickQuestion();
    console.log(`[Question] Selected: "${question}"`);

    // Fetch the question image
    const imageBuffer = await fetchQuestionImageBuffer(question);
    if (!imageBuffer) {
      return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
    }

    const postText = `${question}\n\nDrop your answers below 👇`;
    let blueskyPostId: string | null = null;
    let twitterPostId: string | null = null;

    // Post to Bluesky
    try {
      const agent = new BskyAgent({ service: "https://bsky.social" });
      await agent.login({
        identifier: process.env.BLUESKY_HANDLE!,
        password: process.env.BLUESKY_APP_PASSWORD!,
      });

      const rt = new RichText({ text: postText });
      await rt.detectFacets(agent);

      // Upload image
      const uploadResponse = await agent.uploadBlob(imageBuffer, {
        encoding: "image/png",
      });

      const postResponse = await agent.post({
        text: rt.text,
        facets: rt.facets,
        embed: {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: question,
              image: uploadResponse.data.blob,
            },
          ],
        },
        createdAt: new Date().toISOString(),
      });

      blueskyPostId = postResponse.uri.split("/").pop() || null;
      console.log(`[Question] Posted to Bluesky: ${blueskyPostId}`);
    } catch (bskyError) {
      console.error("[Question] Bluesky post failed:", bskyError);
    }

    // Post to X/Twitter
    try {
      const twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY!,
        appSecret: process.env.TWITTER_API_SECRET!,
        accessToken: process.env.TWITTER_ACCESS_TOKEN!,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
      });

      // Upload image
      const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, {
        mimeType: "image/png",
      });

      const tweet = await twitterClient.v2.tweet(postText, {
        media: { media_ids: [mediaId] },
      });

      twitterPostId = tweet.data.id;
      console.log(`[Question] Posted to X: ${twitterPostId}`);
    } catch (twitterError) {
      console.error("[Question] Twitter post failed:", twitterError);
    }

    return NextResponse.json({
      success: true,
      question,
      blueskyPostId,
      twitterPostId,
    });
  } catch (error) {
    console.error("[Question] Failed to post question:", error);
    return NextResponse.json(
      { error: "Failed to post question", details: String(error) },
      { status: 500 }
    );
  }
}
