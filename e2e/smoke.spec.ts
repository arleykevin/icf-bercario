import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("a home carrega com o nome do app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Berçário",
  );
});

test("a home não tem violações de acessibilidade (WCAG A/AA)", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
