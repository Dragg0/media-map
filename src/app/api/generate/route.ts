import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { searchMedia, formatContextForClaude, MediaInfo } from "@/lib/tmdb";
import { getCachedCard, saveCard } from "@/lib/supabase";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  const { title } = await request.json();

  if (!title || typeof title !== "string") {
    return new Response(JSON.stringify({ error: "Title is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch TMDB data first
  let mediaInfo: MediaInfo | null = null;
  try {
    mediaInfo = await searchMedia(title);
  } catch (error) {
    console.error("TMDB fetch failed:", error);
  }

  // Check cache if we have a TMDB ID
  if (mediaInfo?.id) {
    const cached = await getCachedCard(mediaInfo.id);
    if (cached) {
      // Return cached card immediately (not streamed)
      const metadata = JSON.stringify({
        type: "metadata",
        data: {
          title: cached.title,
          year: cached.year,
          posterUrl: cached.poster_url,
          mediaType: cached.media_type,
          genres: cached.genres || [],
        },
      });

      return new Response(
        `__METADATA__${metadata}__END_METADATA__${cached.card_content}`,
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Cache": "HIT",
          },
        }
      );
    }
  }

  // Generate new card
  const tmdbContext = mediaInfo ? formatContextForClaude(mediaInfo) : "";

  const userMessage = tmdbContext
    ? `Here is information about the title:\n\n${tmdbContext}\n\nBased on this information and your knowledge, create an emotional calibration card for "${mediaInfo?.title || title}".`
    : `Tell me about ${title}`;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const encoder = new TextEncoder();
  let fullContent = "";

  const readableStream = new ReadableStream({
    async start(controller) {
      // Send metadata first if available
      if (mediaInfo) {
        const metadata = JSON.stringify({
          type: "metadata",
          data: {
            title: mediaInfo.title,
            year: mediaInfo.year,
            posterUrl: mediaInfo.posterUrl,
            mediaType: mediaInfo.mediaType,
            genres: mediaInfo.genres,
          },
        });
        controller.enqueue(encoder.encode(`__METADATA__${metadata}__END_METADATA__`));
      }

      // Stream Claude's response
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullContent += event.delta.text;
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }

      // Save to cache after generation completes
      if (mediaInfo && fullContent) {
        saveCard({
          tmdbId: mediaInfo.id,
          title: mediaInfo.title,
          mediaType: mediaInfo.mediaType,
          year: mediaInfo.year,
          posterUrl: mediaInfo.posterUrl,
          genres: mediaInfo.genres,
          cardContent: fullContent,
        }).catch(console.error);
      }

      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Cache": "MISS",
    },
  });
}
