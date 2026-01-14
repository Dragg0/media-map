import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Comparison {
  title: string;
  original_title?: string; // The title as written by Claude (for matching)
  tmdb_id: number;
  media_type: "movie" | "tv";
  year: string;
  slug: string;
  phrase: string;
}

export interface CachedCard {
  id: string;
  tmdb_id: number | null;
  title: string;
  slug: string | null;
  media_type: string;
  year: string | null;
  poster_url: string | null;
  genres: string[] | null;
  card_content: string;
  calibration_sentence: string | null;
  comparisons: Comparison[] | null;
  provider: string | null;
  created_at: string;
}

// Generate URL-friendly slug from title and year
export function generateSlug(title: string, year: string | null): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special chars
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim hyphens from ends

  return year ? `${baseSlug}-${year}` : baseSlug;
}

// Parse comparison titles and phrases from card content markdown
// Patterns: "- Title → phrase" or "* Title → phrase" or "- *Title* → phrase"
export interface ParsedComparison {
  title: string;
  phrase: string;
}

export function parseComparisons(cardContent: string): ParsedComparison[] {
  const comparisons: ParsedComparison[] = [];

  // Match lines like: "- Title → phrase" or "* Title → phrase" or "- *Title* → phrase"
  // Handle both - and * bullets, and both → and -> arrows
  const pattern = /^[-*]\s+\*?([^*→\->]+?)\*?\s*(?:→|->)\s*(.+)$/gm;

  let match;
  while ((match = pattern.exec(cardContent)) !== null) {
    const title = match[1].trim();
    const phrase = match[2].trim();

    if (title && phrase) {
      comparisons.push({ title, phrase });
    }
  }

  return comparisons;
}

// Extract calibration sentence from card content
// Pattern: "If [Title] felt (like) X, this/[Title2] (may) feel(s) (like) Y"
// Must be on its own line (not inside a bullet list)
export function extractCalibrationSentence(cardContent: string): string | null {
  // Split into lines and find lines that match the calibration pattern
  // but are NOT bullet points (don't start with - or *)
  const lines = cardContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip bullet points
    if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*') && !trimmedLine.startsWith('*If')) {
      continue;
    }
    // Skip lines that are part of comparison section (contain →)
    if (trimmedLine.includes('→') || trimmedLine.includes('->')) {
      continue;
    }

    // Look for calibration pattern on standalone lines
    const patterns = [
      // Pattern with "this": If X felt (like) Y, this feels Z
      /^\*?If\s+\*?([^*,]+?)\*?\s+felt\s+(like\s+)?(.+?),\s+this\s+((?:may\s+)?feel[s]?\s+(?:like\s+)?.+?)\.?\*?$/i,
      // Pattern with title name: If X felt (like) Y, Title feels Z
      /^\*?If\s+\*?([^*,]+?)\*?\s+felt\s+(like\s+)?(.+?),\s+([A-Z][A-Za-z0-9\s':]+?)\s+((?:may\s+)?feel[s]?\s+(?:like\s+)?.+?)\.?\*?$/i,
    ];

    for (const pattern of patterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        if (match.length === 5) {
          // Pattern 1: title, likeWord, feltPart, feelsPart
          const [, title, likeWord, feltPart, feelsPart] = match;
          const cleanTitle = title.replace(/\*/g, '').trim();
          const cleanFelt = feltPart.replace(/\*/g, '').trim();
          const cleanFeels = feelsPart.replace(/\*/g, '').replace(/\.+$/, '').trim();
          const feltPrefix = likeWord ? 'like ' : '';
          return `If ${cleanTitle} felt ${feltPrefix}${cleanFelt}, this ${cleanFeels}.`;
        } else if (match.length === 6) {
          // Pattern 2: title, likeWord, feltPart, subject, feelsPart
          const [, title, likeWord, feltPart, , feelsPart] = match;
          const cleanTitle = title.replace(/\*/g, '').trim();
          const cleanFelt = feltPart.replace(/\*/g, '').trim();
          const cleanFeels = feelsPart.replace(/\*/g, '').replace(/\.+$/, '').trim();
          const feltPrefix = likeWord ? 'like ' : '';
          return `If ${cleanTitle} felt ${feltPrefix}${cleanFelt}, this ${cleanFeels}.`;
        }
      }
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

// Get card by slug or UUID (for backwards compatibility)
export async function getCardBySlugOrId(slugOrId: string): Promise<CachedCard | null> {
  // First try by slug
  const { data: bySlug } = await supabase
    .from("cards")
    .select("*")
    .eq("slug", slugOrId)
    .single();

  if (bySlug) {
    return bySlug as CachedCard;
  }

  // Fall back to UUID lookup
  const { data: byId } = await supabase
    .from("cards")
    .select("*")
    .eq("id", slugOrId)
    .single();

  if (byId) {
    return byId as CachedCard;
  }

  return null;
}

export async function saveCard(card: {
  tmdbId: number | null;
  title: string;
  mediaType: string;
  year: string | null;
  posterUrl: string | null;
  genres: string[] | null;
  cardContent: string;
  comparisons?: Comparison[] | null;
  provider: string;
}): Promise<{ id: string; slug: string; calibrationSentence: string | null; comparisons: Comparison[] | null } | null> {
  console.log("Attempting to save card:", { tmdbId: card.tmdbId, title: card.title, provider: card.provider });

  // Extract calibration sentence from card content
  const calibrationSentence = extractCalibrationSentence(card.cardContent);
  if (calibrationSentence) {
    console.log("Extracted calibration sentence:", calibrationSentence);
  }

  // Generate slug from title and year
  const slug = generateSlug(card.title, card.year);
  console.log("Generated slug:", slug);

  const comparisons = card.comparisons || null;

  const { data, error } = await supabase.from("cards").upsert({
    tmdb_id: card.tmdbId,
    title: card.title,
    slug,
    media_type: card.mediaType,
    year: card.year,
    poster_url: card.posterUrl,
    genres: card.genres,
    card_content: card.cardContent,
    calibration_sentence: calibrationSentence,
    comparisons,
    provider: card.provider,
  }, { onConflict: 'tmdb_id' }).select('id, slug').single();

  if (error) {
    console.error("Failed to save card:", error);
    throw new Error(`Supabase save failed: ${error.message}`);
  }

  console.log("Card saved successfully:", card.title, "ID:", data?.id, "Slug:", data?.slug);
  return data ? { id: data.id, slug: data.slug, calibrationSentence, comparisons } : null;
}
