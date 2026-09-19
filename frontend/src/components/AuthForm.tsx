import { FormEvent, useState } from "react";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { clearAuthError, login, register } from "../features/auth/authSlice";

export default function AuthForm() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.auth);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const action = mode === "login" ? login : register;
    dispatch(action({ username, password }));
  };

  const switchMode = () => {
    dispatch(clearAuthError());
    setMode(mode === "login" ? "register" : "login");
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Task Board</h1>
        <p className="muted">
          {mode === "login" ? "Sign in to join the board" : "Pick a name so teammates can see you"}
        </p>

        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="link" onClick={switchMode}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
