import { NavLink } from "react-router-dom";

const ICONS = {
  Today: "M4 11.5 12 4l8 7.5M6 10v9h12v-9",
  Train: "M12,4a8,8 0 1,0 0.001,0 M12 8v4l3 2",
  Food: "M6 3v8a3 3 0 0 0 3 3v7M6 3v6M8 3v6M4 3v6M17 3c-2 1-2.5 4-2.5 6 0 2 1 3 2.5 3v9",
  Coach: "M12 3l2.2 4.6 5 .7-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.6 5-.7z",
  Progress: "M4 19V9M11 19V5M18 19v-7",
};

// Coach spec section 1: Today · Train · Food · Coach · Progress. Profile
// moved to the top-right avatar (see AvatarLink) rather than a nav tab.
export default function BottomNav() {
  const items = [
    ["/today", "Today"],
    ["/train", "Train"],
    ["/food", "Food"],
    ["/coach", "Coach"],
    ["/progress", "Progress"],
  ];
  return (
    <nav className="bottomnav">
      {items.map(([path, label]) => (
        <NavLink key={path} to={path} className={({ isActive }) => `navitem${isActive ? " active" : ""}`}>
          <svg width="21" height="21" viewBox="0 0 24 24">
            <path d={ICONS[label]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
