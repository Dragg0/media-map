import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;

  if (!token) return false;

  const supabase = getSupabase();
  const { data: session } = await supabase
    .from("admin_sessions")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  return !!session;
}

const REGENERATE_PROMPT = `You are generating calibration sentences for a movie/TV show emotional preview app.

A calibration sentence is the viral hook—the one line that captures the specific emotional delta between two titles.

## EXACT FORMAT
*If *Title* felt like X, this feels like Y.*

The sentence must be in italics (wrapped in *), with the comparison title double-italicized (wrapped in **).

## HARD RULES
1. NO lazy comparatives: "more," "less," "lighter," "darker," "heavier," "scarier" are BANNED
2. NO vague adjectives: "interesting," "engaging," "intense" are BANNED
3. Use CONCRETE metaphors: nouns and verbs, not just adjectives
4. The Z clause (after "this feels like") must invoke physical sensation, post-watch behavior, or emotional aftertaste
5. Must pass the screenshot test—would someone text this to a friend because it nails the feeling?

## EXAMPLES OF STRONG SENTENCES
- *If *Inception* felt intellectually challenging, this may feel emotionally exhausting.*
- *If *Ted Lasso* felt like a warm hug, this feels like a warm hug that makes you want to call your mom and apologize.*
- *If *Hereditary* felt like dread in the walls, this feels like realizing the walls were listening.*

Generate 4 different calibration sentences. Use different comparison titles for each. Return only the sentences, one per line, no numbering or extra text.`;

export async function POST(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { card_id } = await request.json();

    if (!card_id) {
      return NextResponse.json(
        { error: "card_id is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Fetch the card
    const { data: card, error } = await supabase
      .from("cards")
      .select("*")
      .eq("id", card_id)
      .single();

    if (error || !card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Build context for AI
    const context = `
Title: ${card.title} (${card.year || "Unknown year"})
Type: ${card.media_type === "tv" ? "TV Series" : "Film"}
Genres: ${(card.genres || []).join(", ") || "Unknown"}
Current calibration sentence: ${card.calibration_sentence || "None"}
`;

    // Call Claude
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${REGENERATE_PROMPT}\n\n## CARD CONTEXT\n${context}\n\nGenerate 4 alternative calibration sentences for this title. Use different comparison titles than the current sentence.`,
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Failed to generate sentences" },
        { status: 500 }
      );
    }

    // Parse sentences (one per line)
    const sentences = textBlock.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("*") && line.endsWith("*"));

    if (sentences.length === 0) {
      // If parsing failed, return the raw text split by newlines
      const fallbackSentences = textBlock.text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 20);

      return NextResponse.json({ sentences: fallbackSentences.slice(0, 4) });
    }

    return NextResponse.json({ sentences: sentences.slice(0, 4) });
  } catch (error) {
    console.error("Regenerate error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate sentences" },
      { status: 500 }
    );
  }
}

// PATCH: Save a selected sentence to the card
export async function PATCH(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { card_id, calibration_sentence } = await request.json();

    if (!card_id || !calibration_sentence) {
      return NextResponse.json(
        { error: "card_id and calibration_sentence are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("cards")
      .update({ calibration_sentence })
      .eq("id", card_id);

    if (error) {
      console.error("Failed to update calibration sentence:", error);
      return NextResponse.json(
        { error: "Failed to update" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save sentence error:", error);
    return NextResponse.json(
      { error: "Failed to save sentence" },
      { status: 500 }
    );
  }
}
