import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getCardById } from "@/lib/supabase";
import ShareButton from "@/components/ShareButton";
import CardContent from "@/components/CardContent";

interface PageProps {
  params: { id: string };
}

// Generate dynamic metadata for OG tags
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const card = await getCardById(params.id);

  if (!card) {
    return {
      title: "Card Not Found | Texture",
    };
  }

  const description = card.calibration_sentence || "Know what it's like before you watch.";
  const ogImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://texture.watch"}/api/og/${params.id}`;

  return {
    title: `${card.title} | Texture`,
    description,
    openGraph: {
      title: `${card.title} | Texture`,
      description,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${card.title} emotional calibration card`,
        },
      ],
      type: "article",
      siteName: "Texture",
    },
    twitter: {
      card: "summary_large_image",
      title: `${card.title} | Texture`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function CardPage({ params }: PageProps) {
  const card = await getCardById(params.id);

  if (!card) {
    notFound();
  }

  const cardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://texture.watch"}/card/${params.id}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12 text-center">
          <a href="/" className="inline-block">
            <h1 className="text-5xl font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
              Texture
            </h1>
          </a>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Know what it&apos;s like before you watch
          </p>
        </header>

        <article className="prose prose-zinc dark:prose-invert max-w-none">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 relative">
            {/* Share Button */}
            <div className="absolute top-4 right-4">
              <ShareButton
                url={cardUrl}
                title={card.title}
                calibrationSentence={card.calibration_sentence}
              />
            </div>

            {/* Card Header */}
            <div className="mb-6 flex gap-5">
              {card.poster_url && (
                <div className="flex-shrink-0">
                  <Image
                    src={card.poster_url}
                    alt={card.title}
                    width={120}
                    height={180}
                    className="rounded-md shadow-md"
                  />
                </div>
              )}
              <div>
                <h2 className="m-0 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {card.title}
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {card.year} &middot; {card.media_type === "tv" ? "TV Series" : "Film"}
                </p>
                {card.genres && card.genres.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {card.genres.map((genre) => (
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

            {/* Card Content */}
            <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <CardContent content={card.card_content} />
            </div>
          </div>
        </article>

        {/* Back to search */}
        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Search for another title
          </a>
        </div>
      </div>
    </div>
  );
}
