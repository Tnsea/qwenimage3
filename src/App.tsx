import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { api } from "./api";
import { parseCatalog } from "./catalog";
import { AuthDialog } from "./components/AuthDialog";
import { GeneratorWorkspace } from "./components/GeneratorWorkspace";
import { Header } from "./components/Header";
import { HomeHero } from "./components/HomeHero";
import { ApiPage, ExamplesPage, GuidesPage, HomeSections, ModelsPage, PricingPage, PromptsPage, type Catalog } from "./components/Marketing";
import { SiteFooter } from "./components/SiteFooter";
import { Studio } from "./components/Studio";
import type { SessionState } from "./types";

const emptySession: SessionState = {
  user: null,
  entitlements: { accountType: "guest", guestLimit: 0, guestRemaining: 0, credits: 0, reservedCredits: 0, guestResetsAt: "", priorityGeneration: false, watermarkedExports: true },
};

const emptyCatalog: Catalog = { plans: [], prompts: [], models: [], promotion: null, creditPacks: [] };

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [session, setSession] = useState<SessionState>(emptySession);
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [resetToken, setResetToken] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [startupError, setStartupError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => window.localStorage.getItem("qwen-theme") === "light" ? "light" : "dark");

  async function refreshSession() {
    const next = await api<SessionState>("/api/session");
    setSession(next);
  }

  useEffect(() => {
    void api<SessionState>("/api/session")
      .then(async (nextSession) => ({ nextSession, nextCatalog: parseCatalog(await api<unknown>("/api/catalog")) }))
      .then(({ nextSession, nextCatalog }) => { setSession(nextSession); setCatalog(nextCatalog); })
      .catch((reason: Error) => setStartupError(reason.message));
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (path === "/reset-password") {
      setResetToken(query.get("token") ?? "");
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    if (path === "/verify-email") {
      const token = query.get("token") ?? "";
      if (!token) {
        setStartupError("This verification link is incomplete.");
        return;
      }
      void api<{ verified: true; session?: SessionState }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
        .then((payload) => {
          if (payload.session) setSession(payload.session);
          else {
            setAuthMode("login");
            setAuthOpen(true);
          }
          window.history.replaceState({}, "", "/");
          setPath("/");
          setNotice(payload.session ? "Email verified. Account recovery and developer access are ready." : "Email verified. Sign in to continue.");
        })
        .catch((reason: Error) => setStartupError(reason.message));
      return;
    }
    if (query.get("oauth") === "success") {
      void refreshSession();
      window.history.replaceState({}, "", path);
      setNotice("Secure social sign-in complete.");
    } else if (query.has("oauth_error")) {
      window.history.replaceState({}, "", "/");
      setPath("/");
      setStartupError("Social sign-in could not be completed. Please try again or use email and password.");
      setAuthOpen(true);
    }
  }, [path]);

  useLayoutEffect(() => {
    const themeName = theme === "dark" ? "qwen" : "qwen-light";
    window.localStorage.setItem("qwen-theme", theme);
    document.documentElement.dataset.theme = themeName;
    document.documentElement.style.colorScheme = theme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#080909" : "#f4f3ef");
  }, [theme]);

  function navigate(nextPath: string) {
    document.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));
    if (nextPath !== path) window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAuth(mode: "login" | "register") {
    setResetToken("");
    setAuthMode(mode);
    setAuthOpen(true);
  }

  async function logout() {
    await api<void>("/api/auth/logout", { method: "POST" });
    await refreshSession();
    navigate("/");
    setNotice("You have signed out. Your account work remains private.");
  }

  function usePrompt(prompt: string) {
    setInitialPrompt(prompt);
    navigate("/");
    window.setTimeout(() => document.getElementById("generator")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  let page: React.ReactNode;
  if (path.startsWith("/studio")) {
    page = <Studio path={path} session={session} models={catalog.models} onNavigate={navigate} onRequireAuth={() => openAuth("login")} onSessionRefresh={refreshSession} onLogout={logout} />;
  } else if (path === "/examples") {
    page = <ExamplesPage catalog={catalog} onUsePrompt={usePrompt} />;
  } else if (path === "/prompts") {
    page = <PromptsPage catalog={catalog} onUsePrompt={usePrompt} />;
  } else if (path === "/models") {
    page = <ModelsPage catalog={catalog} onNavigate={navigate} />;
  } else if (path === "/pricing") {
    page = <PricingPage catalog={catalog} onRegister={() => session.user ? navigate("/studio/billing") : openAuth("register")} />;
  } else if (path === "/guides") {
    page = <GuidesPage onNavigate={navigate} />;
  } else if (path === "/api") {
    page = <ApiPage models={catalog.models} onNavigate={navigate} />;
  } else if (path === "/" || path === "/verify-email" || path === "/reset-password") {
    page = (
      <main className="home-main">
        <HomeHero />
        <GeneratorWorkspace session={session} models={catalog.models} initialPrompt={initialPrompt} onRequireAuth={() => openAuth("login")} onSessionRefresh={refreshSession} />
        <HomeSections catalog={catalog} onNavigate={navigate} onUsePrompt={usePrompt} onRegister={() => openAuth("register")} />
      </main>
    );
  } else {
    page = <main className="content-page studio-gate"><div className="card card-border"><div className="card-body"><FileQuestion size={34} /><span className="badge badge-outline">404</span><h1>This page does not exist.</h1><p>The address may be outdated, or the page may have moved. Your generations and account data are unchanged.</p><div className="card-actions"><button className="btn btn-primary" type="button" onClick={() => navigate("/")}><ArrowLeft size={15} />Back to generator</button></div></div></div></main>;
  }

  return (
    <div className={`page-shell ${theme === "light" ? "light-mode" : ""}`} data-theme={theme === "dark" ? "qwen" : "qwen-light"}>
      {(!path.startsWith("/studio") || !session.user) && <Header path={path} session={session} theme={theme} mobileOpen={mobileOpen} onNavigate={navigate} onTheme={() => setTheme((value) => value === "dark" ? "light" : "dark")} onMobile={() => setMobileOpen((value) => !value)} onSignIn={() => openAuth("login")} onRegister={() => openAuth("register")} onLogout={() => void logout()} />}
      {startupError && <div role="alert" className="alert alert-error global-alert"><span>{startupError}</span></div>}
      {notice && <div className="toast toast-end app-toast"><div role="status" className="alert alert-success"><span>{notice}</span><button className="btn btn-ghost btn-xs" onClick={() => setNotice("")}>Dismiss</button></div></div>}
      {page}
      {!path.startsWith("/studio") && <SiteFooter onNavigate={navigate} />}
      <AuthDialog open={authOpen} initialMode={authMode} resetToken={resetToken} onClose={() => setAuthOpen(false)} onResetComplete={() => {
        window.history.replaceState({}, "", "/");
        setPath("/");
        setResetToken("");
        setNotice("Password updated. Sign in with your new password.");
      }} onSuccess={(nextSession) => {
        setSession(nextSession);
        setAuthOpen(false);
        navigate("/studio");
        setNotice("Account ready. Your credits are available.");
      }} />
    </div>
  );
}
