/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

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
              background: "#0a0a0a",
              color: "white",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
            }}
          >
            Card not found
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    const genreDisplay = card.genres?.[0] || "";
    const typeDisplay = card.media_type === "tv" ? "TV Series" : "Film";
    const metaLine = [card.year, typeDisplay, genreDisplay].filter(Boolean).join(" · ");
    const calibrationSentence = card.calibration_sentence || "Know what it is like before you watch.";

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#0a0a0a",
            display: "flex",
          }}
        >
          {/* Poster Section */}
          <div
            style={{
              width: 300,
              height: "100%",
              display: "flex",
              position: "relative",
            }}
          >
            {card.poster_url ? (
              <img
                src={card.poster_url}
                width={300}
                height={630}
                style={{
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: 300,
                  height: "100%",
                  background: "#2a2a2a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#666",
                  fontSize: 24,
                }}
              >
                No Poster
              </div>
            )}
          </div>

          {/* Content Section */}
          <div
            style={{
              flex: 1,
              padding: 60,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {/* Branding */}
            <div
              style={{
                fontSize: 18,
                letterSpacing: 4,
                color: "#666",
                marginBottom: 20,
              }}
            >
              TEXTURE
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: card.title.length > 20 ? 48 : 64,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 12,
              }}
            >
              {card.title}
            </div>

            {/* Meta */}
            <div
              style={{
                fontSize: 20,
                color: "#888",
                marginBottom: 50,
              }}
            >
              {metaLine}
            </div>

            {/* Calibration Sentence */}
            <div
              style={{
                fontSize: 26,
                fontStyle: "italic",
                color: "#e0e0e0",
                borderLeft: "4px solid #8b5cf6",
                paddingLeft: 24,
                maxWidth: 650,
              }}
            >
              {calibrationSentence}
            </div>

            {/* Tagline */}
            <div
              style={{
                marginTop: "auto",
                fontSize: 16,
                color: "#555",
                display: "flex",
              }}
            >
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
            background: "#0a0a0a",
            color: "red",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
          }}
        >
          Error: {err instanceof Error ? err.message : "Unknown"}
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
