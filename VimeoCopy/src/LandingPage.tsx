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
              <p>Drag and drop your videos or click to browse. Supports all major formats with lightning-fast uploads.</p>
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
              <p>Keep all your videos organized in one place. Search, filter, and manage your library effortlessly.</p>
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
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <h3>Timeline Analysis</h3>
              <p>Track video performance with comprehensive analytics. See who watched, when they watched, and for how long.</p>
            </div>

            {/* Feature 5 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
              </div>
              <h3>Monetization</h3>
              <p>Turn your video content into revenue. Flexible pricing options for your audience and business model.</p>
            </div>

            {/* Feature 6 */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <h3>Security First</h3>
              <p>Enterprise-grade security protects your videos. Privacy controls and encryption ensure your content is safe.</p>
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
              <Link to="/register" className="btn btn-primary btn-large">Create Free Account</Link>
              <Link to="/login" className="btn btn-ghost btn-large">Sign In</Link>
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
          <Link to="/register" className="btn btn-primary">Get Started Now</Link>
        </div>
      </section>

    </div>
  );
}
