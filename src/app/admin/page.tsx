"use client";

import { useState, useEffect, useCallback } from "react";

interface Card {
  id: string;
  title: string;
  slug: string;
  year: string | null;
  calibration_sentence: string | null;
  poster_url: string | null;
  genres: string[] | null;
}

interface PendingPost {
  id: string;
  slot: "morning" | "afternoon" | "evening";
  scheduled_for: string;
  selected_card_id: string;
  alternative_card_ids: string[];
  status: "pending" | "approved" | "skipped" | "posted" | "expired";
  selected_card: Card | null;
  alternative_cards: Card[];
}

interface DiscoveredPost {
  id: string;
  platform: string;
  post_uri: string;
  post_url: string;
  author_handle: string;
  author_display_name: string | null;
  content: string;
  detected_title: string | null;
  relevance_score: number;
  status: "pending" | "liked" | "quoted" | "dismissed";
  search_phrase: string | null;
  discovered_at: string;
}

type Tab = "pending" | "cards" | "discover";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("pending");

  // Pending posts state
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<PendingPost | null>(null);

  // Cards browser state
  const [cards, setCards] = useState<Card[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [cardsLoading, setCardsLoading] = useState(false);

  // Discover state
  const [discoveredPosts, setDiscoveredPosts] = useState<DiscoveredPost[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  // Shared state
  const [regenerating, setRegenerating] = useState(false);
  const [generatedSentences, setGeneratedSentences] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/admin/auth");
      setIsAuthenticated(res.ok);
      if (res.ok) {
        fetchPosts();
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pending");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        if (data.posts?.length > 0 && !selectedPost) {
          setSelectedPost(data.posts[0]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    }
  }, [selectedPost]);

  const fetchCards = async (search: string = "") => {
    setCardsLoading(true);
    try {
      const res = await fetch(`/api/admin/cards?search=${encodeURIComponent(search)}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards || []);
      }
    } catch (error) {
      console.error("Failed to fetch cards:", error);
    } finally {
      setCardsLoading(false);
    }
  };

  // Fetch cards when switching to cards tab
  useEffect(() => {
    if (activeTab === "cards" && cards.length === 0) {
      fetchCards();
    }
  }, [activeTab, cards.length]);

  // Fetch discovered posts when switching to discover tab
  useEffect(() => {
    if (activeTab === "discover" && discoveredPosts.length === 0) {
      fetchDiscoveredPosts();
    }
  }, [activeTab, discoveredPosts.length]);

  const fetchDiscoveredPosts = async () => {
    setDiscoverLoading(true);
    try {
      const res = await fetch("/api/admin/discover");
      if (res.ok) {
        const data = await res.json();
        setDiscoveredPosts(data.posts || []);
      }
    } catch (error) {
      console.error("Failed to fetch discovered posts:", error);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      const res = await fetch("/api/admin/discover", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        console.log("Discovery results:", data);
        fetchDiscoveredPosts();
      }
    } catch (error) {
      console.error("Discovery failed:", error);
    } finally {
      setDiscovering(false);
    }
  };

  const handleDiscoveredPostAction = async (postId: string, status: "liked" | "quoted" | "dismissed") => {
    try {
      const res = await fetch("/api/admin/discover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId, status }),
      });

      if (res.ok) {
        setDiscoveredPosts(posts => posts.filter(p => p.id !== postId));
      }
    } catch (error) {
      console.error("Failed to update post:", error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCards(searchQuery);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
        setPassword("");
        fetchPosts();
      } else {
        setLoginError("Invalid password");
      }
    } catch {
      setLoginError("Login failed");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setIsAuthenticated(false);
    setPosts([]);
    setSelectedPost(null);
    setCards([]);
    setSelectedCard(null);
  };

  const handleSelectCard = async (cardId: string) => {
    if (!selectedPost) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/pending/${selectedPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_card_id: cardId }),
      });

      if (res.ok) {
        const allCards = [
          selectedPost.selected_card,
          ...selectedPost.alternative_cards,
        ].filter(Boolean) as Card[];
        const newCard = allCards.find((c) => c.id === cardId) || null;

        setSelectedPost({
          ...selectedPost,
          selected_card_id: cardId,
          selected_card: newCard,
        });
        setGeneratedSentences([]);
      }
    } catch (error) {
      console.error("Failed to select card:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedPost) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/pending/${selectedPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });

      if (res.ok) {
        setSelectedPost({ ...selectedPost, status: "approved" });
        fetchPosts();
      }
    } catch (error) {
      console.error("Failed to approve:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!selectedPost) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/pending/${selectedPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "skipped" }),
      });

      if (res.ok) {
        setSelectedPost({ ...selectedPost, status: "skipped" });
        fetchPosts();
      }
    } catch (error) {
      console.error("Failed to skip:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (cardId: string) => {
    setRegenerating(true);
    setGeneratedSentences([]);

    try {
      const res = await fetch("/api/admin/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: cardId }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedSentences(data.sentences || []);
      }
    } catch (error) {
      console.error("Failed to regenerate:", error);
    } finally {
      setRegenerating(false);
    }
  };

  const handleSelectSentence = async (cardId: string, sentence: string) => {
    setSaving(true);

    try {
      const res = await fetch("/api/admin/regenerate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: cardId,
          calibration_sentence: sentence,
        }),
      });

      if (res.ok) {
        // Update in pending post view
        if (selectedPost?.selected_card?.id === cardId) {
          setSelectedPost({
            ...selectedPost,
            selected_card: {
              ...selectedPost.selected_card,
              calibration_sentence: sentence,
            },
          });
        }

        // Update in cards browser view
        if (selectedCard?.id === cardId) {
          setSelectedCard({
            ...selectedCard,
            calibration_sentence: sentence,
          });
        }

        // Update cards list
        setCards(cards.map(c =>
          c.id === cardId ? { ...c, calibration_sentence: sentence } : c
        ));

        setGeneratedSentences([]);
        fetchPosts();
      }
    } catch (error) {
      console.error("Failed to save sentence:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatScheduledTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const slotLabels = {
    morning: "Morning (Classic)",
    afternoon: "Afternoon (Popular)",
    evening: "Evening (Prestige)",
  };

  // Loading state
  if (loading || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-zinc-900 rounded-xl p-6 w-full max-w-sm"
        >
          <h1 className="text-xl font-semibold text-white mb-6">
            Texture Admin
          </h1>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 mb-4"
            autoFocus
          />

          {loginError && (
            <p className="text-red-400 text-sm mb-4">{loginError}</p>
          )}

          <button
            type="submit"
            className="w-full bg-white text-zinc-900 font-medium py-3 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">Texture Admin</h1>
          <button
            onClick={handleLogout}
            className="text-zinc-400 text-sm hover:text-white"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <div className="max-w-4xl mx-auto flex">
          <button
            onClick={() => {
              setActiveTab("pending");
              setSelectedCard(null);
              setGeneratedSentences([]);
            }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "pending"
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Pending Posts
          </button>
          <button
            onClick={() => {
              setActiveTab("cards");
              setGeneratedSentences([]);
            }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "cards"
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            All Cards
          </button>
          <button
            onClick={() => {
              setActiveTab("discover");
              setGeneratedSentences([]);
            }}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "discover"
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Discover
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-4">
        {/* PENDING POSTS TAB */}
        {activeTab === "pending" && (
          <>
            {posts.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                No pending posts
              </div>
            ) : (
              <div className="space-y-6">
                {posts.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {posts.map((post) => (
                      <button
                        key={post.id}
                        onClick={() => {
                          setSelectedPost(post);
                          setGeneratedSentences([]);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                          selectedPost?.id === post.id
                            ? "bg-white text-zinc-900"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {slotLabels[post.slot]}
                      </button>
                    ))}
                  </div>
                )}

                {selectedPost && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400">
                        {formatScheduledTime(selectedPost.scheduled_for)}
                      </span>
                      {selectedPost.status === "approved" && (
                        <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full">
                          Approved
                        </span>
                      )}
                      {selectedPost.status === "skipped" && (
                        <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full">
                          Skipped
                        </span>
                      )}
                    </div>

                    {selectedPost.selected_card && (
                      <div className="bg-zinc-900 rounded-xl overflow-hidden">
                        <img
                          src={`/api/og/${selectedPost.selected_card.slug}`}
                          alt={selectedPost.selected_card.title}
                          className="w-full"
                        />

                        <div className="p-4">
                          <h2 className="text-xl font-semibold mb-1">
                            {selectedPost.selected_card.title}
                            {selectedPost.selected_card.year && (
                              <span className="text-zinc-500 font-normal ml-2">
                                ({selectedPost.selected_card.year})
                              </span>
                            )}
                          </h2>

                          <p className="text-zinc-400 italic mb-4">
                            &ldquo;{selectedPost.selected_card.calibration_sentence || "No sentence"}&rdquo;
                          </p>

                          <button
                            onClick={() => handleRegenerate(selectedPost.selected_card!.id)}
                            disabled={regenerating}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {regenerating ? "Generating..." : "Regenerate Sentence"}
                          </button>
                        </div>
                      </div>
                    )}

                    {generatedSentences.length > 0 && selectedPost.selected_card && (
                      <div className="bg-zinc-900 rounded-xl p-4">
                        <h3 className="text-sm font-medium text-zinc-400 mb-3">
                          Select a new sentence:
                        </h3>
                        <div className="space-y-2">
                          {generatedSentences.map((sentence, index) => (
                            <button
                              key={index}
                              onClick={() => handleSelectSentence(selectedPost.selected_card!.id, sentence)}
                              disabled={saving}
                              className="w-full text-left bg-zinc-800 hover:bg-zinc-700 p-3 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              {sentence}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedPost.alternative_cards.length > 0 && (
                      <div className="bg-zinc-900 rounded-xl p-4">
                        <h3 className="text-sm font-medium text-zinc-400 mb-3">
                          Alternatives:
                        </h3>
                        <div className="space-y-2">
                          {[
                            selectedPost.selected_card,
                            ...selectedPost.alternative_cards,
                          ]
                            .filter(Boolean)
                            .map((card) => (
                              <button
                                key={card!.id}
                                onClick={() => handleSelectCard(card!.id)}
                                disabled={saving}
                                className={`w-full text-left p-3 rounded-lg text-sm transition-colors flex items-center gap-3 ${
                                  card!.id === selectedPost.selected_card_id
                                    ? "bg-white/10 border border-white/20"
                                    : "bg-zinc-800 hover:bg-zinc-700"
                                }`}
                              >
                                {card!.poster_url && (
                                  <img
                                    src={card!.poster_url}
                                    alt=""
                                    className="w-10 h-14 object-cover rounded"
                                  />
                                )}
                                <div>
                                  <div className="font-medium">
                                    {card!.title}
                                    {card!.year && (
                                      <span className="text-zinc-500 ml-1">
                                        ({card!.year})
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-zinc-500 text-xs truncate max-w-xs">
                                    {card!.calibration_sentence}
                                  </div>
                                </div>
                                {card!.id === selectedPost.selected_card_id && (
                                  <span className="ml-auto text-green-400">
                                    Selected
                                  </span>
                                )}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {selectedPost.status === "pending" && (
                      <div className="flex gap-3">
                        <button
                          onClick={handleSkip}
                          disabled={saving}
                          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Skip
                        </button>
                        <button
                          onClick={handleApprove}
                          disabled={saving}
                          className="flex-1 bg-white hover:bg-zinc-100 text-zinc-900 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Approve"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ALL CARDS TAB */}
        {activeTab === "cards" && (
          <div className="space-y-6">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cards..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <button
                type="submit"
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Search
              </button>
            </form>

            {cardsLoading ? (
              <div className="text-center py-12 text-zinc-500">Loading...</div>
            ) : selectedCard ? (
              /* Card Detail View */
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setSelectedCard(null);
                    setGeneratedSentences([]);
                  }}
                  className="text-zinc-400 hover:text-white text-sm"
                >
                  ← Back to list
                </button>

                <div className="bg-zinc-900 rounded-xl overflow-hidden">
                  <img
                    src={`/api/og/${selectedCard.slug}`}
                    alt={selectedCard.title}
                    className="w-full"
                  />

                  <div className="p-4">
                    <h2 className="text-xl font-semibold mb-1">
                      {selectedCard.title}
                      {selectedCard.year && (
                        <span className="text-zinc-500 font-normal ml-2">
                          ({selectedCard.year})
                        </span>
                      )}
                    </h2>

                    <p className="text-zinc-400 italic mb-4">
                      &ldquo;{selectedCard.calibration_sentence || "No sentence"}&rdquo;
                    </p>

                    <button
                      onClick={() => handleRegenerate(selectedCard.id)}
                      disabled={regenerating}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {regenerating ? "Generating..." : "Regenerate Sentence"}
                    </button>
                  </div>
                </div>

                {generatedSentences.length > 0 && (
                  <div className="bg-zinc-900 rounded-xl p-4">
                    <h3 className="text-sm font-medium text-zinc-400 mb-3">
                      Select a new sentence:
                    </h3>
                    <div className="space-y-2">
                      {generatedSentences.map((sentence, index) => (
                        <button
                          key={index}
                          onClick={() => handleSelectSentence(selectedCard.id, sentence)}
                          disabled={saving}
                          className="w-full text-left bg-zinc-800 hover:bg-zinc-700 p-3 rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          {sentence}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Cards List */
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    No cards found
                  </div>
                ) : (
                  cards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => {
                        setSelectedCard(card);
                        setGeneratedSentences([]);
                      }}
                      className="w-full text-left bg-zinc-900 hover:bg-zinc-800 p-3 rounded-lg transition-colors flex items-center gap-3"
                    >
                      {card.poster_url && (
                        <img
                          src={card.poster_url}
                          alt=""
                          className="w-10 h-14 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {card.title}
                          {card.year && (
                            <span className="text-zinc-500 ml-1">
                              ({card.year})
                            </span>
                          )}
                        </div>
                        <div className="text-zinc-500 text-xs truncate">
                          {card.calibration_sentence || "No sentence"}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* DISCOVER TAB */}
        {activeTab === "discover" && (
          <div className="space-y-6">
            {/* Run Discovery Button */}
            <div className="flex items-center justify-between">
              <p className="text-zinc-400 text-sm">
                Find posts describing how movies/shows feel to watch
              </p>
              <button
                onClick={runDiscovery}
                disabled={discovering}
                className="bg-white hover:bg-zinc-100 text-zinc-900 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {discovering ? "Searching..." : "Run Discovery"}
              </button>
            </div>

            {discoverLoading ? (
              <div className="text-center py-12 text-zinc-500">Loading...</div>
            ) : discoveredPosts.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                No posts to review. Click &quot;Run Discovery&quot; to search Bluesky.
              </div>
            ) : (
              <div className="space-y-4">
                {discoveredPosts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-zinc-900 rounded-xl p-4 space-y-3"
                  >
                    {/* Author and title */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-white font-medium">
                          {post.author_display_name || post.author_handle}
                        </span>
                        <span className="text-zinc-500 text-sm ml-2">
                          @{post.author_handle}
                        </span>
                        {post.detected_title && (
                          <span className="ml-2 bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded">
                            {post.detected_title}
                          </span>
                        )}
                      </div>
                      <span className="text-zinc-600 text-xs">
                        {Math.round(post.relevance_score * 100)}% relevant
                      </span>
                    </div>

                    {/* Content */}
                    <p className="text-zinc-300 text-sm whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <a
                        href={post.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        Open in Bluesky
                      </a>
                      <button
                        onClick={() => handleDiscoveredPostAction(post.id, "liked")}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                      >
                        Mark Liked
                      </button>
                      <button
                        onClick={() => handleDiscoveredPostAction(post.id, "quoted")}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                      >
                        Mark Quoted
                      </button>
                      <button
                        onClick={() => handleDiscoveredPostAction(post.id, "dismissed")}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg text-sm transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
