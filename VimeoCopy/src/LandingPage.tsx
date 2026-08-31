import { Link } from "react-router-dom";
import "./LandingPage.css";

export function LandingPage() {
  return (
    <div className="landing-page">

      {/* ================= HERO ================= */}
      <section className="hero">
        <div className="hero-content">
          <h1>VimeoCopy</h1>
          <p className="hero-subtitle">Your Professional Video Management Platform</p>

          <p className="hero-description">
            Upload, organize, and share your videos with ease. A powerful platform designed
            for creators, teams, and businesses who demand simplicity and elegance.
          </p>

          <div className="hero-actions">
            <Link to="/upload" className="btn btn-primary">Start Uploading</Link>
            <Link to="/videos" className="btn btn-ghost">Browse Videos</Link>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="features-section">
        <div className="container">
          <h2>Why Choose VimeoCopy?</h2>

          <div className="features-grid">

            {/* Feature 1 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <h3>Easy Upload</h3>
              <p>Drag and drop your media or click to browse. Supports all major formats with lightning-fast uploads.</p>
            </div>

            {/* Feature 2 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </div>
              <h3>Organize & Store</h3>
              <p>Keep all your media files organized in one place. Search, filter, and manage your library effortlessly.</p>
            </div>

            {/* Feature 3 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <h3>Share & Collaborate</h3>
              <p>Share videos with your team or clients. Control permissions and get detailed viewing analytics.</p>
            </div>

            {/* Feature 4 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </div>
              <h3>Embed Anywhere</h3>
              <p>Drop any public video into your blog, portfolio or a client's site with a single line of code.</p>
            </div>

            {/* Feature 5 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <polyline points="8 21 12 17 16 21"></polyline>
                </svg>
              </div>
              <h3>Play On Any Screen</h3>
              <p>A custom player built for video, audio and images — with one-tap casting to your TV, keyboard shortcuts, and boosted audio.</p>
            </div>

            {/* Feature 6 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                  <path d="M12 19a7 7 0 0 1 0-14 5 5 0 0 1 0 10h-1.5a1.5 1.5 0 0 0 0 3H12z"></path>
                  <circle cx="8" cy="10" r="1"></circle>
                  <circle cx="12" cy="8" r="1"></circle>
                  <circle cx="16" cy="10" r="1"></circle>
                </svg>
              </div>
              <h3>Your Own Artist Page</h3>
              <p>Claim your handle for a public profile you control — your palette, your fonts, your gallery wall. No feed, no algorithm.</p>
            </div>

          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Elevate Your Video Content?</h2>
            <p>Join thousands of creators and teams who trust VimeoCopy for their video management needs.</p>

            <div className="cta-actions">
              <Link to="/profile" className="btn btn-primary btn-large">Create Free Account</Link>
              <Link to="/profile" className="btn btn-ghost btn-large">Sign In</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">

            <div className="stat">
              <div className="stat-number">10M+</div>
              <div className="stat-label">Videos Hosted</div>
            </div>

            <div className="stat">
              <div className="stat-number">50K+</div>
              <div className="stat-label">Active Users</div>
            </div>

            <div className="stat">
              <div className="stat-number">99.9%</div>
              <div className="stat-label">Uptime SLA</div>
            </div>

            <div className="stat">
              <div className="stat-number">180+</div>
              <div className="stat-label">Countries Served</div>
            </div>

          </div>
        </div>
      </section>

      {/* ================= FOOTER CTA ================= */}
      <section className="footer-cta">
        <div className="container">
          <p>Start your free trial today. No credit card required.</p>
          <Link to="/profile" className="btn btn-primary">Get Started Now</Link>
        </div>
      </section>

    </div>
  );
}
