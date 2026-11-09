import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultFormDefinition, type PublishedForm } from "@/lib/formDefinitions";
import { CheckinCard } from "./CheckinCard";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  published: null as PublishedForm | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({
    select() { return this; },
    eq() { return this; },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    upsert: mocks.upsert,
  }) },
}));
vi.mock("@/hooks/usePublishedInstrument", () => ({
  usePublishedInstrumentState: () => ({ loaded: true, published: mocks.published }),
}));

describe("daily check-in save", () => {
  beforeEach(() => {
    mocks.published = null;
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
  });

  it.each(["response error", "rejected request"])("keeps the selected answers and retries a legacy %s", async failure => {
    if (failure === "response error") mocks.upsert.mockResolvedValueOnce({ error: { code: "42501" } });
    else mocks.upsert.mockRejectedValueOnce(new Error("offline"));
    render(<CheckinCard studentId="student-a" companyId="company-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Bom" }));
    fireEvent.click(screen.getByRole("button", { name: "Moderado" }));
    fireEvent.click(screen.getByRole("button", { name: "Dor 4 de 8" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Suas respostas foram mantidas");
    expect(screen.getByRole("button", { name: "Bom" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Moderado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dor 4 de 8" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Check-in de hoje feito/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(/Check-in de hoje feito/)).toBeInTheDocument();
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]).toEqual(mocks.upsert.mock.calls[1]);
    expect(mocks.upsert.mock.calls[1][0]).toMatchObject({
      student_id: "student-a", company_id: "company-a", sleep_quality: 4, stress: 3, pain: 4,
    });
  });

  it("retries the versioned form with the same definition and draft answers", async () => {
    mocks.published = { id: "form-v1", version: 1, definition: defaultFormDefinition("checkin") };
    mocks.upsert.mockResolvedValueOnce({ error: { code: "42501" } });
    render(<CheckinCard studentId="student-a" companyId="company-a" />);
    const sleep = await screen.findByLabelText(/Como foi seu sono/);
    fireEvent.change(sleep, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/Como esta seu estresse/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Dor percebida agora/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Suas respostas foram mantidas");
    expect(sleep).toHaveValue("4");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(/Check-in de hoje feito/)).toBeInTheDocument();
    expect(mocks.upsert.mock.calls[1]).toEqual(mocks.upsert.mock.calls[0]);
    expect(mocks.upsert.mock.calls[1][0]).toMatchObject({
      form_definition_id: "form-v1", instrument_answers: { sleep_quality: "4", stress: "3", pain: "2" },
    });
  });
});
