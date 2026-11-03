import { expect, it } from 'vitest';
import { classifyExerciseMediaUrl as classify } from './exerciseMediaSource';
it('rejects unsafe schemes and never embeds a spoofed provider', () => {
 expect(classify('javascript:alert(1)').kind).toBe('unavailable');
 expect(classify('http://example.com/a.mp4').kind).toBe('unavailable');
 expect(classify('https://youtube.com.evil.test/watch?v=abcdefghijk').kind).toBe('external');
});
it('preserves signed native files and recognizes provider routes', () => {
 expect(classify('https://example.com/a.mp4?token=abc')).toEqual({kind:'direct',src:'https://example.com/a.mp4?token=abc'});
 expect(classify('https://youtu.be/abcdefghijk').kind).toBe('youtube');
 expect(classify('https://www.youtube.com/shorts/abcdefghijk').kind).toBe('youtube');
 expect(classify('https://vimeo.com/12345').kind).toBe('vimeo');
});

import { vi } from 'vitest';
import { resolveExerciseMedia } from './exerciseMediaSource';
const origin = 'https://synthetic.supabase.co';
const signed = origin+'/storage/v1/object/sign/exercises-videos/company/demo.mp4?token=synthetic';
function storageSetup() {
 const sign = vi.fn().mockResolvedValue({data:{signedUrl:signed},error:null});
 const session = vi.fn().mockResolvedValue({data:{session:{user:{id:'actor'}}}});
 const from = vi.fn(() => ({createSignedUrl:sign}));
 return { client:{auth:{getSession:session},storage:{from}}, sign, session, from,
   context:{storageOrigin:origin,userId:'actor',isCurrent:()=>true} };
}
it('signs private paths and own public Storage URLs without changing visibility', async () => {
 for (const input of [
   {video_path:'company/demo.mp4'},
   {video_url:origin+'/storage/v1/object/public/exercises-videos/company/demo.mp4'},
   {video_url:origin+'/storage/v1/object/sign/exercises-videos/company/demo.mp4?token=old'},
 ]) {
 const {client,context,sign,from} = storageSetup();
 expect(await resolveExerciseMedia(client,input,context)).toBe(signed);
 expect(from).toHaveBeenCalledWith('exercises-videos');
 expect(sign).toHaveBeenCalledWith('company/demo.mp4',300);
 }
});
it('rejects unknown origin, bucket, traversal and unsafe input before signing', async () => {
 for (const input of [
 {video_url:'https://evil.test/storage/v1/object/public/exercises-videos/company/demo.mp4'},
 {video_url:origin+'/storage/v1/object/public/student-files/company/demo.mp4'},
 {video_path:'../private.mp4'}, {video_path:'a/%2e%2e/private.mp4'},
 {video_url:'javascript:alert(1)'}, {video_path:'https://evil.test/demo.mp4'},
 ]) {
 const {client,context,sign} = storageSetup();
 expect(await resolveExerciseMedia(client,input,context)).toBe('');
 expect(sign).not.toHaveBeenCalled();
 }
});
it('denied or changed identity never exposes the signature', async () => {
 const first = storageSetup();
 first.session.mockResolvedValueOnce({data:{session:null}});
 expect(await resolveExerciseMedia(first.client,{video_path:'company/demo.mp4'},first.context)).toBe('');
 expect(first.sign).not.toHaveBeenCalled();
 const next = storageSetup();
 next.session.mockResolvedValueOnce({data:{session:{user:{id:'actor'}}}}).mockResolvedValueOnce({data:{session:{user:{id:'other'}}}});
 expect(await resolveExerciseMedia(next.client,{video_path:'company/demo.mp4'},next.context)).toBe('');
});
it('discards a signing response after scope changes and preserves own-video priority', async () => {
 const {client,context,sign} = storageSetup();
 let current = true;
 let finish!: (value: unknown) => void;
 sign.mockImplementation(() => new Promise(done => {finish=done;}));
 const result = resolveExerciseMedia(client,{video_path:'company/demo.mp4'}, {...context,isCurrent:()=>current});
 await vi.waitFor(() => expect(sign).toHaveBeenCalled());
 current=false; finish({data:{signedUrl:signed},error:null});
 expect(await result).toBe('');
 expect(await resolveExerciseMedia(client,{video_url:'https://example.com/own.webm',youtube_video_id:'abcdefghijk'},context)).toBe('https://example.com/own.webm');
 expect(await resolveExerciseMedia(client,{youtube_video_id:'abcdefghijk'},context)).toContain('watch?v=abcdefghijk');
});
it('never falls back to public storage or YouTube after a denied signature', async () => {
 const {client,context,sign} = storageSetup();
 sign.mockResolvedValue({data:null,error:new Error('synthetic access denied')});
 expect(await resolveExerciseMedia(client,{
   video_path:'company/private.mp4',
   video_url:origin+'/storage/v1/object/public/exercises-videos/company/private.mp4',
   youtube_video_id:'abcdefghijk',
 },context)).toBe('');
 expect(sign).toHaveBeenCalledTimes(1);
});
