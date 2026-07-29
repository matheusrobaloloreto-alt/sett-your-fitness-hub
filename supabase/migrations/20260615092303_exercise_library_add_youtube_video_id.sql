-- Cache do vídeo do YouTube resolvido por exercício (fallback enquanto não há vídeo gravado próprio).
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS youtube_video_id text;;
