import { renderToStaticMarkup } from "react-dom/server";
import { createCatalogCore } from "./catalog";
import { GeneratorWorkspace } from "./components/GeneratorWorkspace";
import { Header } from "./components/Header";
import { HomeHero } from "./components/HomeHero";
import { HomeSections } from "./components/Marketing";
import { SiteFooter } from "./components/SiteFooter";
import type { Catalog, SessionState } from "./types";

const prerenderedSession: SessionState = {
  user: null,
  entitlements: {
    accountType: "guest",
    guestLimit: 0,
    guestRemaining: 0,
    credits: 0,
    reservedCredits: 0,
    guestResetsAt: "",
    priorityGeneration: false,
    watermarkedExports: true,
  },
};

const prerenderedCatalog: Catalog = {
  ...createCatalogCore({
    providerId: "local-preview",
    providerModel: "local-qwen-preview",
    providerConfigured: true,
    creatorPriceLabel: "$29.90 / month",
    creatorCredits: 2000,
    creatorPlanned: true,
  }),
  promotion: null,
  creditPacks: [],
};

function noop() {
  // Build-time event placeholder. React omits event handlers from static HTML.
}

function PrerenderedHome() {
  return (
    <div className="page-shell" data-theme="qwen" data-prerendered="home">
      <Header
        path="/"
        session={prerenderedSession}
        theme="dark"
        mobileOpen={false}
        onNavigate={noop}
        onTheme={noop}
        onMobile={noop}
        onSignIn={noop}
        onRegister={noop}
        onLogout={noop}
      />
      <main className="home-main">
        <HomeHero />
        <GeneratorWorkspace
          session={prerenderedSession}
          models={prerenderedCatalog.models}
          onRequireAuth={noop}
          onSessionRefresh={async () => undefined}
        />
        <HomeSections
          catalog={prerenderedCatalog}
          onNavigate={noop}
          onUsePrompt={noop}
          onRegister={noop}
        />
      </main>
      <SiteFooter onNavigate={noop} />
    </div>
  );
}

export function renderPrerenderedHome() {
  return renderToStaticMarkup(<PrerenderedHome />);
}
