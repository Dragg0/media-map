/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

// Create Supabase client for edge runtime
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Fetch card data
    const { data: card, error } = await supabase
      .from("cards")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !card) {
      // Return error image instead of 404
      return new ImageResponse(
        (
          <div
            style={{
              display: "flex",
              fontSize: 48,
              background: "#0a0a0a",
              color: "white",
              width: "100%",
              height: "100%",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            Card not found: {id}
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    // Test: render card title only
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 48,
            background: "#0a0a0a",
            color: "white",
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            padding: 60,
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 700, marginBottom: 20 }}>
            {card.title}
          </div>
          <div style={{ fontSize: 24, color: "#888" }}>
            {card.year} · {card.media_type === "tv" ? "TV Series" : "Film"}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err) {
    // Return error image
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            fontSize: 32,
            background: "#0a0a0a",
            color: "red",
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          Error: {err instanceof Error ? err.message : "Unknown error"}
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
