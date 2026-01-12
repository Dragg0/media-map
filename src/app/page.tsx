"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import ShareButton from "@/components/ShareButton";

interface MediaMetadata {
  id?: string;
  title: string;
  year: string;
  posterUrl: string | null;
  mediaType: "movie" | "tv";
  genres: string[];
  calibrationSentence?: string | null;
}

interface SearchResult {
  id: number;
  title: string;
  year: string;
  posterUrl: string | null;
  mediaType: "movie" | "tv";
  overview: string;
  isCached: boolean;
}

// Sort results: exact title matches first, then by year descending
function sortSearchResults(results: SearchResult[], query: string): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  return [...results].sort((a, b) => {
    const aTitle = a.title.trim().toLowerCase();
    const bTitle = b.title.trim().toLowerCase();
    const aExact = aTitle === normalizedQuery;
    const bExact = bTitle === normalizedQuery;

    // Exact matches first
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    // Then by year descending
    const aYear = parseInt(a.year) || 0;
    const bYear = parseInt(b.year) || 0;
    if (aYear !== bYear) return bYear - aYear;

    // Stable fallback: maintain original order
    return 0;
  });
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [card, setCard] = useState("");
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [forceProviderRef, setForceProviderRef] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [searchResults]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && searchResults.length > 0) {
      const highlightedItem = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex, searchResults.length]);

  // Generate card for a specific media (by ID or title)
  const generateCard = useCallback(async (params: { title?: string; tmdbId?: number; mediaType?: "movie" | "tv"; forceProvider?: string }) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsLoading(true);
    setCard("");
    setMetadata(null);
    setError("");
    setSearchResults([]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
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
      let currentMetadata: MediaMetadata | null = null;

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
              currentMetadata = parsed.data;
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

        // Check for card info at the end of stream (contains ID and calibration sentence)
        if (accumulated.includes("__END_CARD_INFO__")) {
          const cardInfoMatch = accumulated.match(
            /__CARD_INFO__(.+?)__END_CARD_INFO__/
          );
          if (cardInfoMatch) {
            try {
              const cardInfo = JSON.parse(cardInfoMatch[1]);
              // Update metadata with card ID and calibration sentence
              if (currentMetadata) {
                setMetadata({
                  ...currentMetadata,
                  id: cardInfo.id,
                  calibrationSentence: cardInfo.calibrationSentence,
                });
              }
            } catch {
              // Ignore parsing errors
            }
            accumulated = accumulated.replace(
              /__CARD_INFO__.+?__END_CARD_INFO__/,
              ""
            );
          }
        }

        const displayContent = metadataParsed
          ? accumulated.replace(/__CARD_INFO__.+?(__END_CARD_INFO__)?/, "")
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
  }, []);

  // Search for a title - shows disambiguation if multiple results
  const searchTitle = useCallback(async (searchQuery: string, forceProvider?: string) => {
    if (!searchQuery.trim() || isLoading || isSearching) return;

    setTitle(searchQuery);
    setIsSearching(true);
    setCard("");
    setMetadata(null);
    setError("");
    setSearchResults([]);
    setForceProviderRef(forceProvider);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const { results } = await response.json();

      if (results.length === 0) {
        // No results, try generating anyway with just the title
        setIsSearching(false);
        generateCard({ title: searchQuery.trim(), forceProvider });
      } else if (results.length === 1) {
        // Only one result, generate directly
        setIsSearching(false);
        generateCard({ tmdbId: results[0].id, mediaType: results[0].mediaType, forceProvider });
      } else {
        // Multiple results, show picker (sorted with exact matches first)
        setSearchResults(sortSearchResults(results, searchQuery));
        setIsSearching(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setIsSearching(false);
    }
  }, [isLoading, isSearching, generateCard]);

  // Handle selection from disambiguation picker
  const handleSelectResult = useCallback((result: SearchResult) => {
    setTitle(result.title);
    generateCard({ tmdbId: result.id, mediaType: result.mediaType, forceProvider: forceProviderRef });
  }, [generateCard, forceProviderRef]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore if composing (IME input)
    if (e.nativeEvent.isComposing) return;

    // Only handle navigation when disambiguation list is visible
    if (searchResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        handleSelectResult(searchResults[highlightIndex]);
        break;
      case "Escape":
        e.preventDefault();
        setSearchResults([]);
        inputRef.current?.focus();
        break;
    }
  }, [searchResults, highlightIndex, handleSelectResult]);

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

    // Check if line is a calibration sentence: "If [Title] felt [X], this feels/may feel [Y]"
    const renderCalibrationSentence = (line: string, key: number) => {
      // Strip outer asterisks and whitespace from the entire line first
      const cleanLine = line.trim().replace(/^\*+|\*+$/g, '').trim();

      // Match calibration pattern - handle both "this feels" and "this may feel"
      // Also handle asterisks around title with or without spaces
      const match = cleanLine.match(/^If\s*\*?(.+?)\*?\s*felt (.+?),\s*this ((?:may )?feel[s]? .+)$/i);
      if (match) {
        const [, titlePart, feltPart, feelsPart] = match;
        // Strip ALL asterisks from title and clean up
        const cleanTitle = titlePart.replace(/\*/g, '').trim();
        // Strip trailing period/asterisk from the ending
        const cleanEnding = feelsPart.replace(/\.*\**$/, '').trim();
        return (
          <div key={key} className="mt-4 italic text-zinc-600 dark:text-zinc-400">
            If <TitleLink title={cleanTitle} keyId={`${key}-cal`} /> felt {feltPart}, this {cleanEnding}
          </div>
        );
      }
      return null;
    };

    // Pre-process: fix Gemini's habit of putting "-" on its own line
    const processedText = text.replace(/^-\s*\n/gm, '- ');

    const lines = processedText.split("\n");
    return lines.map((line, i) => {
      // Handle comparison bullets: "- Title → description" or "- *Title* → description"
      if (line.startsWith("- ")) {
        const content = line.slice(2);
        const arrowMatch = content.match(/^(.+?)\s*→\s*(.*)$/);

        if (arrowMatch) {
          const [, compTitle, description] = arrowMatch;
          // Strip ALL asterisks from title (handles *Title*, Title*, *Title, etc.)
          const cleanTitle = compTitle.trim().replace(/\*/g, '');
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

  const handleSubmit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    const forceProvider = (e as React.MouseEvent).shiftKey ? "claude" : undefined;
    searchTitle(title, forceProvider);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
            Texture
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Know what it&apos;s like before you watch
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a show or movie title..."
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
              disabled={isLoading || isSearching}
              role={searchResults.length > 0 ? "combobox" : undefined}
              aria-expanded={searchResults.length > 0}
              aria-controls={searchResults.length > 0 ? "disambiguation-list" : undefined}
              aria-activedescendant={searchResults.length > 0 ? `result-${highlightIndex}` : undefined}
            />
            <button
              type="submit"
              disabled={isLoading || isSearching || !title.trim()}
              onClick={handleSubmit}
              className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              title="Shift+Click to use Claude"
            >
              {isLoading || isSearching ? "..." : "Go"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Multiple matches found. Which one did you mean?
            </p>
            <div
              ref={listRef}
              id="disambiguation-list"
              role="listbox"
              aria-label="Search results"
              className="space-y-2"
            >
              {searchResults.map((result, index) => (
                <button
                  key={`${result.mediaType}-${result.id}`}
                  id={`result-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === highlightIndex}
                  onClick={() => handleSelectResult(result)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={`w-full flex items-start gap-4 p-3 rounded-lg border transition-colors text-left ${
                    index === highlightIndex
                      ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
                      : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                  }`}
                >
                  {result.posterUrl ? (
                    <Image
                      src={result.posterUrl}
                      alt={result.title}
                      width={48}
                      height={72}
                      className="rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-18 bg-zinc-200 dark:bg-zinc-700 rounded flex-shrink-0 flex items-center justify-center text-zinc-400 text-xs">
                      No img
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {result.title}
                      </span>
                      {result.isCached && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          Cached
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {result.year} · {result.mediaType === "tv" ? "TV Series" : "Film"}
                    </p>
                    {result.overview && (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 line-clamp-2">
                        {result.overview}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {(card || metadata) && (
          <article className="prose prose-zinc dark:prose-invert max-w-none">
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 relative">
              {/* Share Button */}
              {metadata?.id && (
                <div className="absolute top-4 right-4">
                  <ShareButton
                    url={`${typeof window !== 'undefined' ? window.location.origin : ''}/card/${metadata.id}`}
                    title={metadata.title}
                    calibrationSentence={metadata.calibrationSentence || null}
                  />
                </div>
              )}
              {metadata && (
                <div className="mb-6 flex gap-5 pr-12">
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

        {(isLoading || isSearching) && !card && !metadata && searchResults.length === 0 && (
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"></div>
          </div>
        )}
      </div>
    </div>
  );
}
