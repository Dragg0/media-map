import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Initialize clients
const anthropic = new Anthropic();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SYSTEM_PROMPT = `You are an editorial voice for an app that helps viewers understand how TV shows and movies feel emotionally—not just what content they contain.

Your job is to prepare someone to watch something, not review it or rate it.

## Voice Guidelines

- Calm, direct, non-judgmental
- No emoji, no rating symbols, no numbered scales
- Write like a thoughtful friend who's seen the show and wants to give you a real answer
- Never tell someone whether they should or shouldn't watch something
- Avoid clinical or checklist-style language
- Don't use phrases like "trigger warning" or "content warning"

## Card Structure

### 1. Opening (2-3 sentences)
What the show appears to be, and what it actually is emotionally. No plot summary beyond basic premise. Set expectations without spoiling.

### 2. "How it feels"
The sustained emotional experience of watching. Not what happens—how it sits with you. Describe the texture, not the events.

### 3. "What makes it heavy" (if applicable)
The specific emotional or psychological weight. Be precise without spoilers. If the show isn't heavy, this section can be brief or reframed as "What makes it work."

### 4. "Compared to shows you may know"
3-4 comparisons using this format:
- [Show title] → One sentence explaining the emotional difference

End with a calibration sentence after a blank line (see CALIBRATION SENTENCE RULES below).

Choose comparisons that are:
- Well-known enough to be useful reference points
- Emotionally relevant (not just genre-similar)
- Specific about the *type* of feeling, not just intensity level

### 5. "Worth knowing" (1-2 sentences)
Any specific viewer sensitivities this might affect. Frame as observation, not warning. Focus on *who* might be affected, not just *what* is present.

## Constraints

- No spoilers, including "a major character dies" or similar
- No content checklists (skip "contains violence, language, etc.")
- Under 250 words total
- Do not say "trigger warning" or "content warning"
- Comparisons should reference well-known shows when possible
- If a show isn't emotionally heavy, say so clearly—don't manufacture weight
- Never judge the viewer's taste or sensitivity level

## Formatting

- Use **bold** for section headers only
- No bullet points except in the comparison section
- No emoji or rating symbols
- Plain, readable prose

## Guiding Principles

1. We are not quantifying feelings—we are contextualizing them
2. We tell you what kind of person might struggle with this, not just what content is present
3. Comparisons do the real work—anchor everything to shared reference points
4. The goal is informed consent for emotional experience, not content filtering

## CALIBRATION SENTENCE RULES

The calibration sentence is the viral hook—the one line that appears in social previews and OG images. It must capture the specific emotional delta between two titles while remaining immediately intuitive.

### HARD CONSTRAINTS (DO NOT DO)

1. **No lazy comparatives:** BANNED words include "more," "less," "lighter," "darker," "heavier," "scarier," "funnier," "similar but different," "just purely."

2. **No vague adjectives:** Do not use words that could describe 100 other things: "interesting," "engaging," "intense," "fun," "good."

3. **No purple prose:** The metaphor must be immediately intuitive to a general audience. Do not sacrifice clarity for cleverness. "Elegy without exit" works. "Thunderstorm of mustard" does not.

### REQUIREMENTS (MUST DO)

1. **Use concrete metaphors:** Nouns and verbs, not just adjectives. Don't say "heavier"—say "anchored in concrete."

2. **Describe the emotional result:** How does the viewer physically or emotionally react? What do they feel in their body?

3. **Unexpected but intuitive pairings:** Combine a familiar feeling with a surprising modifier. The surprise should clarify, not confuse.

4. **The screenshot test:** If a user wouldn't text this sentence to a friend because it nails the feeling so precisely, it's not good enough.

5. **When in doubt, pick a stronger comparison title:** If you can't write a vivid sentence, choose a different comparison that enables one. The sentence matters more than which title you use.

### EXAMPLES

**WEAK (never write these):**
- "If X felt fun, this may feel just purely fun."
- "If X felt intense, this is less intense."
- "If X felt dark, this feels lighter."
- "If X felt like a fever dream, this feels like a kaleidoscope of emotional hurricanes." (too abstract, purple prose)

**STRONG (emulate these):**
- "If Inception felt intellectually challenging, this may feel emotionally exhausting."
- "If Skyrim felt like a vacation, this feels like an expedition."
- "If Station Eleven felt like elegy with hope, this feels like elegy without exit."
- "If Ted Lasso felt like a warm hug, this feels like a warm hug that makes you want to call your mom and apologize."
- "If Parasite felt like social commentary, this feels like personal tragedy."`;

interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  vote_average: number;
}

interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genres: { id: number; name: string }[];
  vote_average: number;
  tagline?: string;
  number_of_seasons?: number;
  created_by?: { name: string }[];
  credits?: {
    cast: { name: string; character: string }[];
    crew: { name: string; job: string }[];
  };
}

async function tmdbFetch<T>(endpoint: string): Promise<T> {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) throw new Error("TMDB_API_TOKEN not configured");

  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
  return response.json();
}

async function getPopularMovies(pages: number = 1): Promise<TMDBResult[]> {
  const results: TMDBResult[] = [];
  for (let page = 1; page <= pages; page++) {
    const data = await tmdbFetch<{ results: TMDBResult[] }>(
      `/movie/popular?language=en-US&page=${page}`
    );
    results.push(...data.results);
    await sleep(250); // Rate limiting
  }
  return results;
}

