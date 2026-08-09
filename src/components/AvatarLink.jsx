import { Link } from "react-router-dom";
import { useProfile } from "../hooks/useProfile";

// Small avatar in the top-right that opens Profile/Settings — replaces the
// old bottom-nav Profile tab (Coach spec section 1: "Move account/settings
// access to the user avatar in the top-right corner rather than consuming a
// primary navigation tab").
export default function AvatarLink() {
  const { profile } = useProfile();
  return (
    <Link
      to="/profile"
      style={{
        width: 34, height: 34, borderRadius: "50%", background: "var(--primary-tint)", color: "var(--primary-ink)",
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
        fontFamily: "var(--font-display)", textDecoration: "none", flexShrink: 0, fontSize: 14,
      }}
    >
      {(profile?.display_name || "?")[0]}
    </Link>
  );
}
