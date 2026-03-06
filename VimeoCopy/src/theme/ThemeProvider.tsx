import { useState, useEffect, type ReactNode } from "react";
import { ThemeContext, type Theme } from "./ThemeContext";

function getInitialTheme(): Theme {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    // Respect OS preference
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Set initial attribute immediately
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
