import { useEffect, useState } from "react";
import { Boxes, FolderOpen, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
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
  onGenerationCreated: (generation: Generation) => void;
}

export function GeneratorWorkspace({ session, models, compact = false, initialPrompt = "", onRequireAuth, onSessionRefresh, onGenerationCreated }: GeneratorWorkspaceProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [modelId, setModelId] = useState(() => models.find((model) => model.available)?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [style, setStyle] = useState<ImageStyle>("Photorealistic");
  const [quality, setQuality] = useState<ImageQuality>("High");
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const creditCost = qualities.find((item) => item.value === quality)?.credits ?? 2;
  const selectedModel = models.find((model) => model.id === modelId && model.available) ?? null;
  const availableAspectRatios = selectedModel?.supportedAspectRatios.length ? selectedModel.supportedAspectRatios : aspectRatios;
  const availableQualities = selectedModel?.supportedQualities.length
    ? qualities.filter((item) => selectedModel.supportedQualities.includes(item.value))
    : qualities;
  const maxPromptLength = selectedModel?.maxPromptLength || 1000;
  const canGenerate = !generating && (!session.user || (prompt.trim().length >= 3 && Boolean(selectedModel)));
  const promptId = compact ? "studio-prompt" : "prompt";

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (!models.some((model) => model.id === modelId && model.available)) {
      setModelId(models.find((model) => model.available)?.id ?? "");
    }
  }, [modelId, models]);

  useEffect(() => {
    if (selectedModel && !selectedModel.supportedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(selectedModel.supportedAspectRatios[0] ?? "1:1");
    }
    if (selectedModel && !selectedModel.supportedQualities.includes(quality)) {
      setQuality(selectedModel.supportedQualities[0] ?? "Standard");
    }
  }, [aspectRatio, quality, selectedModel]);

  useEffect(() => {
    if (session.user) {
      void api<{ projects: Project[] }>("/api/projects").then((payload) => setProjects(payload.projects.filter((project) => !project.archived))).catch((reason: Error) => setError(reason.message));
    } else {
      setProjects([]);
      setProjectId("");
    }
  }, [session.user]);

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
      onGenerationCreated(created);
      void onSessionRefresh().catch(() => undefined);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.code === "UNAUTHENTICATED") onRequireAuth();
      setError(reason instanceof Error ? reason.message : "Generation failed.");
    } finally {
      setGenerating(false);
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
            maxLength={maxPromptLength}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void generate();
              }
            }}
            placeholder="Describe the image you want to create..."
          />
          <span className="creation-count">{prompt.length}/{maxPromptLength}</span>
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
                {availableAspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}
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
                {availableQualities.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.credits} credit{item.credits > 1 ? "s" : ""}</option>)}
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
    </section>
  );
}
