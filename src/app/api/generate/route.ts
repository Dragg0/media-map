import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { searchMedia, getMediaById, formatContextForClaude, MediaInfo, resolveComparisonTitle } from "@/lib/tmdb";
import { getCachedCard, saveCard, parseComparisons, generateSlug, Comparison } from "@/lib/supabase";

const anthropic = new Anthropic();
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const STREAM_TIMEOUT_MS = 8000; // 8 seconds between chunks before timeout
const GEMINI_MODEL = "gemini-2.5-flash-lite-preview-06-17";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Helper to get first chunk with timeout (proves stream is working)
async function getFirstChunk(
  stream: AsyncIterable<string>
): Promise<{ firstChunk: string; iterator: AsyncIterator<string> }> {
  const iterator = stream[Symbol.asyncIterator]();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Stream timeout")), STREAM_TIMEOUT_MS);
  });

  const result = await Promise.race([iterator.next(), timeoutPromise]);
  if (result.done) {
    return { firstChunk: "", iterator };
  }
  return { firstChunk: result.value, iterator };
}

// Generate with Claude (primary)
async function generateWithClaude(userMessage: string): Promise<AsyncIterable<string>> {
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
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
    model: GEMINI_MODEL,
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
    const { title, tmdbId, mediaType, forceProvider } = await request.json();

    // Need either a title to search, or a tmdbId + mediaType to fetch directly
    if (!title && !tmdbId) {
      return new Response(JSON.stringify({ error: "Title or TMDB ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch TMDB data - either by ID (disambiguation) or by search
    let mediaInfo: MediaInfo | null = null;
    try {
      if (tmdbId && mediaType) {
        // Direct lookup by ID (user selected from disambiguation)
        mediaInfo = await getMediaById(tmdbId, mediaType);
      } else if (title) {
        // Search by title
        mediaInfo = await searchMedia(title);
      }
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
              id: cached.id,
              slug: cached.slug,
              title: cached.title,
              year: cached.year,
              posterUrl: cached.poster_url,
              mediaType: cached.media_type,
              genres: cached.genres || [],
              calibrationSentence: cached.calibration_sentence,
              comparisons: cached.comparisons || [],
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
      ? `Here is information about the title:\n\n${tmdbContext}\n\nBased on this information and your knowledge, create an emotional calibration card for "${mediaInfo?.title || title}". IMPORTANT: Use this exact title "${mediaInfo?.title}" throughout your response.`
      : `Create an emotional calibration card for "${title}".`;

    // Use forced provider or try Gemini first (faster), fall back to Claude
    let provider = forceProvider === "claude" ? CLAUDE_MODEL : GEMINI_MODEL;
    let firstChunk = "";
    let iterator: AsyncIterator<string>;

    if (forceProvider === "claude") {
      try {
        const stream = await generateWithClaude(userMessage);
        const result = await getFirstChunk(stream);
        firstChunk = result.firstChunk;
        iterator = result.iterator;
      } catch (claudeError) {
        console.error("Claude failed:", claudeError);
        return new Response(
          JSON.stringify({ error: "Claude failed. Please try again." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      try {
        const stream = await generateWithGemini(userMessage);
        const result = await getFirstChunk(stream);
        firstChunk = result.firstChunk;
        iterator = result.iterator;
      } catch (geminiError) {
        console.error("Gemini failed or timed out, trying Claude:", geminiError);
        provider = CLAUDE_MODEL;

        try {
          const stream = await generateWithClaude(userMessage);
          const result = await getFirstChunk(stream);
          firstChunk = result.firstChunk;
          iterator = result.iterator;
        } catch (claudeError) {
          console.error("Claude also failed:", claudeError);
          return new Response(
            JSON.stringify({ error: "All AI providers failed. Please try again." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const encoder = new TextEncoder();
    let fullContent = firstChunk;

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

          // Send the first chunk we already got
          if (firstChunk) {
            controller.enqueue(encoder.encode(firstChunk));
          }

          // Continue streaming the rest
          while (true) {
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("Stream timeout")), STREAM_TIMEOUT_MS);
            });

            const result = await Promise.race([iterator.next(), timeoutPromise]);
            if (result.done) break;

            fullContent += result.value;
            controller.enqueue(encoder.encode(result.value));
          }

          // Save to cache after generation completes (await to ensure it completes before function ends)
          if (mediaInfo && fullContent) {
            try {
              // Parse and resolve comparisons from the generated content
              const parsedComparisons = parseComparisons(fullContent);
              let resolvedComparisons: Comparison[] = [];

              if (parsedComparisons.length > 0) {
                console.log(`Resolving ${parsedComparisons.length} comparisons...`);
                const resolutionPromises = parsedComparisons.map(async (pc) => {
                  const resolved = await resolveComparisonTitle(pc.title);
                  if (resolved) {
                    return {
                      title: resolved.title,
                      original_title: pc.title, // Store original for matching
                      tmdb_id: resolved.tmdb_id,
                      media_type: resolved.media_type,
                      year: resolved.year,
                      slug: generateSlug(resolved.title, resolved.year),
                      phrase: pc.phrase,
                    } as Comparison;
                  }
                  return null;
                });

                const results = await Promise.all(resolutionPromises);
                resolvedComparisons = results.filter((c): c is Comparison => c !== null);
                console.log(`Resolved ${resolvedComparisons.length} comparisons successfully`);
              }

              const savedCard = await saveCard({
                tmdbId: mediaInfo.id,
                title: mediaInfo.title,
                mediaType: mediaInfo.mediaType,
                year: mediaInfo.year,
                posterUrl: mediaInfo.posterUrl,
                genres: mediaInfo.genres,
                cardContent: fullContent,
                comparisons: resolvedComparisons.length > 0 ? resolvedComparisons : null,
                provider,
              });

              // Send card ID, slug, calibration sentence, and comparisons at the end of the stream
              if (savedCard) {
                const cardInfo = JSON.stringify({
                  id: savedCard.id,
                  slug: savedCard.slug,
                  calibrationSentence: savedCard.calibrationSentence,
                  comparisons: savedCard.comparisons,
                });
                controller.enqueue(encoder.encode(`__CARD_INFO__${cardInfo}__END_CARD_INFO__`));

                // Pre-warm the OG image cache so it's ready for social sharing
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://texture.watch";
                fetch(`${baseUrl}/api/og/${savedCard.slug}`).catch(() => {
                  // Ignore errors - this is just cache warming
                });
              }
            } catch (saveError) {
              console.error("Failed to save card:", saveError);
            }
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
