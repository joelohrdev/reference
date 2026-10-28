/**
 * Common watercolor paints with approximate masstone sRGB values. These are
 * generic pigment averages, not any one brand's formulation.
 */
export interface Paint {
  id: string;
  name: string;
  pigment: string;
  hex: string;
}

export const PAINTS: Paint[] = [
  { id: "lemon-yellow", name: "Lemon Yellow", pigment: "PY3", hex: "#f3e55a" },
  { id: "hansa-yellow", name: "Hansa Yellow Medium", pigment: "PY74", hex: "#f7c828" },
  { id: "cadmium-yellow", name: "Cadmium Yellow", pigment: "PY35", hex: "#fbc511" },
  { id: "indian-yellow", name: "Indian Yellow", pigment: "PY110", hex: "#e3931a" },
  { id: "yellow-ochre", name: "Yellow Ochre", pigment: "PY43", hex: "#c99a3a" },
  { id: "raw-sienna", name: "Raw Sienna", pigment: "PBr7", hex: "#c08a42" },
  { id: "cadmium-orange", name: "Cadmium Orange", pigment: "PO20", hex: "#ef7a2a" },
  { id: "pyrrol-scarlet", name: "Pyrrol Scarlet", pigment: "PR255", hex: "#d42f22" },
  { id: "cadmium-red", name: "Cadmium Red", pigment: "PR108", hex: "#c8322b" },
  { id: "alizarin-crimson", name: "Alizarin Crimson", pigment: "PR83", hex: "#9a1f33" },
  { id: "quinacridone-rose", name: "Quinacridone Rose", pigment: "PV19", hex: "#c9396f" },
  { id: "quinacridone-magenta", name: "Quinacridone Magenta", pigment: "PR122", hex: "#b2337c" },
  { id: "dioxazine-purple", name: "Dioxazine Purple", pigment: "PV23", hex: "#4b2c6e" },
  { id: "ultramarine", name: "Ultramarine Blue", pigment: "PB29", hex: "#30409e" },
  { id: "cobalt-blue", name: "Cobalt Blue", pigment: "PB28", hex: "#2f5db8" },
  { id: "cerulean", name: "Cerulean Blue", pigment: "PB35", hex: "#4190cf" },
  { id: "phthalo-blue", name: "Phthalo Blue (GS)", pigment: "PB15:3", hex: "#0f4f90" },
  { id: "prussian-blue", name: "Prussian Blue", pigment: "PB27", hex: "#1d3452" },
  { id: "indigo", name: "Indigo", pigment: "PB60+PBk", hex: "#2c3349" },
  { id: "phthalo-green", name: "Phthalo Green (BS)", pigment: "PG7", hex: "#106c4b" },
  { id: "viridian", name: "Viridian", pigment: "PG18", hex: "#2c8c6c" },
  { id: "sap-green", name: "Sap Green", pigment: "PG7+PY", hex: "#5c7b2c" },
  { id: "hookers-green", name: "Hooker's Green", pigment: "PG36+PY", hex: "#3f6c36" },
  { id: "burnt-sienna", name: "Burnt Sienna", pigment: "PBr7", hex: "#8b4a2b" },
  { id: "burnt-umber", name: "Burnt Umber", pigment: "PBr7", hex: "#5b3b29" },
  { id: "raw-umber", name: "Raw Umber", pigment: "PBr7", hex: "#6b5b3b" },
  { id: "van-dyke-brown", name: "Van Dyke Brown", pigment: "NBr8", hex: "#4a3627" },
  { id: "sepia", name: "Sepia", pigment: "PBr7+PBk", hex: "#3f3329" },
  { id: "paynes-gray", name: "Payne's Gray", pigment: "PB29+PBk", hex: "#3d4657" },
  { id: "neutral-tint", name: "Neutral Tint", pigment: "PBk6+PV19", hex: "#45414a" },
  { id: "ivory-black", name: "Ivory Black", pigment: "PBk9", hex: "#222222" },
  { id: "chinese-white", name: "Chinese White", pigment: "PW4", hex: "#f2f1ec" },
];

export const STARTER_PALETTE = [
  "hansa-yellow",
  "yellow-ochre",
  "pyrrol-scarlet",
  "quinacridone-rose",
  "burnt-sienna",
  "burnt-umber",
  "ultramarine",
  "phthalo-blue",
  "cerulean",
  "phthalo-green",
  "sap-green",
  "paynes-gray",
];

export const paintById = new Map(PAINTS.map((p) => [p.id, p]));
