import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildYouTubeSearchUrl, type ExerciseVideoModalState } from "@/lib/exerciseVideoPlayer";

interface VideoExercise {
  exercise_id: string;
  exercise_name: string;
  video_path?: string | null;
  video_url?: string | null;
  youtube_video_id?: string | null;
}

export function useExerciseVideo() {
  const [video, setVideo] = useState<ExerciseVideoModalState | null>(null);
  const request = useRef(0);
  const closeVideo = useCallback(() => {
    request.current += 1;
    setVideo(null);
  }, []);
  useEffect(() => () => { request.current += 1; }, []);

  const openVideo = useCallback(async (exercise: VideoExercise) => {
    const ticket = ++request.current;
    const title = exercise.exercise_name;
    if (exercise.video_path) {
      const { data } = supabase.storage.from("exercises-videos").getPublicUrl(exercise.video_path);
      setVideo({ type: "path", value: data.publicUrl, title });
      return;
    }
    if (exercise.video_url || exercise.youtube_video_id) {
      setVideo({ type: "url", value: exercise.video_url || `https://www.youtube.com/watch?v=${exercise.youtube_video_id}`, title });
      return;
    }
    setVideo({ type: "loading", value: "", title });
    const unavailable: ExerciseVideoModalState = { type: "unavailable", value: buildYouTubeSearchUrl(title), title };
    try {
      const { data } = await supabase.functions.invoke("youtube-exercise-video", {
        body: { exercise_id: exercise.exercise_id, name: title },
      });
      // A late lookup must never reopen a dismissed player or replace a newer video.
      if (ticket !== request.current) return;
      setVideo(data?.video_id
        ? { type: "url", value: `https://www.youtube.com/watch?v=${data.video_id}`, title }
        : unavailable);
    } catch {
      if (ticket === request.current) setVideo(unavailable);
    }
  }, []);

  return { video, openVideo, closeVideo };
}
