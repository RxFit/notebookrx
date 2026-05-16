"use client";
import { PresenceUser } from "@/hooks/useCollabPresence";

interface Props {
  users: PresenceUser[];
  connected: boolean;
  maxVisible?: number;
}

export default function PresenceAvatars({ users, connected, maxVisible = 5 }: Props) {
  if (!connected || users.length <= 1) return null;

  const visible  = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  return (
    <div className="presence-avatars" title={`${users.length} people viewing this notebook`}>
      {visible.map((u, i) => (
        <div
          key={u.user_id}
          className="presence-avatar"
          style={{
            background: u.color,
            zIndex: maxVisible - i,
            marginLeft: i === 0 ? 0 : -8,
          }}
          title={u.display_name}
        >
          {u.display_name.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="presence-avatar presence-overflow"
          style={{ zIndex: 0, marginLeft: -8 }}
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
      <span className="presence-live-dot" title="Live collaboration active" />
    </div>
  );
}