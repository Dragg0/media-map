const TMDB_BASE_URL = "https://api.themoviedb.org/3";

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
  vote_average: number;
  genre_ids: number[];
}

interface TMDBSearchResponse {
  results: TMDBSearchResult[];
}

interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genres: { id: number; name: string }[];
  vote_average: number;
  tagline?: string;
  status?: string;
  number_of_seasons?: number;
  created_by?: { name: string }[];
  credits?: {
    cast: { name: string; character: string }[];
    crew: { name: string; job: string }[];
  };
}

export interface MediaInfo {
  id: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  year: string;
  mediaType: "movie" | "tv";
  genres: string[];
  rating: number;
  tagline?: string;
  status?: string;
  seasons?: number;
  creators?: string[];
  director?: string;
  topCast?: string[];
}

// Lightweight preview for disambiguation UI
export interface MediaPreview {
  id: number;
  title: string;
  year: string;
  posterUrl: string | null;
  mediaType: "movie" | "tv";
  overview: string;
}

async function tmdbFetch<T>(endpoint: string): Promise<T> {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) {
    throw new Error("TMDB_API_TOKEN not configured");
  }

  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status}`);
  }

  return response.json();
}

// Search and return multiple results for disambiguation
export async function searchMediaMultiple(query: string, limit: number = 5): Promise<MediaPreview[]> {
  const encoded = encodeURIComponent(query);
  const searchResponse = await tmdbFetch<TMDBSearchResponse>(
    `/search/multi?query=${encoded}&include_adult=false&language=en-US&page=1`
  );

  const results = searchResponse.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, limit);

  return results.map((r) => {
    const title = r.title || r.name || query;
    const releaseDate = r.release_date || r.first_air_date;
    const year = releaseDate ? releaseDate.split("-")[0] : "Unknown";

    return {
      id: r.id,
      title,
      year,
      posterUrl: r.poster_path
        ? `https://image.tmdb.org/t/p/w200${r.poster_path}`
        : null,
      mediaType: r.media_type,
      overview: r.overview?.slice(0, 150) + (r.overview?.length > 150 ? "..." : "") || "",
    };
  });
}

// Get full details for a specific media by ID
export async function getMediaById(id: number, mediaType: "movie" | "tv"): Promise<MediaInfo | null> {
  const detailsEndpoint =
    mediaType === "movie"
      ? `/movie/${id}?append_to_response=credits`
      : `/tv/${id}?append_to_response=credits`;

  const details = await tmdbFetch<TMDBDetails>(detailsEndpoint);

  const title = details.title || details.name || "Unknown";
  const releaseDate = details.release_date || details.first_air_date;
  const year = releaseDate ? releaseDate.split("-")[0] : "Unknown";

  const director = details.credits?.crew?.find(
    (c) => c.job === "Director"
  )?.name;

  const topCast = details.credits?.cast?.slice(0, 5).map((c) => c.name);

  return {
    id: details.id,
    title,
    overview: details.overview,
    posterUrl: details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : null,
    year,
    mediaType,
    genres: details.genres.map((g) => g.name),
    rating: details.vote_average,
    tagline: details.tagline,
    status: details.status,
    seasons: details.number_of_seasons,
    creators: details.created_by?.map((c) => c.name),
    director,
    topCast,
  };
}

export async function searchMedia(query: string): Promise<MediaInfo | null> {
  const encoded = encodeURIComponent(query);
  const searchResponse = await tmdbFetch<TMDBSearchResponse>(
    `/search/multi?query=${encoded}&include_adult=false&language=en-US&page=1`
  );

  const result = searchResponse.results.find(
    (r) => r.media_type === "movie" || r.media_type === "tv"
  );

  if (!result) {
    return null;
  }

  const detailsEndpoint =
    result.media_type === "movie"
      ? `/movie/${result.id}?append_to_response=credits`
      : `/tv/${result.id}?append_to_response=credits`;

  const details = await tmdbFetch<TMDBDetails>(detailsEndpoint);

  const title = details.title || details.name || query;
  const releaseDate = details.release_date || details.first_air_date;
  const year = releaseDate ? releaseDate.split("-")[0] : "Unknown";

  const director = details.credits?.crew?.find(
    (c) => c.job === "Director"
  )?.name;

  const topCast = details.credits?.cast?.slice(0, 5).map((c) => c.name);

  return {
    id: details.id,
    title,
    overview: details.overview,
    posterUrl: details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : null,
    year,
    mediaType: result.media_type,
    genres: details.genres.map((g) => g.name),
    rating: details.vote_average,
    tagline: details.tagline,
    status: details.status,
    seasons: details.number_of_seasons,
    creators: details.created_by?.map((c) => c.name),
    director,
    topCast,
  };
}

export function formatContextForClaude(media: MediaInfo): string {
  const lines: string[] = [
    `Title: ${media.title} (${media.year})`,
    `Type: ${media.mediaType === "tv" ? "TV Series" : "Film"}`,
    `Genres: ${media.genres.join(", ")}`,
  ];

  if (media.tagline) {
    lines.push(`Tagline: "${media.tagline}"`);
  }

  if (media.mediaType === "tv" && media.seasons) {
    lines.push(`Seasons: ${media.seasons}`);
  }

  if (media.director) {
    lines.push(`Director: ${media.director}`);
  }

  if (media.creators && media.creators.length > 0) {
    lines.push(`Created by: ${media.creators.join(", ")}`);
  }

  if (media.topCast && media.topCast.length > 0) {
    lines.push(`Starring: ${media.topCast.join(", ")}`);
  }

  lines.push(`\nSynopsis: ${media.overview}`);

  if (media.rating) {
    lines.push(`\nTMDB Rating: ${media.rating.toFixed(1)}/10`);
  }

  return lines.join("\n");
}
