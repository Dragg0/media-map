import { ImageResponse } from "@vercel/og";
import { getCardById } from "@/lib/supabase";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Fetch card data
  const card = await getCardById(id);

  if (!card) {
    return new Response("Card not found", { status: 404 });
  }

  // Get first genre for display
  const genreDisplay = card.genres?.[0] || "";
  const typeDisplay = card.media_type === "tv" ? "TV Series" : "Film";
  const metaLine = [card.year, typeDisplay, genreDisplay].filter(Boolean).join(" · ");

  // Use calibration sentence or fallback
  const calibrationSentence = card.calibration_sentence || "Know what it's like before you watch.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
          display: "flex",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Poster Section */}
        <div
          style={{
            width: "300px",
            height: "100%",
            flexShrink: 0,
            position: "relative",
            display: "flex",
          }}
        >
          {card.poster_url ? (
            <img
              src={card.poster_url}
              alt={card.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#2a2a2a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#666",
                fontSize: "24px",
              }}
            >
              No Poster
            </div>
          )}
          {/* Gradient overlay */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "80px",
              height: "100%",
              background: "linear-gradient(to right, transparent, #0a0a0a)",
            }}
          />
        </div>

        {/* Content Section */}
        <div
          style={{
            flex: 1,
            padding: "60px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {/* Branding */}
          <div
            style={{
              fontSize: "18px",
              textTransform: "uppercase",
              letterSpacing: "4px",
              color: "#666",
              marginBottom: "20px",
            }}
          >
            TEXTURE
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: card.title.length > 20 ? "48px" : "64px",
              fontWeight: 700,
              color: "#fff",
              marginBottom: "12px",
              lineHeight: 1.1,
            }}
          >
            {card.title}
          </div>

          {/* Meta */}
          <div
            style={{
              fontSize: "20px",
              color: "#888",
              marginBottom: "50px",
            }}
          >
            {metaLine}
          </div>

          {/* Calibration Sentence */}
          <div
            style={{
              fontSize: "28px",
              fontStyle: "italic",
              color: "#e0e0e0",
              lineHeight: 1.4,
              borderLeft: "4px solid #8b5cf6",
              paddingLeft: "24px",
              maxWidth: "700px",
            }}
          >
            "{calibrationSentence}"
          </div>

          {/* Tagline */}
          <div
            style={{
              marginTop: "auto",
              paddingTop: "40px",
              fontSize: "16px",
              color: "#555",
              display: "flex",
            }}
          >
            texture.watch ·{" "}
            <span style={{ color: "#888", marginLeft: "8px" }}>
              Know what it's like before you watch
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
