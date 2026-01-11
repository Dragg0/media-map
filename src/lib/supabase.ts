import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface CachedCard {
  id: string;
  tmdb_id: number | null;
  title: string;
  media_type: string;
  year: string | null;
  poster_url: string | null;
  genres: string[] | null;
  card_content: string;
  provider: string | null;
  created_at: string;
}

export async function getCachedCard(tmdbId: number): Promise<CachedCard | null> {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("tmdb_id", tmdbId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as CachedCard;
}

export async function saveCard(card: {
  tmdbId: number | null;
  title: string;
  mediaType: string;
  year: string | null;
  posterUrl: string | null;
  genres: string[] | null;
  cardContent: string;
  provider: string;
}): Promise<void> {
  console.log("Attempting to save card:", { tmdbId: card.tmdbId, title: card.title, provider: card.provider });

  const { error } = await supabase.from("cards").upsert({
    tmdb_id: card.tmdbId,
    title: card.title,
    media_type: card.mediaType,
    year: card.year,
    poster_url: card.posterUrl,
    genres: card.genres,
    card_content: card.cardContent,
    provider: card.provider,
  }, { onConflict: 'tmdb_id' });

  if (error) {
    console.error("Failed to save card:", error);
    throw new Error(`Supabase save failed: ${error.message}`);
  }

  console.log("Card saved successfully:", card.title);
}
