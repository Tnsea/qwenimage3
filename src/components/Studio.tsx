import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Archive, ArrowRight, CheckCircle2, Coins, Copy, CreditCard, Download, FolderKanban, Heart, History, Home, Image as ImageIcon, KeyRound, LayoutDashboard, LifeBuoy, LogOut, MailCheck, Menu, MessageSquare, MonitorSmartphone, Plus, ReceiptText, RefreshCw, Send, Settings, ShieldCheck, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import { api } from "../api";
import { BILLING_TERMS_VERSION, billingPolicySummary } from "../billing-policy";
import type {
  AccountSession,
  ApiKeyCreated,
  ApiKeySummary,
  ApiRequestLog,
  BillingSummary,
  CatalogModel,
  CreditEntry,
  Generation,
  Project,
  SessionState,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketPriority,
  WorkspaceActivity,
  WorkspaceOverview,
} from "../types";
import { GeneratorWorkspace } from "./GeneratorWorkspace";

interface StudioProps {
  path: string;
  session: SessionState;
  models: CatalogModel[];
  onNavigate: (path: string) => void;
  onRequireAuth: () => void;
  onSessionRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}

const workspaceNavigation = [
  { label: "Create", path: "/studio", icon: Plus },
  { label: "History", path: "/studio/history", icon: History },
  { label: "Projects", path: "/studio/projects", icon: FolderKanban },
  { label: "Favorites", path: "/studio/favorites", icon: Heart },
  { label: "Overview", path: "/studio/overview", icon: LayoutDashboard },
] as const;

