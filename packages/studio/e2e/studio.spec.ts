import { expect, test } from "@playwright/test";

// Studio smoke: the D2 user-visible contract — a new user goes from the
// preselected preset to a first assessment in one click, and the dashboard
// renders every SimulationResult surface.
test("preset selection through dashboard render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ThermoPulse-AI Studio" })).toBeVisible();
  await expect(page.getByText("No assessment yet")).toBeVisible();

  // One interaction to swap the preset; its values land in both forms.
  await page.getByRole("button", { name: /Inference-serving/ }).click();
  await expect(page.getByLabel(/Nominal campus load/)).toHaveValue("50");

  // Second interaction: run. The default preset is preselected, so a fresh
  // user reaches a first assessment in two clicks total.
  await page.getByRole("button", { name: "Run simulation" }).click();

  const results = page.getByTestId("results-body");
  await expect(results).toBeVisible();
  await expect(results.getByRole("heading", { name: "Compliance scorecard" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "SOFC safety envelope" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Storage shortfalls" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Efficiency" })).toBeVisible();
  await expect(results.locator("svg.tp-chart")).toBeVisible();
  await expect(results.getByText(/Minimum compressor surge margin/)).toBeVisible();
});

// The export is the AIDC onboarding artifact: a complete Markdown system spec
// whose compliance scorecard is present on every run, whatever the verdict.
test("system-spec export contains the compliance scorecard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run simulation" }).click();
  const results = page.getByTestId("results-body");
  await expect(results).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export system spec (Markdown)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^thermopulse-system-spec-.*\.md$/);

  const fs = await import("node:fs");
  const content = fs.readFileSync(await download.path(), "utf8");
  expect(content).toContain("## Compliance scorecard");
  expect(content).toMatch(/\| \*\*Overall\*\* \| \*\*(PASS|MARGINAL|FAIL)\*\* \|/);
  expect(content).toContain("## Plant configuration");
  expect(content).toContain("Combined efficiency");
});
