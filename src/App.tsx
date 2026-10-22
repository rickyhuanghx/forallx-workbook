import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useProgress } from "./state/progress";
import { getAccountEmail, useSyncStatus } from "./state/sync";

export function App() {
  const [progress, update] = useProgress();
  const loc = useLocation();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const theme = progress.theme ?? "auto";
  useSyncStatus(); // re-render when sign-in state changes
  const email = getAccountEmail();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    // scroll to top on route change unless there is a hash target
    if (!loc.hash) window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  useEffect(() => {
    // one canonical URL per route on the public domain
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = `https://forallxworkbook.com${loc.pathname === "/" ? "/" : loc.pathname.replace(/\/$/, "")}`;
  }, [loc.pathname]);

  const cycleTheme = () => update((p) => { p.theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto"; });

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">
          <span className="brand-fx"><span className="fx-mono">forall</span><i>x</i></span>
          <span className="brand-sub">Calgary</span>
        </Link>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/">Contents</NavLink>
          <NavLink to="/exercises">Exercises</NavLink>
          <NavLink to="/read/appC">Reference</NavLink>
          <NavLink to="/glossary">Glossary</NavLink>
          <NavLink to="/lab">Lab</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <form className="search-form" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the book" aria-label="Search the book" />
        </form>
        <Link to={email ? "/about#progress" : "/login"} className="account-link" title={email ? `Signed in as ${email}. Progress is saved to your account.` : "Sign in to save your progress across devices"}>
          {email ? email : "Sign in"}
        </Link>
        <button type="button" className="theme-btn" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}. Click to change`}>
          {theme === "auto" ? "Auto" : theme === "dark" ? "Dark" : "Light"}
        </button>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="site-foot">
        <p>
          An independent, free study edition of <em>forall x: Calgary</em> (text CC BY 4.0, code MIT). Not affiliated with or endorsed by the book's authors.
          Questions or concerns: <a href="mailto:hh695@cam.ac.uk">hh695@cam.ac.uk</a>. <Link to="/about">About and privacy</Link>.
        </p>
      </footer>
    </div>
  );
}
