"use client";

import React from "react";

interface CardContentProps {
  content: string;
  onTitleClick?: (title: string) => void;
}

export default function CardContent({ content, onTitleClick }: CardContentProps) {
  // Title link component - clickable if onTitleClick provided, otherwise just styled
  const TitleLink = ({ title, keyId }: { title: string; keyId: string }) => {
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
    // Strip outer asterisks and whitespace from the entire line first
    const cleanLine = line.trim().replace(/^\*+|\*+$/g, "").trim();

    // Match calibration pattern - handle both "this feels" and "this may feel"
    const match = cleanLine.match(/^If\s*\*?(.+?)\*?\s*felt (.+?),\s*this ((?:may )?feel[s]? .+)$/i);
    if (match) {
      const [, titlePart, feltPart, feelsPart] = match;
      // Strip ALL asterisks from title and clean up
      const cleanTitle = titlePart.replace(/\*/g, "").trim();
      // Strip trailing period/asterisk from the ending
      const cleanEnding = feelsPart.replace(/\.*\**$/, "").trim();
      return (
        <div key={key} className="mt-4 italic text-zinc-600 dark:text-zinc-400">
          If <TitleLink title={cleanTitle} keyId={`${key}-cal`} /> felt {feltPart}, this {cleanEnding}
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
