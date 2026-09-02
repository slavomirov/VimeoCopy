import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Upload } from "./components/Upload";
import { Videos } from "./components/Video";
import { AuthProvider } from "./Auth/AuthProvider";
import { useAuth } from "./Auth/useAuth";
import SocialLoginPage from "./SocialLoginPage";
import { Toaster } from "react-hot-toast";
import { ProfilePage } from "./components/ProfilePage";
import { SettingsPage } from "./components/SettingsPage";
import { SharedMediaViewer } from "./components/SharedMediaViewer";
import { BuyPage } from "./Payments/BuyPage";
import { ProfileAuthPage } from "./Auth/ProfileAuthPage";
import { ForgotPasswordPage } from "./Auth/ForgotPasswordPage";
import { LandingPage } from "./LandingPage";
import { EmbedPlayer } from "./components/EmbedPlayer";
import { ProjectsPage } from "./components/ProjectsPage";
import { ProjectDetailPage } from "./components/ProjectDetailPage";
import { ArtistProfile } from "./profile/ArtistProfile";
import { ArtistsPage } from "./profile/ArtistsPage";
import { ArtistProfileEditor } from "./profile/ArtistProfileEditor";
import { UploadProvider } from "./components/UploadProvider";
import { UploadDock } from "./components/UploadDock";
import { AudiencePage } from "./components/AudiencePage";
import { ModerationPage } from "./components/ModerationPage";
import { useTheme } from "./theme/useTheme";
import {
  SeaBackdrop,
  FerryLogo,
  ProwMark,
  IconHarbour,
  IconLoad,
  IconDeck,
  IconCompass,
  IconVoyage,
  IconSonar,
  IconBuoy,
  IconTicket,
  IconHelm,
  IconGangway,
} from "./brand/FerryMarks";
import "./App.css";
import "./ferry.css";

function App() {
  return (
    <AuthProvider>
      <UploadProvider>
        <Routes>
          <Route path="/embed/:mediaId" element={<EmbedPlayer />} />
          <Route path="/*" element={<MainLayout />} />
        </Routes>
      </UploadProvider>
    </AuthProvider>
  );
}

