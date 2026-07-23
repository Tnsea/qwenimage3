import { renderToStaticMarkup } from "react-dom/server";
import { createCatalogCore } from "./catalog";
import { GeneratorWorkspace } from "./components/GeneratorWorkspace";
import { Header } from "./components/Header";
import { HomeHero } from "./components/HomeHero";
import { HomeSections } from "./components/Marketing";
import type { Catalog, SessionState } from "./types";

const prerenderedSession: SessionState = {
  user: null,
  entitlements: {
    accountType: "guest",
    guestLimit: 3,
    guestRemaining: 3,
    credits: 0,
    reservedCredits: 0,
    guestResetsAt: "2099-01-01T00:00:00.000Z",
    priorityGeneration: false,
    watermarkedExports: true,
  },
};

const prerenderedCatalog: Catalog = {
  ...createCatalogCore({
    providerId: "local-preview",
    providerModel: "local-qwen-preview",
    providerConfigured: true,
    creatorPriceLabel: "$10 / month",
    creatorCredits: 300,
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
          prerendered
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
      <footer className="site-footer footer sm:footer-horizontal">
        <span>Qwen Image 3 Generator Hub</span>
        <span>English-only · Private by default · Provider-aware</span>
      </footer>
    </div>
  );
}

export function renderPrerenderedHome() {
  return renderToStaticMarkup(<PrerenderedHome />);
}
