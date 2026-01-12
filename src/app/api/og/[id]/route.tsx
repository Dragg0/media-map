/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Test with hardcoded data (no Supabase)
  const testCard = {
    title: "Test Movie",
    year: "2024",
    media_type: "movie",
  };

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
          {testCard.title}
        </div>
        <div style={{ fontSize: 24, color: "#888" }}>
          {testCard.year} · Film
        </div>
        <div style={{ fontSize: 18, color: "#666", marginTop: 20 }}>
          ID: {id}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
