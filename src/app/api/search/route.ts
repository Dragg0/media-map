import { searchMediaMultiple } from "@/lib/tmdb";
import { getCachedCard } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = await searchMediaMultiple(query, 5);

    // Check which ones are already cached
    const resultsWithCache = await Promise.all(
      results.map(async (result) => {
        try {
          const cached = await getCachedCard(result.id);
          return { ...result, isCached: !!cached };
        } catch {
          return { ...result, isCached: false };
        }
      })
    );

    return new Response(JSON.stringify({ results: resultsWithCache }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Search failed:", error);
    return new Response(
      JSON.stringify({ error: "Search failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
