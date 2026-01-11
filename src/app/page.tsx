"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";

interface MediaMetadata {
  title: string;
  year: string;
  posterUrl: string | null;
  mediaType: "movie" | "tv";
  genres: string[];
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [card, setCard] = useState("");
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search for a title (used by form and clickable links)
  const searchTitle = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setTitle(searchQuery);
    setIsLoading(true);
    setCard("");
    setMetadata(null);
    setError("");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: searchQuery.trim() }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to generate card");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let metadataParsed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });

        if (!metadataParsed && accumulated.includes("__END_METADATA__")) {
          const metadataMatch = accumulated.match(
            /__METADATA__(.+?)__END_METADATA__/
          );
          if (metadataMatch) {
            try {
              const parsed = JSON.parse(metadataMatch[1]);
              setMetadata(parsed.data);
            } catch {
              // Ignore parsing errors
            }
            accumulated = accumulated.replace(
              /__METADATA__.+?__END_METADATA__/,
              ""
            );
            metadataParsed = true;
          }
        }

        const displayContent = metadataParsed
          ? accumulated
          : accumulated.replace(/__METADATA__.+?(__END_METADATA__)?/, "");
        setCard(displayContent);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Clickable title link component
  const TitleLink = ({ title: linkTitle, keyId }: { title: string; keyId: string }) => (
    <button
      key={keyId}
      onClick={() => searchTitle(linkTitle)}
      className="italic text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 hover:decoration-zinc-500 dark:hover:decoration-zinc-400 cursor-pointer bg-transparent border-none p-0 font-inherit transition-colors"
    >
      {linkTitle}
    </button>
  );

  // Markdown renderer with clickable title links
  const renderMarkdown = useCallback((text: string) => {
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

    // Check if line is a calibration sentence: "If [Title] felt [X], this may feel [Y]"
    const renderCalibrationSentence = (line: string, key: number) => {
      const match = line.match(/^If (.+?) felt (.+?), this may feel (.+)$/i);
      if (match) {
        const [, titlePart, feltPart, mayFeelPart] = match;
        return (
          <div key={key} className="mt-4 italic text-zinc-600 dark:text-zinc-400">
            If <TitleLink title={titlePart} keyId={`${key}-cal`} /> felt {feltPart}, this may feel {mayFeelPart}
          </div>
        );
      }
      return null;
    };

    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Handle comparison bullets: "- Title → description"
      if (line.startsWith("- ")) {
        const content = line.slice(2);
        const arrowMatch = content.match(/^(.+?)\s*→\s*(.*)$/);

        if (arrowMatch) {
          const [, compTitle, description] = arrowMatch;
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span>-</span>
              <span>
                <TitleLink title={compTitle.trim()} keyId={`${i}-title`} />
                <span> → {description}</span>
              </span>
            </div>
          );
        }

        return (
          <div key={i} className="flex gap-2 ml-2">
            <span>-</span>
            <span>{formatInline(content, `${i}`)}</span>
          </div>
        );
      }

      // Check for calibration sentence
      const calibration = renderCalibrationSentence(line, i);
      if (calibration) return calibration;

      return <div key={i}>{formatInline(line, `${i}`)}</div>;
    });
  }, [searchTitle]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchTitle(title);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            How does it feel?
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Understand the emotional experience before you watch
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a show or movie title..."
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !title.trim()}
              className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isLoading ? "..." : "Go"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {(card || metadata) && (
          <article className="prose prose-zinc dark:prose-invert max-w-none">
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              {metadata && (
                <div className="mb-6 flex gap-5">
                  {metadata.posterUrl && (
                    <div className="flex-shrink-0">
                      <Image
                        src={metadata.posterUrl}
                        alt={metadata.title}
                        width={120}
                        height={180}
                        className="rounded-md shadow-md"
                      />
                    </div>
                  )}
                  <div>
                    <h2 className="m-0 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {metadata.title}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {metadata.year} &middot;{" "}
                      {metadata.mediaType === "tv" ? "TV Series" : "Film"}
                    </p>
                    {metadata.genres.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {metadata.genres.map((genre) => (
                          <span
                            key={genre}
                            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {card && (
                <div className={metadata ? "border-t border-zinc-100 pt-5 dark:border-zinc-800" : ""}>
                  <div className="space-y-1">{renderMarkdown(card)}</div>
                </div>
              )}
            </div>
          </article>
        )}

        {isLoading && !card && !metadata && (
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"></div>
          </div>
        )}
      </div>
    </div>
  );
}
