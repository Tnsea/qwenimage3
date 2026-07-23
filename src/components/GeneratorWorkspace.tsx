import { useEffect, useMemo, useState } from "react";
import { Clock3, Coins, Crown, Download, FolderOpen, Heart, Image as ImageIcon, RefreshCw, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { api, ApiClientError } from "../api";
import type { AspectRatio, Generation, ImageQuality, ImageStyle, Project, SessionState } from "../types";

const examples = [
  "A premium cobalt perfume bottle on black stone, soft studio light",
  "A tiny night train crossing a bridge in the rain, cinematic",
  "Minimalist workspace with warm oak and morning shadows",
];
const aspectRatios: AspectRatio[] = ["1:1", "3:2", "16:9", "4:3", "9:16"];
const styles: ImageStyle[] = ["Photorealistic", "Editorial", "Cinematic", "Illustration"];
const qualities: Array<{ value: ImageQuality; note: string; credits: number }> = [
  { value: "Standard", note: "Faster generation", credits: 1 },
  { value: "High", note: "Balanced quality", credits: 2 },
  { value: "Ultra", note: "Maximum detail", credits: 4 },
];

function AspectGlyph({ ratio }: { ratio: AspectRatio }) {
  const [width, height] = ratio.split(":").map(Number);
  const max = Math.max(width, height);
  return <span className="aspect-glyph" style={{ width: `${Math.max(7, Math.round((width / max) * 14))}px`, height: `${Math.max(7, Math.round((height / max) * 14))}px` }} aria-hidden="true" />;
}

interface GeneratorWorkspaceProps {
  session: SessionState;
  compact?: boolean;
  prerendered?: boolean;
  initialPrompt?: string;
  onRequireAuth: () => void;
  onSessionRefresh: () => Promise<void>;
}

export function GeneratorWorkspace({ session, compact = false, prerendered = false, initialPrompt = "", onRequireAuth, onSessionRefresh }: GeneratorWorkspaceProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [style, setStyle] = useState<ImageStyle>("Photorealistic");
  const [quality, setQuality] = useState<ImageQuality>("High");
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [active, setActive] = useState<Generation | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const creditCost = qualities.find((item) => item.value === quality)?.credits ?? 2;
  const isVip = session.entitlements.priorityGeneration;
  const activeMeta = useMemo(() => active ? `${active.aspectRatio} · ${active.style} · ${active.quality}` : "", [active]);
  const canGenerate = prompt.trim().length >= 3 && !generating;

  async function loadGenerations() {
    const payload = await api<{ generations: Generation[] }>("/api/generations?limit=12");
    setGenerations(payload.generations);
    setActive((current) => current && payload.generations.some((item) => item.id === current.id) ? current : payload.generations[0] ?? null);
  }

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    void loadGenerations().catch((reason: Error) => setError(reason.message));
    if (session.user) {
      void api<{ projects: Project[] }>("/api/projects").then((payload) => setProjects(payload.projects.filter((project) => !project.archived))).catch((reason: Error) => setError(reason.message));
    } else {
      setProjects([]);
      setProjectId("");
    }
  }, [session.user?.id]);

  async function generate(promptOverride?: string) {
    const requestedPrompt = (promptOverride ?? prompt).trim();
    if (requestedPrompt.length < 3 || generating) return;
    if (!session.user && session.entitlements.guestRemaining <= 0) {
      onRequireAuth();
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const created = await api<Generation>("/api/generations", {
        method: "POST",
        body: JSON.stringify({ prompt: requestedPrompt, aspectRatio, style, quality, projectId: projectId || null }),
      });
      setActive(created);
      setGenerations((items) => [created, ...items.filter((item) => item.id !== created.id)].slice(0, 12));
      await onSessionRefresh();
    } catch (reason) {
      if (reason instanceof ApiClientError && (reason.code === "ANONYMOUS_LIMIT_REACHED" || reason.code === "UNAUTHENTICATED")) onRequireAuth();
      setError(reason instanceof Error ? reason.message : "Generation failed.");
      await loadGenerations().catch(() => undefined);
    } finally {
      setGenerating(false);
    }
  }

  async function removeGeneration(event: React.MouseEvent, id: string) {
    event.stopPropagation();
    try {
      await api<void>(`/api/generations/${id}`, { method: "DELETE" });
      setGenerations((items) => items.filter((item) => item.id !== id));
      if (active?.id === id) setActive(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete that generation.");
    }
  }

  async function setFavorite(favorite: boolean) {
    if (!active || !session.user) return onRequireAuth();
    try {
      await api(`/api/generations/${active.id}/favorite`, { method: "PATCH", body: JSON.stringify({ favorite }) });
      setActive({ ...active, favorite });
      setGenerations((items) => items.map((item) => item.id === active.id ? { ...item, favorite } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this favorite.");
    }
  }

  return (
    <section id="generator" className={`generator-shell card card-border ${compact ? "generator-compact" : ""}`} aria-label="Image generator workspace">
      <header className="generator-toolbar">
        <div className="generator-identity">
          <span className="generator-mark" aria-hidden="true"><WandSparkles size={19} /></span>
          <span><strong>Provider-aware AI image generator</strong><small>{session.user ? `Signed in as ${session.user.name}` : "Private guest session · no account required"}</small></span>
        </div>
        <div className="workspace-entitlement">
          <span className="badge badge-neutral"><span className="status-dot" />Private generation</span>
          <span className={`badge ${isVip ? "badge-warning badge-soft" : "badge-outline"}`}>{isVip ? <Crown size={13} /> : <Clock3 size={13} />}{isVip ? "VIP priority" : "Free queue"}</span>
          {session.user ? <span className="badge badge-outline"><Coins size={13} />{session.entitlements.credits} credits</span> : <span className="badge badge-outline">{prerendered ? "3 free generations daily" : <>{session.entitlements.guestRemaining} of 3 free · resets {new Date(session.entitlements.guestResetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>}</span>}
        </div>
      </header>

      {error && <div role="alert" className="alert alert-error app-alert"><span>{error}</span><button className="btn btn-ghost btn-xs" onClick={() => setError("")} type="button">Dismiss</button></div>}

      <div className="generator-grid">
        <form className="controls-panel" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
          <div className="control-heading"><label htmlFor={compact ? "studio-prompt" : "prompt"}>1. Write your image prompt</label><p>Subject + setting + style + lighting. Plain language works.</p></div>
          <div className="prompt-wrap">
            <textarea id={compact ? "studio-prompt" : "prompt"} className="textarea prompt-field" value={prompt} maxLength={1000} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void generate(); } }} placeholder="Example: A quiet bookshop on a rainy Tokyo street, warm window light, cinematic photography..." />
            <span className="character-count">{prompt.length}/1000</span>
          </div>

          <div className="examples-block"><p>Not sure what to write? Try an example</p><div className="example-row">{examples.map((example, index) => <button className="btn btn-ghost example-chip" type="button" key={example} onClick={() => setPrompt(example)}>{index + 1}. {example}</button>)}</div></div>

          <div className="settings-row">
            <fieldset><legend>Aspect ratio</legend><div className="ratio-row">{aspectRatios.map((ratio) => <button key={ratio} className={`btn ratio-button ${aspectRatio === ratio ? "is-selected" : ""}`} type="button" onClick={() => setAspectRatio(ratio)}><AspectGlyph ratio={ratio} />{ratio}</button>)}</div></fieldset>
            <fieldset className="style-fieldset"><label htmlFor={compact ? "studio-style" : "style"}>Style</label><select id={compact ? "studio-style" : "style"} className="select" value={style} onChange={(event) => setStyle(event.target.value as ImageStyle)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></fieldset>
          </div>

          <fieldset className="quality-fieldset"><legend>Image quality</legend><div className="quality-row">{qualities.map((item) => <button key={item.value} className={`btn quality-button ${quality === item.value ? "is-selected" : ""}`} type="button" onClick={() => setQuality(item.value)}><strong>{item.value}</strong><small>{session.user ? `${item.credits} credit${item.credits > 1 ? "s" : ""}` : item.note}</small></button>)}</div></fieldset>

          {session.user && projects.length > 0 && <label className="project-select-label"><span><FolderOpen size={13} />Save to project</span><select className="select" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Unassigned</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>}

          <button className="btn generate-button" type="submit" disabled={!canGenerate}>{generating ? <><RefreshCw size={17} className="spin-icon" />{isVip ? "Generating with VIP priority" : "Waiting in the free queue"}</> : <><Sparkles size={17} />{session.user ? `Generate · ${creditCost} credit${creditCost > 1 ? "s" : ""}` : session.entitlements.guestRemaining > 0 ? `Generate free · ${session.entitlements.guestRemaining} left` : "Create account to continue"}</>}</button>
          <p className="generate-note">{isVip ? "VIP priority · Original exports · Failed requests are never charged" : "Free queue · Watermarked exports · Failed requests are never charged"}</p>
        </form>

        <div className="result-panel">
          <div className="result-heading"><h2>Your generated image result</h2><span>{activeMeta}</span></div>
          <div className={`result-stage ${active?.imageUrl ? "has-image" : ""}`}>
            {active?.imageUrl ? <><img src={active.imageUrl} alt={`Generated image for: ${active.prompt.slice(0, 100)}`} /><div className="result-actions">{session.user && <button className="btn btn-sm" type="button" onClick={() => void setFavorite(!active.favorite)}><Heart size={14} fill={active.favorite ? "currentColor" : "none"} />{active.favorite ? "Saved" : "Favorite"}</button>}<button className="btn btn-sm" type="button" onClick={() => { setPrompt(active.prompt); void generate(active.prompt); }}><RefreshCw size={14} />Variation</button><a className="btn btn-sm" href={active.downloadUrl ?? active.imageUrl}><Download size={14} />{session.entitlements.watermarkedExports ? "Watermarked export" : "Download original"}</a></div></> : active?.status === "failed" ? <div className="result-placeholder"><span className="image-placeholder-icon"><ImageIcon size={23} /></span><strong>Generation failed safely</strong><p>No guest allowance or credits were charged. Edit the prompt or retry it now.</p><button className="btn btn-sm" type="button" onClick={() => { setPrompt(active.prompt); void generate(active.prompt); }}><RefreshCw size={14} />Retry prompt</button></div> : <div className="result-placeholder"><span className={`image-placeholder-icon ${generating ? "is-loading" : ""}`}>{generating ? <RefreshCw size={23} /> : <ImageIcon size={23} />}</span><strong>{generating ? (isVip ? "Creating with VIP priority" : "Waiting in the free queue") : "Your image will appear here"}</strong><p>{generating ? (isVip ? "Your request bypassed the standard free queue." : "VIP requests are processed first; yours will start automatically.") : "Start by describing the image you want."}</p></div>}
          </div>

          <div className="recent-heading"><h3>Recent private image results</h3><span>{generations.length ? `${generations.length} private item${generations.length > 1 ? "s" : ""}` : "No images yet"}</span></div>
          <div className="recent-grid">{generations.slice(0, 6).map((item) => <div className={`recent-item ${active?.id === item.id ? "is-active" : ""} ${item.status === "failed" ? "is-failed" : ""}`} key={item.id}><button className="recent-open" type="button" onClick={() => setActive(item)} aria-label={`Open ${item.status} generation: ${item.prompt}`}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="recent-status"><ImageIcon size={16} /><small>{item.status}</small></span>}</button><button className="recent-delete" type="button" onClick={(event) => void removeGeneration(event, item.id)} aria-label="Delete generation"><Trash2 size={12} /></button>{item.favorite && <Heart className="recent-favorite" size={12} fill="currentColor" />}</div>)}{generations.length === 0 && <div className="recent-empty"><ImageIcon size={15} /></div>}</div>
        </div>
      </div>
    </section>
  );
}