function MainLayout() {
  const { accessToken, logout, roles } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isLoggedIn = !!accessToken;
  const isStaff = roles.includes("Admin") || roles.includes("Moderator");
  const location = useLocation();

  const isMobile = useCallback(() => window.innerWidth <= 768, []);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile());

  // Clicking the brand always brings you back to the top of the home page
  const handleBrandClick = useCallback(() => {
    const behavior: ScrollBehavior =
      location.pathname === "/" ? "smooth" : "auto";
    window.scrollTo({ top: 0, behavior });
    document.querySelector(".app-content")?.scrollTo({ top: 0, behavior });
  }, [location.pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile()) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  // Close sidebar on resize to mobile
  useEffect(() => {
    function handleResize() {
      if (isMobile()) setSidebarOpen(false);
      else setSidebarOpen(true);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobile]);

  return (
    <div className="app-container">
      <SeaBackdrop />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            color: "var(--toaster-text)",
            fontWeight: "bold",
            borderRadius: "8px",
            padding: "12px 16px",
            fontSize: "16px",
          },
          success: { style: { background: "var(--success)" } },
          error: { style: { background: "var(--danger)" } },
        }}
      />

      {/* Mobile top bar */}
      { isMobile() && !sidebarOpen &&
      <div className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
        <Link to="/" className="mobile-topbar-brand ferry-logo" onClick={handleBrandClick}>
          <ProwMark size={24} title="Ferry" />
          <span className="ferry-wordmark">Ferry</span>
        </Link>
      </div>

      }
      {/* Backdrop overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand" onClick={handleBrandClick}>
            <FerryLogo size={32} tagline="Keep your resolution" />
          </Link>
          {
            !sidebarOpen &&
            <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
            >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          }
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <Link to="/" className="nav-item" title="Harbour — the home page">
            <IconHarbour />
            <span className="nav-label">Harbour</span>
          </Link>

          {isLoggedIn && (
            <Link to="/upload" className="nav-item" title="Upload — load work aboard">
              <IconLoad />
              <span className="nav-label">Upload</span>
            </Link>
          )}

          <Link to="/videos" className="nav-item" title="Media">
            <IconDeck />
            <span className="nav-label">Media</span>
          </Link>

          <Link to="/artists" className="nav-item" title="Artists">
            <IconCompass />
            <span className="nav-label">Artists</span>
          </Link>

          {isLoggedIn && (
            <Link to="/projects" className="nav-item" title="Projects">
              <IconVoyage />
              <span className="nav-label">Projects</span>
            </Link>
          )}

          {isLoggedIn && (
            <Link to="/audience" className="nav-item" title="Audience — who is out there">
              <IconSonar />
              <span className="nav-label">Audience</span>
            </Link>
          )}

          {isStaff && (
            <Link to="/moderation" className="nav-item" title="Moderation">
              <IconBuoy />
              <span className="nav-label">Moderation</span>
            </Link>
          )}

          <Link to="/buy" className="nav-item" title="Fares — plans and pricing">
            <IconTicket />
            <span className="nav-label">Fares</span>
          </Link>

        </nav>

        <div className="sidebar-footer">
          <div className="theme-toggle-wrap">
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              <span className="theme-toggle-track">
                <span className={`theme-toggle-thumb ${theme === "light" ? "light" : ""}`}>
                  {theme === "dark" ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                    </svg>
                  )}
                </span>
              </span>
              <span className="nav-label theme-toggle-label">
                {theme === "dark" ? "Dark Mode" : "Light Mode"}
              </span>
            </button>
          </div>

          <div className="sidebar-auth">
            <Link to="/profile" className="nav-item nav-item-secondary" title="Profile — the helm">
              <IconHelm />
              <span className="nav-label">Profile</span>
            </Link>

            {isLoggedIn && (
              <button onClick={logout} className="nav-item nav-item-secondary" title="Sign out — head ashore">
                <IconGangway />
                <span className="nav-label">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/upload"
            element={
              isLoggedIn ? <Upload /> : <Navigate to="/profile" replace />
            }
          />
          <Route path="/videos" element={<Videos />} />
          <Route
            path="/projects"
            element={
              isLoggedIn ? <ProjectsPage /> : <Navigate to="/profile" replace />
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              isLoggedIn ? <ProjectDetailPage /> : <Navigate to="/profile" replace />
            }
          />
          <Route path="/shared/:token" element={<SharedMediaViewer />} />
          <Route path="/social-login" element={<SocialLoginPage />} />
          <Route path="/buy" element={<BuyPage />} />

          <Route
            path="/audience"
            element={isLoggedIn ? <AudiencePage /> : <Navigate to="/profile" replace />}
          />
          <Route
            path="/moderation"
            element={isStaff ? <ModerationPage /> : <Navigate to="/" replace />}
          />
          <Route path="/artists" element={<ArtistsPage />} />
          <Route path="/u/:handle" element={<ArtistProfile />} />
          <Route
            path="/profile/customize"
            element={isLoggedIn ? <ArtistProfileEditor /> : <ProfileAuthPage />}
          />

          <Route
            path="/profile"
            element={
              isLoggedIn ? <ProfilePage /> : <ProfileAuthPage />
            }
          />
          <Route
            path="/settings"
            element={isLoggedIn ? <SettingsPage /> : <ProfileAuthPage />}
          />

          {/* Already-signed-in users have Settings for this; the reset flow is for locked-out ones. */}
          <Route
            path="/forgot-password"
            element={isLoggedIn ? <Navigate to="/settings" replace /> : <ForgotPasswordPage />}
          />

          <Route path="/login" element={<Navigate to="/profile" replace />} />
          <Route path="/register" element={<Navigate to="/profile" replace />} />
        </Routes>
      </main>

      <UploadDock />
    </div>
  );
}

function Home() {
  return <LandingPage />;
}

export default App;
