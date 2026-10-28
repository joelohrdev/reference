/**
 * A synthetic one-point-perspective street, tilted a few degrees so the
 * "level the view" tool has something to correct. Lets people try every tool
 * before they have a photo to hand.
 */
export function drawSampleScene(): HTMLCanvasElement {
  const W = 1600;
  const H = 1067;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");

  ctx.translate(W / 2, H / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.scale(1.1, 1.1);
  ctx.translate(-W / 2, -H / 2);

  const hy = H * 0.56;
  const vp = { x: W * 0.52, y: hy };
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });

  const sky = ctx.createLinearGradient(0, -H, 0, hy);
  sky.addColorStop(0, "#3f6fb5");
  sky.addColorStop(0.7, "#9db7d9");
  sky.addColorStop(1, "#e6d3b0");
  ctx.fillStyle = sky;
  ctx.fillRect(-W, -H, 3 * W, hy + H);

  ctx.fillStyle = "#fff4c2";
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.18, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8a8575";
  ctx.fillRect(-W, hy, 3 * W, 2 * H);

  const roadL = { x: W * 0.12, y: H * 1.4 };
  const roadR = { x: W * 0.97, y: H * 1.4 };
  ctx.fillStyle = "#45454b";
  ctx.beginPath();
  ctx.moveTo(roadL.x, roadL.y);
  ctx.lineTo(vp.x, vp.y);
  ctx.lineTo(roadR.x, roadR.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#d9d4a5";
  ctx.lineWidth = 6;
  const mid = { x: W * 0.55, y: H * 1.4 };
  for (let t = 0; t < 0.95; t += 0.07) {
    const a = lerp(mid, vp, t);
    const b = lerp(mid, vp, t + 0.03);
    ctx.lineWidth = 7 * (1 - t);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  type Side = { base: { x: number; y: number }; colors: string[] };
  const sides: Side[] = [
    { base: { x: W * 0.06, y: H * 1.25 }, colors: ["#b7804f", "#c9a37a", "#8f5a3c", "#d8c3a0", "#a67052"] },
    { base: { x: W * 1.02, y: H * 1.25 }, colors: ["#6f7f93", "#a7b4c2", "#56677b", "#c2c9d1", "#7b8a9b"] },
  ];
  const depths = [0, 0.14, 0.27, 0.4, 0.52, 0.62, 0.7, 0.77, 0.83, 0.88];
  const heights = [0.95, 0.7, 1.1, 0.85, 1.0, 0.75, 0.9, 1.05, 0.8, 0.9];

  for (const side of sides) {
    for (let i = depths.length - 2; i >= 0; i--) {
      const t0 = depths[i];
      const t1 = depths[i + 1];
      const top = { x: side.base.x, y: hy - H * 0.9 * heights[i] };
      const p0 = lerp(side.base, vp, t0);
      const p1 = lerp(side.base, vp, t1);
      const q0 = lerp(top, vp, t0);
      const q1 = lerp(top, vp, t1);
      ctx.fillStyle = side.colors[i % side.colors.length];
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(q1.x, q1.y);
      ctx.lineTo(q0.x, q0.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "rgba(30,35,55,0.75)";
      const rows = Math.max(2, Math.round(4 * heights[i]));
      const cols = 3;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u0 = t0 + ((t1 - t0) * (c + 0.2)) / cols;
          const u1 = t0 + ((t1 - t0) * (c + 0.8)) / cols;
          const v0 = (r + 0.25) / rows;
          const v1 = (r + 0.75) / rows;
          const a = lerp(lerp(side.base, vp, u0), lerp(top, vp, u0), v0);
          const b = lerp(lerp(side.base, vp, u1), lerp(top, vp, u1), v0);
          const cc = lerp(lerp(side.base, vp, u1), lerp(top, vp, u1), v1);
          const d = lerp(lerp(side.base, vp, u0), lerp(top, vp, u0), v1);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(cc.x, cc.y);
          ctx.lineTo(d.x, d.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  ctx.strokeStyle = "#1e1e1e";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, H * 0.98);
  ctx.lineTo(W * 0.2, H * 0.3);
  ctx.stroke();
  ctx.strokeStyle = "#e9e4d6";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = "#ffe9a3";
  ctx.beginPath();
  ctx.arc(W * 0.2, H * 0.29, 16, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}
