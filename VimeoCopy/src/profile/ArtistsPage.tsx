import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config";
import "../App.css";
import "./artist-profile.css";

interface ArtistResult {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  workCount: number;
}

export function ArtistsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArtistResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/profiles/search?q=${encodeURIComponent(q)}`);
        const data: ArtistResult[] = res.ok ? await res.json() : [];
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <div className="container artists-page">
      <h1>Discover artists</h1>
      <p className="text-muted">Search creators by name or handle and explore their public work.</p>

      <div className="artists-search-wrap">
        <svg className="artists-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="artists-search-input"
          placeholder="Search artists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {loading && <div className="loading" style={{ margin: "var(--space-8) auto" }} />}

      {!loading && searched && results.length === 0 && (
        <div className="ap-empty">No artists match “{query}”.</div>
      )}

      {!loading && results.length > 0 && (
        <div className="artists-grid">
          {results.map((a) => (
            <Link key={a.handle} to={`/u/${a.handle}`} className="artist-card">
              {a.avatarUrl ? (
                <img className="artist-card-avatar" src={a.avatarUrl} alt={a.displayName} />
              ) : (
                <div className="artist-card-avatar artist-card-avatar-fallback">{a.displayName.charAt(0)}</div>
              )}
              <div>
                <div className="artist-card-name">{a.displayName}</div>
                <div className="artist-card-handle">@{a.handle}</div>
              </div>
              <div className="artist-card-meta">{a.workCount} public work{a.workCount !== 1 ? "s" : ""}</div>
            </Link>
          ))}
        </div>
      )}

      {!searched && !loading && (
        <div className="ap-empty">Start typing to find artists.</div>
      )}
    </div>
  );
}
