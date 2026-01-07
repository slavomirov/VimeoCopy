import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./Auth/useAuth";

export default function SocialLoginPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("accessToken");

    if (token) {
      loginWithToken(token);
      navigate("/"); // или /dashboard
    } else {
      navigate("/login");
    }
  }, [loginWithToken, navigate]);

  return <p>Signing you in...</p>;
}
