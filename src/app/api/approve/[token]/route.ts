import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getSupabase();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://texture.watch";

  // Look up the pending post by token
  const { data: pendingPost, error } = await supabase
    .from("pending_posts")
    .select("*, cards:selected_card_id(*)")
    .eq("approval_token", token)
    .single();

  if (error || !pendingPost) {
    return new Response(
      generateHTML({
        title: "Invalid Link",
        message: "This approval link is invalid or has already been used.",
        success: false,
        baseUrl,
      }),
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // Check if token is expired
  if (new Date(pendingPost.token_expires_at) < new Date()) {
    return new Response(
      generateHTML({
        title: "Link Expired",
        message: "This approval link has expired.",
        success: false,
        baseUrl,
      }),
      { status: 410, headers: { "Content-Type": "text/html" } }
    );
  }

  // Check if already processed
  if (pendingPost.status !== "pending") {
    const statusMessages: Record<string, string> = {
      approved: "This post has already been approved.",
      skipped: "This post was skipped.",
      posted: "This post has already been published.",
      expired: "This post has expired.",
    };

    return new Response(
      generateHTML({
        title: "Already Processed",
        message: statusMessages[pendingPost.status] || "This post has already been processed.",
        success: true,
        baseUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // Approve the post
  const { error: updateError } = await supabase
    .from("pending_posts")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_via: "email",
    })
    .eq("id", pendingPost.id);

  if (updateError) {
    console.error("Failed to approve post:", updateError);
    return new Response(
      generateHTML({
        title: "Error",
        message: "Failed to approve the post. Please try again or use the admin dashboard.",
        success: false,
        baseUrl,
      }),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  const cardTitle = pendingPost.cards?.title || "Unknown";

  return new Response(
    generateHTML({
      title: "Post Approved!",
      message: `"${cardTitle}" has been approved and will be posted at the scheduled time.`,
      success: true,
      baseUrl,
    }),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

function generateHTML({
  title,
  message,
  success,
  baseUrl,
}: {
  title: string;
  message: string;
  success: boolean;
  baseUrl: string;
}): string {
  const iconColor = success ? "#22c55e" : "#ef4444";
  const icon = success
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Texture</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 400px;
          width: 100%;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .icon { margin-bottom: 20px; }
        h1 {
          font-size: 24px;
          color: #18181b;
          margin-bottom: 12px;
        }
        p {
          font-size: 16px;
          color: #52525b;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .button {
          display: inline-block;
          background: #18181b;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
        }
        .button:hover { background: #27272a; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">${icon}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="${baseUrl}/admin" class="button">Open Dashboard</a>
      </div>
    </body>
    </html>
  `;
}
