export type ExerciseVideoModalState = {
  type: "path" | "url" | "loading" | "unavailable";
  value: string;
  title: string;
};

const YOUTUBE_ID_RE = /^[0-9A-Za-z_-]{11}$/;
const YOUTUBE_URL_RE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([0-9A-Za-z_-]{11})/;

export function buildYouTubeSearchUrl(exerciseName: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} execução técnica`)}`;
}

export function youtubeIdFromVideoValue(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;
  const match = trimmed.match(YOUTUBE_URL_RE);
  if (match?.[1]) return match[1];
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get("v");
    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbedUrl(videoId: string) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function vimeoEmbedUrl(value: string) {
  const match = value.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
  return match?.[1] ? `https://player.vimeo.com/video/${match[1]}?autoplay=1&muted=1&loop=1&playsinline=1` : null;
}
