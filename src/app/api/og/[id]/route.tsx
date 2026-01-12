import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Fetch card using REST API directly (more reliable in edge runtime)
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

    // Debug: show what we got
    return new ImageResponse(
      (
        <div
          style={{
            background: "black",
            color: "white",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            padding: 40,
          }}
        >
          <div>ID: {id}</div>
          <div style={{ marginTop: 20 }}>
            Title: {card?.title || "NO TITLE"}
          </div>
          <div style={{ marginTop: 20, fontSize: 20, color: "#888" }}>
            Data length: {data?.length || 0}
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
            background: "black",
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
