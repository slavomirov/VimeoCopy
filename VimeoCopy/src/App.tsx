import { Routes, Route, Link } from "react-router-dom";
import { Upload } from "./components/Upload";
import { Videos } from "./components/Video";


function App() {
  return (
    <div style={{ padding: 20 }}>
      <nav style={{ display: "flex", gap: 20 }}>
        <Link to="/">Home</Link>
        <Link to="/upload">Upload</Link>
        <Link to="/videos">Videos</Link>
        <Link to="/profile">Profile</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </div>
  );
}

function Home() {
  return <h1>Home Page</h1>;
}

function Profile() {
  return <h1>Profile Page</h1>;
}

export default App;
