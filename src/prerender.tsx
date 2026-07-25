import { ArrowLeft, FileQuestion } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCatalogCore, KIE_QWEN_MODEL_ID } from "./catalog";
import { BlogHubPage, ContentArticlePage, GuidesHubPage } from "./components/ContentPages";
import { GeneratorWorkspace } from "./components/GeneratorWorkspace";
import { Header } from "./components/Header";
import { HomeHero } from "./components/HomeHero";
import {
  ApiPage,
  BillingTermsPage,
  ExamplesPage,
  HomeSections,
  ModelsPage,
  PricingPage,
  RefundPolicyPage,
} from "./components/Marketing";
import { SiteFooter } from "./components/SiteFooter";
import { IndependentStatusPage, PrivacyDataPage, SupportPage } from "./components/TrustPages";
import { contentDocumentForPath } from "./content";
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
    providerId: "kie-ai",
    providerModel: KIE_QWEN_MODEL_ID,
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

async function asyncNoop() {
  // Build-time event placeholder.
}

function PrerenderedShell({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="page-shell" data-theme="qwen" data-prerendered={path}>
      <Header
        path={path}
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
      {children}
      <SiteFooter onNavigate={noop} />
    </div>
  );
}

function PrerenderedHome() {
  return (
    <PrerenderedShell path="/">
      <main className="home-main">
        <HomeHero />
        <GeneratorWorkspace
          session={prerenderedSession}
          models={prerenderedCatalog.models}
          onRequireAuth={noop}
          onSessionRefresh={asyncNoop}
          onGenerationCreated={noop}
        />
        <HomeSections
          catalog={prerenderedCatalog}
          onNavigate={noop}
          onUsePrompt={noop}
          onRegister={noop}
        />
      </main>
    </PrerenderedShell>
  );
}

function PrerenderedNotFound() {
  return (
    <PrerenderedShell path="/404">
      <main className="content-page studio-gate">
        <div className="card card-border">
          <div className="card-body">
            <FileQuestion size={34} />
            <span className="badge badge-outline">404</span>
            <h1>This page does not exist.</h1>
            <p>The address may be outdated, or the page may have moved. Your generations and account data are unchanged.</p>
            <div className="card-actions"><a className="btn btn-primary" href="/"><ArrowLeft size={15} />Back to generator</a></div>
          </div>
        </div>
      </main>
    </PrerenderedShell>
  );
}

function routeContent(path: string): React.ReactNode {
  if (path === "/") return <PrerenderedHome />;
  if (path === "/examples") return <PrerenderedShell path={path}><ExamplesPage catalog={prerenderedCatalog} onUsePrompt={noop} /></PrerenderedShell>;
  if (path === "/models") return <PrerenderedShell path={path}><ModelsPage catalog={prerenderedCatalog} onNavigate={noop} /></PrerenderedShell>;
  if (path === "/pricing") return <PrerenderedShell path={path}><PricingPage catalog={prerenderedCatalog} onCheckout={asyncNoop} /></PrerenderedShell>;
  if (path === "/guides") return <PrerenderedShell path={path}><GuidesHubPage onNavigate={noop} /></PrerenderedShell>;
  if (path === "/blog") return <PrerenderedShell path={path}><BlogHubPage onNavigate={noop} /></PrerenderedShell>;
  if (path === "/api") return <PrerenderedShell path={path}><ApiPage models={prerenderedCatalog.models} onNavigate={noop} /></PrerenderedShell>;
  if (path === "/terms") return <PrerenderedShell path={path}><BillingTermsPage /></PrerenderedShell>;
  if (path === "/refund-policy") return <PrerenderedShell path={path}><RefundPolicyPage /></PrerenderedShell>;
  if (path === "/privacy") return <PrerenderedShell path={path}><PrivacyDataPage onNavigate={noop} /></PrerenderedShell>;
  if (path === "/status") return <PrerenderedShell path={path}><IndependentStatusPage onNavigate={noop} /></PrerenderedShell>;
  if (path === "/support") return <PrerenderedShell path={path}><SupportPage onNavigate={noop} /></PrerenderedShell>;
  if (contentDocumentForPath(path)) {
    return (
      <PrerenderedShell path={path}>
        <ContentArticlePage path={path} onNavigate={noop} onUsePrompt={noop} />
      </PrerenderedShell>
    );
  }
  return <PrerenderedNotFound />;
}

export function renderPrerenderedRoute(path: string) {
  return renderToStaticMarkup(routeContent(path));
}

export function renderPrerenderedNotFound() {
  return renderToStaticMarkup(<PrerenderedNotFound />);
}

export function renderPrerenderedHome() {
  return renderPrerenderedRoute("/");
}
