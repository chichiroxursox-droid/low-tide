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
      // Room below the footer so it can scroll clear of the caption bar at the end.
      document.body.style.paddingBottom = "200px";
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
// The flag legend repeats verdict labels, so result text is looked up inside the results region only.
const results = page.locator("section[aria-live]");
await caption("Is this brand sustainable, for the planet and for the people who make its products?");
await wait(4000);

await page.getByRole("button", { name: "H&M", exact: true }).click();
const brandHeading = page.getByRole("heading", { name: "Is H&M sustainable?" });
await brandHeading.waitFor();
await results.getByText("Red flags", { exact: true }).waitFor();
await scrollTo(brandHeading);
await caption("H&M is a saved answer. Every quote was checked word for word against its page on Sep 27, 2026.");
await wait(4500);
await caption("Red flags comes from a fixed rule over five checks, not from Gemini’s opinion.");
await wait(4500);
await scrollTo(page.locator("figure", { hasText: "Global Labour Justice" }).first());
await caption("Labor and sourcing: reports of abused garment workers at factories that supply H&M.");
await wait(6000);
await scrollTo(page.locator("figure", { hasText: "Netherlands Authority for Consumers and Markets" }).first());
await caption("The Dutch regulator on H&M’s “Conscious” labels. Known sources come first.");
await wait(6500);

await top();
await caption("Claim mode checks one green claim against the FTC Green Guides.");
await page.getByRole("button", { name: "A claim" }).click();
await wait(1500);
await caption("Sample: “Biodegradable plastic bag”");
await page.getByRole("button", { name: "Biodegradable plastic bag" }).click();
await results.getByText("Needs qualification").first().waitFor();
await wait(1200);
await scrollTo(page.locator("mark").first());
await caption("Needs qualification. The exact 260.8 passage is highlighted, checked word for word.");
await wait(5500);

await top();
await caption("Sample: “Made with ocean plastic”");
await page.getByRole("button", { name: "Made with ocean plastic" }).click();
await results.getByText("Not covered by the Guides").waitFor();
await wait(1200);
await scrollTo(results.getByText("Not covered by the Guides"));
await caption("The Guides never mention ocean plastic, so Low Tide says so instead of forcing a rule to fit.");
await wait(6000);

await caption("Now a claim typed in live, and Gemini 2.5 Flash checks it.");
await top();
await page.getByLabel("Green claim").fill("");
await page.getByLabel("Green claim").pressSequentially(LIVE, { delay: 45 });
await page.getByRole("button", { name: "Check claim" }).click();
await page.getByText("Checked live by").waitFor({ timeout: 30000 });
await wait(1200);
await scrollTo(page.locator("article").first());
await caption("A live answer. Every quote shown passed the word for word check against the Guides.");
await wait(5500);

const tamperBtn = page.getByRole("button", { name: "Tamper test: change one word" }).first();
await scrollTo(tamperBtn);
await caption("Tamper test: change one word in a real quote and send it back through the check.");
await wait(3500);
await tamperBtn.click();
await page.getByText("1 finding removed").waitFor();
// Show the pulled row itself: flag lowered, the swapped word struck through.
await scrollTo(results.getByText("Finding removed: this quote no longer"));
await caption("One word off and the finding is removed. No verified quote, no verdict.");
await wait(6500);

await scrollTo(page.locator("footer"));
await caption("A reading of the Green Guides, not legal advice. Built with Gemini 2.5 Flash.");
await wait(4500);

const video = page.video();
await context.close();
console.log(await video.path());
await browser.close();
