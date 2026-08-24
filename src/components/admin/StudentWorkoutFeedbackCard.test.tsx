import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentWorkoutFeedbackCard } from "./StudentWorkoutFeedbackCard";

const { rpc, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({
              data: [
                {
                  id: "feedback-1",
                  created_at: "2026-08-20T10:00:00Z",
                  workout_title: "Treino A",
                  notes: "Percepção: Difícil\nSenti o ombro.",
                  trainer_reply: null,
                  trainer_replied_at: null,
                  trainer_reply_author_name: null,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
    rpc,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

describe("StudentWorkoutFeedbackCard", () => {
  beforeEach(() => {
    rpc.mockReset();
    toast.mockReset();
    rpc.mockResolvedValue({
      data: {
        id: "feedback-1",
        trainer_reply: "Vamos ajustar o ombro no próximo treino.",
        trainer_replied_at: "2026-08-21T10:00:00Z",
        trainer_reply_author_name: "Matheus",
      },
      error: null,
    });
  });

  it("shows recent workout feedback and saves a human inline reply through the RPC", async () => {
    render(<StudentWorkoutFeedbackCard studentId="student-1" />);

    expect(await screen.findByText("Treino A")).toBeInTheDocument();
    expect(screen.getByText("Senti o ombro.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Responder feedback do treino Treino A"), {
      target: { value: "Vamos ajustar o ombro no próximo treino." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Responder ao aluno" }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("reply_to_workout_feedback", {
        _feedback_id: "feedback-1",
        _trainer_reply: "Vamos ajustar o ombro no próximo treino.",
      });
    });
  });
});
