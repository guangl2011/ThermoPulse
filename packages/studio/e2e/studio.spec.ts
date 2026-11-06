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

// Behavior contract, empty state: before any run, the studio offers exactly the
// three contract presets as the entry ramp to a first assessment.
test("empty state offers the three contract presets", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No assessment yet")).toBeVisible();

  const group = page.getByRole("group", { name: "Preset load profiles" });
  await expect(group.getByRole("button", { name: /Training-heavy/ })).toBeVisible();
  await expect(group.getByRole("button", { name: /Inference-serving/ })).toBeVisible();
  await expect(group.getByRole("button", { name: /Mixed/ })).toBeVisible();
  await expect(group.getByRole("button")).toHaveCount(3);
});

// Behavior contract, invalid input: an impossible field value produces a
// visible inline error and disables the run — the shell never crashes, so the
// user can correct the value instead of reloading.
test("invalid input shows an actionable message without crashing", async ({ page }) => {
  await page.goto("/");

  // Zero nominal load is below the studio's validation floor.
  await page.getByLabel(/Nominal campus load/).fill("0");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeDisabled();
  await expect(page.getByText("Fix the highlighted fields to run the simulation.")).toBeVisible();

  // The shell is intact: heading, forms, and presets all still render.
  await expect(page.getByRole("heading", { name: "ThermoPulse-AI Studio" })).toBeVisible();
  await expect(page.getByText("No assessment yet")).toBeVisible();
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

// Behavior contract, export on a FAIL run: zeroing the storage fields yields
// the unbuffered baseline, the scorecard records overall FAIL, and the export
// still completes with the failure recorded — a failing assessment must
// produce the same complete onboarding artifact.
test("export completes on a FAIL run", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel(/Storage power/).fill("0");
  await page.getByLabel(/Storage energy/).fill("0");
  await page.getByRole("button", { name: "Run simulation" }).click();

  const results = page.getByTestId("results-body");
  await expect(results).toBeVisible();
  await expect(
    results.locator(".tp-scorecard, [data-testid=results-body]").getByText("FAIL").first(),
  ).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export system spec (Markdown)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^thermopulse-system-spec-.*\.md$/);

  const fs = await import("node:fs");
  const content = fs.readFileSync(await download.path(), "utf8");
  expect(content).toContain("## Compliance scorecard");
  expect(content).toMatch(/\| \*\*Overall\*\* \| \*\*FAIL\*\* \|/);
  expect(content).toContain("## Plant configuration");
});
