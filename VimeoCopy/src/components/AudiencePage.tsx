import { useEffect, useState } from "react";
import { useAuth } from "../Auth/useAuth";
import { API_BASE_URL } from "../config";
import "../App.css";

interface DailyViews { date: string; views: number; }
interface TopMedia { mediaId: string; fileName: string | null; views: number; uniqueViewers: number; }
interface SourceBreakdown { source: string; views: number; }
interface Audience {
  totalViews: number;
  uniqueViewers: number;
  totalBytes: number;
  viewsByDay: DailyViews[];
  topMedia: TopMedia[];
  bySource: SourceBreakdown[];
}

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(Number.isInteger(size) ? 0 : 1)} ${units[i]}`;
}

export function AudiencePage() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/analytics/audience`);
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [authFetch]);

  if (loading) return <div className="loading" style={{ margin: "var(--space-16) auto" }} />;
  if (!data) return <div className="container"><p className="text-muted">Couldn’t load audience data.</p></div>;

  const maxDay = Math.max(1, ...data.viewsByDay.map((d) => d.views));
  const empty = data.totalViews === 0;

  return (
    <div className="container">
      <h1>Audience</h1>
      <p className="text-muted">How people are watching your work. A “view” is counted once per viewer per hour.</p>

      {/* Stat cards */}
      <div className="grid grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: "var(--space-6)" }}>
        <StatCard label="Total views" value={data.totalViews.toLocaleString()} />
        <StatCard label="Unique viewers" value={data.uniqueViewers.toLocaleString()} />
        <StatCard label="Data delivered" value={formatBytes(data.totalBytes)} />
      </div>

      {empty ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-12)", marginTop: "var(--space-8)" }}>
          <p className="text-muted">No views yet. Once people watch your public media, their activity shows up here.</p>
        </div>
      ) : (
        <>
          {/* Views over time */}
          <div className="card" style={{ marginTop: "var(--space-8)" }}>
            <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Views — last 30 days</h2></div>
            <div className="card-body">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>
                {data.viewsByDay.map((d) => (
                  <div key={d.date} title={`${d.date}: ${d.views} view${d.views !== 1 ? "s" : ""}`}
                    style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                    <div style={{
                      height: `${(d.views / maxDay) * 100}%`,
                      minHeight: d.views > 0 ? 3 : 0,
                      background: "linear-gradient(180deg, var(--secondary), var(--primary))",
                      borderRadius: "3px 3px 0 0",
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-2)", fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>
                <span>{data.viewsByDay[0]?.date}</span>
                <span>{data.viewsByDay[data.viewsByDay.length - 1]?.date}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: "var(--space-8)", alignItems: "start" }}>
            {/* Top media */}
            <div className="card">
              <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Top media</h2></div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {data.topMedia.map((m, i) => (
                  <div key={m.mediaId} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <span style={{ color: "var(--gray-400)", fontWeight: 700, width: 20 }}>{i + 1}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.fileName || "Untitled"}
                    </span>
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{m.views.toLocaleString()} views</span>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--gray-500)" }}>{m.uniqueViewers} unique</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By source */}
            <div className="card">
              <div className="card-header"><h2 className="card-title" style={{ marginBottom: 0 }}>Where views come from</h2></div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {data.bySource.map((s) => {
                  const pct = data.totalViews > 0 ? Math.round((s.views / data.totalViews) * 100) : 0;
                  return (
                    <div key={s.source}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 4 }}>
                        <span>{labelForSource(s.source)}</span>
                        <span style={{ color: "var(--gray-500)" }}>{s.views.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-deep)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--primary), var(--secondary))" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: "var(--space-5)" }}>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--gray-500)" }}>{label}</div>
      <div style={{ fontSize: "var(--font-size-3xl)", fontWeight: 700, color: "var(--gray-900)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function labelForSource(source: string) {
  switch (source) {
    case "Public": return "Public gallery";
    case "Shared": return "Shared links";
    case "Embed": return "Embedded players";
    case "Owner": return "You";
    default: return source;
  }
}
