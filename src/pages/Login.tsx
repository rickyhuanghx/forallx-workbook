import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useProgress } from "../state/progress";
import { signInWithToken } from "../state/sync";

/** Landing page for the emailed link. The token is spent only when the learner clicks, so a mail
 *  client that prefetches the link cannot use it up. */
export function Login() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const [, update] = useProgress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    const r = await signInWithToken(token);
    setBusy(false);
    if (r === "ok") { update(() => {}); nav("/about?signedin=1", { replace: true }); return; }
    setError(r === "invalid"
      ? "This link has expired or has already been used. Ask for a new one from the About page."
      : "The server could not be reached. Your work is still saved in this browser. Try again in a moment.");
  };

  return (
    <div className="page page-narrow prose about">
      <header className="page-head"><h1>Sign in</h1></header>
      {!token ? (
        <p>This page needs the link from your sign-in email. You can ask for one on the <Link to="/about">About page</Link>.</p>
      ) : error ? (
        <>
          <p role="alert">{error}</p>
          <p><Link className="btn" to="/about">Back to the About page</Link></p>
        </>
      ) : (
        <>
          <p>Click the button to finish signing in on this device. Progress already saved in this browser is kept and merged with your account.</p>
          <p><button type="button" className="btn btn-primary" disabled={busy} onClick={finish}>{busy ? "Signing in..." : "Finish signing in"}</button></p>
        </>
      )}
    </div>
  );
}