const accountNavigation = [
  { label: "Credits", path: "/studio/credits", icon: Coins },
  { label: "Billing", path: "/studio/billing", icon: CreditCard },
  { label: "Payments", path: "/studio/payments", icon: ReceiptText },
  { label: "API Keys", path: "/studio/api-keys", icon: KeyRound },
  { label: "API Activity", path: "/studio/api-activity", icon: Activity },
  { label: "Support", path: "/studio/support", icon: LifeBuoy },
  { label: "Settings", path: "/studio/settings", icon: Settings },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ActivityIcon({ activity }: { activity: WorkspaceActivity }) {
  if (activity.type === "credit") return <Coins size={16} />;
  if (activity.type === "payment") return <ReceiptText size={16} />;
  if (activity.type === "support") return <LifeBuoy size={16} />;
  return <ImageIcon size={16} />;
}

export function Studio({ path, session, models, onNavigate, onRequireAuth, onSessionRefresh, onLogout }: StudioProps) {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [ledger, setLedger] = useState<CreditEntry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [apiRequests, setApiRequests] = useState<ApiRequestLog[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicketDetail | null>(null);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportCategory, setSupportCategory] = useState<SupportTicketCategory>("generation");
  const [supportPriority, setSupportPriority] = useState<SupportTicketPriority>("normal");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportReply, setSupportReply] = useState("");
  const [accountSessions, setAccountSessions] = useState<AccountSession[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [keyName, setKeyName] = useState("");
  const [issuedKey, setIssuedKey] = useState<ApiKeyCreated | null>(null);
  const [profileName, setProfileName] = useState(session.user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"month" | "year">("year");
  const [billingTermsConfirmed, setBillingTermsConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [studioLoading, setStudioLoading] = useState(true);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const loadStudio = useCallback(async () => {
    if (!session.user) return;
    const [overviewPayload, projectPayload, generationPayload, creditPayload, keyPayload, requestPayload, sessionPayload, billingPayload, supportPayload] = await Promise.all([
      api<WorkspaceOverview>("/api/workspace/overview"),
      api<{ projects: Project[] }>("/api/projects"),
      api<{ generations: Generation[] }>("/api/generations?limit=50"),
      api<{ account: { available: number; reserved: number }; ledger: CreditEntry[] }>("/api/credits"),
      api<{ apiKeys: ApiKeySummary[] }>("/api/api-keys"),
      api<{ requests: ApiRequestLog[] }>("/api/api-logs"),
      api<{ sessions: AccountSession[] }>("/api/account/sessions"),
      api<BillingSummary>("/api/billing"),
      api<{ tickets: SupportTicket[] }>("/api/support/tickets"),
    ]);
    setOverview(overviewPayload);
    setProjects(projectPayload.projects);
    setGenerations(generationPayload.generations);
    setLedger(creditPayload.ledger);
    setApiKeys(keyPayload.apiKeys);
    setApiRequests(requestPayload.requests);
    setAccountSessions(sessionPayload.sessions);
    setBilling(billingPayload);
    setBillingTermsConfirmed(billingPayload.terms.accepted);
    setSupportTickets(supportPayload.tickets);
  }, [session.user]);

  useEffect(() => {
    let active = true;
    void loadStudio()
      .catch((reason: Error) => setError(reason.message))
      .finally(() => {
        if (active) setStudioLoading(false);
      });
    return () => { active = false; };
  }, [loadStudio, path]);
  useEffect(() => { setProfileName(session.user?.name ?? ""); }, [session.user?.name]);

  const favoriteGenerations = useMemo(() => generations.filter((item) => item.favorite), [generations]);
  const currentSection = path.split("/")[2] || "create";

  useEffect(() => {
    if (currentSection !== "billing") return;
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (!checkout) return;
    setMessage(checkout === "success" ? "Checkout returned successfully. Credits and plan status update after Stripe confirms the signed webhook." : "Checkout canceled. No payment or credits were applied.");
    window.history.replaceState({}, "", "/studio/billing");
  }, [currentSection]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const project = await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name: newProjectName, description: newProjectDescription }) });
      setProjects((items) => [project, ...items]);
      setNewProjectName("");
      setNewProjectDescription("");
      setMessage(`Project “${project.name}” created.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the project."); }
  }

  async function archiveProject(project: Project) {
    try {
      const updated = await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name: project.name, description: project.description, archived: !project.archived }) });
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the project."); }
  }

  async function setGenerationFavorite(generation: Generation) {
    const action = `generation-favorite-${generation.id}`;
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      const updated = await api<{ favorite: boolean }>(`/api/generations/${generation.id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ favorite: !generation.favorite }),
      });
      setGenerations((items) => items.map((item) => item.id === generation.id ? { ...item, favorite: updated.favorite } : item));
      setMessage(updated.favorite ? "Saved to Favorites." : "Removed from Favorites.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this favorite.");
    } finally {
      setBusyAction("");
    }
  }

  async function createGenerationVariation(generation: Generation) {
    const retrying = generation.status === "failed";
    const actionLabel = retrying ? "retry" : "variation";
    if (!window.confirm(`Create a ${actionLabel} using the same settings? This generation uses ${generation.creditCost} credits when it completes.`)) return;
    const action = `generation-variation-${generation.id}`;
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      const created = await api<Generation>("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          prompt: generation.prompt,
          modelId: generation.model,
          aspectRatio: generation.aspectRatio,
          style: generation.style,
          quality: generation.quality,
          projectId: generation.projectId,
        }),
      });
      setGenerations((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      await Promise.allSettled([
        onSessionRefresh(),
        api<WorkspaceOverview>("/api/workspace/overview").then(setOverview),
      ]);
      setMessage(retrying ? "Retry complete. The new result is first in your history." : "Variation complete. The new result is first in your history.");
      onNavigate("/studio/history");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not create the ${actionLabel}.`);
    } finally {
      setBusyAction("");
    }
  }

  async function deleteGenerationRecord(generation: Generation) {
    if (!window.confirm("Delete this generation and its private image permanently? This cannot be undone.")) return;
    const action = `generation-delete-${generation.id}`;
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      await api<void>(`/api/generations/${generation.id}`, { method: "DELETE" });
      setGenerations((items) => items.filter((item) => item.id !== generation.id));
      setOverview(await api<WorkspaceOverview>("/api/workspace/overview"));
      setMessage("Generation deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this generation.");
    } finally {
      setBusyAction("");
    }
  }

  async function createSupportRequest(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("support-create");
    setError("");
    try {
      const ticket = await api<SupportTicketDetail>("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: supportSubject,
          category: supportCategory,
          priority: supportPriority,
          message: supportMessage,
        }),
      });
      setSupportTickets((items) => [ticket, ...items]);
      setActiveTicket(ticket);
      setSupportSubject("");
      setSupportCategory("generation");
      setSupportPriority("normal");
      setSupportMessage("");
      setMessage(`Support ticket ${ticket.id.slice(0, 8)} opened.`);
      setOverview(await api<WorkspaceOverview>("/api/workspace/overview"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open the support ticket."); }
    finally { setBusyAction(""); }
  }

  async function openSupportTicket(ticketId: string) {
    setBusyAction(ticketId);
    setError("");
    try {
      setActiveTicket(await api<SupportTicketDetail>(`/api/support/tickets/${ticketId}`));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the support ticket."); }
    finally { setBusyAction(""); }
  }

  async function replyToSupportTicket(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTicket) return;
    setBusyAction("support-reply");
    setError("");
    try {
      const ticket = await api<SupportTicketDetail>(`/api/support/tickets/${activeTicket.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: supportReply }),
      });
      setActiveTicket(ticket);
      setSupportTickets((items) => items.map((item) => item.id === ticket.id ? ticket : item));
      setSupportReply("");
      setMessage("Your reply was added to the ticket.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the reply."); }
    finally { setBusyAction(""); }
  }

  async function setSupportTicketClosed(closed: boolean) {
    if (!activeTicket) return;
    setBusyAction("support-status");
    setError("");
    try {
      const ticket = await api<SupportTicketDetail>(`/api/support/tickets/${activeTicket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: closed ? "closed" : "open" }),
      });
      setActiveTicket(ticket);
      setSupportTickets((items) => items.map((item) => item.id === ticket.id ? ticket : item));
      setMessage(closed ? "Support ticket closed." : "Support ticket reopened.");
      setOverview(await api<WorkspaceOverview>("/api/workspace/overview"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the support ticket."); }
    finally { setBusyAction(""); }
  }

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<ApiKeyCreated>("/api/api-keys", { method: "POST", body: JSON.stringify({ name: keyName }) });
      setIssuedKey(created);
      setApiKeys((items) => [created, ...items]);
      setOverview((current) => current ? { ...current, activeApiKeys: current.activeApiKeys + 1 } : current);
      setKeyName("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the API key."); }
  }

  async function revokeKey(id: string) {
    try {
      await api<void>(`/api/api-keys/${id}`, { method: "DELETE" });
      setApiKeys((items) => items.filter((item) => item.id !== id));
      setOverview((current) => current ? { ...current, activeApiKeys: Math.max(0, current.activeApiKeys - 1) } : current);
      if (issuedKey?.id === id) setIssuedKey(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke the API key."); }
  }

  async function updateProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("profile");
    setError("");
    try {
      await api<{ user: SessionState["user"] }>("/api/account/profile", { method: "PATCH", body: JSON.stringify({ name: profileName }) });
      await onSessionRefresh();
      setMessage("Profile updated across your workspace.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update your profile."); }
    finally { setBusyAction(""); }
  }

  async function requestVerification() {
    setBusyAction("verification");
    setError("");
    try {
      const delivery = await api<{ alreadyVerified?: boolean }>("/api/auth/verify-email/request", { method: "POST" });
      if (delivery.alreadyVerified) {
        await onSessionRefresh();
        setMessage("This email is already verified.");
      } else {
        setMessage("Verification email sent. The link expires in 24 hours.");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the verification email."); }
    finally { setBusyAction(""); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("password");
    setError("");
    try {
      await api<{ changed: true }>("/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword("");
      setNewPassword("");
      await loadStudio();
      setMessage("Password changed. Every other signed-in device was revoked.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the password."); }
    finally { setBusyAction(""); }
  }

  async function revokeAccountSession(id: string) {
    setBusyAction(id);
    setError("");
    try {
      await api<void>(`/api/account/sessions/${id}`, { method: "DELETE" });
      setAccountSessions((items) => items.filter((item) => item.id !== id));
      setMessage("That device session can no longer access your account.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke the session."); }
    finally { setBusyAction(""); }
  }

  async function revokeOtherAccountSessions() {
    setBusyAction("sessions");
    setError("");
    try {
      const payload = await api<{ revoked: number }>("/api/account/sessions/revoke-others", { method: "POST" });
      setAccountSessions((items) => items.filter((item) => item.current));
      setMessage(`${payload.revoked} other session${payload.revoked === 1 ? " was" : "s were"} revoked.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke other sessions."); }
    finally { setBusyAction(""); }
  }

  async function startCheckout(offerId: string) {
    if (!billingTermsConfirmed) {
      setError("Review and accept the current Billing Terms and Refund Policy before purchasing.");
      return;
    }
    setBusyAction(offerId);
    setError("");
    try {
      const payload = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ offerId }) });
      window.location.assign(payload.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start checkout."); setBusyAction(""); }
  }

  async function setBillingTermsConsent(confirmed: boolean) {
    if (!confirmed) {
      setBillingTermsConfirmed(false);
      return;
    }
    if (billing?.terms.accepted) {
      setBillingTermsConfirmed(true);
      return;
    }
    setBusyAction("billing-terms");
    setError("");
    try {
      const terms = await api<BillingSummary["terms"]>("/api/billing/terms/accept", {
        method: "POST",
        body: JSON.stringify({ version: BILLING_TERMS_VERSION, confirmed: true }),
      });
      setBilling((current) => current ? { ...current, terms } : current);
      setBillingTermsConfirmed(true);
      setMessage("Billing Terms and Refund Policy accepted.");
    } catch (reason) {
      setBillingTermsConfirmed(false);
      setError(reason instanceof Error ? reason.message : "Could not record billing policy acceptance.");
    } finally {
      setBusyAction("");
    }
  }

  async function openBillingPortal() {
    setBusyAction("portal");
    setError("");
    try {
      const payload = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.assign(payload.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open billing management."); setBusyAction(""); }
  }

  async function deleteAccount() {
    setBusyAction("delete");
    setError("");
    try {
      await api<void>("/api/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }) });
      deleteDialogRef.current?.close();
      await onSessionRefresh();
      onNavigate("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete the account."); }
    finally { setBusyAction(""); }
  }

  if (!session.user) {
    return <main className="content-page studio-gate"><div className="card card-border"><div className="card-body"><KeyRound /><h1>Studio is your private workspace.</h1><p>Sign in to manage projects, credits, generations, favorites, and developer keys.</p><div className="card-actions"><button className="btn btn-primary" type="button" onClick={onRequireAuth}>Sign in to Studio <ArrowRight size={15} /></button></div></div></div></main>;
  }

  const renderLoading = () => <div className="studio-content studio-loading" aria-busy="true" aria-label="Loading workspace">
    <header className="studio-loading-header">
      <div className="skeleton studio-loading-kicker" />
      <div className="skeleton studio-loading-title" />
      <div className="skeleton studio-loading-copy" />
    </header>
    <div className="studio-loading-summary">
      {Array.from({ length: 4 }, (_, index) => <div className="studio-loading-summary-item" key={index}><div className="skeleton studio-loading-label" /><div className="skeleton studio-loading-value" /><div className="skeleton studio-loading-note" /></div>)}
    </div>
    <div className="studio-loading-grid">
      <section><div className="skeleton studio-loading-section-title" /><div className="studio-loading-thumbnails">{Array.from({ length: 3 }, (_, index) => <div className="skeleton studio-loading-thumbnail" key={index} />)}</div></section>
      <aside><div className="skeleton studio-loading-section-title" />{Array.from({ length: 3 }, (_, index) => <div className="skeleton studio-loading-row" key={index} />)}</aside>
    </div>
  </div>;

  const renderOverview = () => {
    const metrics = [
      {
        value: overview?.plan.name ?? (session.entitlements.accountType === "creator" ? "Creator" : "Starter"),
        label: "Plan",
        note: overview?.plan.status === "active" ? "Active subscription" : "Current subscription",
        path: "/studio/billing",
      },
      {
        value: overview?.credits.available ?? session.entitlements.credits,
        label: "Available credits",
        note: `${overview?.credits.reserved ?? session.entitlements.reservedCredits} currently reserved`,
        path: "/studio/credits",
      },
      {
        value: overview?.usage.generationsThisMonth ?? 0,
        label: "Images this month",
        note: `${overview?.usage.generationsAllTime ?? generations.length} generated all time`,
        path: "/studio/history",
      },
      {
        value: overview?.activeApiKeys ?? apiKeys.length,
        label: "Active API keys",
        note: "Manage developer access",
        path: "/studio/api-keys",
      },
    ];
    return <div className="studio-content studio-overview">
      <header className="studio-heading studio-overview-heading">
        <div>
          <span>Workspace</span>
          <h1>Overview</h1>
          <p>{greeting()}, {session.user!.name.split(" ")[0]}. Your private work is ready where you left it.</p>
        </div>
        <button className="btn studio-primary-action" type="button" onClick={() => onNavigate("/studio")}><Plus size={16} />Create image</button>
      </header>

      <div className="studio-summary" aria-label="Workspace summary">
        {metrics.map((metric) => <button className="workspace-summary-item" type="button" key={metric.path} onClick={() => onNavigate(metric.path)}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.note}</small>
        </button>)}
      </div>

      <div className="studio-overview-grid">
        <section className="studio-panel studio-continue-panel">
          <div className="studio-panel-heading">
            <div><h2>Continue creating</h2><p>Your latest private work stays attached to your account.</p></div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => onNavigate("/studio")}><Plus size={14} />New image</button>
          </div>
          <GenerationGrid
            generations={generations.slice(0, 6)}
            busyAction={busyAction}
            onCreate={() => onNavigate("/studio")}
            onDelete={deleteGenerationRecord}
            onFavorite={setGenerationFavorite}
            onVariation={createGenerationVariation}
          />
        </section>

        <section className="studio-panel studio-activity-panel">
          <div className="studio-panel-heading">
            <div><h2>Recent activity</h2><p>Generations, credits, payments, and support.</p></div>
          </div>
          {overview?.recentActivity.length ? <ul className="list studio-activity-list">
            {overview.recentActivity.map((activity) => <li className="list-row" key={activity.id}>
              <span className="studio-activity-icon"><ActivityIcon activity={activity} /></span>
              <button type="button" className="studio-activity-copy" onClick={() => onNavigate(activity.href)}>
                <strong>{activity.title}</strong>
                <small>{activity.detail}</small>
              </button>
              <time dateTime={activity.createdAt}>{formatDate(activity.createdAt)}</time>
            </li>)}
          </ul> : <div className="studio-empty studio-activity-empty"><History /><h3>No recent activity</h3><p>Generations, credit changes, payments, and support updates will appear here.</p></div>}
        </section>
      </div>
    </div>;
  };

  const renderProjects = () => <div className="studio-content"><header className="studio-heading"><div><span>Organization</span><h1>Projects</h1><p>Group generations by campaign, client, or creative direction.</p></div></header><form className="card card-border studio-form-card" onSubmit={createProject}><div className="card-body"><h2 className="card-title">Create a project</h2><div className="studio-form-grid"><label><span>Project name</span><input className="input" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Spring launch" required minLength={2} maxLength={80} /></label><label><span>Description</span><input className="input" value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="Campaign images and prompt directions" maxLength={240} /></label><button className="btn" type="submit"><Plus size={15} />Create</button></div></div></form><div className="project-grid">{projects.map((project) => <article className={`card card-border project-card ${project.archived ? "is-archived" : ""}`} key={project.id}><div className="card-body"><div className="project-card-top"><FolderKanban /><span className="badge badge-outline">{project.generationCount} images</span></div><h2 className="card-title">{project.name}</h2><p>{project.description || "No description yet."}</p><small>Created {formatDate(project.createdAt)}</small><div className="card-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => void archiveProject(project)}><Archive size={14} />{project.archived ? "Restore" : "Archive"}</button></div></div></article>)}</div></div>;

  const renderCredits = () => <div className="studio-content"><header className="studio-heading"><div><span>Transparent accounting</span><h1>Credits</h1><p>Every grant, reservation, settlement, and refund is visible.</p></div></header><div className="stats studio-stats credit-stats"><div className="stat"><div className="stat-title">Available</div><div className="stat-value">{session.entitlements.credits}</div><div className="stat-desc">Ready for web or API use</div></div><div className="stat"><div className="stat-title">Reserved</div><div className="stat-value">{session.entitlements.reservedCredits}</div><div className="stat-desc">Released automatically on failure</div></div><div className="stat"><div className="stat-title">Welcome grant</div><div className="stat-value">20</div><div className="stat-desc">Issued once at account creation</div></div></div><section className="studio-panel"><div className="studio-panel-heading"><div><span>Immutable ledger</span><h2>Balance activity</h2></div></div><div className="overflow-x-auto"><table className="table ledger-table"><thead><tr><th>Event</th><th>Description</th><th>Change</th><th>Balance</th><th>Date</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry.id}><td><span className="badge badge-outline">{entry.type.replaceAll("_", " ")}</span></td><td>{entry.description}</td><td className={entry.amount > 0 ? "credit-positive" : entry.amount < 0 ? "credit-negative" : ""}>{entry.amount > 0 ? "+" : ""}{entry.amount}</td><td>{entry.balanceAfter}</td><td>{formatDate(entry.createdAt)}</td></tr>)}</tbody></table></div></section></div>;

  const renderBilling = () => {
    const planTier = billing?.account.planTier && billing.account.planTier !== "free"
      ? billing.account.planTier[0].toUpperCase() + billing.account.planTier.slice(1)
      : "Account";
    const subscriptionOffers = billing?.offers.filter((offer) => offer.kind === "subscription" && offer.billingInterval === billingPeriod) ?? [];
    const creditPacks = billing?.offers.filter((offer) => offer.kind === "credits") ?? [];
    return <div className="studio-content">
      <header className="studio-heading"><div><span>Payments and plans</span><h1>Billing</h1><p>Stripe-hosted checkout, signed fulfillment, and self-service subscription management.</p></div>{billing?.account.hasCustomer && <button className="btn btn-outline" type="button" disabled={busyAction === "portal"} onClick={() => void openBillingPortal()}><CreditCard size={15} />Manage in Stripe</button>}</header>
      {billing?.account.spendingBlocked && <div role="alert" className="alert alert-error alert-soft billing-config-alert"><TriangleAlert size={19} /><div><strong>Credit spending is paused</strong><span>{billing.account.blockReason ?? "A refund or dispute needs billing review before more credits can be spent."}</span></div></div>}
      {!billing?.configured && <div role="alert" className="alert alert-info alert-soft billing-config-alert"><ShieldCheck size={19} /><div><strong>Billing is safely disabled</strong><span>New purchases remain paused while release checks are completed. No simulated payment buttons are shown and no charge can start.</span></div></div>}
      <section className="studio-panel billing-plan-panel"><div><span className="settings-card-icon"><CreditCard size={18} /></span><div><span>Current plan</span><h2>{planTier}</h2><p>{billing?.account.plan === "creator" ? `${billing.account.billingInterval === "year" ? "Yearly" : "Monthly"} subscription status: ${billing.account.status.replaceAll("_", " ")}.` : "20 welcome credits, private history, projects, and API access."}</p></div></div><div><span className={`badge ${billing?.account.status === "active" ? "badge-success" : "badge-outline"}`}>{billing?.account.status ?? "inactive"}</span>{billing?.account.currentPeriodEnd && <small>{billing.account.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDate(billing.account.currentPeriodEnd)}</small>}</div></section>

      <fieldset className="fieldset card card-border">
        <legend className="fieldset-legend">Purchase confirmation</legend>
        <div role="alert" className="alert alert-info alert-soft items-start" id="billing-policy-summary">
          <ShieldCheck size={18} />
          <div>
            <strong>Automatic renewal and refund rules</strong>
            <span>{billingPolicySummary[0]} {billingPolicySummary[1]}</span>
            <span>{billingPolicySummary[3]}</span>
          </div>
        </div>
        <label className="label cursor-pointer items-start gap-3">
          <input
            className="checkbox checkbox-sm"
            type="checkbox"
            checked={billingTermsConfirmed}
            disabled={!billing || busyAction === "billing-terms"}
            aria-describedby="billing-policy-summary"
            onChange={(event) => void setBillingTermsConsent(event.target.checked)}
          />
          <span>
            I have read and agree to the current <a className="link" href="/terms">Billing Terms</a> and{" "}
            <a className="link" href="/refund-policy">Refund Policy</a>, including automatic renewal and credit recovery after refunds or disputes.
          </span>
        </label>
        <p className="label">
          Version {billing?.terms.version ?? BILLING_TERMS_VERSION}
          {billing?.terms.acceptedAt ? ` accepted ${formatDate(billing.terms.acceptedAt)}` : " must be accepted before Checkout."}
        </p>
      </fieldset>

      <section className="billing-choice-section">
        <div className="studio-panel-heading billing-choice-heading"><div><span>Subscriptions</span><h2>Choose recurring capacity</h2><p>Yearly plans are selected by default and issue the full annual allowance after payment.</p></div><div role="tablist" className="tabs tabs-box billing-cycle-tabs" aria-label="Studio billing period"><button role="tab" type="button" className={`tab ${billingPeriod === "month" ? "tab-active" : ""}`} aria-selected={billingPeriod === "month"} onClick={() => setBillingPeriod("month")}>Monthly</button><button role="tab" type="button" className={`tab ${billingPeriod === "year" ? "tab-active" : ""}`} aria-selected={billingPeriod === "year"} onClick={() => setBillingPeriod("year")}>Yearly <span className="badge badge-sm">Save 2 months</span></button></div></div>
        <div className="billing-offers">{subscriptionOffers.map((offer) => <article className={`card card-border billing-offer ${offer.planTier === "creator" ? "billing-offer-featured" : ""}`} key={offer.id}><div className="card-body"><span className="badge badge-outline">{offer.planTier === "creator" ? "Most popular" : offer.planTier === "professional" ? "Best unit price" : "Starter plan"}</span><h2 className="card-title">{offer.name.replace(` ${billingPeriod === "year" ? "yearly" : "monthly"}`, "")}</h2><div className="billing-offer-price"><strong>{offer.priceLabel}</strong></div><p>{offer.description}</p><div className="billing-credit-count"><Coins size={16} /><span>{offer.credits.toLocaleString("en-US")} credits · up to {offer.standardImages?.toLocaleString("en-US")} Standard images</span></div><ul className="billing-feature-list">{offer.features.map((feature) => <li key={feature}><CheckCircle2 size={13} />{feature}</li>)}</ul><button className="btn" type="button" disabled={!offer.configured || !billingTermsConfirmed || busyAction === offer.id} onClick={() => void startCheckout(offer.id)}>{busyAction === offer.id && <span className="loading loading-spinner loading-xs" />}{offer.configured ? `Choose ${offer.planTier}` : "Checkout not enabled"}{offer.configured && <ArrowRight size={14} />}</button></div></article>)}</div>
      </section>

      <section className="billing-choice-section">
        <div className="studio-panel-heading"><div><span>One-time credits</span><h2>Top up without a subscription</h2><p>Credit packs do not renew and remain available until used.</p></div></div>
        <div className="billing-offers">{creditPacks.map((offer) => <article className={`card card-border billing-offer ${offer.id === "credits_3000" ? "billing-offer-featured" : ""}`} key={offer.id}><div className="card-body"><span className="badge badge-outline">{offer.id === "credits_3000" ? "Best one-time value" : "One-time pack"}</span><h2 className="card-title">{offer.name}</h2><div className="billing-offer-price"><strong>{offer.priceLabel}</strong></div><p>{offer.description}</p><div className="billing-credit-count"><Coins size={16} /><span>{offer.credits.toLocaleString("en-US")} credits · up to {offer.standardImages?.toLocaleString("en-US")} Standard images</span></div><ul className="billing-feature-list">{offer.features.map((feature) => <li key={feature}><CheckCircle2 size={13} />{feature}</li>)}</ul><button className="btn" type="button" disabled={!offer.configured || !billingTermsConfirmed || busyAction === offer.id} onClick={() => void startCheckout(offer.id)}>{busyAction === offer.id && <span className="loading loading-spinner loading-xs" />}{offer.configured ? "Buy credit pack" : "Checkout not enabled"}{offer.configured && <ArrowRight size={14} />}</button></div></article>)}</div>
      </section>

      <section className="studio-panel"><div className="studio-panel-heading"><div><span>Reconciled purchases</span><h2>Billing history</h2></div></div>{billing && billing.orders.length > 0 ? <div className="overflow-x-auto"><table className="table billing-table"><thead><tr><th>Offer</th><th>Type</th><th>Credits</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{billing.orders.map((order) => <tr key={order.id}><td>{order.offerId.replaceAll("_", " ")}</td><td>{order.kind}</td><td>{order.credits}</td><td>{formatCurrency(order.amountCents, order.currency)}</td><td><span className={`badge badge-outline ${order.financialStatus !== "normal" ? "badge-error" : order.status === "paid" ? "badge-success" : ""}`}>{order.financialStatus === "normal" ? order.status : order.financialStatus}</span></td><td>{formatDate(order.completedAt ?? order.createdAt)}</td></tr>)}</tbody></table></div> : <div className="studio-empty billing-empty"><CreditCard /><h3>No purchases yet</h3><p>Completed Stripe checkouts appear here after a signed webhook is reconciled.</p></div>}</section>
    </div>;
  };

  const renderPayments = () => {
    const orders = billing?.orders ?? [];
    const paidTotal = orders.filter((order) => order.status === "paid" && order.financialStatus === "normal")
      .reduce((total, order) => total + order.amountCents, 0);
    return <div className="studio-content">
      <header className="studio-heading"><div><span>Receipts and settlement</span><h1>Payments</h1><p>Every Checkout attempt is reconciled against signed Stripe events before credits or plan access are applied.</p></div></header>
      <div className="stats studio-stats payment-stats">
        <div className="stat"><div className="stat-title">Successful payments</div><div className="stat-value">{orders.filter((order) => order.status === "paid").length}</div><div className="stat-desc">Signed webhook fulfillment only</div></div>
        <div className="stat"><div className="stat-title">Recorded spend</div><div className="stat-value">{formatCurrency(paidTotal, "usd")}</div><div className="stat-desc">Excludes refunded or disputed orders</div></div>
        <div className="stat"><div className="stat-title">Financial reviews</div><div className="stat-value">{orders.filter((order) => order.financialStatus !== "normal").length}</div><div className="stat-desc">Refunds and disputes remain visible</div></div>
      </div>
      <section className="studio-panel">
        <div className="studio-panel-heading"><div><span>Transaction history</span><h2>Receipts and order status</h2></div></div>
        {orders.length ? <div className="overflow-x-auto"><table className="table billing-table"><thead><tr><th>Order</th><th>Product</th><th>Credits</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><code>{order.id.slice(0, 12)}</code></td><td>{order.offerId.replaceAll("_", " ")}</td><td>{order.credits}</td><td>{formatCurrency(order.amountCents, order.currency)}</td><td><span className={`badge badge-outline ${order.financialStatus !== "normal" ? "badge-error" : order.status === "paid" ? "badge-success" : ""}`}>{order.financialStatus === "normal" ? order.status : order.financialStatus}</span></td><td>{formatDate(order.completedAt ?? order.createdAt)}</td></tr>)}</tbody></table></div> : <div className="studio-empty"><ReceiptText /><h3>No payments yet</h3><p>Completed, expired, refunded, and disputed orders will remain visible here.</p></div>}
      </section>
    </div>;
  };

  const renderSupport = () => <div className="studio-content">
    <header className="studio-heading"><div><span>Account-backed help</span><h1>Support</h1><p>Open a private ticket for generation, billing, API, or account issues and keep the conversation attached to your workspace.</p></div></header>

    <form className="card card-border studio-form-card support-create-card" onSubmit={createSupportRequest}>
      <div className="card-body">
        <div className="studio-panel-heading"><div><span>New request</span><h2>How can we help?</h2></div><span className="badge badge-outline">{overview?.openSupportTickets ?? supportTickets.filter((ticket) => ["open", "waiting"].includes(ticket.status)).length} open</span></div>
        <div className="support-form-grid">
          <label className="support-subject"><span>Subject</span><input className="input" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} minLength={4} maxLength={120} placeholder="Describe the issue in one line" required /></label>
          <label><span>Category</span><select className="select" value={supportCategory} onChange={(event) => setSupportCategory(event.target.value as SupportTicketCategory)}><option value="generation">Generation</option><option value="billing">Billing</option><option value="api">API</option><option value="account">Account</option><option value="other">Other</option></select></label>
          <label><span>Priority</span><select className="select" value={supportPriority} onChange={(event) => setSupportPriority(event.target.value as SupportTicketPriority)}><option value="normal">Normal</option><option value="high">High</option></select></label>
          <label className="support-message"><span>Message</span><textarea className="textarea" value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} minLength={10} maxLength={4000} placeholder="Include what you expected, what happened, and any relevant generation or request ID." required /></label>
          <button className="btn studio-primary-action" type="submit" disabled={busyAction === "support-create"}>{busyAction === "support-create" ? <span className="loading loading-spinner loading-xs" /> : <LifeBuoy size={15} />}Open ticket</button>
        </div>
      </div>
    </form>

    <div className="support-workspace">
      <section className="studio-panel support-ticket-list">
        <div className="studio-panel-heading"><div><span>Your requests</span><h2>Tickets</h2></div></div>
        {supportTickets.length ? <ul className="list">{supportTickets.map((ticket) => <li className="list-row" key={ticket.id}>
          <button className={`support-ticket-button ${activeTicket?.id === ticket.id ? "is-active" : ""}`} type="button" disabled={busyAction === ticket.id} onClick={() => void openSupportTicket(ticket.id)}>
            <span><strong>{ticket.subject}</strong><small>{ticket.category} · {ticket.messageCount} {ticket.messageCount === 1 ? "message" : "messages"}</small></span>
            <span><span className={`badge badge-outline ${ticket.status === "open" ? "badge-info" : ticket.status === "closed" ? "" : "badge-warning"}`}>{ticket.status}</span><time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt)}</time></span>
          </button>
        </li>)}</ul> : <div className="studio-empty support-empty"><LifeBuoy /><h3>No support tickets</h3><p>Open a request above when you need help.</p></div>}
      </section>

      <section className="studio-panel support-conversation">
        {activeTicket ? <>
          <div className="studio-panel-heading"><div><span>Ticket {activeTicket.id.slice(0, 8)}</span><h2>{activeTicket.subject}</h2><p>{activeTicket.category} · {activeTicket.priority} priority</p></div><button className="btn btn-ghost btn-sm" type="button" disabled={busyAction === "support-status"} onClick={() => void setSupportTicketClosed(activeTicket.status !== "closed")}>{activeTicket.status === "closed" ? "Reopen" : "Close ticket"}</button></div>
          <div className="support-messages">{activeTicket.messages.map((item) => <article className={`support-message-row ${item.author === "support" ? "is-support" : ""}`} key={item.id}><span className="support-message-avatar">{item.author === "support" ? <LifeBuoy size={15} /> : session.user!.name.slice(0, 1).toUpperCase()}</span><div><span><strong>{item.author === "support" ? "Qwen Image 3 Support" : session.user!.name}</strong><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></span><p>{item.body}</p></div></article>)}</div>
          <form className="support-reply" onSubmit={replyToSupportTicket}><textarea className="textarea" value={supportReply} onChange={(event) => setSupportReply(event.target.value)} minLength={2} maxLength={4000} placeholder={activeTicket.status === "closed" ? "Reopen this ticket to reply." : "Add a reply"} disabled={activeTicket.status === "closed"} required /><button className="btn" type="submit" disabled={activeTicket.status === "closed" || busyAction === "support-reply"}><Send size={14} />Reply</button></form>
        </> : <div className="studio-empty"><MessageSquare /><h3>Select a ticket</h3><p>Open a ticket from the list to review its private conversation.</p></div>}
      </section>
    </div>
  </div>;

  const renderProfile = () => <div className="studio-content">
    <header className="studio-heading"><div><span>Your identity</span><h1>Profile</h1><p>Manage the name and verified email associated with this private workspace.</p></div></header>
    <div className="profile-layout">
      <section className="studio-panel profile-summary">
        <span className="profile-avatar">{session.user!.name.slice(0, 1).toUpperCase()}</span>
        <div><h2>{session.user!.name}</h2><p>{session.user!.email}</p><span className={`badge badge-outline ${session.user!.emailVerified ? "badge-success" : "badge-warning"}`}>{session.user!.emailVerified ? "Verified email" : "Verification pending"}</span></div>
        <dl><div><dt>Member since</dt><dd>{formatDate(session.user!.createdAt)}</dd></div><div><dt>Workspace plan</dt><dd>{overview?.plan.name ?? "Starter"}</dd></div></dl>
      </section>
      <form className="card card-border settings-card profile-form" onSubmit={updateProfile}><div className="card-body"><span className="settings-card-icon"><UserRound size={18} /></span><h2 className="card-title">Display name</h2><p>This name is shown throughout your workspace and support conversations.</p><label><span>Name</span><input className="input" value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={60} required /></label><label><span>Sign-in email</span><input className="input" value={session.user!.email} disabled /></label><div className="card-actions"><button className="btn" type="submit" disabled={busyAction === "profile"}>{busyAction === "profile" && <span className="loading loading-spinner loading-xs" />}Save profile</button>{!session.user!.emailVerified && <button className="btn btn-ghost" type="button" disabled={busyAction === "verification"} onClick={() => void requestVerification()}><MailCheck size={14} />Send verification</button>}</div></div></form>
    </div>
  </div>;

  const renderApiKeys = () => <div className="studio-content">
    <header className="studio-heading"><div><span>Developer access</span><h1>API keys</h1><p>Create revocable keys for the model-neutral generation endpoint.</p></div></header>
    {!session.user!.emailVerified && <div role="alert" className="alert alert-warning alert-soft issued-key-alert"><div><strong>Email verification required</strong><span>Verify your address before issuing a credential that can spend account credits.</span></div><button className="btn btn-sm" type="button" onClick={() => onNavigate("/studio/settings")}><MailCheck size={14} />Open settings</button></div>}
    {issuedKey && <div role="alert" className="alert alert-success alert-soft issued-key-alert"><div><strong>Copy this secret now. It will not be shown again.</strong><code>{issuedKey.secret}</code></div><button className="btn btn-sm" type="button" onClick={() => void navigator.clipboard.writeText(issuedKey.secret)}><Copy size={14} />Copy key</button></div>}
    <form className="card card-border studio-form-card" onSubmit={createKey}><div className="card-body"><h2 className="card-title">Create a scoped key</h2><div className="studio-form-grid key-form"><label><span>Key name</span><input className="input" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Production website" required minLength={2} maxLength={60} disabled={!session.user!.emailVerified} /></label><button className="btn" type="submit" disabled={!session.user!.emailVerified}><KeyRound size={15} />Issue key</button></div></div></form>
    <section className="studio-panel"><div className="studio-panel-heading"><div><span>Active credentials</span><h2>Your keys</h2></div></div><div className="api-key-list">{apiKeys.map((key) => <div className="api-key-row" key={key.id}><span className="api-key-icon"><KeyRound size={17} /></span><div><strong>{key.name}</strong><code>{key.prefix}••••••••</code><small>{key.scopes.join(", ")}</small></div><span>{key.lastUsedAt ? `Used ${formatDate(key.lastUsedAt)}` : "Never used"}</span><button className="btn btn-ghost btn-sm" type="button" onClick={() => void revokeKey(key.id)}><Trash2 size={14} />Revoke</button></div>)}{apiKeys.length === 0 && <div className="studio-empty"><KeyRound /><h3>No API keys yet</h3><p>Verify your email, create a key, then use it with the documented `/v1/generations` endpoint.</p></div>}</div></section>
  </div>;

  const renderApiActivity = () => <div className="studio-content"><header className="studio-heading"><div><span>Request observability</span><h1>API activity</h1><p>Review authenticated generation requests, response status, latency, and request IDs.</p></div></header><section className="studio-panel">{apiRequests.length > 0 ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Request</th><th>Status</th><th>Latency</th><th>Request ID</th><th>Time</th></tr></thead><tbody>{apiRequests.map((request) => <tr key={request.id}><td><strong>{request.method}</strong> {request.path}</td><td><span className={`badge badge-outline ${request.statusCode < 400 ? "badge-success" : "badge-error"}`}>{request.statusCode}</span></td><td>{request.durationMs} ms</td><td><code>{request.requestId.slice(0, 12)}…</code></td><td>{formatDateTime(request.createdAt)}</td></tr>)}</tbody></table></div> : <div className="studio-empty"><Activity /><h3>No API requests yet</h3><p>Requests made with an active API key appear here after the response completes.</p></div>}</section></div>;

  const renderSettings = () => <div className="studio-content">
    <header className="studio-heading"><div><span>Account control</span><h1>Settings</h1><p>Identity, security, active devices, portability, and account ownership in one place.</p></div></header>

    <div className={`alert ${session.user!.emailVerified ? "alert-success" : "alert-warning"} alert-soft settings-verification`}>
      {session.user!.emailVerified ? <CheckCircle2 size={20} /> : <MailCheck size={20} />}
      <div><strong>{session.user!.emailVerified ? "Email verified" : "Verify your email"}</strong><span>{session.user!.emailVerified ? `${session.user!.email} is trusted for account recovery and API access.` : "Verification protects account recovery and unlocks developer keys."}</span></div>
      {!session.user!.emailVerified && <div className="settings-verification-actions"><button className="btn btn-sm" type="button" disabled={busyAction === "verification"} onClick={() => void requestVerification()}>{busyAction === "verification" && <span className="loading loading-spinner loading-xs" />}Send verification</button></div>}
    </div>

    <div className="settings-grid">
      <form className="card card-border settings-card" onSubmit={updateProfile}><div className="card-body"><span className="settings-card-icon"><UserRound size={18} /></span><h2 className="card-title">Profile</h2><p>The name shown across Studio. Your sign-in email remains {session.user!.email}.</p><label><span>Display name</span><input className="input" value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={60} required /></label><div className="card-actions"><button className="btn btn-sm" type="submit" disabled={busyAction === "profile"}>{busyAction === "profile" && <span className="loading loading-spinner loading-xs" />}Save profile</button></div></div></form>

      <form className="card card-border settings-card" onSubmit={changePassword}><div className="card-body"><span className="settings-card-icon"><ShieldCheck size={18} /></span><h2 className="card-title">Password</h2><p>Changing it revokes every other session while keeping this device signed in.</p><label><span>Current password</span><input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label><span>New password</span><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} required /></label><div className="card-actions"><button className="btn btn-sm" type="submit" disabled={busyAction === "password"}>{busyAction === "password" && <span className="loading loading-spinner loading-xs" />}Change password</button></div></div></form>
    </div>

    <section className="studio-panel settings-sessions"><div className="studio-panel-heading"><div><span>Session access</span><h2>Signed-in sessions</h2></div><button className="btn btn-ghost btn-sm" type="button" disabled={busyAction === "sessions" || accountSessions.filter((item) => !item.current).length === 0} onClick={() => void revokeOtherAccountSessions()}><LogOut size={14} />Revoke all others</button></div><div className="overflow-x-auto"><table className="table"><thead><tr><th>Device</th><th>Last active</th><th>Expires</th><th /></tr></thead><tbody>{accountSessions.map((item) => <tr key={item.id}><td><span className="session-device"><MonitorSmartphone size={16} /><span><strong>{item.current ? "This device" : "Signed-in session"}</strong><small>{item.userAgent}</small></span></span></td><td>{formatDateTime(item.lastSeenAt)}</td><td>{formatDate(item.expiresAt)}</td><td>{item.current ? <span className="badge badge-success badge-outline">Current</span> : <button className="btn btn-ghost btn-xs" type="button" disabled={busyAction === item.id} onClick={() => void revokeAccountSession(item.id)}>Revoke</button>}</td></tr>)}</tbody></table></div></section>

    <section className="studio-panel data-panel"><div><span className="settings-card-icon"><Download size={18} /></span><div><span>Data portability</span><h2>Export your account</h2><p>Download profile, project metadata, generation history, ledger entries, API key summaries, and session metadata as JSON. Image binaries and secrets are excluded.</p></div></div><a className="btn btn-outline" href="/api/account/export" download><Download size={15} />Download export</a></section>

    <section className="studio-panel danger-panel"><div><span className="settings-card-icon"><TriangleAlert size={18} /></span><div><span>Danger zone</span><h2>Delete this account</h2><p>Cancels any Stripe subscription, deletes the Stripe customer, then permanently removes projects, assets, credits, sessions, API keys, and identities. If billing cleanup fails, the local account is kept intact.</p></div></div><button className="btn btn-error btn-outline" type="button" onClick={() => deleteDialogRef.current?.showModal()}><Trash2 size={15} />Delete account</button></section>

    <dialog ref={deleteDialogRef} className="modal"><div className="modal-box delete-account-modal"><button className="btn btn-ghost btn-circle auth-close" type="button" onClick={() => deleteDialogRef.current?.close()} aria-label="Close deletion confirmation"><X size={18} /></button><span className="settings-card-icon danger-icon"><TriangleAlert size={20} /></span><h2>Delete your account permanently?</h2><p>Any active Stripe subscription and customer record are removed first. Enter your password and type <strong>DELETE</strong>. OAuth-only accounts can set a password through recovery first.</p><label><span>Password</span><input className="input" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label><label><span>Confirmation</span><input className="input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" /></label>{error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}<div className="modal-action"><button className="btn btn-ghost" type="button" onClick={() => deleteDialogRef.current?.close()}>Keep account</button><button className="btn btn-error" type="button" disabled={busyAction === "delete" || !deletePassword || deleteConfirmation.toUpperCase() !== "DELETE"} onClick={() => void deleteAccount()}>{busyAction === "delete" && <span className="loading loading-spinner loading-xs" />}Cancel billing and delete</button></div></div><form method="dialog" className="modal-backdrop"><button>Cancel</button></form></dialog>
  </div>;

  const visibleHistory = currentSection === "favorites" ? favoriteGenerations : generations;
  const renderHistory = () => <div className="studio-content"><header className="studio-heading"><div><span>{currentSection === "favorites" ? "Curated work" : "Private archive"}</span><h1>{currentSection === "favorites" ? "Favorites" : "Generation history"}</h1><p>{currentSection === "favorites" ? "The results you marked for quick return." : "Every signed-in generation in one private archive."}</p></div></header><section className="studio-panel"><GenerationGrid generations={visibleHistory} busyAction={busyAction} onCreate={() => onNavigate("/studio")} onDelete={deleteGenerationRecord} onFavorite={setGenerationFavorite} onVariation={createGenerationVariation} /></section></div>;

  let content = studioLoading && currentSection !== "create" && currentSection !== "new" ? renderLoading() : renderOverview();
  if (currentSection === "create" || currentSection === "new") content = <div className="studio-content studio-create"><GeneratorWorkspace session={session} models={models} compact onRequireAuth={onRequireAuth} onSessionRefresh={onSessionRefresh} onGenerationCreated={(generation) => { setGenerations((items) => [generation, ...items.filter((item) => item.id !== generation.id)]); onNavigate("/studio/history"); }} /></div>;
  if (!studioLoading && currentSection === "overview") content = renderOverview();
  if (!studioLoading && currentSection === "projects") content = renderProjects();
  if (!studioLoading && (currentSection === "history" || currentSection === "favorites")) content = renderHistory();
  if (!studioLoading && currentSection === "credits") content = renderCredits();
  if (!studioLoading && currentSection === "billing") content = renderBilling();
  if (!studioLoading && currentSection === "payments") content = renderPayments();
  if (!studioLoading && currentSection === "api-keys") content = renderApiKeys();
  if (!studioLoading && currentSection === "api-activity") content = renderApiActivity();
  if (!studioLoading && currentSection === "support") content = renderSupport();
  if (!studioLoading && currentSection === "profile") content = renderProfile();
  if (!studioLoading && currentSection === "settings") content = renderSettings();
  if (!studioLoading && !["create", "overview", "new", "projects", "history", "favorites", "credits", "billing", "payments", "api-keys", "api-activity", "support", "profile", "settings"].includes(currentSection)) {
    content = <div className="studio-content"><div className="card card-border studio-form-card"><div className="card-body"><span className="badge badge-outline">404</span><h1>Studio page not found</h1><p>This workspace section does not exist. Your private account data has not changed.</p><div className="card-actions"><button className="btn" type="button" onClick={() => onNavigate("/studio")}>Back to create</button></div></div></div></div>;
  }

  const navigateFromShell = (nextPath: string) => {
    const toggle = document.getElementById("studio-drawer") as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
    onNavigate(nextPath);
  };

  return <div className="drawer lg:drawer-open studio-drawer" data-theme="qwen">
    <input id="studio-drawer" type="checkbox" className="drawer-toggle" />
    <div className="drawer-content">
      <header className="studio-mobile-bar">
        <button
          className="btn btn-ghost btn-square drawer-button"
          type="button"
          aria-label="Open workspace navigation"
          onClick={() => {
            const toggle = document.getElementById("studio-drawer") as HTMLInputElement | null;
            if (toggle) toggle.checked = !toggle.checked;
          }}
        >
          <Menu size={20} />
        </button>
        <button className="studio-mobile-wordmark" type="button" onClick={() => onNavigate("/studio")} aria-label="Qwen Image 3 workspace home"><img src="/favicon.png" alt="Qwen mark" /><span>Qwen Image 3</span></button>
        <button className="studio-mobile-avatar" type="button" onClick={() => onNavigate("/studio/profile")} aria-label="Open profile">{session.user.name.slice(0, 1).toUpperCase()}</button>
      </header>
      {(error || message) && <div className={`alert ${error ? "alert-error" : "alert-success"} studio-alert`}><span>{error || message}</span><button className="btn btn-ghost btn-xs" onClick={() => { setError(""); setMessage(""); }}>Dismiss</button></div>}
      {content}
      <nav className="dock dock-sm studio-mobile-dock" aria-label="Workspace shortcuts">
        {workspaceNavigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = item.path === "/studio" ? path === "/studio" || path === "/studio/new" : path.startsWith(item.path);
          return <button className={active ? "dock-active" : ""} type="button" key={item.path} onClick={() => onNavigate(item.path)}><Icon size={19} /><span className="dock-label">{item.label}</span></button>;
        })}
      </nav>
    </div>
    <aside className="drawer-side">
      <label htmlFor="studio-drawer" aria-label="Close workspace navigation" className="drawer-overlay" />
      <div className="studio-sidebar">
        <button className="studio-sidebar-brand" type="button" onClick={() => navigateFromShell("/studio")} aria-label="Qwen Image 3 workspace home"><img src="/favicon.png" alt="Qwen mark" /><span><strong>Qwen Image 3</strong><small>Workspace</small></span></button>
        <nav className="studio-sidebar-navigation" aria-label="Workspace navigation">
          <ul className="menu menu-sm">
            <li className="menu-title">Workspace</li>
            {workspaceNavigation.map((item) => {
              const Icon = item.icon;
              const active = item.path === "/studio" ? path === "/studio" || path === "/studio/new" : path.startsWith(item.path);
              return <li key={item.path}><button className={active ? "menu-active" : ""} type="button" onClick={() => navigateFromShell(item.path)} aria-current={active ? "page" : undefined}><Icon size={17} />{item.label}</button></li>;
            })}
          </ul>
          <ul className="menu menu-sm">
            <li className="menu-title">Account</li>
            {accountNavigation.map((item) => {
              const Icon = item.icon;
              const active = path.startsWith(item.path);
              return <li key={item.path}><button className={active ? "menu-active" : ""} type="button" onClick={() => navigateFromShell(item.path)} aria-current={active ? "page" : undefined}><Icon size={17} />{item.label}</button></li>;
            })}
          </ul>
        </nav>
        <div className="studio-sidebar-secondary">
          <button type="button" onClick={() => navigateFromShell("/")}><Home size={17} />Home</button>
          <button className={path.startsWith("/studio/profile") ? "is-active" : ""} type="button" onClick={() => navigateFromShell("/studio/profile")}><UserRound size={17} />Profile</button>
        </div>
        <div className="studio-sidebar-foot">
          <span className="studio-user-avatar">{session.user.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{session.user.name}</strong><small>{session.user.email}</small></span>
          <button className="btn btn-ghost btn-square btn-sm" type="button" onClick={() => void onLogout()} aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  </div>;
}

