import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { api } from "./api";
import { initializeAnalytics, trackPageView } from "./analytics";
import { parseCatalog } from "./catalog";
import { AuthDialog } from "./components/AuthDialog";
import { GeneratorWorkspace } from "./components/GeneratorWorkspace";
import { Header } from "./components/Header";
import { HomeHero } from "./components/HomeHero";
import { ApiPage, BillingTermsPage, ExamplesPage, GuidesPage, HomeSections, ModelsPage, PricingPage, RefundPolicyPage, type Catalog } from "./components/Marketing";
import { SiteFooter } from "./components/SiteFooter";
import { Studio } from "./components/Studio";
import { IndependentStatusPage, PrivacyDataPage, SupportPage } from "./components/TrustPages";
import { CANONICAL_SITE_ORIGIN, legacyPublicRedirectPath, publicCanonicalUrl } from "./seo";
import type { SessionState } from "./types";

const emptySession: SessionState = {
  user: null,
  entitlements: { accountType: "guest", guestLimit: 0, guestRemaining: 0, credits: 0, reservedCredits: 0, guestResetsAt: "", priorityGeneration: false, watermarkedExports: true },
};

const emptyCatalog: Catalog = { plans: [], prompts: [], models: [], promotion: null, creditPacks: [] };

export default function App() {
  const [path, setPath] = useState(() => legacyPublicRedirectPath(window.location.pathname) ?? window.location.pathname);
  const [session, setSession] = useState<SessionState>(emptySession);
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [authOpen, setAuthOpen] = useState(false);
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
    initializeAnalytics();
    const initialRedirect = legacyPublicRedirectPath(window.location.pathname);
    if (initialRedirect) window.history.replaceState({}, "", `${initialRedirect}${window.location.search}${window.location.hash}`);
    void api<SessionState>("/api/session")
      .then(async (nextSession) => ({ nextSession, nextCatalog: parseCatalog(await api<unknown>("/api/catalog")) }))
      .then(({ nextSession, nextCatalog }) => { setSession(nextSession); setCatalog(nextCatalog); })
      .catch((reason: Error) => setStartupError(reason.message));
    const handlePopState = () => {
      const redirect = legacyPublicRedirectPath(window.location.pathname);
      if (redirect) window.history.replaceState({}, "", `${redirect}${window.location.search}${window.location.hash}`);
      setPath(redirect ?? window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (path === "/reset-password") {
      window.history.replaceState({}, "", "/");
      setPath("/");
      setAuthOpen(true);
      setNotice("Password reset is not needed. Continue with Google.");
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
      setStartupError("Google sign-in could not be completed. Please try again.");
      setAuthOpen(true);
    }
  }, [path]);

  useEffect(() => {
    const canonicalUrl = publicCanonicalUrl(path) ?? `${CANONICAL_SITE_ORIGIN}/`;
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
    trackPageView(path);
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

  function openAuth() {
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
    page = <Studio path={path} session={session} models={catalog.models} onNavigate={navigate} onRequireAuth={openAuth} onSessionRefresh={refreshSession} onLogout={logout} />;
  } else if (path === "/examples") {
    page = <ExamplesPage catalog={catalog} onUsePrompt={usePrompt} />;
  } else if (path === "/models") {
    page = <ModelsPage catalog={catalog} onNavigate={navigate} />;
  } else if (path === "/pricing") {
    page = <PricingPage catalog={catalog} onRegister={() => session.user ? navigate("/studio/billing") : openAuth()} />;
  } else if (path === "/guides") {
    page = <GuidesPage onNavigate={navigate} />;
  } else if (path === "/api") {
    page = <ApiPage models={catalog.models} onNavigate={navigate} />;
  } else if (path === "/terms") {
    page = <BillingTermsPage />;
  } else if (path === "/refund-policy") {
    page = <RefundPolicyPage />;
  } else if (path === "/privacy") {
    page = <PrivacyDataPage onNavigate={navigate} />;
  } else if (path === "/status") {
    page = <IndependentStatusPage onNavigate={navigate} />;
  } else if (path === "/support") {
    page = <SupportPage onNavigate={navigate} />;
  } else if (path === "/" || path === "/verify-email" || path === "/reset-password") {
    page = (
      <main className="home-main">
        <HomeHero />
        <GeneratorWorkspace session={session} models={catalog.models} initialPrompt={initialPrompt} onRequireAuth={openAuth} onSessionRefresh={refreshSession} onGenerationCreated={() => navigate("/studio/history")} />
        <HomeSections catalog={catalog} onNavigate={navigate} onUsePrompt={usePrompt} onRegister={openAuth} />
      </main>
    );
  } else {
    page = <main className="content-page studio-gate"><div className="card card-border"><div className="card-body"><FileQuestion size={34} /><span className="badge badge-outline">404</span><h1>This page does not exist.</h1><p>The address may be outdated, or the page may have moved. Your generations and account data are unchanged.</p><div className="card-actions"><button className="btn btn-primary" type="button" onClick={() => navigate("/")}><ArrowLeft size={15} />Back to generator</button></div></div></div></main>;
  }

  return (
    <div className={`page-shell ${theme === "light" ? "light-mode" : ""}`} data-theme={theme === "dark" ? "qwen" : "qwen-light"}>
      {(!path.startsWith("/studio") || !session.user) && <Header path={path} session={session} theme={theme} mobileOpen={mobileOpen} onNavigate={navigate} onTheme={() => setTheme((value) => value === "dark" ? "light" : "dark")} onMobile={() => setMobileOpen((value) => !value)} onSignIn={openAuth} onRegister={openAuth} onLogout={() => void logout()} />}
      {startupError && <div role="alert" className="alert alert-error global-alert"><span>{startupError}</span></div>}
      {notice && <div className="toast toast-end app-toast"><div role="status" className="alert alert-success"><span>{notice}</span><button className="btn btn-ghost btn-xs" onClick={() => setNotice("")}>Dismiss</button></div></div>}
      {page}
      {!path.startsWith("/studio") && <SiteFooter onNavigate={navigate} />}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
