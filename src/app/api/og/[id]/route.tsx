import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

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

  if (!card) {
    return new ImageResponse(
      (
        <div
          style={{
            background: "black",
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

  return new ImageResponse(
    (
      <div
        style={{
          background: "black",
          color: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 72,
        }}
      >
        {card.title}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
