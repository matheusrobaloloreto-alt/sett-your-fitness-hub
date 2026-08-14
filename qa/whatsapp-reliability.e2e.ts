import { expect, test, type Page } from "@playwright/test";

const COMPANY = {
  id: "dad65c62-e700-4ae9-930a-43b18357c171",
  name: "BN Performance Training",
  tier: "advanced",
  slug: null,
};

async function openConversation(page: Page, search: string, expectedName: RegExp) {
  const searchInput = page.getByPlaceholder("Buscar conversa...");
  await searchInput.fill(search);
  const rows = page.getByTestId("whatsapp-chat-row");
  await expect(rows.first()).toBeVisible();
  const target = page.getByRole("button", { name: expectedName }).first();
  await target.click();
  await expect(page.getByTestId("whatsapp-message").first()).toBeVisible();
  return rows;
}

test("audita conversas críticas do WhatsApp sem alterar dados", async ({ page }) => {
  const email = process.env.QA_MASTER_EMAIL;
  const password = process.env.QA_MASTER_PASSWORD;
  if (!email || !password) throw new Error("Defina QA_MASTER_EMAIL e QA_MASTER_PASSWORD");

  await page.goto("/auth");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/master(?:\/|$)/);

  await page.evaluate((company) => {
    localStorage.setItem("master_viewing_company", JSON.stringify(company));
  }, COMPANY);
  await page.goto("/admin/whatsapp-chat");
  await expect(page.getByPlaceholder("Buscar conversa...")).toBeVisible({ timeout: 20_000 });

  const searchInput = page.getByPlaceholder("Buscar conversa...");
  await searchInput.fill("Maria Eduarda Valim");
  const mariaRows = page.getByTestId("whatsapp-chat-row");
  await expect(mariaRows.first()).toBeVisible();
  if (process.env.EXPECT_WHATSAPP_REPAIRED === "1") {
    await expect(mariaRows).toHaveCount(1);
  }

  await openConversation(page, "diely", /Abrir conversa com diely/i);
  const audio = page.locator("audio").first();
  await expect(audio).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => audio.evaluate((element: HTMLAudioElement) => ({
    error: element.error?.code || null,
    readyState: element.readyState,
    src: element.currentSrc,
  }))).toMatchObject({ error: null });

  const audioState = await audio.evaluate((element: HTMLAudioElement) => ({
    error: element.error?.code || null,
    networkState: element.networkState,
    readyState: element.readyState,
    src: element.currentSrc,
  }));
  expect(audioState.src).toContain("whatsapp-media");

  await openConversation(page, "Paula Ramalho Lodi", /Abrir conversa com Paula Ramalho Lodi/i);
  const paulaMessageCount = await page.getByTestId("whatsapp-message").count();
  expect(paulaMessageCount).toBeGreaterThan(0);
  if (process.env.EXPECT_WHATSAPP_REPAIRED === "1") {
    expect(paulaMessageCount).toBeGreaterThan(1);
  }
});
