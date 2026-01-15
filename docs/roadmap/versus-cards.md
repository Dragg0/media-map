# Versus Cards (Visual Algebra)

## Status: Planned

## Concept

The Versus Card uses "Visual Algebra" to describe vibes through relationships rather than words.

Instead of saying "This movie is paranoid and gritty," you say:
**"This movie = The Conversation + Enemy of the State"**

## How It Works

### Triangulation
- **The Anchor**: A movie everyone knows (e.g., Arrival)
- **The Unknown**: The movie you want them to watch (e.g., Vast of Night)
- **The Equation**: Shared data points connecting them (e.g., "Smart Sci-Fi" + "Low Budget" + "Dialogue Heavy")

It turns a recommendation into a proof. Not just "you might like this" - it's "these two things are chemically similar."

## Implementation

### 1. The Comparison Page
Route: `texture.watch/compare/[movie-a]-vs-[movie-b]`

Content:
- **Shared DNA**: Tags both movies share (e.g., "Slow Burn," "Synth Score")
- **Contrast**: Where they differ (e.g., "Movie A is Gory," "Movie B is Psychological")
- **Verdict**: Text summary of why they pair well

### 2. The Versus Card (OG Image)
The card is the dynamically generated OG image for the comparison URL.

- Pulls poster for Movie A
- Pulls poster for Movie B
- Shows top 3 shared tags
- Generated on the fly, not designed manually

## Existing Data

Cards already have a `comparisons` array with:
```json
{
  "slug": "avatar-the-last-airbender-2005",
  "title": "Avatar: The Last Airbender",
  "phrase": "Similar blend of martial arts philosophy and fantasy, but with more mature themes of loss"
}
```

This can seed the comparison logic.

## Open Questions

1. **Scope**: Only compare movies that already reference each other, or compute any two dynamically?
2. **AI Generation**: Generate comparison text on the fly for arbitrary pairs?
3. **Platform**: Best format for Instagram vs Twitter vs others?

## Why This Matters

- Proves the underlying data model works
- Not guessing movies are alike - the system *knows* they share specific data points
- Differentiates Texture from simple recommendation engines

---

*Logged: 2026-01-15*
