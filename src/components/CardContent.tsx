"use client";

import React from "react";
import Link from "next/link";

export interface ComparisonData {
  title: string;
  original_title?: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  year: string;
  slug: string;
  phrase: string;
}

interface CardContentProps {
  content: string;
  comparisons?: ComparisonData[] | null;
  onTitleClick?: (title: string, tmdbId?: number, mediaType?: "movie" | "tv") => void;
}

export default function CardContent({ content, comparisons, onTitleClick }: CardContentProps) {
  // Find comparison data by title (case-insensitive, checks both original and resolved titles)
  const findComparison = (title: string): ComparisonData | undefined => {
    if (!comparisons) return undefined;
    const normalizedTitle = title.toLowerCase().trim();
    return comparisons.find((c) => {
      // Check against original title first (what Claude wrote), then resolved TMDB title
      const originalMatch = c.original_title?.toLowerCase().trim() === normalizedTitle;
      const resolvedMatch = c.title.toLowerCase().trim() === normalizedTitle;
      return originalMatch || resolvedMatch;
    });
  };

  // Title link component - uses comparison data if available
  const TitleLink = ({ title, keyId }: { title: string; keyId: string }) => {
    const comparison = findComparison(title);

    // If we have comparison data with a slug, link directly
    if (comparison?.slug) {
      if (onTitleClick) {
        // On main page, use click handler to generate if needed
        return (
          <button
            key={keyId}
            onClick={() => onTitleClick(comparison.title, comparison.tmdb_id, comparison.media_type)}
            className="italic text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 hover:decoration-zinc-500 dark:hover:decoration-zinc-400 cursor-pointer bg-transparent border-none p-0 font-inherit transition-colors"
          >
            {title}
          </button>
        );
      }
      // On card page, link directly to the card (will generate if needed)
      return (
        <Link
          key={keyId}
          href={`/card/${comparison.slug}`}
          className="italic text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 hover:decoration-zinc-500 dark:hover:decoration-zinc-400 cursor-pointer transition-colors"
        >
          {title}
        </Link>
      );
    }

    // Fallback: use click handler with just title (old behavior)
    if (onTitleClick) {
      return (
        <button
          key={keyId}
          onClick={() => onTitleClick(title)}
          className="italic text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 hover:decoration-zinc-500 dark:hover:decoration-zinc-400 cursor-pointer bg-transparent border-none p-0 font-inherit transition-colors"
        >
          {title}
        </button>
      );
    }

    // No click handler, just styled text
    return (
      <span key={keyId} className="italic text-zinc-600 dark:text-zinc-400">
        {title}
      </span>
    );
  };

  const formatInline = (str: string, keyPrefix: string): React.ReactNode[] => {
    const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${keyPrefix}-${j}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        const innerText = part.slice(1, -1);
        return <TitleLink key={`${keyPrefix}-${j}`} title={innerText} keyId={`${keyPrefix}-${j}`} />;
      }
      return part;
    });
  };

  // Check if line is a calibration sentence: "If [Title] felt [X], this feels/may feel [Y]"
  const renderCalibrationSentence = (line: string, key: number) => {
    // First, aggressively normalize the line - strip all asterisks and clean up spacing
    let cleanLine = line.trim();

    // Remove outer asterisks
    cleanLine = cleanLine.replace(/^\*+|\*+$/g, "").trim();

    // Fix common AI formatting errors: "*If*Title*" → "If Title"
    // Replace patterns like "*If*" at the start with just "If "
    cleanLine = cleanLine.replace(/^\*?If\*?\s*/i, "If ");

    // Remove remaining asterisks around the title and normalize spaces
    // Pattern: "If*Title*felt" → "If Title felt"
    cleanLine = cleanLine.replace(/\*+/g, " ").replace(/\s+/g, " ").trim();

    // Match calibration pattern - handle both "this feels" and "this may feel"
    // Also handle when AI uses the movie title instead of "this" (e.g., "Napoleon Dynamite feels like")
    // Now the line should be clean: "If Title felt X, this/MovieTitle feels Y"
    const match = cleanLine.match(/^If\s+(.+?)\s+felt\s+(.+?),\s*(.+?)\s+((?:may\s+)?feel[s]?\s+.+)$/i);
    if (match) {
      const [, titlePart, feltPart, subjectPart, feelsPart] = match;
      const cleanTitle = titlePart.trim();
      // Strip trailing period from the ending
      const cleanEnding = feelsPart.replace(/\.*$/, "").trim();
      // Normalize subject to "this" for consistent display
      const isThisSubject = subjectPart.toLowerCase().trim() === "this";
      return (
        <div key={key} className="mt-4 italic text-zinc-600 dark:text-zinc-400">
          If <TitleLink title={cleanTitle} keyId={`${key}-cal`} /> felt {feltPart}, {isThisSubject ? "this" : subjectPart} {cleanEnding}
        </div>
      );
    }
    return null;
  };

  // Pre-process: fix Gemini's habit of putting "-" on its own line
  const processedText = content.replace(/^-\s*\n/gm, "- ");

  const lines = processedText.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Handle comparison bullets: "- Title → description" or "- *Title* → description"
        if (line.startsWith("- ")) {
          const bulletContent = line.slice(2);
          const arrowMatch = bulletContent.match(/^(.+?)\s*→\s*(.*)$/);

          if (arrowMatch) {
            const [, compTitle, description] = arrowMatch;
            // Strip ALL asterisks from title (handles *Title*, Title*, *Title, etc.)
            const cleanTitle = compTitle.trim().replace(/\*/g, "");
            return (
              <div key={i} className="flex gap-2 ml-2">
                <span>-</span>
                <span>
                  <TitleLink title={cleanTitle} keyId={`${i}-title`} />
                  <span> → {description}</span>
                </span>
              </div>
            );
          }

          return (
            <div key={i} className="flex gap-2 ml-2">
              <span>-</span>
              <span>{formatInline(bulletContent, `${i}`)}</span>
            </div>
          );
        }

        // Check for calibration sentence
        const calibration = renderCalibrationSentence(line, i);
        if (calibration) return calibration;

        return <div key={i}>{formatInline(line, `${i}`)}</div>;
      })}
    </div>
  );
}
