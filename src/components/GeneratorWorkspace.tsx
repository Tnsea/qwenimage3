import { useCallback, useEffect, useState } from "react";
import { Boxes, Download, FolderOpen, Heart, Image as ImageIcon, RefreshCw, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { api, ApiClientError } from "../api";
import type { AspectRatio, CatalogModel, Generation, ImageQuality, ImageStyle, Project, SessionState } from "../types";

const examples = [
  "A premium cobalt perfume bottle on black stone, soft studio light",
  "A tiny night train crossing a bridge in the rain, cinematic",
  "Minimalist workspace with warm oak and morning shadows",
];
const aspectRatios: AspectRatio[] = ["1:1", "3:2", "16:9", "4:3", "9:16"];
const styles: ImageStyle[] = ["Photorealistic", "Editorial", "Cinematic", "Illustration"];
const qualities: Array<{ value: ImageQuality; credits: number }> = [
  { value: "Standard", credits: 4 },
  { value: "High", credits: 8 },
  { value: "Ultra", credits: 16 },
];

function AspectGlyph({ ratio }: { ratio: AspectRatio }) {
  const [width, height] = ratio.split(":").map(Number);
  const max = Math.max(width, height);
  return <span className="aspect-glyph" style={{ width: `${Math.max(7, Math.round((width / max) * 14))}px`, height: `${Math.max(7, Math.round((height / max) * 14))}px` }} aria-hidden="true" />;
}

interface GeneratorWorkspaceProps {
  session: SessionState;
  models: CatalogModel[];
  compact?: boolean;
  initialPrompt?: string;
  onRequireAuth: () => void;
  onSessionRefresh: () => Promise<void>;
}

export function GeneratorWorkspace({ session, models, compact = false, initialPrompt = "", onRequireAuth, onSessionRefresh }: GeneratorWorkspaceProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [modelId, setModelId] = useState(() => models.find((model) => model.available)?.id ?? "");
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
  const selectedModel = models.find((model) => model.id === modelId && model.available) ?? null;
  const canGenerate = !generating && (!session.user || (prompt.trim().length >= 3 && Boolean(selectedModel)));
  const promptId = compact ? "studio-prompt" : "prompt";

  const loadGenerations = useCallback(async () => {
    const payload = await api<{ generations: Generation[] }>("/api/generations?limit=12");
    setGenerations(payload.generations);
    setActive((current) => current && payload.generations.some((item) => item.id === current.id) ? current : payload.generations[0] ?? null);
  }, []);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (!models.some((model) => model.id === modelId && model.available)) {
      setModelId(models.find((model) => model.available)?.id ?? "");
    }
  }, [modelId, models]);

  useEffect(() => {
    if (session.user) {
      void loadGenerations().catch((reason: Error) => setError(reason.message));
      void api<{ projects: Project[] }>("/api/projects").then((payload) => setProjects(payload.projects.filter((project) => !project.archived))).catch((reason: Error) => setError(reason.message));
    } else {
      setGenerations([]);
      setActive(null);
      setProjects([]);
      setProjectId("");
    }
  }, [loadGenerations, session.user]);

  async function generate(promptOverride?: string) {
    if (!session.user) {
      onRequireAuth();
      return;
    }
    const requestedPrompt = (promptOverride ?? prompt).trim();
    if (requestedPrompt.length < 3 || generating) return;
    setGenerating(true);
    setError("");
    try {
      const created = await api<Generation>("/api/generations", {
        method: "POST",
        body: JSON.stringify({ prompt: requestedPrompt, modelId, aspectRatio, style, quality, projectId: projectId || null }),
      });
      setActive(created);
      setGenerations((items) => [created, ...items.filter((item) => item.id !== created.id)].slice(0, 12));
      await onSessionRefresh();
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.code === "UNAUTHENTICATED") onRequireAuth();
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

  function useNextExample() {
    const currentIndex = examples.indexOf(prompt);
    setPrompt(examples[(currentIndex + 1) % examples.length]);
  }

  const allowance = session.user
    ? `${session.entitlements.credits} credits · ${creditCost} per image`
    : "Sign in to receive 20 welcome credits";

  return (
    <section id="generator" className={`generator-shell creation-workspace card ${compact ? "generator-compact" : ""}`} aria-label="Image generator workspace">
      <h2 className="sr-only">Create an image</h2>

      {error && <div role="alert" className="alert alert-error app-alert creation-alert"><span>{error}</span><button className="btn btn-ghost btn-xs" onClick={() => setError("")} type="button">Dismiss</button></div>}

      <form className="creation-composer" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <div className="creation-editor">
          <label className="sr-only" htmlFor={promptId}>Describe the image you want to create</label>
          <textarea
            id={promptId}
            className="textarea creation-prompt"
            value={prompt}
            maxLength={1000}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void generate();
              }
            }}
            placeholder="Describe the image you want to create..."
          />
          <span className="creation-count">{prompt.length}/1000</span>
        </div>

        <div className="creation-toolbar">
          <div className="creation-controls">
            <button className="btn btn-ghost btn-sm creation-example" type="button" onClick={useNextExample}>
              <WandSparkles size={14} />
              <span>Try an example</span>
            </button>

            <label className="creation-select">
              <span className="sr-only">Aspect ratio</span>
              <AspectGlyph ratio={aspectRatio} />
              <select className="select select-sm" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)} aria-label="Aspect ratio">
                {aspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}
              </select>
            </label>

            <label className="creation-select creation-model-select">
              <span className="sr-only">Image model</span>
              <Boxes size={14} aria-hidden="true" />
              <select
                className="select select-sm"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                aria-label="Image model"
                disabled={!models.some((model) => model.available)}
              >
                {models.length === 0 && <option value="">Loading models…</option>}
                {models.map((model) => (
                  <option value={model.id} key={model.id} disabled={!model.available}>
                    {model.name}{model.available ? "" : ` · ${model.status}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="creation-select creation-style-select">
              <span className="sr-only">Visual style</span>
              <select className="select select-sm" value={style} onChange={(event) => setStyle(event.target.value as ImageStyle)} aria-label="Visual style">
                {styles.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label className="creation-select creation-quality-select">
              <span className="sr-only">Image quality</span>
              <select className="select select-sm" value={quality} onChange={(event) => setQuality(event.target.value as ImageQuality)} aria-label="Image quality">
                {qualities.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.credits} credit{item.credits > 1 ? "s" : ""}</option>)}
              </select>
            </label>

            {session.user && projects.length > 0 && <label className="creation-select creation-project-select">
              <span className="sr-only">Save to project</span>
              <FolderOpen size={14} aria-hidden="true" />
              <select className="select select-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Save to project">
                <option value="">No project</option>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
            </label>}
          </div>

          <div className="creation-submit">
            <span>{allowance}</span>
            <button className="btn creation-generate" type="submit" disabled={!canGenerate}>
              {generating ? <RefreshCw size={16} className="spin-icon" /> : <Sparkles size={16} />}
              {generating ? "Generating" : session.user ? "Generate" : "Sign in to generate"}
            </button>
          </div>
        </div>
      </form>

      {(generating || active) && <section className="creation-output" aria-live="polite">
        <div className="creation-output-heading">
          <div><span>Result</span>{active && <small>{active.model} · {active.aspectRatio} · {active.style} · {active.quality}</small>}</div>
          {active?.imageUrl && !generating && <div className="creation-result-actions">
            {session.user && <button className="btn btn-ghost btn-sm" type="button" onClick={() => void setFavorite(!active.favorite)}><Heart size={14} fill={active.favorite ? "currentColor" : "none"} />{active.favorite ? "Saved" : "Save"}</button>}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPrompt(active.prompt); void generate(active.prompt); }}><RefreshCw size={14} />Variation</button>
            <a className="btn btn-sm" href={active.downloadUrl ?? active.imageUrl}><Download size={14} />Download</a>
          </div>}
        </div>

        <div className={`creation-result-stage ${active?.imageUrl && !generating ? "has-image" : ""}`}>
          {generating ? <div className="creation-result-placeholder"><RefreshCw size={24} className="spin-icon" /><strong>Creating your image</strong><p>{session.entitlements.priorityGeneration ? "Priority generation is in progress." : "Your request is in the generation queue."}</p></div>
            : active?.imageUrl ? <img src={active.imageUrl} alt={`Generated result for: ${active.prompt.slice(0, 100)}`} />
              : <div className="creation-result-placeholder"><ImageIcon size={24} /><strong>Generation failed safely</strong><p>No credits were charged.</p><button className="btn btn-sm" type="button" onClick={() => { setPrompt(active!.prompt); void generate(active!.prompt); }}><RefreshCw size={14} />Retry</button></div>}
        </div>

        {generations.length > 1 && <div className="creation-recent">
          <div className="creation-recent-heading"><span>Recent</span><small>{generations.length} private images</small></div>
          <div className="creation-recent-grid">
            {generations.slice(0, 8).map((item) => <div className={`recent-item ${active?.id === item.id ? "is-active" : ""} ${item.status === "failed" ? "is-failed" : ""}`} key={item.id}>
              <button className="recent-open" type="button" onClick={() => setActive(item)} aria-label={`Open ${item.status} generation: ${item.prompt}`}>
                {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="recent-status"><ImageIcon size={16} /><small>{item.status}</small></span>}
              </button>
              <button className="recent-delete" type="button" onClick={(event) => void removeGeneration(event, item.id)} aria-label="Delete generation"><Trash2 size={12} /></button>
              {item.favorite && <Heart className="recent-favorite" size={12} fill="currentColor" />}
            </div>)}
          </div>
        </div>}
      </section>}
    </section>
  );
}
