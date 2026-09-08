const MAX_POSTS = 250;
const MAX_SLIDES_PER_POST = 20;
const SAFE_POST_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SAFE_SLIDE_PATH = /^posts\/([a-z0-9][a-z0-9-]{0,127})\/slide_([1-9]\d{0,2})\.(png|jpe?g|webp)$/;

export interface BnContentPost {
  id: string;
  title: string;
  aesthetic?: string;
  date?: string;
  status?: string;
  slides: string[];
  caption?: string;
}

function isBnContentPost(value: unknown): value is BnContentPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<BnContentPost>;
  if (typeof post.id !== "string" || !SAFE_POST_ID.test(post.id)) return false;
  return typeof post.title === "string"
    && Array.isArray(post.slides)
    && post.slides.length > 0
    && post.slides.length <= MAX_SLIDES_PER_POST
    && post.slides.every((slide) => {
      if (typeof slide !== "string") return false;
      const match = SAFE_SLIDE_PATH.exec(slide);
      return match?.[1] === post.id;
    });
}

export function parseBnContentManifest(raw: string): BnContentPost[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("O manifesto do BN Content não é uma lista.");
  if (parsed.length > MAX_POSTS) throw new Error("O manifesto do BN Content excede o limite seguro.");
  const posts = parsed.filter(isBnContentPost);
  if (posts.length !== parsed.length) throw new Error("O manifesto do BN Content contém itens inválidos.");
  return posts;
}
