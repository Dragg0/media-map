/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

// Fetch image and convert to data URL
async function fetchAsDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*",
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Fetch card using REST API directly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/cards?id=eq.${id}&select=*`,
      {
        headers: {
          apikey: supabaseKey!,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const data = await response.json();
    const card = data?.[0];

    if (!card) {
      return new ImageResponse(
        (
          <div
            style={{
              width: 1200,
              height: 630,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#0a0a0a",
              color: "white",
              fontSize: 48,
            }}
          >
            Card not found
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    // Fetch poster as data URL (avoids remote image issues)
    const posterUrl = card.poster_url?.startsWith("http") ? card.poster_url : null;
    const posterDataUrl = posterUrl ? await fetchAsDataURL(posterUrl) : null;

    const genreDisplay = card.genres?.[0] || "";
    const typeDisplay = card.media_type === "tv" ? "TV Series" : "Film";
    const metaLine = [card.year, typeDisplay, genreDisplay].filter(Boolean).join(" · ");
    const calibrationSentence = card.calibration_sentence || "Know what it is like before you watch.";

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            backgroundColor: "#0a0a0a",
            color: "white",
            padding: 48,
            gap: 36,
          }}
        >
          {/* Poster */}
          <div
            style={{
              width: 280,
              height: 534,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#222",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {posterDataUrl ? (
              <img
                src={posterDataUrl}
                width={280}
                height={534}
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div style={{ color: "#666", fontSize: 20 }}>No Poster</div>
            )}
          </div>

          {/* Content */}
          <div
            style={{
              width: 788,
              height: 534,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Branding */}
            <div
              style={{
                fontSize: 16,
                letterSpacing: 4,
                color: "#666",
                marginBottom: 16,
              }}
            >
              TEXTURE
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: card.title.length > 25 ? 44 : 56,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              {card.title}
            </div>

            {/* Meta */}
            <div
              style={{
                fontSize: 20,
                color: "#888",
                marginBottom: 40,
              }}
            >
              {metaLine}
            </div>

            {/* Calibration Sentence */}
            <div
              style={{
                fontSize: 24,
                fontStyle: "italic",
                color: "#e0e0e0",
                borderLeft: "4px solid #8b5cf6",
                paddingLeft: 20,
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              {calibrationSentence}
            </div>

            {/* Spacer */}
            <div style={{ flexGrow: 1 }}></div>

            {/* Tagline */}
            <div style={{ fontSize: 16, color: "#555" }}>
              texture.watch
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (err) {
    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0a0a0a",
            color: "red",
            fontSize: 28,
            padding: 40,
          }}
        >
          OG ERROR: {err instanceof Error ? err.message : String(err)}
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
