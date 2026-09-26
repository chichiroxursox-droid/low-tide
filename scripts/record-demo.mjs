// Records the demo path on prod as a backup video. Uses the globally installed Playwright.
// Run: node scripts/record-demo.mjs [url] [outDir]  then convert the .webm with ffmpeg (see README).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const { chromium } = createRequire(execSync("npm root -g").toString().trim() + "/")("playwright");
const [url = "https://low-tide-nine.vercel.app", outDir = "."] = process.argv.slice(2);
const LIVE = "Eco-friendly cleaner in a bottle made from recycled materials";
const size = { width: 1280, height: 800 };

// New headless mode: the old headless shell left unpainted tiles in the video after scrolling.
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: outDir, size } });
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// A caption bar stands in for narration, since a headless recording has no voice or cursor.
async function caption(text) {
  await page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.style.cssText =
        "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:860px;padding:14px 22px;border-radius:10px;background:#12343b;color:#e7ece8;font:600 20px/1.4 system-ui,sans-serif;text-align:center;z-index:99;box-shadow:0 6px 24px rgba(18,52,59,.35)";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}
// After each smooth scroll, a 1px nudge forces a fresh frame so no half-painted tile sticks in the video.
const settle = async () => {
  await wait(900);
  await page.evaluate(() => window.scrollBy(0, 1));
};
const scrollTo = async (locator) => {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await settle();
};
const top = async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await settle();
};

await page.goto(url);
await page.getByRole("heading", { name: "Low Tide" }).waitFor();
await caption("Low Tide checks green marketing claims against the FTC Green Guides.");
await wait(4500);

await caption("Sample 1: “Biodegradable plastic bag”");
await page.getByRole("button", { name: "Biodegradable plastic bag" }).click();
await page.getByText("Needs qualification").first().waitFor();
await wait(1500);
await scrollTo(page.locator("mark").first());
await caption("Needs qualification. The exact 260.8 passage is highlighted, checked word for word.");
await wait(6500);

await top();
await caption("Sample 2: “Carbon neutral shipping”");
await page.getByRole("button", { name: "Carbon neutral shipping" }).click();
await page.getByText("260.5").first().waitFor();
await wait(1500);
await scrollTo(page.locator("mark").first());
await caption("Gemini points to 260.5, the carbon offsets section, and quotes it.");
await wait(6000);

await top();
await caption("Sample 3: “Made with ocean plastic”");
await page.getByRole("button", { name: "Made with ocean plastic" }).click();
await page.getByText("Not covered by the Guides").waitFor();
await wait(1500);
await scrollTo(page.getByText("Not covered by the Guides"));
await caption("The Guides never mention ocean plastic, so Low Tide says so instead of forcing a rule to fit.");
await wait(7000);

await top();
await caption("Now a live claim copied off a real package, checked by Gemini 2.5 Flash.");
await page.getByLabel("Green claim").fill("");
await page.getByLabel("Green claim").pressSequentially(LIVE, { delay: 45 });
await page.getByRole("button", { name: "Check claim" }).click();
await page.getByText("Checked live by").waitFor({ timeout: 30000 });
await wait(1500);
await scrollTo(page.locator("article").first());
await caption("Two phrases found: “Eco-friendly” (260.4) and “recycled materials” (260.13).");
await wait(6000);
await scrollTo(page.locator("article").nth(1));
await wait(4000);

await scrollTo(page.locator("article").first());
await caption("Tamper test: change one word in a real quote and send it back through the check.");
await wait(3500);
await page.getByRole("button", { name: "Tamper test: change one word" }).first().click();
await page.getByText(/finding removed/).waitFor();
await scrollTo(page.getByText(/finding removed/));
await caption("One word off and the finding is removed. No verified quote, no verdict.");
await wait(7000);

await scrollTo(page.locator("footer"));
await caption("A reading of the Green Guides, not legal advice. Built with Gemini 2.5 Flash.");
await wait(4500);

const video = page.video();
await context.close();
console.log(await video.path());
await browser.close();
