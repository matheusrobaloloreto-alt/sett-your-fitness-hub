import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AssessmentMaterialReceipt } from "./AssessmentMaterialReceipt";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));

it("starts the displayed deadlines only after the chosen receipt date is confirmed by the database", async () => {
  const read = {
    select: () => read,
    eq: () => read,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  mocks.from.mockReturnValue(read);
  mocks.rpc.mockReturnValue({
    single: async () => ({
      data: {
        company_id: "company-a", student_id: "student-a", received_on: "2026-10-30",
        material_reference: "Vídeos enviados pelo WhatsApp",
        assessment_due_on: "2026-11-04", first_prescription_due_on: "2026-11-09",
      },
      error: null,
    }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>
    <AssessmentMaterialReceipt studentId="student-a" companyId="company-a" onboarding />
  </QueryClientProvider>);

  const date = await screen.findByLabelText("Data em que o material completo foi recebido");
  expect(screen.queryByText(/Avaliação até/)).not.toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "Registrar recebimento" });
  expect(submit).toBeDisabled();

  fireEvent.change(date, { target: { value: "2026-10-30" } });
  fireEvent.change(screen.getByLabelText("Referência do envio"), { target: { value: "Vídeos enviados pelo WhatsApp" } });
  fireEvent.click(submit);
  expect(await screen.findByText("Avaliação até 04/11/2026")).toBeInTheDocument();
  expect(screen.getByText("Primeira prescrição até 09/11/2026")).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_assessment_material_receipt", {
    _company_id: "company-a", _student_id: "student-a", _received_on: "2026-10-30",
    _material_reference: "Vídeos enviados pelo WhatsApp",
  });
});
