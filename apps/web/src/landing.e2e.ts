// These browser tests cover the main player flows that should stay solid.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function loginAsGuest(page: Page, displayName: string) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: /choose a display name/i })
    .fill(displayName);
  await page.getByRole("button", { name: /play as guest/i }).click();
  await expect(page).toHaveURL(/\/play$/);
}

test("guest login can start a practice match and send chat", async ({
  page
}) => {
  await loginAsGuest(page, `Practice${Date.now()}`);

  await page.getByRole("button", { name: /start practice match/i }).click();

  await expect(page).toHaveURL(/\/matches\//);
  await expect(
    page.getByRole("heading", { name: /arcade bot/i })
  ).toBeVisible();
  const boardBounds = await page.locator(".pong-board").boundingBox();
  expect(boardBounds?.width ?? 0).toBeGreaterThan(720);
  await page.getByRole("button", { name: /open chat/i }).click();

  await page
    .getByRole("textbox", { name: /say something sportsmanlike/i })
    .fill("gg bot");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("gg bot")).toBeVisible();
});

test("two guest sessions can create and join a private room", async ({
  browser
}) => {
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const guestPage = await guestContext.newPage();

  await loginAsGuest(ownerPage, `Owner${Date.now()}`);
  await loginAsGuest(guestPage, `Guest${Date.now()}`);

  await ownerPage.getByRole("button", { name: /create room/i }).click();
  await expect(ownerPage).toHaveURL(/\/rooms\//);

  const roomUrl = ownerPage.url();
  await guestPage.goto(roomUrl);

  await expect(ownerPage).toHaveURL(/\/matches\//);
  await expect(guestPage).toHaveURL(/\/matches\//);
  await expect(ownerPage.getByRole("heading", { name: /vs/i })).toBeVisible();
  await expect(guestPage.getByRole("heading", { name: /vs/i })).toBeVisible();

  await ownerContext.close();
  await guestContext.close();
});

test("unknown routes show the 404 recovery page", async ({ page }) => {
  await page.goto("/does-not-exist");

  await expect(
    page.getByRole("heading", { name: /not in this arena/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /back home/i })).toHaveAttribute(
    "href",
    "/"
  );
});

test("invalid room codes show a clear error state", async ({ page }) => {
  await loginAsGuest(page, `RoomCheck${Date.now()}`);
  await page.goto("/rooms/NOPE");

  await expect(
    page.getByText(/could not join this private room|room not found/i)
  ).toBeVisible();
});

test("landing page stays usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /play ranked matches/i })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /view leaderboard/i })
  ).toBeVisible();
});
