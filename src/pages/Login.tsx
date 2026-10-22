import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProgress } from "../state/progress";
import { getAccountEmail, requestSignIn, signInWithToken, signOut, useSyncStatus } from "../state/sync";

/**
 * Sign-in page. Four states: ask for a link, link sent, finish from the emailed link, signed in.
 * The emailed token is spent only when the learner clicks "Finish signing in", so a mail client
 * that prefetches the link cannot use it up.
 */
export function Login() {
  const [params, setParams] = useSearchParams();
  const token = params.get("token") ?? "";
  const [, update] = useProgress();
  const status = useSyncStatus();
  const [account, setAccount] = useState<string | null>(() => getAccountEmail());
  useEffect(() => { setAccount(getAccountEmail()); }, [status.state]);

  const [entry, setEntry] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<"ready" | "invalid" | "offline">("ready");

  useEffect(() => { const prev = document.title; document.title = "Sign in | forall x workbook"; return () => { document.title = prev; }; }, []);

  const request = async () => {
    const email = entry.trim();
    if (!email) return;
    setBusy(true); setError(null);
    const r = await requestSignIn(email);
    setBusy(false);
    if (r === "ok") { setSentTo(email); return; }
    setError(r === "bademail" ? "That does not look like an email address."
      : r === "limited" ? "Too many sign-in emails have gone to that address in the last hour. Try again later."
      : "The sign-in email could not be sent. Try again in a moment.");
  };

  const finish = async () => {
    setBusy(true);
    const r = await signInWithToken(token);
    setBusy(false);
    if (r === "ok") { update(() => {}); setAccount(getAccountEmail()); setParams({}, { replace: true }); return; }
    setLinkState(r === "invalid" ? "invalid" : "offline");
  };

  const leave = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    setAccount(null);
    setSentTo(null);
    setEntry("");
  };

  let body;
  if (account) {
    body = (
      <>
        <p className="login-lede" role="status">You are signed in as <strong>{account}</strong>. Your progress saves to your account as you work and follows you to any device you sign in on.</p>
        <div className="login-actions">
          <Link className="btn btn-primary" to="/">Continue to the book</Link>
          <Link className="btn" to="/exercises">Exercises</Link>
        </div>
        <p className="login-foot">
          <Link to="/about#progress">Manage your account</Link>
          <span aria-hidden="true"> · </span>
          <button type="button" className="link-btn" disabled={busy} onClick={leave}>Sign out on this device</button>
        </p>
      </>
    );
  } else if (token) {
    body = linkState === "ready" ? (
      <>
        <p className="login-lede">Click the button to finish signing in on this device. Any progress already saved in this browser is kept and merged with your account.</p>
        <div className="login-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={finish}>{busy ? "Signing in..." : "Finish signing in"}</button>
        </div>
      </>
    ) : (
      <>
        <p className="login-error" role="alert">
          {linkState === "invalid"
            ? "This link has expired or has already been used. Each link works once, for 15 minutes."
            : "The server could not be reached. Your work is still saved in this browser."}
        </p>
        <div className="login-actions">
          {linkState === "invalid"
            ? <button type="button" className="btn btn-primary" onClick={() => { setLinkState("ready"); setParams({}, { replace: true }); }}>Ask for a new link</button>
            : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setLinkState("ready"); void finish(); }}>Try again</button>}
        </div>
      </>
    );
  } else if (sentTo) {
    body = (
      <>
        <p className="login-lede" role="status">We have sent a link to <strong>{sentTo}</strong>. Open it on this device to finish. It works once and expires in 15 minutes.</p>
        <p className="login-foot">Nothing yet? Check your spam folder, or <button type="button" className="link-btn" disabled={busy} onClick={request}>{busy ? "sending..." : "send it again"}</button>.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <p className="login-foot"><button type="button" className="link-btn" onClick={() => { setSentTo(null); setError(null); }}>Use a different address</button></p>
      </>
    );
  } else {
    body = (
      <>
        <p className="login-lede">Keep your progress and pick it up on any device. Enter your email and we will send you a link. There is no password.</p>
        <form className="login-form" onSubmit={(e) => { e.preventDefault(); void request(); }}>
          <label className="login-label" htmlFor="login-email">Email address</label>
          <input id="login-email" type="email" inputMode="email" autoComplete="email" autoFocus spellCheck={false}
            value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="you@example.org" aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} />
          {error && <p id="login-error" className="login-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || !entry.trim()}>{busy ? "Sending..." : "Email me a sign-in link"}</button>
        </form>
        <p className="login-foot">
          Until you sign in, your progress stays in this browser only.
          Prefer not to give an email? <Link to="/about#progress">Use a sync code instead</Link>.
        </p>
      </>
    );
  }

  return (
    <div className="page login">
      <div className="login-card">
        <div className="login-brand" aria-hidden="true"><span className="fx-mono">forall</span><i>x</i></div>
        <h1 className="login-title">{account ? "Signed in" : token ? "Finish signing in" : sentTo ? "Check your inbox" : "Sign in"}</h1>
        {body}
      </div>
      <p className="login-privacy">
        Signing in stores only your email, a random account id and your progress. <Link to="/about#privacy">Privacy</Link>
      </p>
    </div>
  );
}
