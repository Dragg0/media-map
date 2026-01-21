/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

// Fetch image and convert to data URL
async function fetchAsDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/*",
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") || "What's your favorite film?";
  const style = url.searchParams.get("style") || "minimal"; // minimal, dark, gradient

  // Fetch logo
  const baseUrl = getBaseUrl(request);
  const logoDataUrl = await fetchAsDataURL(`${baseUrl}/logo/gradient.png`);
  const whiteLogoDataUrl = await fetchAsDataURL(`${baseUrl}/logo/white.svg`);

  // Style configurations
  const styles = {
    dark: {
      background: "#0a0a0a",
      textColor: "white",
      useLogo: logoDataUrl, // gradient logo on dark
    },
    gradient: {
      background: "linear-gradient(135deg, #ee8643 0%, #992f33 50%, #6a6691 100%)",
      textColor: "white",
      useLogo: whiteLogoDataUrl, // white logo on gradient
    },
    minimal: {
      background: "#8b5cf6", // purple accent color
      textColor: "white",
      useLogo: whiteLogoDataUrl, // white logo on purple
    },
  };

  const currentStyle = styles[style as keyof typeof styles] || styles.dark;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 1200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: currentStyle.background,
          color: currentStyle.textColor,
          padding: 80,
          position: "relative",
        }}
      >
        {/* Question text */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.3,
            maxWidth: 1000,
          }}
        >
          {text}
        </div>

        {/* Logo in bottom right */}
        {currentStyle.useLogo && (
          <img
            src={currentStyle.useLogo}
            width={90}
            height={90}
            style={{
              position: "absolute",
              bottom: 60,
              right: 60,
              opacity: style === "dark" ? 0.85 : 0.9,
            }}
          />
        )}

        {/* URL in bottom left */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            fontSize: 28,
            opacity: 0.7,
          }}
        >
          texture.watch
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 1200,
    }
  );
}
