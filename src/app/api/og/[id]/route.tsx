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

// Get base URL for fetching assets
function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Fetch card using REST API directly (supports both slug and UUID)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // First try by slug (with cache busting)
    let response = await fetch(
      `${supabaseUrl}/rest/v1/cards?slug=eq.${encodeURIComponent(id)}&select=*`,
      {
        headers: {
          apikey: supabaseKey!,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: 'no-store',
      }
    );

    let data = await response.json();
    let card = data?.[0];

    // If not found by slug, try by UUID
    if (!card) {
      response = await fetch(
        `${supabaseUrl}/rest/v1/cards?id=eq.${id}&select=*`,
        {
          headers: {
            apikey: supabaseKey!,
            Authorization: `Bearer ${supabaseKey}`,
          },
          cache: 'no-store',
        }
      );
      data = await response.json();
      card = data?.[0];
    }

    if (!card) {
      return new ImageResponse(
        (
          <div
            style={{
              width: 1200,
              height: 1200,
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
        { width: 1200, height: 1200 }
      );
    }

    // Fetch poster as data URL (avoids remote image issues)
    const posterUrl = card.poster_url?.startsWith("http") ? card.poster_url : null;
    const posterDataUrl = posterUrl ? await fetchAsDataURL(posterUrl) : null;

    // Fetch logo
    const baseUrl = getBaseUrl(request);
    const logoDataUrl = await fetchAsDataURL(`${baseUrl}/logo/gradient.png`);

    const genreDisplay = card.genres?.[0] || "";
    const typeDisplay = card.media_type === "tv" ? "TV Series" : "Film";
    const metaLine = [card.year, typeDisplay, genreDisplay].filter(Boolean).join(" · ");
    // Strip markdown bold markers for OG display
    const rawSentence = card.calibration_sentence || "Know what it is like before you watch.";
    const calibrationSentence = rawSentence.replace(/\*\*/g, "");

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 1200,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0a0a0a",
            color: "white",
            padding: 60,
          }}
        >
          {/* Main content row */}
          <div
            style={{
              display: "flex",
              flex: 1,
              gap: 50,
              alignItems: "center",
            }}
          >
            {/* Poster */}
            <div
              style={{
                width: 380,
                height: 570,
                borderRadius: 20,
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
                  width={380}
                  height={570}
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div style={{ color: "#666", fontSize: 24 }}>No Poster</div>
              )}
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {/* Branding */}
              <div
                style={{
                  fontSize: 20,
                  letterSpacing: 6,
                  color: "#666",
                  marginBottom: 24,
                }}
              >
                TEXTURE
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: card.title.length > 20 ? 56 : 72,
                  fontWeight: 700,
                  marginBottom: 12,
                  lineHeight: 1.1,
                }}
              >
                {card.title}
              </div>

              {/* Meta */}
              <div
                style={{
                  fontSize: 26,
                  color: "#888",
                  marginBottom: 48,
                }}
              >
                {metaLine}
              </div>

              {/* Calibration Sentence */}
              <div
                style={{
                  fontSize: 32,
                  fontStyle: "italic",
                  color: "#e0e0e0",
                  borderLeft: "5px solid #8b5cf6",
                  paddingLeft: 28,
                  paddingTop: 8,
                  paddingBottom: 8,
                  lineHeight: 1.4,
                }}
              >
                {calibrationSentence}
              </div>
            </div>
          </div>

          {/* Footer with logo and URL */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 30,
            }}
          >
            {/* URL on left */}
            <div style={{ fontSize: 28, color: "#666" }}>
              texture.watch
            </div>

            {/* Logo on right */}
            {logoDataUrl && (
              <img
                src={logoDataUrl}
                width={90}
                height={90}
                style={{ opacity: 0.85 }}
              />
            )}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 1200,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    );
  } catch (err) {
    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 1200,
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
      { width: 1200, height: 1200 }
    );
  }
}
