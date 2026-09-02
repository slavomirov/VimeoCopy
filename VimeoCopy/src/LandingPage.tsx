import { Link } from "react-router-dom";
import {
  ProwMark,
  IconLoad,
  IconDeck,
  IconCompass,
  IconVoyage,
  IconSonar,
  IconAnchor,
  IconResolution,
  IconBeacon,
  IconTicket,
} from "./brand/FerryMarks";
import "./LandingPage.css";

/** A crest that caps a section — the same swell used in the backdrop, held still. */
function WaveCap({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className={`wave-cap ${flip ? "wave-cap-flip" : ""}`}
      viewBox="0 0 1440 54"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0,28 c180,-30 360,30 720,0 c360,-30 540,30 720,0 V54 H0 Z" />
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="landing-page">

      {/* ═══════════ HERO — the thesis ═══════════ */}
      <section className="hero">
        <div className="hero-content">

          <span className="landing-mark">
            <ProwMark size={92} title="Ferry" />
          </span>

          <h1>Ferry</h1>
          <p className="hero-subtitle">
            In the open sea of the internet, your work keeps its resolution.
          </p>

          <p className="hero-description">
            Everywhere else re-encodes you. Feeds crush your frames, timelines flatten your
            audio, algorithms decide who ever sees it. Ferry does one thing: it carries the
            file you made, at the quality you made it, to the people you send it to — and
            gives it a permanent address on the way.
          </p>

          <div className="res-badge">
            <span className="dot" aria-hidden="true" />
            Original file · no re-encode · streamed direct
          </div>

          <div className="hero-actions">
            <Link to="/upload" className="btn btn-primary">Load your work aboard</Link>
            <Link to="/videos" className="btn btn-ghost">See what&rsquo;s sailing</Link>
          </div>

          {/* The crossing: a ferry actually makes the trip, once, on load. */}
          <div className="hero-crossing" aria-hidden="true">
            <span className="hero-port hero-port-left">
              <span className="port-dot" />
              <span className="port-label">Your drive</span>
            </span>
            <span className="hero-route">
              <span className="hero-ferry"><ProwMark size={26} /></span>
            </span>
            <span className="hero-port hero-port-right">
              <span className="port-dot" />
              <span className="port-label">Their screen</span>
            </span>
          </div>

        </div>
      </section>

      <WaveCap />

      {/* ═══════════ THE PROMISE ═══════════ */}
      <section className="promise-section">
        <div className="container">
          <div className="promise-grid">
            <div className="promise-lead">
              <span className="eyebrow">Why the name</span>
              <h2>A ferry has one job, and it doesn&rsquo;t improvise.</h2>
              <p>
                It runs the same route, on schedule, for anyone who turns up at the dock. It
                doesn&rsquo;t rank its passengers. It doesn&rsquo;t decide that some cargo
                deserves the crossing more than others. It takes what you loaded and puts it
                down on the other side in the condition it left.
              </p>
              <p>
                That is the whole product, and it is the opposite of a feed.
              </p>
            </div>

            <ul className="promise-list">
              <li>
                <IconResolution size={22} />
                <div>
                  <strong>Your original, not our version of it</strong>
                  <span>The bytes you uploaded are the bytes that stream back. Nothing is re-compressed to save us money.</span>
                </div>
              </li>
              <li>
                <IconAnchor size={22} />
                <div>
                  <strong>A permanent berth</strong>
                  <span>Every piece gets a stable address and an artist page you control — your palette, your fonts, your wall.</span>
                </div>
              </li>
              <li>
                <IconCompass size={22} />
                <div>
                  <strong>No algorithm at the helm</strong>
                  <span>No ranking, no recommended-for-you, no reach to buy back. People arrive because you sent them.</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="features-section">
        <div className="container">
          <span className="eyebrow">Aboard</span>
          <h2>Everything the crossing needs</h2>

          <div className="features-grid">

            <div className="feature-card">
              <div className="feature-icon"><IconLoad size={38} /></div>
              <h3>Load aboard</h3>
              <p>
                Drag a whole batch onto the deck — video, audio and stills together. Uploads
                run in the background and survive you navigating away.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><IconDeck size={38} /></div>
              <h3>Keep the hold in order</h3>
              <p>
                Group work into projects, set covers, choose what&rsquo;s public and what stays
                below deck. Your library, arranged the way you think about it.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><IconTicket size={38} /></div>
              <h3>Issue a boarding pass</h3>
              <p>
                Share links that expire when you say and can be revoked the moment you change
                your mind. One click to pull a pass back out of circulation.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><IconVoyage size={38} /></div>
              <h3>Sail anywhere</h3>
              <p>
                Drop any public piece into a blog, a portfolio or a client&rsquo;s site with a
                single line of embed code. It travels with the player attached.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><IconResolution size={38} /></div>
              <h3>A player that respects the file</h3>
              <p>
                Built for video, audio <em>and</em> images. Cast to a TV, drive it from the
                keyboard, boosted audio for quiet masters, full-screen with no letterbox.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><IconSonar size={38} /></div>
              <h3>Know who came aboard</h3>
              <p>
                Views, unique viewers and data delivered — counted once per viewer per hour,
                and never sold on. Numbers for you, not for advertisers.
              </p>
            </div>

          </div>
        </div>
      </section>

      <WaveCap flip />

      {/* ═══════════ THE ROUTE ═══════════ */}
      <section className="route-section">
        <div className="container">
          <span className="eyebrow">The route</span>
          <h2>Three stops, no detours</h2>

          <ol className="route-steps">
            <li>
              <span className="route-num">01</span>
              <h3>Cast off</h3>
              <p>Drop your files in. They go straight to storage over a signed, one-time link — the file never sits on a middleman&rsquo;s disk.</p>
            </li>
            <li>
              <span className="route-num">02</span>
              <h3>Under way</h3>
              <p>Claim your handle and arrange the wall. Set the palette, pick the fonts, choose what the public sees.</p>
            </li>
            <li>
              <span className="route-num">03</span>
              <h3>Made port</h3>
              <p>Send a link, embed it, or point people at your page. It arrives at full resolution on whatever they open it with.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-content">
            <IconBeacon size={44} className="cta-beacon" />
            <h2>The next crossing is yours</h2>
            <p>
              Start free. Load something aboard and see what it looks like when nothing
              stands between your work and the person you made it for.
            </p>

            <div className="cta-actions">
              <Link to="/profile" className="btn btn-primary btn-large">Board for free</Link>
              <Link to="/profile" className="btn btn-ghost btn-large">Sign in</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ STATS ═══════════ */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-number">1:1</div>
              <div className="stat-label">Bytes in, bytes out</div>
            </div>
            <div className="stat">
              <div className="stat-number">0</div>
              <div className="stat-label">Algorithms aboard</div>
            </div>
            <div className="stat">
              <div className="stat-number">3</div>
              <div className="stat-label">Media types, one player</div>
            </div>
            <div className="stat">
              <div className="stat-number">7d</div>
              <div className="stat-label">Free trial, no card</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <section className="footer-cta">
        <div className="container">
          <p>Every crossing starts at the dock. No card required.</p>
          <Link to="/profile" className="btn btn-primary">Get your handle</Link>
        </div>
      </section>

    </div>
  );
}
