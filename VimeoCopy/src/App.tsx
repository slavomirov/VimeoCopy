import { useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Upload } from "./components/Upload";
import { Videos } from "./components/Video";
import { LoginForm } from "./Auth/Login";
import { AuthProvider } from "./Auth/AuthProvider";
import { useAuth } from "./Auth/useAuth";
import SocialLoginPage from "./SocialLoginPage";
import { Toaster } from "react-hot-toast";
import { ProfilePage } from "./components/ProfilePage";
import { BuyPage } from "./Payments/BuyPage";
import { Register } from "./Auth/Register";
import { LandingPage } from "./LandingPage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}

function MainLayout() {
  const { accessToken, logout } = useAuth();
  const isLoggedIn = !!accessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app-container">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            color: "#fff",
            fontWeight: "bold",
            borderRadius: "8px",
            padding: "12px 16px",
            fontSize: "16px",
          },
          success: { style: { background: "var(--success)" } },
          error: { style: { background: "var(--danger)" } },
        }}
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 7l-7 5 7 5V7z"></path>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            <span className="brand-text">VimeoCopy</span>
          </Link>
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
        </div>

        <nav className="sidebar-nav">
          <Link to="/" className="nav-item" title="Home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span className="nav-label">Home</span>
          </Link>

          <Link to="/upload" className="nav-item" title="Upload">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span className="nav-label">Upload</span>
          </Link>

          <Link to="/videos" className="nav-item" title="Videos">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            <span className="nav-label">Videos</span>
          </Link>

          <Link to="/buy" className="nav-item" title="Buy">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <span className="nav-label">Buy</span>
          </Link>

          {isLoggedIn && (
            <Link to="/profile" className="nav-item" title="Profile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span className="nav-label">Profile</span>
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          {!isLoggedIn ? (
            <div className="sidebar-auth">
              <Link to="/login" className="nav-item nav-item-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                  <polyline points="10 17 15 12 10 7"></polyline>
                </svg>
                <span className="nav-label">Login</span>
              </Link>
              <Link to="/register" className="nav-item nav-item-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                <span className="nav-label">Register</span>
              </Link>
            </div>
          ) : (
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
      </aside>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/social-login" element={<SocialLoginPage />} />
          <Route path="/buy" element={<BuyPage />} />

          <Route
            path="/profile"
            element={
              isLoggedIn ? <ProfilePage /> : <Navigate to="/login" replace />
            }
          />

          <Route
            path="/login"
            element={
              !isLoggedIn ? <LoginForm /> : <Navigate to="/profile" replace />
            }
          />

          <Route
            path="/register"
            element={
              !isLoggedIn ? <Register /> : <Navigate to="/profile" replace />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  return <LandingPage />;
}

export default App;
