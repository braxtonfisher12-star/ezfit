import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    if (error) setError(error.message);
    else navigate("/today");
  };

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <h1 className="pageTitle" style={{ textAlign: "center" }}>EZfit</h1>
      <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>Get leaner. Get stronger. Stop guessing.</p>
      <form onSubmit={submit}>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <p className="pill red" style={{ marginBottom: 12 }}>{error}</p>}
        <button className="btnPrimary" type="submit">{mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="btnGhost" style={{ marginTop: 10 }} onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
