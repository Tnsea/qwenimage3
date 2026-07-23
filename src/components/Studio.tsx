import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Archive, ArrowRight, BarChart3, CheckCircle2, Coins, Copy, CreditCard, Download, FolderKanban, Heart, History, Image as ImageIcon, KeyRound, LayoutDashboard, LogOut, MailCheck, Menu, MonitorSmartphone, Plus, Settings, ShieldCheck, Sparkles, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import { api } from "../api";
import type { AccountSession, ApiKeyCreated, ApiKeySummary, ApiRequestLog, AuthTokenDelivery, BillingSummary, CreditEntry, Generation, Project, SessionState } from "../types";
import { GeneratorWorkspace } from "./GeneratorWorkspace";
import { PricingCountdown, usePromotionCountdown } from "./PricingCountdown";

interface StudioProps {
  path: string;
  session: SessionState;
  onNavigate: (path: string) => void;
  onRequireAuth: () => void;
  onSessionRefresh: () => Promise<void>;
}

const studioNavigation = [
  { label: "Overview", path: "/studio", icon: LayoutDashboard },
  { label: "Create", path: "/studio/new", icon: Sparkles },
  { label: "Projects", path: "/studio/projects", icon: FolderKanban },
  { label: "History", path: "/studio/history", icon: History },
  { label: "Favorites", path: "/studio/favorites", icon: Heart },
  { label: "Credits", path: "/studio/credits", icon: Coins },
  { label: "Billing", path: "/studio/billing", icon: CreditCard },
  { label: "API keys", path: "/studio/api-keys", icon: KeyRound },
  { label: "API activity", path: "/studio/api-activity", icon: Activity },
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

export function Studio({ path, session, onNavigate, onRequireAuth, onSessionRefresh }: StudioProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [ledger, setLedger] = useState<CreditEntry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [apiRequests, setApiRequests] = useState<ApiRequestLog[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [accountSessions, setAccountSessions] = useState<AccountSession[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [keyName, setKeyName] = useState("");
  const [issuedKey, setIssuedKey] = useState<ApiKeyCreated | null>(null);
  const [profileName, setProfileName] = useState(session.user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const promotionCountdown = usePromotionCountdown(billing?.promotion);

  async function loadStudio() {
    if (!session.user) return;
    const [projectPayload, generationPayload, creditPayload, keyPayload, requestPayload, sessionPayload, billingPayload] = await Promise.all([
      api<{ projects: Project[] }>("/api/projects"),
      api<{ generations: Generation[] }>("/api/generations?limit=50"),
      api<{ account: { available: number; reserved: number }; ledger: CreditEntry[] }>("/api/credits"),
      api<{ apiKeys: ApiKeySummary[] }>("/api/api-keys"),
      api<{ requests: ApiRequestLog[] }>("/api/api-logs"),
      api<{ sessions: AccountSession[] }>("/api/account/sessions"),
      api<BillingSummary>("/api/billing"),
    ]);
    setProjects(projectPayload.projects);
    setGenerations(generationPayload.generations);
    setLedger(creditPayload.ledger);
    setApiKeys(keyPayload.apiKeys);
    setApiRequests(requestPayload.requests);
    setAccountSessions(sessionPayload.sessions);
    setBilling(billingPayload);
  }

  useEffect(() => { void loadStudio().catch((reason: Error) => setError(reason.message)); }, [session.user?.id, path]);
  useEffect(() => { setProfileName(session.user?.name ?? ""); }, [session.user?.name]);

  const favoriteGenerations = useMemo(() => generations.filter((item) => item.favorite), [generations]);
  const currentSection = path.split("/")[2] || "overview";

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

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<ApiKeyCreated>("/api/api-keys", { method: "POST", body: JSON.stringify({ name: keyName }) });
      setIssuedKey(created);
      setApiKeys((items) => [created, ...items]);
      setKeyName("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the API key."); }
  }

  async function revokeKey(id: string) {
    try {
      await api<void>(`/api/api-keys/${id}`, { method: "DELETE" });
      setApiKeys((items) => items.filter((item) => item.id !== id));
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
      const delivery = await api<AuthTokenDelivery & { alreadyVerified?: boolean }>("/api/auth/verify-email/request", { method: "POST" });
      if (delivery.devToken) {
        setVerificationToken(delivery.devToken);
        setMessage("Local verification link created. Complete it below.");
      } else if (delivery.alreadyVerified) {
        await onSessionRefresh();
        setMessage("This email is already verified.");
      } else {
        setMessage("Verification email sent. The link expires in 24 hours.");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the verification email."); }
    finally { setBusyAction(""); }
  }

  async function completeLocalVerification() {
    setBusyAction("verification");
    setError("");
    try {
      await api<{ verified: true }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verificationToken }) });
      setVerificationToken("");
      await onSessionRefresh();
      await loadStudio();
      setMessage("Email verified. 20 welcome credits were added exactly once.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not verify the email."); }
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
    setBusyAction(offerId);
    setError("");
    try {
      const payload = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ offerId }) });
      window.location.assign(payload.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start checkout."); setBusyAction(""); }
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
    return <main className="content-page studio-gate"><div className="card card-border"><div className="card-body"><KeyRound /><h1>Studio is your private workspace.</h1><p>Sign in to manage projects, migrated guest work, credits, favorites, and developer keys.</p><div className="card-actions"><button className="btn" type="button" onClick={onRequireAuth}>Sign in to Studio <ArrowRight size={15} /></button></div></div></div></main>;
  }

  const renderOverview = () => <div className="studio-content"><header className="studio-heading"><div><span>Good to see you, {session.user!.name.split(" ")[0]}</span><h1>Your creative control room</h1><p>Continue a project, watch credit usage, or start a fresh generation.</p></div><button className="btn" type="button" onClick={() => onNavigate("/studio/new")}><Plus size={16} />New creation</button></header><div className="stats studio-stats"><div className="stat"><div className="stat-figure"><Coins /></div><div className="stat-title">Available credits</div><div className="stat-value">{session.entitlements.credits}</div><div className="stat-desc">{session.entitlements.reservedCredits} currently reserved</div></div><div className="stat"><div className="stat-figure"><FolderKanban /></div><div className="stat-title">Active projects</div><div className="stat-value">{projects.filter((item) => !item.archived).length}</div><div className="stat-desc">{projects.reduce((total, item) => total + item.generationCount, 0)} organized generations</div></div><div className="stat"><div className="stat-figure"><ImageIcon /></div><div className="stat-title">Private generations</div><div className="stat-value">{generations.length}</div><div className="stat-desc">{favoriteGenerations.length} saved as favorites</div></div></div><section className="studio-panel"><div className="studio-panel-heading"><div><span>Recent work</span><h2>Pick up where you left off</h2></div><button className="btn btn-ghost btn-sm" onClick={() => onNavigate("/studio/history")}>View history <ArrowRight size={14} /></button></div><GenerationGrid generations={generations.slice(0, 6)} /></section></div>;

  const renderProjects = () => <div className="studio-content"><header className="studio-heading"><div><span>Organization</span><h1>Projects</h1><p>Group generations by campaign, client, or creative direction.</p></div></header><form className="card card-border studio-form-card" onSubmit={createProject}><div className="card-body"><h2 className="card-title">Create a project</h2><div className="studio-form-grid"><label><span>Project name</span><input className="input" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Spring launch" required minLength={2} maxLength={80} /></label><label><span>Description</span><input className="input" value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="Campaign images and prompt directions" maxLength={240} /></label><button className="btn" type="submit"><Plus size={15} />Create</button></div></div></form><div className="project-grid">{projects.map((project) => <article className={`card card-border project-card ${project.archived ? "is-archived" : ""}`} key={project.id}><div className="card-body"><div className="project-card-top"><FolderKanban /><span className="badge badge-outline">{project.generationCount} images</span></div><h2 className="card-title">{project.name}</h2><p>{project.description || "No description yet."}</p><small>Created {formatDate(project.createdAt)}</small><div className="card-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => void archiveProject(project)}><Archive size={14} />{project.archived ? "Restore" : "Archive"}</button></div></div></article>)}</div></div>;

  const renderCredits = () => <div className="studio-content"><header className="studio-heading"><div><span>Transparent accounting</span><h1>Credits</h1><p>Every grant, reservation, settlement, and refund is visible.</p></div></header><div className="stats studio-stats credit-stats"><div className="stat"><div className="stat-title">Available</div><div className="stat-value">{session.entitlements.credits}</div><div className="stat-desc">Ready for web or API use</div></div><div className="stat"><div className="stat-title">Reserved</div><div className="stat-value">{session.entitlements.reservedCredits}</div><div className="stat-desc">Released automatically on failure</div></div><div className="stat"><div className="stat-title">Welcome grant</div><div className="stat-value">20</div><div className="stat-desc">Issued once after email verification</div></div></div><section className="studio-panel"><div className="studio-panel-heading"><div><span>Immutable ledger</span><h2>Balance activity</h2></div></div><div className="overflow-x-auto"><table className="table ledger-table"><thead><tr><th>Event</th><th>Description</th><th>Change</th><th>Balance</th><th>Date</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry.id}><td><span className="badge badge-outline">{entry.type.replaceAll("_", " ")}</span></td><td>{entry.description}</td><td className={entry.amount > 0 ? "credit-positive" : entry.amount < 0 ? "credit-negative" : ""}>{entry.amount > 0 ? "+" : ""}{entry.amount}</td><td>{entry.balanceAfter}</td><td>{formatDate(entry.createdAt)}</td></tr>)}</tbody></table></div></section></div>;

  const renderBilling = () => <div className="studio-content">
    <header className="studio-heading"><div><span>Payments and plans</span><h1>Billing</h1><p>Stripe-hosted checkout, signed fulfillment, and self-service subscription management.</p></div>{billing?.account.hasCustomer && <button className="btn btn-outline" type="button" disabled={busyAction === "portal"} onClick={() => void openBillingPortal()}><CreditCard size={15} />Manage in Stripe</button>}</header>
    {billing?.promotion && <PricingCountdown state={promotionCountdown} compact />}
    {billing?.account.spendingBlocked && <div role="alert" className="alert alert-error alert-soft billing-config-alert"><TriangleAlert size={19} /><div><strong>Credit spending is paused</strong><span>{billing.account.blockReason ?? "A refund or dispute needs billing review before more credits can be spent."}</span></div></div>}
    {!billing?.configured && <div role="alert" className="alert alert-info alert-soft billing-config-alert"><ShieldCheck size={19} /><div><strong>Billing is safely disabled</strong><span>Add Stripe secret, webhook, and Price IDs to enable real purchases. No simulated payment buttons are shown.</span></div></div>}
    <section className="studio-panel billing-plan-panel"><div><span className="settings-card-icon"><CreditCard size={18} /></span><div><span>Current plan</span><h2>{billing?.account.plan === "creator" ? "Creator" : "Free account"}</h2><p>{billing?.account.plan === "creator" ? `Subscription status: ${billing.account.status.replaceAll("_", " ")}.` : "Guest migration, verified welcome credits, projects, and API access."}</p></div></div><div><span className={`badge ${billing?.account.status === "active" ? "badge-success" : "badge-outline"}`}>{billing?.account.status ?? "inactive"}</span>{billing?.account.currentPeriodEnd && <small>{billing.account.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDate(billing.account.currentPeriodEnd)}</small>}</div></section>
    <div className="billing-offers">{billing?.offers.map((offer) => {
      const isSubscription = offer.kind === "subscription";
      const checkoutOfferId = isSubscription && promotionCountdown.active ? billing.promotion?.offerId ?? offer.id : offer.id;
      const promotionalPrice = isSubscription && promotionCountdown.active ? `$${((billing.promotion?.promotionalAmountCents ?? offer.amountCents) / 100).toFixed(0)} / month` : offer.priceLabel;
      return <article className={`card card-border billing-offer ${isSubscription ? "billing-offer-featured" : ""}`} key={offer.id}><div className="card-body"><span className="badge badge-outline">{isSubscription ? "Monthly plan" : "One-time pack"}</span><h2 className="card-title">{offer.name}</h2><div className="billing-offer-price">{isSubscription && promotionCountdown.active && <del>{offer.priceLabel}</del>}<strong>{promotionalPrice}</strong>{isSubscription && promotionCountdown.active && <span className="badge badge-error badge-soft">Save 20%</span>}</div><p>{offer.description}</p><div className="billing-credit-count"><Coins size={16} /><span>{offer.credits} credits</span></div><ul className="billing-feature-list">{offer.features.map((feature) => <li key={feature}><CheckCircle2 size={13} />{feature}</li>)}</ul><button className="btn" type="button" disabled={!billing.configured || !offer.configured || busyAction === checkoutOfferId} onClick={() => void startCheckout(checkoutOfferId)}>{busyAction === checkoutOfferId && <span className="loading loading-spinner loading-xs" />}{isSubscription ? promotionCountdown.active ? "Claim $8 Creator price" : "Start Creator checkout" : "Buy credit pack"}<ArrowRight size={14} /></button></div></article>;
    })}</div>
    <section className="studio-panel"><div className="studio-panel-heading"><div><span>Reconciled purchases</span><h2>Billing history</h2></div></div>{billing && billing.orders.length > 0 ? <div className="overflow-x-auto"><table className="table billing-table"><thead><tr><th>Offer</th><th>Type</th><th>Credits</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{billing.orders.map((order) => <tr key={order.id}><td>{order.offerId.replaceAll("_", " ")}</td><td>{order.kind}</td><td>{order.credits}</td><td>{formatCurrency(order.amountCents, order.currency)}</td><td><span className={`badge badge-outline ${order.financialStatus !== "normal" ? "badge-error" : order.status === "paid" ? "badge-success" : ""}`}>{order.financialStatus === "normal" ? order.status : order.financialStatus}</span></td><td>{formatDate(order.completedAt ?? order.createdAt)}</td></tr>)}</tbody></table></div> : <div className="studio-empty billing-empty"><CreditCard /><h3>No purchases yet</h3><p>Completed Stripe checkouts appear here after a signed webhook is reconciled.</p></div>}</section>
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
      <div><strong>{session.user!.emailVerified ? "Email verified" : "Verify your email"}</strong><span>{session.user!.emailVerified ? `${session.user!.email} is trusted for account recovery and API access.` : "Verification unlocks the one-time 20-credit grant and developer keys."}</span></div>
      {!session.user!.emailVerified && <div className="settings-verification-actions"><button className="btn btn-sm" type="button" disabled={busyAction === "verification"} onClick={() => void requestVerification()}>{busyAction === "verification" && <span className="loading loading-spinner loading-xs" />}Send verification</button>{verificationToken && <button className="btn btn-sm btn-success" type="button" disabled={busyAction === "verification"} onClick={() => void completeLocalVerification()}>Complete local verification</button>}</div>}
    </div>

    <div className="settings-grid">
      <form className="card card-border settings-card" onSubmit={updateProfile}><div className="card-body"><span className="settings-card-icon"><UserRound size={18} /></span><h2 className="card-title">Profile</h2><p>The name shown across Studio. Your sign-in email remains {session.user!.email}.</p><label><span>Display name</span><input className="input" value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={60} required /></label><div className="card-actions"><button className="btn btn-sm" type="submit" disabled={busyAction === "profile"}>{busyAction === "profile" && <span className="loading loading-spinner loading-xs" />}Save profile</button></div></div></form>

      <form className="card card-border settings-card" onSubmit={changePassword}><div className="card-body"><span className="settings-card-icon"><ShieldCheck size={18} /></span><h2 className="card-title">Password</h2><p>Changing it revokes every other session while keeping this device signed in.</p><label><span>Current password</span><input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label><span>New password</span><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} required /></label><div className="card-actions"><button className="btn btn-sm" type="submit" disabled={busyAction === "password"}>{busyAction === "password" && <span className="loading loading-spinner loading-xs" />}Change password</button></div></div></form>
    </div>

    <section className="studio-panel settings-sessions"><div className="studio-panel-heading"><div><span>Device security</span><h2>Active sessions</h2></div><button className="btn btn-ghost btn-sm" type="button" disabled={busyAction === "sessions" || accountSessions.filter((item) => !item.current).length === 0} onClick={() => void revokeOtherAccountSessions()}><LogOut size={14} />Revoke all others</button></div><div className="overflow-x-auto"><table className="table"><thead><tr><th>Device</th><th>Network</th><th>Last active</th><th>Expires</th><th /></tr></thead><tbody>{accountSessions.map((item) => <tr key={item.id}><td><span className="session-device"><MonitorSmartphone size={16} /><span><strong>{item.current ? "This device" : "Signed-in device"}</strong><small>{item.userAgent}</small></span></span></td><td>{item.ipHint}</td><td>{formatDateTime(item.lastSeenAt)}</td><td>{formatDate(item.expiresAt)}</td><td>{item.current ? <span className="badge badge-success badge-outline">Current</span> : <button className="btn btn-ghost btn-xs" type="button" disabled={busyAction === item.id} onClick={() => void revokeAccountSession(item.id)}>Revoke</button>}</td></tr>)}</tbody></table></div></section>

    <section className="studio-panel data-panel"><div><span className="settings-card-icon"><Download size={18} /></span><div><span>Data portability</span><h2>Export your account</h2><p>Download profile, project metadata, generation history, ledger entries, API key summaries, and session metadata as JSON. Image binaries and secrets are excluded.</p></div></div><a className="btn btn-outline" href="/api/account/export" download><Download size={15} />Download export</a></section>

    <section className="studio-panel danger-panel"><div><span className="settings-card-icon"><TriangleAlert size={18} /></span><div><span>Danger zone</span><h2>Delete this account</h2><p>Cancels any Stripe subscription, deletes the Stripe customer, then permanently removes projects, assets, credits, sessions, API keys, and identities. If billing cleanup fails, the local account is kept intact.</p></div></div><button className="btn btn-error btn-outline" type="button" onClick={() => deleteDialogRef.current?.showModal()}><Trash2 size={15} />Delete account</button></section>

    <dialog ref={deleteDialogRef} className="modal"><div className="modal-box delete-account-modal"><button className="btn btn-ghost btn-circle auth-close" type="button" onClick={() => deleteDialogRef.current?.close()} aria-label="Close deletion confirmation"><X size={18} /></button><span className="settings-card-icon danger-icon"><TriangleAlert size={20} /></span><h2>Delete your account permanently?</h2><p>Any active Stripe subscription and customer record are removed first. Enter your password and type <strong>DELETE</strong>. OAuth-only accounts can set a password through recovery first.</p><label><span>Password</span><input className="input" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label><label><span>Confirmation</span><input className="input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" /></label>{error && <div role="alert" className="alert alert-error alert-soft"><span>{error}</span></div>}<div className="modal-action"><button className="btn btn-ghost" type="button" onClick={() => deleteDialogRef.current?.close()}>Keep account</button><button className="btn btn-error" type="button" disabled={busyAction === "delete" || !deletePassword || deleteConfirmation.toUpperCase() !== "DELETE"} onClick={() => void deleteAccount()}>{busyAction === "delete" && <span className="loading loading-spinner loading-xs" />}Cancel billing and delete</button></div></div><form method="dialog" className="modal-backdrop"><button>Cancel</button></form></dialog>
  </div>;

  const visibleHistory = currentSection === "favorites" ? favoriteGenerations : generations;
  const renderHistory = () => <div className="studio-content"><header className="studio-heading"><div><span>{currentSection === "favorites" ? "Curated work" : "Private archive"}</span><h1>{currentSection === "favorites" ? "Favorites" : "Generation history"}</h1><p>{currentSection === "favorites" ? "The results you marked for quick return." : "Every guest migration and signed-in generation in one place."}</p></div></header><section className="studio-panel"><GenerationGrid generations={visibleHistory} /></section></div>;

  let content = renderOverview();
  if (currentSection === "new") content = <div className="studio-content studio-create"><header className="studio-heading"><div><span>Private creation</span><h1>New image</h1><p>Generate into your account and assign the result to a project.</p></div></header><GeneratorWorkspace session={session} compact onRequireAuth={onRequireAuth} onSessionRefresh={async () => { await onSessionRefresh(); await loadStudio(); }} /></div>;
  if (currentSection === "projects") content = renderProjects();
  if (currentSection === "history" || currentSection === "favorites") content = renderHistory();
  if (currentSection === "credits") content = renderCredits();
  if (currentSection === "billing") content = renderBilling();
  if (currentSection === "api-keys") content = renderApiKeys();
  if (currentSection === "api-activity") content = renderApiActivity();
  if (currentSection === "settings") content = renderSettings();
  if (!["overview", "new", "projects", "history", "favorites", "credits", "billing", "api-keys", "api-activity", "settings"].includes(currentSection)) {
    content = <div className="studio-content"><div className="card card-border studio-form-card"><div className="card-body"><span className="badge badge-outline">404</span><h1>Studio page not found</h1><p>This workspace section does not exist. Your private account data has not changed.</p><div className="card-actions"><button className="btn" type="button" onClick={() => onNavigate("/studio")}>Back to overview</button></div></div></div></div>;
  }

  return <div className="drawer lg:drawer-open studio-drawer"><input id="studio-drawer" type="checkbox" className="drawer-toggle" /><div className="drawer-content"><div className="studio-mobile-bar"><label htmlFor="studio-drawer" className="btn btn-ghost drawer-button"><Menu size={18} />Studio menu</label></div>{(error || message) && <div className={`alert ${error ? "alert-error" : "alert-success"} studio-alert`}><span>{error || message}</span><button className="btn btn-ghost btn-xs" onClick={() => { setError(""); setMessage(""); }}>Dismiss</button></div>}{content}</div><aside className="drawer-side"><label htmlFor="studio-drawer" aria-label="Close Studio navigation" className="drawer-overlay" /><div className="studio-sidebar"><div className="studio-sidebar-brand"><span>STUDIO</span><strong>{session.user.name}</strong><small>{session.entitlements.credits} available credits</small></div><ul className="menu">{studioNavigation.map((item) => { const Icon = item.icon; const active = item.path === "/studio" ? path === item.path : path.startsWith(item.path); return <li key={item.path}><button className={active ? "menu-active" : ""} type="button" onClick={() => onNavigate(item.path)} aria-current={active ? "page" : undefined}><Icon size={17} />{item.label}</button></li>; })}</ul><div className="studio-sidebar-foot"><BarChart3 size={16} /><span><strong>Provider-aware workspace</strong><small>SQLite · private by default</small></span></div></div></aside></div>;
}

function GenerationGrid({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) return <div className="studio-empty"><ImageIcon /><h3>No generations here yet</h3><p>Create an image or mark a result as a favorite to fill this view.</p></div>;
  return <div className="studio-generation-grid">{generations.map((generation) => <article className={`studio-generation-card ${generation.status === "failed" ? "is-failed" : ""}`} key={generation.id}>{generation.imageUrl ? <img src={generation.imageUrl} alt={`Generated image for ${generation.prompt.slice(0, 80)}`} /> : <div className="studio-generation-failed"><TriangleAlert size={22} /><span className="badge badge-error badge-outline">{generation.status}</span><small>No credits charged</small></div>}<div><p>{generation.prompt}</p><span>{generation.quality} · {generation.aspectRatio}</span>{generation.favorite && <Heart size={13} fill="currentColor" />}</div></article>)}</div>;
}
