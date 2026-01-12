/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Minimal test - just render text
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          fontSize: 48,
          background: "black",
          color: "white",
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        Test OG Image - {id}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
