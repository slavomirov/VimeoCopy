import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Upload } from "./components/Upload";
import { Videos } from "./components/Video";
import { LoginForm } from "./Auth/Login";
import { AuthProvider } from "./Auth/AuthProvider";
import { useAuth } from "./Auth/useAuth";
import SocialLoginPage from "./SocialLoginPage";
import { Toaster } from "react-hot-toast";
import { ProfilePage } from "./components/ProfilePage";

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

  return (
    <div style={{ padding: 20 }}>
      <Toaster
        position="top-right"
        toastOptions={{ style: { background: "#ff0033", color: "#fff", fontWeight: "bold", borderRadius: "8px", padding: "12px 16px", fontSize: "16px", }, }} />
      <nav style={{ display: "flex", gap: 20 }}>
        <Link to="/">Home</Link>
        <Link to="/upload">Upload</Link>
        <Link to="/videos">Videos</Link>

        {isLoggedIn && <Link to="/profile">Profile</Link>}
        {!isLoggedIn && <Link to="/login">Login</Link>}

        {isLoggedIn && (
          <button onClick={logout} style={{ marginLeft: "auto" }}>
            Logout
          </button>
        )}
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/social-login" element={<SocialLoginPage />} />

        {/* Protected route */}
        <Route
          path="/profile"
          element={
            isLoggedIn ? <ProfilePage /> : <Navigate to="/login" replace />
          }
        />

        {/* Login only if NOT logged in */}
        <Route
          path="/login"
          element={
            !isLoggedIn ? <LoginForm /> : <Navigate to="/profile" replace />
          }
        />
      </Routes>
    </div>
  );
}

function Home() {
  return <h1>Home Page</h1>;
}

export default App;
