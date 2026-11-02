"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { imageForAi, runAiTask } from "@/lib/ai/client";
import { LESSON_TOPICS, type AiRequest, type AiResult, type AiTask } from "@/lib/ai/schemas";
import { getProcessedCanvas } from "@/lib/image-processing";
import { useStoredValue } from "@/lib/local-store";
import { FRAME_RATIOS, type AiNote, type Annotation, type LoadedImage, type Pt } from "@/lib/types";

interface Size {
  width: number;
  height: number;
}

interface Props {
  image: LoadedImage | null;
  paintNames: string[];
  dominantColors: string[];
  askPoint: Pt | null;
  asking: boolean;
  onStartAsk: () => void;
  onApplyPerspective: (r: AiResult<"perspective">, size: Size) => void;
  onApplyComposition: (opt: AiResult<"composition">["options"][number], size: Size) => void;
  onAnnotate: (annotations: Annotation[]) => void;
  notes: AiNote[];
  onSaveNote: (note: AiNote) => void;
  onDeleteNote: (at: number) => void;
  onClose: () => void;
}

type Results = { [T in AiTask]?: { result: AiResult<T>; size: Size | null } };

const TASK_LABELS: Record<Exclude<AiTask, "explain" | "lesson" | "note">, { label: string; hint: string }> = {
  plan: { label: "Painting plan", hint: "Focal point, value shapes, block-in order, edges and mixes" },
  perspective: { label: "Find perspective", hint: "Eye level and vanishing points, applied to the guides" },
  palette: { label: "Palette advice", hint: "A limited palette from your paints" },
  composition: { label: "Composition ideas", hint: "Two or three crops in your canvas ratios" },
  values: { label: "Value check", hint: "Does the design read as a few clear groups?" },
  traps: { label: "Photo traps", hint: "Blown highlights, dead shadows, distortion" },
};

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

