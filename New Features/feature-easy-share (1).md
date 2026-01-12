# Feature Card: Easy Share

## Summary
One-tap sharing from any card to social platforms, iMessage, and clipboard. OG images auto-generate with the calibration sentence as the viral hook.

## Problem
Users can't easily share cards. No share button, no optimized preview when links are pasted. Calibration sentences—the most shareable asset—don't appear in link previews.

## Solution

### 1. Share UI
- Share button on every card (top right or bottom of card)
- Options: Copy link, Twitter/X, iMessage, native share sheet (mobile)
- Optional: "Share calibration" copies just the sentence with attribution

### 2. OG Image Generation (@vercel/og)
- Endpoint: `/api/og?id=[card_id]`
- Image includes: poster (left), title, year/type, calibration sentence (hero), texture.watch branding
- Style: The Atlantic quote card aesthetic—high contrast, generous whitespace, no ratings/emojis
- Size: 1200x630 (standard OG)

### 3. Meta Tags
```html
<meta property="og:title" content="Twilight | Texture" />
<meta property="og:description" content="If You felt uncomfortably obsessive, this may feel romantically overwhelming." />
<meta property="og:image" content="https://texture.watch/api/og?id=xxx" />
<meta property="twitter:card" content="summary_large_image" />
```

## Implementation Steps
1. Build `/api/og` route with @vercel/og
2. Add dynamic meta tags to card pages
3. Add share button component
4. Test previews on Twitter, iMessage, Slack, Discord

## Success Metric
Links shared to iMessage/Twitter display poster + calibration sentence without user doing anything extra.

## Priority
V1 (pre-launch)

## Dependencies
- Calibration sentence must be extractable from card data (not buried in markdown blob)
