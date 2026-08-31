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
import "./App.css";

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
        <Link to="/" className="mobile-topbar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          VimeoCopy
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
          <Link to="/" className="sidebar-brand">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z"></path>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            <span className="brand-text">VimeoCopy</span>
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
          <Link to="/" className="nav-item" title="Home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span className="nav-label">Home</span>
          </Link>

          {isLoggedIn && (
            <Link to="/upload" className="nav-item" title="Upload">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span className="nav-label">Upload</span>
            </Link>
          )}

          <Link to="/videos" className="nav-item" title="Videos">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            <span className="nav-label">Media</span>
          </Link>

          <Link to="/artists" className="nav-item" title="Artists">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"></path>
              <circle cx="18" cy="8" r="2.5"></circle>
              <path d="M16.5 21v-1.5a3 3 0 0 1 3-3"></path>
            </svg>
            <span className="nav-label">Artists</span>
          </Link>

          {isLoggedIn && (
            <Link to="/projects" className="nav-item" title="Projects">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="nav-label">Projects</span>
            </Link>
          )}

          {isLoggedIn && (
            <Link to="/audience" className="nav-item" title="Audience">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span className="nav-label">Audience</span>
            </Link>
          )}

          {isStaff && (
            <Link to="/moderation" className="nav-item" title="Moderation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="nav-label">Moderation</span>
            </Link>
          )}

          <Link to="/buy" className="nav-item" title={isLoggedIn ? "Buy" : "Pricing"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <span className="nav-label">{isLoggedIn ? "Buy" : "Pricing"}</span>
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
            <Link to="/profile" className="nav-item nav-item-secondary" title="Profile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span className="nav-label">Profile</span>
            </Link>

            {isLoggedIn && (
              <button onClick={logout} className="nav-item nav-item-secondary" title="Logout">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span className="nav-label">Logout</span>
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
