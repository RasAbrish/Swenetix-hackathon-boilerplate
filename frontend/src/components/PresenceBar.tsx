import { useAppSelector } from "../app/hooks";
import { colorFor } from "../lib/color";

export default function PresenceBar() {
  const { online, connected } = useAppSelector((s) => s.presence);
  const me = useAppSelector((s) => s.auth.user);

  return (
    <div className="presence">
      <span className={`dot ${connected ? "on" : "off"}`} />
      <span className="muted">{connected ? `${online.length} online` : "Reconnecting..."}</span>
      <div className="avatars">
        {online.map((u) => (
          <span
            key={u.id}
            className={`avatar${u.id === me?.id ? " me" : ""}`}
            style={{ background: colorFor(u.id) }}
            title={u.id === me?.id ? `${u.username} (you)` : u.username}
          >
            {u.username.charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