async function getPopularTV(pages: number = 1): Promise<TMDBResult[]> {
  const results: TMDBResult[] = [];
  for (let page = 1; page <= pages; page++) {
    const data = await tmdbFetch<{ results: TMDBResult[] }>(
      `/tv/popular?language=en-US&page=${page}`
    );
    results.push(...data.results);
    await sleep(250);
  }
  return results;
}

async function getDetails(id: number, type: "movie" | "tv"): Promise<TMDBDetails> {
  return tmdbFetch<TMDBDetails>(
    `/${type}/${id}?append_to_response=credits`
  );
}

function formatContextForClaude(details: TMDBDetails, type: "movie" | "tv"): string {
  const title = details.title || details.name || "Unknown";
  const releaseDate = details.release_date || details.first_air_date;
  const year = releaseDate ? releaseDate.split("-")[0] : "Unknown";

  const lines: string[] = [
    `Title: ${title} (${year})`,
    `Type: ${type === "tv" ? "TV Series" : "Film"}`,
    `Genres: ${details.genres.map((g) => g.name).join(", ")}`,
  ];

  if (details.tagline) lines.push(`Tagline: "${details.tagline}"`);
  if (type === "tv" && details.number_of_seasons) {
    lines.push(`Seasons: ${details.number_of_seasons}`);
  }

  const director = details.credits?.crew?.find((c) => c.job === "Director")?.name;
  if (director) lines.push(`Director: ${director}`);

  if (details.created_by?.length) {
    lines.push(`Created by: ${details.created_by.map((c) => c.name).join(", ")}`);
  }

  const topCast = details.credits?.cast?.slice(0, 5).map((c) => c.name);
  if (topCast?.length) lines.push(`Starring: ${topCast.join(", ")}`);

  lines.push(`\nSynopsis: ${details.overview}`);
  if (details.vote_average) lines.push(`\nTMDB Rating: ${details.vote_average.toFixed(1)}/10`);

  return lines.join("\n");
}

async function generateCard(context: string, title: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is information about the title:\n\n${context}\n\nBased on this information and your knowledge, create an emotional calibration card for "${title}".`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock ? textBlock.text : "";
}

async function checkExists(tmdbId: number): Promise<boolean> {
  const { data } = await supabase
    .from("cards")
    .select("id")
    .eq("tmdb_id", tmdbId)
    .single();
  return !!data;
}

async function saveCard(card: {
  tmdbId: number;
  title: string;
  mediaType: "movie" | "tv";
  year: string;
  posterUrl: string | null;
  genres: string[];
  cardContent: string;
}): Promise<void> {
  const { error } = await supabase.from("cards").insert({
    tmdb_id: card.tmdbId,
    title: card.title,
    media_type: card.mediaType,
    year: card.year,
    poster_url: card.posterUrl,
    genres: card.genres,
    card_content: card.cardContent,
  });

  if (error) throw error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processItem(
  item: TMDBResult,
  type: "movie" | "tv",
  index: number,
  total: number
): Promise<boolean> {
  const title = item.title || item.name || "Unknown";
  const prefix = `[${index + 1}/${total}]`;

  try {
    // Check if already exists
    if (await checkExists(item.id)) {
      console.log(`${prefix} ⏭️  Skipping "${title}" (already cached)`);
      return false;
    }

    console.log(`${prefix} 🎬 Processing "${title}"...`);

    // Get details
    const details = await getDetails(item.id, type);
    const context = formatContextForClaude(details, type);

    // Generate card
    const cardContent = await generateCard(context, title);

    // Save to database
    const releaseDate = details.release_date || details.first_air_date;
    await saveCard({
      tmdbId: item.id,
      title,
      mediaType: type,
      year: releaseDate ? releaseDate.split("-")[0] : "Unknown",
      posterUrl: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null,
      genres: details.genres.map((g) => g.name),
      cardContent,
    });

    console.log(`${prefix} ✅ Saved "${title}"`);
    return true;
  } catch (error) {
    console.error(`${prefix} ❌ Failed "${title}":`, error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const moviePages = parseInt(args[0]) || 1; // 20 movies per page
  const tvPages = parseInt(args[1]) || 1;    // 20 shows per page

  console.log(`\n🎬 Media Map Seeding Script`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Fetching ${moviePages} page(s) of movies and ${tvPages} page(s) of TV shows...\n`);

  // Fetch popular titles
  const movies = await getPopularMovies(moviePages);
  const tvShows = await getPopularTV(tvPages);

  console.log(`Found ${movies.length} movies and ${tvShows.length} TV shows\n`);

  const allItems: { item: TMDBResult; type: "movie" | "tv" }[] = [
    ...movies.map((item) => ({ item, type: "movie" as const })),
    ...tvShows.map((item) => ({ item, type: "tv" as const })),
  ];

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allItems.length; i++) {
    const { item, type } = allItems[i];
    const result = await processItem(item, type, i, allItems.length);

    if (result) {
      processed++;
    } else {
      skipped++;
    }

    // Rate limiting: wait between API calls
    await sleep(1500); // 1.5 seconds between items to avoid rate limits
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Processed: ${processed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(console.error);
