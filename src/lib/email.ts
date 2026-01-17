import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface Card {
  id: string;
  title: string;
  slug: string;
  year: string | null;
  calibration_sentence: string | null;
  poster_url: string | null;
}

interface PostPreviewEmailProps {
  selectedCard: Card;
  alternativeCards: Card[];
  approvalToken: string;
  slot: "morning" | "afternoon" | "evening";
  scheduledFor: Date;
}

export async function sendPostPreviewEmail(props: PostPreviewEmailProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://texture.watch";
  const approveUrl = `${baseUrl}/api/approve/${props.approvalToken}`;
  const adminUrl = `${baseUrl}/admin`;
  const ogImageUrl = `${baseUrl}/api/og/${props.selectedCard.slug}`;

  const slotLabels = {
    morning: "Morning (Classic)",
    afternoon: "Afternoon (Popular)",
    evening: "Evening (Prestige)",
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

        <div style="background: #18181b; color: white; padding: 16px 20px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 600;">
            ${slotLabels[props.slot]} Post Ready
          </h2>
          <p style="margin: 8px 0 0; font-size: 14px; color: #a1a1aa;">
            Scheduled for ${props.scheduledFor.toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short"
            })}
          </p>
        </div>

        <div style="padding: 0;">
          <img src="${ogImageUrl}" alt="${props.selectedCard.title}" style="width: 100%; display: block;" />
        </div>

        <div style="padding: 20px;">
          <h3 style="margin: 0 0 8px; font-size: 20px; color: #18181b;">
            ${props.selectedCard.title}
            ${props.selectedCard.year ? `<span style="color: #71717a; font-weight: normal;">(${props.selectedCard.year})</span>` : ""}
          </h3>

          <p style="margin: 0 0 20px; font-size: 15px; color: #3f3f46; line-height: 1.5; font-style: italic;">
            "${props.selectedCard.calibration_sentence || "No calibration sentence"}"
          </p>

          <a href="${approveUrl}" style="display: inline-block; background: #18181b; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Approve This Post
          </a>
        </div>

        ${props.alternativeCards.length > 0 ? `
        <div style="padding: 0 20px 20px; border-top: 1px solid #e5e5e5; margin-top: 10px;">
          <h4 style="margin: 20px 0 12px; font-size: 14px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">
            Alternatives
          </h4>
          <ul style="margin: 0; padding: 0; list-style: none;">
            ${props.alternativeCards.map(card => `
              <li style="padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 14px; color: #3f3f46;">
                ${card.title} ${card.year ? `(${card.year})` : ""}
              </li>
            `).join("")}
          </ul>
        </div>
        ` : ""}

        <div style="padding: 20px; background: #fafafa; border-top: 1px solid #e5e5e5;">
          <p style="margin: 0; font-size: 13px; color: #71717a;">
            Want to pick a different card or edit the sentence?
            <a href="${adminUrl}" style="color: #18181b; font-weight: 500;">Open admin dashboard</a>
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: "Texture <noreply@texture.watch>",
    to: process.env.ADMIN_EMAIL!,
    subject: `[Texture] ${props.slot} post: ${props.selectedCard.title}`,
    html,
  });

  if (error) {
    console.error("Failed to send email:", error);
    throw error;
  }

  return { success: true };
}
