import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { searchMedia, formatContextForClaude, MediaInfo } from "@/lib/tmdb";
import { getCachedCard, saveCard } from "@/lib/supabase";

const anthropic = new Anthropic();
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Generate with Claude (primary)
async function generateWithClaude(userMessage: string): Promise<AsyncIterable<string>> {
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514", // Best balance of quality and speed
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    },
  };
}

// Generate with Gemini (fallback)
async function generateWithGemini(userMessage: string): Promise<AsyncIterable<string>> {
  const model = gemini.getGenerativeModel({
    model: "gemini-3-pro-preview",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContentStream(userMessage);

  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    },
  };
}

export async function POST(request: Request) {
  try {
    const { title, forceProvider } = await request.json();

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
      try {
        const cached = await getCachedCard(mediaInfo.id);
        if (cached) {
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
      } catch (error) {
        console.error("Cache check failed:", error);
      }
    }

    // Generate new card
    const tmdbContext = mediaInfo ? formatContextForClaude(mediaInfo) : "";
    const userMessage = tmdbContext
      ? `Here is information about the title:\n\n${tmdbContext}\n\nBased on this information and your knowledge, create an emotional calibration card for "${mediaInfo?.title || title}".`
      : `Create an emotional calibration card for "${title}".`;

    // Use forced provider or try Claude first, fall back to Gemini
    let textStream: AsyncIterable<string>;
    let provider = forceProvider || "claude";

    if (forceProvider === "gemini") {
      try {
        textStream = await generateWithGemini(userMessage);
      } catch (geminiError) {
        console.error("Gemini failed:", geminiError);
        return new Response(
          JSON.stringify({ error: "Gemini failed. Please try again." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      try {
        textStream = await generateWithClaude(userMessage);
      } catch (claudeError) {
        console.error("Claude failed, trying Gemini:", claudeError);
        provider = "gemini";

        try {
          textStream = await generateWithGemini(userMessage);
        } catch (geminiError) {
          console.error("Gemini also failed:", geminiError);
          return new Response(
            JSON.stringify({ error: "All AI providers failed. Please try again." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const encoder = new TextEncoder();
    let fullContent = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
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

          // Stream the response
          for await (const text of textStream) {
            fullContent += text;
            controller.enqueue(encoder.encode(text));
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
              provider,
            }).catch(console.error);
          }

          controller.close();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Cache": "MISS",
        "X-Provider": provider,
      },
    });
  } catch (error) {
    console.error("Request failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate card. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
