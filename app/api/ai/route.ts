import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { AI_TASKS, SCHEMAS, type AiRequest, type AiResponse, type AiTask } from "@/lib/ai/schemas";

/** Vision requests at medium effort can run well past a serverless default; give them room. */
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";

const EFFORT: Record<AiTask, "low" | "medium" | "high"> = {
  plan: "medium",
  perspective: "low",
  palette: "medium",
  composition: "medium",
  values: "low",
  traps: "low",
  explain: "medium",
  lesson: "medium",
  note: "low",
};

const SYSTEM = `You are an experienced painting teacher helping a painter study a reference photo before they paint it.
Speak plainly and concretely, as you would at the easel. Name things by where they are in the picture ("the roofline on the left", "the pale band above the horizon").
When you give coordinates, they are pixels of the image you were shown, with the origin at the top-left corner.
Never describe the photo back in general terms; everything you say should change what the painter does.`;

function instructions(req: AiRequest): string {
  const c = req.context;
  const paints = c.paints?.length ? `The painter owns these watercolor paints: ${c.paints.join(", ")}.` : "The painter has not listed their paints; suggest common watercolor pigments.";
  switch (req.task) {
    case "plan":
      return `Make a painting plan for this photo. ${paints} Choose the focal point, say what the big value shapes are (four to six, lightest to darkest), give the block-in order, name which edges to keep sharp or soft, and list mixes for the main passages using the painter's paints where possible.`;
    case "perspective":
      return `Estimate the linear perspective of this photo. Give the eye level (horizon) as a y value in pixels, the vanishing points as pixel coordinates (they may fall outside the image, even far outside), and which perspective type fits: one-point, two-point, three-point, or none if the scene has no clear parallel structure. Base the horizon on converging edges, not on where sky meets ground.`;
    case "palette":
      return `Recommend a limited palette for this photo. ${paints} ${c.dominantColors?.length ? `The dominant colors measured from the photo are ${c.dominantColors.join(", ")}.` : ""} Pick four to eight paints with a role for each, say which of the painter's paints to leave in the box, and describe where the warm and cool masses sit.`;
    case "composition":
      return `Suggest two or three crops of this photo that would make a stronger painting than the whole frame. Each crop must use one of these canvas ratios: ${c.ratios?.map((r) => `${r.id} (${r.label})`).join("; ")}. Give each crop as a pixel rectangle inside the image whose proportions match the chosen ratio and orientation, with a title and the reason it works.`;
    case "values":
      return `The first image is the photo; the second is the same photo reduced to three values. Judge whether the design reads as a small number of clear value groups. Count the groups, say whether it would read at thumbnail size, describe each group with a value from 1 (lightest) to 5 (darkest), and advise what to merge or separate.`;
    case "traps":
      return `Look for the ways this photo would mislead a painter who copies it: blown-out highlights, crushed shadows with no colour, a colour cast, lens distortion of verticals or the horizon, flat or confusing light, over-sharp detail in the distance. For each, give where it is as a pixel rectangle, how serious it is, and what to paint from knowledge instead.`;
    case "explain":
      return `The painter tapped the photo at pixel (${Math.round(c.point?.x ?? 0)}, ${Math.round(c.point?.y ?? 0)}) and asked: "${c.question ?? "What should I notice here?"}". Answer about that spot specifically, and point out up to three other spots worth comparing it with.`;
    case "lesson":
      return `Teach the topic "${c.topic}" using this photo. Explain how it shows up here, give two to four places as pixel rectangles with what to notice in each, and set a ten-minute study exercise.`;
    case "note":
      return `The painter dictated these notes after a painting session on "${c.imageName ?? "this reference"}": """${c.transcript ?? ""}""". Turn them into a tidy session note that keeps their own observations and wording where it is clear, plus one to three things to try next time.`;
  }
}

function imageBlock(img: { data: string; width: number; height: number }): Anthropic.Beta.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } };
}

function isAiRequest(body: unknown): body is AiRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.task === "string" && (AI_TASKS as readonly string[]).includes(b.task) && typeof b.context === "object" && b.context !== null;
}

export async function POST(request: Request): Promise<NextResponse<AiResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request.", code: "invalid" }, { status: 400 });
  }
  if (!isAiRequest(body)) {
    return NextResponse.json({ ok: false, error: "Unknown task.", code: "invalid" }, { status: 400 });
  }
  if (body.task !== "note" && !body.image) {
    return NextResponse.json({ ok: false, error: "This task needs an image.", code: "invalid" }, { status: 400 });
  }

  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch {
    return NextResponse.json(
      { ok: false, error: "No Anthropic API key is configured on the server. Add ANTHROPIC_API_KEY to .env.local and restart.", code: "no_key" },
      { status: 503 },
    );
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (body.image) content.push(imageBlock(body.image));
  if (body.secondImage) content.push(imageBlock(body.secondImage));
  content.push({ type: "text", text: instructions(body) });

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: EFFORT[body.task], format: betaZodOutputFormat(SCHEMAS[body.task]) },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ ok: false, error: "The model declined this request.", code: "refusal" }, { status: 200 });
    }
    if (!response.parsed_output) {
      return NextResponse.json({ ok: false, error: "The model's answer could not be read. Try again.", code: "failed" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      task: body.task,
      result: response.parsed_output,
      imageSize: body.image ? { width: body.image.width, height: body.image.height } : null,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.", code: "no_key" }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: "Rate limited by the API. Wait a moment and try again.", code: "failed" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return NextResponse.json({ ok: false, error: "Could not reach the Anthropic API.", code: "offline" }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ ok: false, error: `API error ${err.status}: ${err.message}`, code: "failed" }, { status: 502 });
    }
    if (err instanceof Error && /authentication method|api key|apiKey/i.test(err.message)) {
      return NextResponse.json(
        { ok: false, error: "No Anthropic API key is configured on the server. Add ANTHROPIC_API_KEY to .env.local and restart.", code: "no_key" },
        { status: 503 },
      );
    }
    console.error("[api/ai]", err);
    return NextResponse.json({ ok: false, error: "Something went wrong.", code: "failed" }, { status: 500 });
  }
}