interface GenerationGridProps {
  generations: Generation[];
  busyAction: string;
  onCreate?: () => void;
  onDelete: (generation: Generation) => Promise<void>;
  onFavorite: (generation: Generation) => Promise<void>;
  onVariation: (generation: Generation) => Promise<void>;
}

function GenerationGrid({ generations, busyAction, onCreate, onDelete, onFavorite, onVariation }: GenerationGridProps) {
  if (generations.length === 0) return <div className="studio-empty"><ImageIcon /><h3>No recent work yet</h3><p>Create an image to begin building your private workspace history.</p>{onCreate && <button className="btn studio-primary-action" type="button" onClick={onCreate}><Plus size={15} />Create image</button>}</div>;
  return <div className={`studio-generation-grid ${generations.length < 3 ? "is-sparse" : ""}`}>{generations.map((generation, index) => {
    const favoriteAction = `generation-favorite-${generation.id}`;
    const variationAction = `generation-variation-${generation.id}`;
    const deleteAction = `generation-delete-${generation.id}`;
    const actionPending = [favoriteAction, variationAction, deleteAction].includes(busyAction);
    return <article className={`card card-border studio-generation-card ${generation.status === "failed" ? "is-failed" : ""}`} key={generation.id}>
      <figure className="studio-generation-media">
        {generation.imageUrl
          ? <img src={generation.imageUrl} alt={`Generated result for ${generation.prompt.slice(0, 80)}`} loading={index < 3 ? "eager" : "lazy"} decoding="async" />
          : <div className="studio-generation-failed"><TriangleAlert size={22} /><span className="badge badge-error badge-outline">{generation.status}</span><small>No credits charged</small></div>}
      </figure>
      <div className="card-body studio-generation-body">
        <p>{generation.prompt}</p>
        <span className="studio-generation-meta">{generation.quality} · {generation.aspectRatio}</span>
        <div className="card-actions studio-generation-actions" aria-label={`Actions for ${generation.prompt.slice(0, 40)}`}>
          {generation.status === "complete" && generation.downloadUrl && <div className="tooltip" data-tip="Download"><a className="btn btn-ghost btn-square btn-sm" href={generation.downloadUrl} download aria-label="Download generation"><Download size={15} /></a></div>}
          <div className="tooltip" data-tip={generation.status === "failed" ? "Retry" : "Create variation"}><button className="btn btn-ghost btn-square btn-sm" type="button" disabled={actionPending} onClick={() => void onVariation(generation)} aria-label={generation.status === "failed" ? "Retry generation" : "Create variation"}>{busyAction === variationAction ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw size={15} />}</button></div>
          {generation.status === "complete" && <div className="tooltip" data-tip={generation.favorite ? "Remove favorite" : "Save favorite"}><button className={`btn btn-ghost btn-square btn-sm ${generation.favorite ? "is-favorite" : ""}`} type="button" disabled={actionPending} onClick={() => void onFavorite(generation)} aria-label={generation.favorite ? "Remove from Favorites" : "Save to Favorites"} aria-pressed={generation.favorite}>{busyAction === favoriteAction ? <span className="loading loading-spinner loading-xs" /> : <Heart size={15} fill={generation.favorite ? "currentColor" : "none"} />}</button></div>}
          <div className="tooltip" data-tip="Delete"><button className="btn btn-ghost btn-square btn-sm studio-generation-delete" type="button" disabled={actionPending} onClick={() => void onDelete(generation)} aria-label="Delete generation">{busyAction === deleteAction ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={15} />}</button></div>
        </div>
      </div>
    </article>;
  })}</div>;
}
