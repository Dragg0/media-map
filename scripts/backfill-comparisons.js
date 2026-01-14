// Backfill comparisons for existing cards
// Run with: node scripts/backfill-comparisons.js

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TMDB_TOKEN = process.env.TMDB_API_TOKEN;

function parseComparisons(cardContent) {
  const comparisons = [];
  const pattern = /^-\s*\*?([^*→\->]+?)\*?\s*(?:→|->)\s*(.+)$/gm;
  let match;
  while ((match = pattern.exec(cardContent)) !== null) {
    const title = match[1].trim();
    const phrase = match[2].trim();
    if (title && phrase) comparisons.push({ title, phrase });
  }
  return comparisons;
}

function generateSlug(title, year) {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return year ? `${baseSlug}-${year}` : baseSlug;
}

function extractCalibrationSentence(cardContent) {
  // Split into lines and find lines that match the calibration pattern
  // but are NOT bullet points (don't start with - or *)
  const lines = cardContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip bullet points
    if (trimmedLine.startsWith('-') || (trimmedLine.startsWith('*') && !trimmedLine.startsWith('*If'))) {
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

async function resolveTmdb(title) {
  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}&include_adult=false`,
    { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } }
  );
  const data = await res.json();
  const match = data.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv');
  if (!match) return null;
  const year = (match.release_date || match.first_air_date || '').split('-')[0] || 'Unknown';
  return {
    title: match.title || match.name,
    tmdb_id: match.id,
    media_type: match.media_type,
    year
  };
}

async function backfill() {
  // Re-process all cards to add original_title field and calibration_sentence
  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, title, card_content, calibration_sentence');

  if (error) {
    console.error('Error fetching cards:', error);
    return;
  }

  console.log(`Found ${cards?.length || 0} cards to backfill`);

  for (const card of cards || []) {
    const parsed = parseComparisons(card.card_content);
    const calibrationSentence = extractCalibrationSentence(card.card_content);

    // Track what we need to update
    const updateData = {};

    // Extract calibration sentence (always re-extract to fix any bad values)
    if (calibrationSentence) {
      updateData.calibration_sentence = calibrationSentence;
      console.log(`"${card.title}" - calibration: "${calibrationSentence.substring(0, 60)}..."`);
    }

    if (parsed.length === 0 && Object.keys(updateData).length === 0) {
      console.log(`Skipping "${card.title}" - nothing to update`);
      continue;
    }

    console.log(`Processing "${card.title}" - found ${parsed.length} comparisons`);

    if (parsed.length > 0) {
      const resolved = [];
      for (const p of parsed) {
        const tmdb = await resolveTmdb(p.title);
        if (tmdb) {
          resolved.push({
            ...tmdb,
            original_title: p.title, // Store original for matching
            slug: generateSlug(tmdb.title, tmdb.year),
            phrase: p.phrase
          });
          console.log(`  ✓ Resolved "${p.title}" -> ${tmdb.title} (${tmdb.year})`);
        } else {
          console.log(`  ✗ Could not resolve "${p.title}"`);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }

      if (resolved.length > 0) {
        updateData.comparisons = resolved;
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('cards')
        .update(updateData)
        .eq('id', card.id);

      if (updateError) {
        console.error(`  Error updating card:`, updateError);
      } else {
        console.log(`  Updated: ${Object.keys(updateData).join(', ')}`);
      }
    }
  }

  console.log('\nDone!');
}

backfill();
