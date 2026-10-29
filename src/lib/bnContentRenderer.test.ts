import { describe, expect, it,vi } from "vitest";
import { bnRichText, bnSlideDimensions, wrapBnText,renderBnContentSlide } from "./bnContentRenderer";

const context = { font: "", measureText: (text: string) => ({ width: Array.from(text).length * 10 }) } as unknown as CanvasRenderingContext2D;

describe("BN Content cloud renderer", () => {
  it("renders configured brand name, handle and palette without leaking the legacy identity",async()=>{
    const text:string[]=[];const backgrounds:string[]=[];
    const ctx={font:"",fillStyle:"",textBaseline:"",fillText:(value:string)=>text.push(value),fillRect:()=>backgrounds.push(ctx.fillStyle),drawImage:()=>{},measureText:(value:string)=>({width:value.length*10})};
    const canvas=vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const blob=vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation(callback=>callback(new Blob(["synthetic"])));
    const originalImage=globalThis.Image;
    vi.stubGlobal("Image",class{naturalWidth=100;naturalHeight=64;onload=()=>{};set src(_url:string){queueMicrotask(()=>this.onload());}});
    try{
      await renderBnContentSlide({format:"post",aesthetic:"l1_educativo",slides:[{role:"capa",title:"Treino"}]},0,{brand:{name:"Synthetic Studio",handle:"@synthetic",navy:"#123456",ink:"#111111",paper:"#ffffff",sand:"#445566"},logoUrl:null});
      expect(text).toContain("Synthetic Studio");expect(text).toContain("@synthetic");expect(text).not.toContain("BN Performance Training");expect(backgrounds).toContain("#123456");
    }finally{canvas.mockRestore();blob.mockRestore();vi.stubGlobal("Image",originalImage);}
  });
  it("exports fixed Instagram dimensions independently of viewport", () => {
    expect(bnSlideDimensions("carrossel")).toEqual({ width: 1080, height: 1350 });
    expect(bnSlideDimensions("story")).toEqual({ width: 1080, height: 1920 });
    expect(bnSlideDimensions("reels").height).toBe(1920);
  });

  it("preserves rich brand emphasis without interpreting HTML", () => {
    const runs = bnRichText("Treine **bem** com *técnica* e ==constância== <script>");
    expect(runs.find((run) => run.text === "bem")?.bold).toBe(true);
    expect(runs.find((run) => run.text === "técnica")?.italic).toBe(true);
    expect(runs.find((run) => run.text === "constância")?.accent).toBe(true);
    expect(runs.map((run) => run.text).join("")).toContain("<script>");
  });

  it("wraps long words and retains all characters instead of clipping", () => {
    const lines = wrapBnText(context, "Supercalifragilístico", 24, 50);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.reduce((width, run) => width + context.measureText(run.text).width, 0) <= 50)).toBe(true);
    expect(lines.flat().map((run) => run.text).join("")).toBe("Supercalifragilístico");
  });

  it("preserves explicit newlines and bold across wrapped lines", () => {
    const lines = wrapBnText(context, "**ABCDEF**\nFim", 24, 30);
    expect(lines.map((line) => line.map((run) => run.text).join(""))).toEqual(["ABC", "DEF", "Fim"]);
    expect(lines[0].every((run) => run.bold)).toBe(true);
  });
});