export function Assistant(p: Props) {
  const [consent, setConsent] = useStoredValue("reference-studio:ai-consent", "");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [busy, setBusy] = useState<AiTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Results>({});
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState(LESSON_TOPICS[0]);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const [prevImageId, setPrevImageId] = useState(p.image?.id ?? null);
  if ((p.image?.id ?? null) !== prevImageId) {
    setPrevImageId(p.image?.id ?? null);
    setResults({});
    setError(null);
  }

  const ready = consent === "1" && online && !busy;

  const run = useCallback(
    async <T extends AiTask>(task: T, extra: Partial<AiRequest> = {}) => {
      if (busy) return;
      setBusy(task);
      setError(null);
      try {
        const image = p.image && task !== "note" ? imageForAi(p.image.data) : undefined;
        const req: AiRequest = {
          task,
          image,
          context: {
            paints: p.paintNames,
            dominantColors: p.dominantColors,
            ratios: FRAME_RATIOS.map((r) => ({ id: r.id, label: r.label })),
            imageName: p.image?.name,
          },
          ...extra,
        };
        if (task === "values" && p.image) {
          const v = getProcessedCanvas(p.image.data, "values3");
          const ctx = v.getContext("2d", { willReadFrequently: true });
          if (ctx) req.secondImage = imageForAi(ctx.getImageData(0, 0, v.width, v.height));
        }
        const res = await runAiTask(req);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setResults((r) => ({ ...r, [task]: { result: res.result as AiResult<T>, size: res.imageSize } }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
    },
    [busy, p.image, p.paintNames, p.dominantColors],
  );

  const norm = (size: Size | null) => ({
    pt: (x: number, y: number): Pt => (size ? { x: x / size.width, y: y / size.height } : { x: 0, y: 0 }),
    rect: (r: { x: number; y: number; w: number; h: number }) =>
      size ? { x: r.x / size.width, y: r.y / size.height, w: r.w / size.width, h: r.h / size.height } : { x: 0, y: 0, w: 0, h: 0 },
  });

  const toggleListening = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser has no speech recognition. Type the note instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
      setTranscript((t) => (t ? t + " " : "") + text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <aside className="flex h-full w-full flex-col overflow-x-hidden bg-[#1b1b1b] text-[13.5px] text-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <h2 className="text-[15px] font-semibold">Studio assistant</h2>
        <button type="button" onClick={p.onClose} aria-label="Close assistant" className="text-neutral-300 hover:text-white">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {consent !== "1" && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[13px] leading-relaxed">
            <p>
              Each assistant request sends a copy of the current image (and your question or notes) to Anthropic&apos;s API
              through this app&apos;s server. Nothing is sent until you tap one of the buttons, and nothing else in the app
              leaves your browser.
            </p>
            <button
              type="button"
              onClick={() => setConsent("1")}
              className="mt-2 rounded-full bg-amber-400 px-3 py-1 font-medium text-black hover:bg-amber-300"
            >
              I understand
            </button>
          </div>
        )}
        {!online && <p className="rounded-lg bg-white/5 px-3 py-2 text-neutral-300">You are offline. The assistant needs a connection; everything else keeps working.</p>}
        {!p.image && <p className="text-neutral-400">Open an image to use the assistant.</p>}
        {error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-[13px] text-red-200">{error}</p>}

        <section className="grid grid-cols-2 gap-2">
          {(Object.keys(TASK_LABELS) as (keyof typeof TASK_LABELS)[]).map((task) => (
            <button
              key={task}
              type="button"
              disabled={!ready || !p.image}
              onClick={() => void run(task)}
              title={TASK_LABELS[task].hint}
              className={`rounded-lg border px-3 py-2 text-left leading-snug transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                busy === task ? "border-amber-400 bg-amber-400/15 text-amber-100" : "border-white/15 bg-white/[0.04] hover:bg-white/[0.09]"
              }`}
            >
              {busy === task ? "Thinking…" : TASK_LABELS[task].label}
            </button>
          ))}
        </section>

        {results.plan && <PlanView r={results.plan.result} size={results.plan.size} norm={norm} onAnnotate={p.onAnnotate} />}
        {results.perspective && (
          <Card title="Perspective">
            <p>
              {results.perspective.result.type === "none" ? "No clear linear perspective" : `${results.perspective.result.type}-point`} ·{" "}
              {results.perspective.result.confidence} confidence
            </p>
            <p className="text-neutral-400">{results.perspective.result.note}</p>
            {results.perspective.size && (
              <Action onClick={() => p.onApplyPerspective(results.perspective!.result, results.perspective!.size!)}>Apply to guides</Action>
            )}
          </Card>
        )}
        {results.palette && (
          <Card title="Palette">
            <p>{results.palette.result.summary}</p>
            <ul className="list-disc pl-4">
              {results.palette.result.limitedPalette.map((x) => (
                <li key={x.name}>
                  <span className="font-medium">{x.name}</span> <span className="text-neutral-400">{x.role}</span>
                </li>
              ))}
            </ul>
            {results.palette.result.leaveOut.length > 0 && <p className="text-neutral-400">Leave out: {results.palette.result.leaveOut.join(", ")}</p>}
            <p>{results.palette.result.temperature}</p>
          </Card>
        )}
        {results.composition && (
          <Card title="Composition ideas">
            {results.composition.result.options.map((o, i) => (
              <div key={i} className="rounded-lg border border-white/10 p-2">
                <p className="font-medium">
                  {o.title} <span className="text-neutral-400">{o.ratio} {o.landscape ? "landscape" : "portrait"}</span>
                </p>
                <p className="text-neutral-300">{o.reason}</p>
                {results.composition!.size && <Action onClick={() => p.onApplyComposition(o, results.composition!.size!)}>Apply frame</Action>}
              </div>
            ))}
          </Card>
        )}
        {results.values && (
          <Card title="Value check">
            <p>
              {results.values.result.groups} value groups · {results.values.result.readsAtThumbnail ? "reads at thumbnail size" : "does not read at thumbnail size"}
            </p>
            <ul className="list-disc pl-4">
              {results.values.result.groupsDescribed.map((g, i) => (
                <li key={i}>
                  {g.label} <span className="text-neutral-400">value {g.value}</span>
                </li>
              ))}
            </ul>
            <p>{results.values.result.advice}</p>
          </Card>
        )}
        {results.traps && (
          <Card title="Photo traps">
            <p>{results.traps.result.summary}</p>
            {results.traps.result.issues.map((it, i) => (
              <p key={i}>
                <span className={it.severity === "serious" ? "text-red-300" : it.severity === "notable" ? "text-amber-300" : "text-neutral-300"}>{it.kind}</span>
                {" · "}
                {it.fix}
              </p>
            ))}
            {results.traps.size && (
              <Action
                onClick={() =>
                  p.onAnnotate(results.traps!.result.issues.map((it, i) => ({ id: `trap-${i}`, label: it.kind, ...norm(results.traps!.size).rect(it.where) })))
                }
              >
                Show on image
              </Action>
            )}
          </Card>
        )}

        <Card title="Ask about a spot">
          <p className="text-neutral-400">{p.askPoint ? "Spot chosen. Ask your question." : "Tap a point on the image, then ask."}</p>
          <div className="flex gap-2">
            <Action onClick={p.onStartAsk} active={p.asking}>
              {p.asking ? "Tap the image…" : p.askPoint ? "Choose another spot" : "Choose a spot"}
            </Action>
          </div>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What colour is this shadow really?"
            className="w-full rounded-lg border border-white/15 bg-[#242424] px-2 py-1.5 text-white placeholder:text-neutral-500"
          />
          <Action
            disabled={!ready || !p.image || !p.askPoint}
            onClick={() =>
              p.image &&
              p.askPoint &&
              void run("explain", {
                context: {
                  paints: p.paintNames,
                  question: question || undefined,
                  point: (() => {
                    const img = imageForAi(p.image.data);
                    return { x: p.askPoint.x * img.width, y: p.askPoint.y * img.height };
                  })(),
                },
              })
            }
          >
            {busy === "explain" ? "Thinking…" : "Ask"}
          </Action>
          {results.explain && (
            <>
              <p>{results.explain.result.answer}</p>
              {results.explain.result.related.length > 0 && results.explain.size && (
                <Action
                  onClick={() =>
                    p.onAnnotate(results.explain!.result.related.map((r, i) => ({ id: `rel-${i}`, label: r.label, ...norm(results.explain!.size).pt(r.x, r.y) })))
                  }
                >
                  Show related spots
                </Action>
              )}
            </>
          )}
        </Card>

        <Card title="Lesson">
          <div className="flex gap-2">
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#242424] px-2 py-1.5 text-white">
              {LESSON_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Action disabled={!ready || !p.image} onClick={() => void run("lesson", { context: { paints: p.paintNames, topic } })}>
              {busy === "lesson" ? "Thinking…" : "Teach me"}
            </Action>
          </div>
          {results.lesson && (
            <>
              <p>{results.lesson.result.intro}</p>
              {results.lesson.result.examples.map((ex, i) => (
                <p key={i}>
                  <span className="font-medium">{ex.label}.</span> {ex.explanation}
                </p>
              ))}
              <p className="text-neutral-300">Exercise: {results.lesson.result.exercise}</p>
              {results.lesson.size && (
                <Action
                  onClick={() =>
                    p.onAnnotate(results.lesson!.result.examples.map((ex, i) => ({ id: `lesson-${i}`, label: ex.label, ...norm(results.lesson!.size).rect(ex.where) })))
                  }
                >
                  Show on image
                </Action>
              )}
            </>
          )}
        </Card>

        <Card title="Session note">
          <p className="text-neutral-400">Say or type what happened this session; the assistant tidies it into a note kept with this image.</p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            placeholder="The sky went muddy because I overworked it…"
            className="w-full rounded-lg border border-white/15 bg-[#242424] px-2 py-1.5 text-white placeholder:text-neutral-500"
          />
          <div className="flex flex-wrap gap-2">
            <Action onClick={toggleListening} active={listening}>
              {listening ? "Stop listening" : "Dictate"}
            </Action>
            <Action disabled={!ready || !transcript.trim()} onClick={() => void run("note", { context: { transcript, imageName: p.image?.name } })}>
              {busy === "note" ? "Thinking…" : "Tidy into a note"}
            </Action>
          </div>
          {results.note && (
            <div className="rounded-lg border border-white/10 p-2">
              <p className="font-medium">{results.note.result.title}</p>
              <p>{results.note.result.note}</p>
              {results.note.result.nextTime.length > 0 && (
                <ul className="list-disc pl-4 text-neutral-300">
                  {results.note.result.nextTime.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <Action
                onClick={() => {
                  p.onSaveNote({ ...results.note!.result, at: Date.now() });
                  setResults((r) => ({ ...r, note: undefined }));
                  setTranscript("");
                }}
              >
                Save with image
              </Action>
            </div>
          )}
          {p.notes.length > 0 && (
            <div className="flex flex-col gap-2">
              {p.notes
                .slice()
                .sort((a, b) => b.at - a.at)
                .map((n) => (
                  <div key={n.at} className="rounded-lg bg-white/[0.04] p-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium">{n.title}</p>
                      <span className="shrink-0 text-[11px] text-neutral-500">{new Date(n.at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-neutral-200">{n.note}</p>
                    {n.nextTime.length > 0 && <p className="text-[12.5px] text-neutral-400">Next time: {n.nextTime.join(" · ")}</p>}
                    <button type="button" onClick={() => p.onDeleteNote(n.at)} className="mt-1 text-[12px] text-neutral-500 hover:text-red-300">
                      Delete
                    </button>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <p className="mt-auto pt-2 text-[12px] leading-relaxed text-neutral-500">
          Powered by Claude. Suggestions are a starting point for your own looking, not a verdict.
        </p>
      </div>
    </aside>
  );
}

function PlanView({
  r,
  size,
  norm,
  onAnnotate,
}: {
  r: AiResult<"plan">;
  size: Size | null;
  norm: (s: Size | null) => { pt: (x: number, y: number) => Pt };
  onAnnotate: (a: Annotation[]) => void;
}) {
  return (
    <Card title="Painting plan">
      <p>{r.summary}</p>
      <p>
        <span className="font-medium">Focal point.</span> {r.focalPoint.why}{" "}
        {size && (
          <button type="button" onClick={() => onAnnotate([{ id: "focal", label: "Focal point", ...norm(size).pt(r.focalPoint.x, r.focalPoint.y) }])} className="text-amber-300 hover:underline">
            Show
          </button>
        )}
      </p>
      <p>
        <span className="font-medium">Value key:</span> {r.valueKey}
      </p>
      <p className="font-medium">Big shapes</p>
      <ul className="list-disc pl-4">
        {r.bigShapes.map((s, i) => (
          <li key={i}>
            {s.label} <span className="text-neutral-400">value {s.value}</span>
          </li>
        ))}
      </ul>
      <p className="font-medium">Block-in order</p>
      <ol className="list-decimal pl-4">
        {r.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {r.edges.length > 0 && (
        <>
          <p className="font-medium">Edges</p>
          <ul className="list-disc pl-4">
            {r.edges.map((e, i) => (
              <li key={i}>
                {e.where} <span className="text-neutral-400">{e.treatment}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.mixes.length > 0 && (
        <>
          <p className="font-medium">Mixes</p>
          <ul className="list-disc pl-4">
            {r.mixes.map((m, i) => (
              <li key={i}>
                <span className="font-medium">{m.subject}:</span> {m.paints.join(" + ")} <span className="text-neutral-400">{m.note}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 leading-relaxed">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

function Action({ onClick, disabled, active, children }: { onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`self-start rounded-full border px-3 py-1 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-amber-400 bg-amber-400/15 text-amber-100" : "border-white/20 text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
