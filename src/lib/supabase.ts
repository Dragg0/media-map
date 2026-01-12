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
  calibration_sentence: string | null;
  provider: string | null;
  created_at: string;
}

// Extract calibration sentence from card content
// Pattern: "If [Title] felt X, this (may) feel(s) Y" - usually italicized with *
export function extractCalibrationSentence(cardContent: string): string | null {
  // Try multiple patterns to catch variations
  const patterns = [
    // Pattern with asterisks (italics): *If X felt Y, this feels Z*
    /\*If\s+(.+?)\s+felt\s+(.+?),\s+this\s+((?:may\s+)?feel[s]?\s+.+?)\*/i,
    // Pattern without asterisks
    /If\s+(.+?)\s+felt\s+(.+?),\s+this\s+((?:may\s+)?feel[s]?\s+.+?)\.?\s*$/im,
    // Pattern at end of comparison section
    /If\s+\*?(.+?)\*?\s+felt\s+(.+?),\s+this\s+((?:may\s+)?feel[s]?\s+.+?)\.?\*?\s*(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = cardContent.match(pattern);
    if (match) {
      const [, title, feltPart, feelsPart] = match;
      // Clean up the extracted parts
      const cleanTitle = title.replace(/\*/g, '').trim();
      const cleanFelt = feltPart.replace(/\*/g, '').trim();
      const cleanFeels = feelsPart.replace(/\*/g, '').replace(/\.+$/, '').trim();
      return `If ${cleanTitle} felt ${cleanFelt}, this ${cleanFeels}.`;
    }
  }

  return null;
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

export async function getCardById(id: string): Promise<CachedCard | null> {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
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
}): Promise<{ id: string; calibrationSentence: string | null } | null> {
  console.log("Attempting to save card:", { tmdbId: card.tmdbId, title: card.title, provider: card.provider });

  // Extract calibration sentence from card content
  const calibrationSentence = extractCalibrationSentence(card.cardContent);
  if (calibrationSentence) {
    console.log("Extracted calibration sentence:", calibrationSentence);
  }

  const { data, error } = await supabase.from("cards").upsert({
    tmdb_id: card.tmdbId,
    title: card.title,
    media_type: card.mediaType,
    year: card.year,
    poster_url: card.posterUrl,
    genres: card.genres,
    card_content: card.cardContent,
    calibration_sentence: calibrationSentence,
    provider: card.provider,
  }, { onConflict: 'tmdb_id' }).select('id').single();

  if (error) {
    console.error("Failed to save card:", error);
    throw new Error(`Supabase save failed: ${error.message}`);
  }

  console.log("Card saved successfully:", card.title, "ID:", data?.id);
  return data ? { id: data.id, calibrationSentence } : null;
}
