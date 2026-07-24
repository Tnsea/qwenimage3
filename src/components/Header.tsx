import { Coins, Menu as MenuIcon, Moon, Sun, X } from "lucide-react";
import type { SessionState } from "../types";

const navigation = [
  { label: "Generator", path: "/" },
  { label: "Examples", path: "/examples" },
  { label: "Models", path: "/models" },
  { label: "Pricing", path: "/pricing" },
  { label: "Guides", path: "/guides" },
] as const;

interface HeaderProps {
  path: string;
  session: SessionState;
  theme: "dark" | "light";
  mobileOpen: boolean;
  onNavigate: (path: string) => void;
  onTheme: () => void;
  onMobile: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  onLogout: () => void;
}

export function Header({ path, session, theme, mobileOpen, onNavigate, onTheme, onMobile, onSignIn, onRegister, onLogout }: HeaderProps) {
  const isActive = (target: string) => target === "/" ? path === "/" : path.startsWith(target);
  const link = (target: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <header className="site-header">
      <nav className="navbar site-navbar" aria-label="Primary navigation">
        <div className="navbar-start">
          <a className="brand-link" href="/" onClick={link("/")} aria-label="Qwen Image 3 home">
            <img className="brand-favicon" src="/favicon-32x32.png" width={32} height={32} alt="" />
            <span>Qwen Image 3</span>
          </a>
        </div>

        <div className="navbar-center desktop-navigation">
          <ul className="menu menu-horizontal nav-menu">
            {navigation.map((item) => (
              <li key={item.path}>
                <a className={isActive(item.path) ? "menu-active" : ""} href={item.path} onClick={link(item.path)} aria-current={isActive(item.path) ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="navbar-end nav-actions">
          {session.user && (
            <button className="btn btn-ghost credit-nav-button desktop-action" type="button" onClick={() => onNavigate("/studio/credits")}>
              <Coins size={15} /> {session.entitlements.credits} credits
            </button>
          )}
          <div className="tooltip tooltip-bottom desktop-action" data-tip={theme === "dark" ? "Light theme" : "Dark theme"}>
            <button className="btn btn-ghost btn-circle nav-icon-button" type="button" onClick={onTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={17} />}
            </button>
          </div>

          {session.user ? (
            <details className="dropdown dropdown-end account-dropdown">
              <summary className="btn btn-circle account-button" aria-label="Open account menu">{session.user.name.slice(0, 1).toUpperCase()}</summary>
              <ul className="menu dropdown-content account-menu">
                <li className="account-menu-header"><strong>{session.user.name}</strong><span>{session.user.email}</span></li>
                <li><button type="button" onClick={() => onNavigate("/studio")}><span>Open Studio</span><b>{session.entitlements.credits} CR</b></button></li>
                <li><button type="button" onClick={() => onNavigate("/studio/history")}><span>Generation history</span></button></li>
                <li><button type="button" onClick={onLogout}><span>Sign out</span></button></li>
              </ul>
            </details>
          ) : (
            <div className="desktop-auth-actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={onSignIn}>Sign in</button>
              <button className="btn btn-sm nav-register-button" type="button" onClick={onRegister}>Create account</button>
            </div>
          )}

          <button className="btn btn-ghost btn-circle nav-icon-button mobile-menu-button" type="button" onClick={onMobile} aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileOpen}>
            {mobileOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="mobile-navigation-panel">
          <ul className="menu menu-vertical mobile-nav-menu">
            {navigation.map((item, index) => (
              <li key={item.path}>
                <a className={isActive(item.path) ? "menu-active" : ""} href={item.path} onClick={link(item.path)} aria-current={isActive(item.path) ? "page" : undefined}>
                  <span>{item.label}</span><span>{String(index + 1).padStart(2, "0")}</span>
                </a>
              </li>
            ))}
            {session.user && <li><a className={path.startsWith("/studio") ? "menu-active" : ""} href="/studio" onClick={link("/studio")} aria-current={path.startsWith("/studio") ? "page" : undefined}><span>Studio</span><span>{session.entitlements.credits} CR</span></a></li>}
          </ul>
          <div className="mobile-nav-footer">
            <button className="btn btn-ghost" type="button" onClick={onTheme}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Light" : "Dark"}</button>
            {session.user ? <button className="btn btn-ghost" type="button" onClick={onLogout}>Sign out</button> : <button className="btn" type="button" onClick={onSignIn}>Sign in</button>}
          </div>
        </div>
      )}
    </header>
  );
}
