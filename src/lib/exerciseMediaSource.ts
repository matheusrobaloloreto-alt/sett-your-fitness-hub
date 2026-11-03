export type ExerciseMediaSource = { kind: 'youtube' | 'vimeo' | 'direct' | 'external'; src: string } | { kind: 'unavailable'; src?: never };
export function classifyExerciseMediaUrl(value: string): ExerciseMediaSource {
 try {
 const u = new URL(value);
 if (u.protocol !== 'https:' || u.username || u.password) return {kind:'unavailable'};
 const host = u.hostname;
 if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be'].includes(host)) {
 const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/')[2];
 return id && /^[\w-]{11}$/.test(id) ? {kind:'youtube',src:'https://www.youtube-nocookie.com/embed/'+id} : {kind:'external',src:u.href};
 }
 if (['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)) {
 const id = u.pathname.split('/').filter(Boolean).at(-1);
 return id && /^\d+$/.test(id) ? {kind:'vimeo',src:'https://player.vimeo.com/video/'+id} : {kind:'external',src:u.href};
 }
 return {kind:/\.(mp4|webm|ogg|mov)$/i.test(u.pathname) || u.pathname.includes('/storage/v1/object/') ? 'direct':'external',src:u.href};
 } catch { return {kind:'unavailable'}; }
}

export interface ExerciseMediaInput {
 video_path?: string | null;
 video_url?: string | null;
 youtube_video_id?: string | null;
}
type MediaClient = {
 auth: { getSession(): Promise<{ data: { session: { user: { id: string } } | null } }> };
 storage: { from(bucket: string): { createSignedUrl(path: string, seconds: number): Promise<{ data: { signedUrl: string } | null; error: unknown }> } };
};
/** Storage authorization stays with authenticated Storage/RLS; never derives public URLs. */
export async function resolveExerciseMedia(
 client: MediaClient, exercise: ExerciseMediaInput,
 context: { storageOrigin: string; userId: string; isCurrent(): boolean },
): Promise<string> {
 const own = exercise.video_path || exercise.video_url || '';
 let path = exercise.video_path || '';
 if (!path && own) {
   try {
     const url = new URL(own);
     if (url.pathname.startsWith('/storage/v1/object/')) {
       if (url.origin !== new URL(context.storageOrigin).origin || url.protocol !== 'https:') return '';
       const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/exercises-videos\/(.+)$/);
       if (!match) return '';
       path = decodeURIComponent(match[1]);
     }
   } catch { return ''; }
 }
 if (!context.isCurrent()) return '';
 if (path) {
   if (path.startsWith('/') || path.includes('\\') || path.includes('://') ||
       path.split('/').some(part => !part || part === '.' || part === '..' || /[%?#]/.test(part))) return '';
   try {
     const before = await client.auth.getSession();
     if (!context.isCurrent() || before.data.session?.user.id !== context.userId) return '';
     const { data, error } = await client.storage.from('exercises-videos').createSignedUrl(path, 300);
     const after = await client.auth.getSession();
     if (!context.isCurrent() || after.data.session?.user.id !== context.userId || error || !data) return '';
     const signed = new URL(data.signedUrl);
     if (signed.origin !== new URL(context.storageOrigin).origin || signed.protocol !== 'https:') return '';
     return classifyExerciseMediaUrl(signed.href).kind === 'direct' ? signed.href : '';
   } catch { return ''; }
 }
 if (own) return classifyExerciseMediaUrl(own).kind !== 'unavailable' ? own : '';
 const id = exercise.youtube_video_id;
 return id && /^[\w-]{11}$/.test(id) ? 'https://www.youtube.com/watch?v='+id : '';
}
