import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  htmlToText, isSafeUrl, parseBrandInput, readPage, guardChecks, verdictFor, namesBrand, hostNamesBrand, CHECKS,
  type Picked, type SourcePage, type CheckKey, type CheckResult, type Mark,
} from "./brand.ts";
import { verifyQuote, BANNED } from "./guard.ts";

test("namesBrand finds the brand as whole words, however the page spells the punctuation", () => {
  assert.equal(namesBrand("Shop the new line at H&M's flagship", "H&M"), true);
  assert.equal(namesBrand("H & M Group annual report", "H&M"), true);
  assert.equal(namesBrand("Which brands are B Corps: H&M & Zara", "h&m"), true);
  assert.equal(namesBrand("Patagonia's mission statement", "Patagonia"), true);
  assert.equal(namesBrand("Nestlé said on Monday", "Nestle"), true);
  assert.equal(namesBrand("L'Oréal Group reported its emissions", "L'Oreal"), true);
  assert.equal(namesBrand("L'Oreal reported its emissions", "L'Oréal"), true);
  assert.equal(namesBrand("Hermès published a climate report", "Hermes"), true);
  assert.equal(namesBrand("The North Face jacket", "North Face"), true);
  assert.equal(namesBrand("Patagonia Inc. reported", "Patagonia, Inc."), true);
  assert.equal(namesBrand("L.L.Bean boots", "L.L.Bean"), true);
  assert.equal(namesBrand("SEC charges QZ Asset Management with misleading claims", "Zqxv Widget Company"), false);
  assert.equal(namesBrand("an ohm meter reading", "HM"), false);
});

const page = (id: string, host: string, text: string): SourcePage => ({
  id,
  url: `https://${host}/${id}`,
  host,
  text: `Intro text here. ${text}. Closing text here.`,
});

test("htmlToText drops scripts, styles, nav, footer and comments, and decodes entities", () => {
  const html = `<html><head><style>p { color: red }</style><script>var hidden = "do not show this";</script></head>
<body><nav>Menu Shop Stories</nav><!-- a comment --><p>We&rsquo;re cutting   emissions &amp; waste</p>
<p>across&nbsp;every store we run, starting this year &#8212; and &#x2019;next&#x2019;.</p><footer>Footer links</footer></body></html>`;
  const text = htmlToText(html);
  for (const gone of ["do not show", "Menu Shop", "a comment", "Footer links", "color: red", "<p>"]) {
    assert.ok(!text.includes(gone), gone);
  }
  assert.ok(text.includes("—"));
  assert.equal(verifyQuote("We’re cutting emissions & waste across every store we run, starting this year", text), true);
});

test("htmlToText stays fast on hostile HTML with unclosed tags and comments", () => {
  const start = performance.now();
  for (const hostile of ["<".repeat(60_000), "<nav x".repeat(20_000), "<!--".repeat(25_000)]) htmlToText(hostile);
  assert.ok(performance.now() - start < 500, `took ${Math.round(performance.now() - start)} ms`);
  assert.equal(htmlToText("<p>Kept text</p><script>var unclosed = 1"), "Kept text");
});

const CERT = "The company has been a certified B Corporation since 2011 and was recertified with a score of 151.4 this year";
const CLIMATE = "The brand publishes its full scope 1, 2 and 3 greenhouse gas emissions every year in its impact report";
const RATING = "Our rating for the brand is Good, based on its use of lower impact materials and its supplier code of conduct";
const LOW = "Our rating for the brand is Not Good Enough because it discloses almost nothing about its supply chain emissions";
const WATCH = "The consumer authority found the sustainability claims on its website were vague and could mislead shoppers";
const LEGAL = "The company settled a lawsuit over how it marketed recycled materials in its outdoor clothing line";

const PAGES = [
  page("S1", "brand.example", `${CERT}. ${CLIMATE}. ${LOW}`), // the brand's own site
  page("S2", "bcorp.example", CERT),
  page("S3", "rater.example", `${RATING}. ${LOW}`),
  page("S4", "regulator.example", WATCH),
  page("S5", "shop.brand.example", RATING), // the brand's shop, a subdomain of its site
  page("S6", "law.example", LEGAL),
];
type Raw = Picked["checks"][number]["findings"][number];
const f = (sign: Raw["sign"], sourceId: string, quote: string, note = "A plain note."): Raw => ({ sign, sourceId, quote, note });
const pick = (checks: Partial<Record<CheckKey, Raw[]>>): Picked => ({
  checks: Object.entries(checks).map(([check, findings]) => ({ check: check as CheckKey, findings: findings! })),
});
const guard = (checks: Partial<Record<CheckKey, Raw[]>>) => guardChecks(pick(checks), PAGES, "Brand");
const marks = (r: { checks: CheckResult[] }) => Object.fromEntries(r.checks.map((c) => [c.check, c.mark]));

test("hostNamesBrand counts a site as the brand's own when its address names the brand", () => {
  assert.equal(hostNamesBrand("hmgroup.com", "H&M"), true);
  assert.equal(hostNamesBrand("www2.hm.com", "H&M"), true);
  assert.equal(hostNamesBrand("chmod.com", "H&M"), false);
  assert.equal(hostNamesBrand("patagoniaworks.com", "Patagonia"), true);
  assert.equal(hostNamesBrand("bettertrail.com", "Patagonia"), false);
  assert.equal(hostNamesBrand("directory.goodonyou.eco", "Patagonia"), false);
  assert.equal(hostNamesBrand("thenorthface.com", "North Face"), true);
  assert.equal(hostNamesBrand("allbirds.com.kw", "Allbirds"), true);
  assert.equal(hostNamesBrand("llbean.com", "L.L.Bean"), true);
});

test("guardChecks keeps verified findings and marks every check, in order", () => {
  const r = guard({
    certifications: [f("good", "S2", CERT)],
    climate: [f("good", "S1", CLIMATE)],
    ratings: [f("good", "S3", RATING), f("red", "S3", LOW)],
    watchdogs: [f("red", "S4", WATCH)],
  });
  assert.deepEqual(r.checks.map((c) => c.check), [...CHECKS]);
  assert.deepEqual(marks(r), { certifications: "good", climate: "good", ratings: "both", watchdogs: "red" });
  assert.deepEqual(r.removed, { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 });
  assert.equal(r.checks[1].signals[0].own, true);
  assert.equal(r.checks[0].signals[0].own, false);
  assert.equal(r.checks[0].signals[0].url, "https://bcorp.example/S2");
});

test("a check with no surviving quote is not found", () => {
  const r = guard({ certifications: [f("good", "S2", CERT.replace("151.4", "160"))] });
  assert.deepEqual(marks(r), { certifications: "not_found", climate: "not_found", ratings: "not_found", watchdogs: "not_found" });
  assert.equal(r.removed.mismatch, 1);
});

test("certifications only count for the brand, watchdog findings only against it", () => {
  const r = guard({ certifications: [f("red", "S2", CERT)], watchdogs: [f("good", "S4", WATCH)] });
  assert.equal(marks(r).certifications, "not_found");
  assert.equal(marks(r).watchdogs, "not_found");
  assert.equal(r.removed.offCheck, 2);
});

test("the brand can't vouch for its own certification or rating, subdomains included", () => {
  const r = guard({ certifications: [f("good", "S1", CERT)], ratings: [f("good", "S5", RATING)] });
  assert.equal(marks(r).certifications, "not_found");
  assert.equal(marks(r).ratings, "not_found");
  assert.equal(r.removed.wrongSite, 2);
});

test("the brand's own site can back climate action and can show a red rating", () => {
  const r = guard({ climate: [f("good", "S1", CLIMATE)], ratings: [f("red", "S1", LOW)] });
  assert.equal(marks(r).climate, "good");
  assert.equal(marks(r).ratings, "red");
  assert.equal(r.checks[2].signals[0].own, true);
  assert.equal(r.removed.wrongSite, 0);
});

test("missing source ids and banned words are dropped", () => {
  const r = guard({ watchdogs: [f("red", "S9", WATCH), f("red", "S6", LEGAL)] });
  assert.equal(marks(r).watchdogs, "not_found");
  assert.deepEqual(r.removed, { mismatch: 1, offCheck: 0, wrongSite: 0, banned: 1 });
});

test("sloppy source ids still match", () => {
  const r = guard({ certifications: [f("good", " S2 ", CERT)], climate: [f("good", "[S1]", CLIMATE)] });
  assert.equal(marks(r).certifications, "good");
  assert.equal(marks(r).climate, "good");
  assert.equal(r.checks[1].signals[0].own, true);
});

test("at most 2 findings per check, first entry wins for a repeated check, notes softened", () => {
  const picked: Picked = {
    checks: [
      { check: "ratings", findings: [f("good", "S3", RATING, "This is illegal."), f("good", "S3", RATING), f("red", "S3", LOW)] },
      { check: "ratings", findings: [f("red", "S3", LOW)] },
    ],
  };
  const r = guardChecks(picked, PAGES, "Brand");
  assert.equal(r.checks[2].signals.length, 2);
  assert.equal(marks(r).ratings, "good");
  assert.equal(BANNED.test(r.checks[2].signals[0].note), false);
});

const mk = (...ms: Mark[]): CheckResult[] => ms.map((mark, i) => ({ check: CHECKS[i], mark, signals: [] }));

test("verdictFor follows the rule on every branch", () => {
  const v = (...ms: Mark[]) => verdictFor(mk(...ms)).verdict;
  assert.equal(v("good", "not_found", "not_found", "not_found"), "not_enough");
  assert.equal(v("not_found", "not_found", "not_found", "not_found"), "not_enough");
  assert.equal(v("good", "good", "good", "not_found"), "strong");
  assert.equal(v("good", "good", "good", "both"), "mixed");
  assert.equal(v("good", "good", "red", "not_found"), "mixed");
  assert.equal(v("good", "good", "not_found", "not_found"), "mixed");
  assert.equal(v("both", "good", "not_found", "not_found"), "mixed");
  assert.equal(v("good", "red", "not_found", "not_found"), "red_flags");
  assert.equal(v("red", "red", "not_found", "not_found"), "red_flags");
  assert.deepEqual(verdictFor(mk("good", "good", "red", "both")), { verdict: "mixed", good: 2, red: 1 });
});

test("isSafeUrl allows public web pages and refuses everything else", () => {
  assert.equal(isSafeUrl("https://example.com/x")?.href, "https://example.com/x");
  assert.equal(isSafeUrl("patagonia.com/sustainability")?.href, "https://patagonia.com/sustainability");
  for (const bad of [
    "http://127.0.0.1",
    "http://localhost:3000",
    "file:///etc/passwd",
    "ftp://x.com",
    "http://[::1]/",
    "http://2130706433/",
    "https://printer.local",
    "http://metadata.google.internal",
    "http://localhost./",
    "http://%6c%6fcalhost./",
    "http://metadata.google.internal./",
    "http://printer.local./",
    "http://localhost.localdomain/",
    "Patagonia",
  ]) {
    assert.equal(isSafeUrl(bad), null, bad);
  }
});

test("parseBrandInput tells brand names from links", () => {
  assert.deepEqual(parseBrandInput("H&M"), { name: "H&M" });
  assert.deepEqual(parseBrandInput("  Patagonia: Worn Wear "), { name: "Patagonia: Worn Wear" });
  assert.deepEqual(parseBrandInput("L.L.Bean"), { name: "L.L.Bean" });
  assert.deepEqual(parseBrandInput("J.Crew"), { name: "J.Crew" });
  assert.equal(parseBrandInput("patagonia.com/sustainability")?.url?.href, "https://patagonia.com/sustainability");
  const link = parseBrandInput("www.patagonia.com/our-footprint")!;
  assert.equal(link.name, "patagonia.com");
  assert.equal(link.url?.href, "https://www.patagonia.com/our-footprint");
  assert.equal(parseBrandInput("http://127.0.0.1/admin"), null);
});

test("readPage reads HTML in its declared charset, follows redirects, and skips PDFs, errors, thin and huge pages", async () => {
  const body = `<p>${"Real sentence about recycled fabric in our jackets. ".repeat(20)}</p>`;
  const cp1252 = Buffer.from(`<p>${"We\x92re cutting emissions across every store we run, starting this year. ".repeat(10)}</p>`, "latin1");
  const server = http.createServer((req, res) => {
    if (req.url === "/page") res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
    else if (req.url === "/cp1252") res.writeHead(200, { "content-type": 'text/html; charset="windows-1252"' }).end(cp1252);
    else if (req.url === "/moved") res.writeHead(302, { location: "/page" }).end();
    else if (req.url === "/report.pdf") res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.4 ".repeat(200));
    else if (req.url === "/thin") res.writeHead(200, { "content-type": "text/html" }).end("<p>Too short.</p>");
    else if (req.url === "/huge") res.writeHead(200, { "content-type": "text/html" }).end(`<p>${"word ".repeat(1_000_000)}</p>`);
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const ok = await readPage(`${base}/page`);
    assert.ok(ok?.text.includes("recycled fabric"));
    assert.equal(ok?.host, "127.0.0.1");
    assert.equal((await readPage(`${base}/moved`))?.url, `${base}/page`);
    const legacy = await readPage(`${base}/cp1252`);
    assert.equal(verifyQuote("We’re cutting emissions across every store we run, starting this year", legacy?.text ?? ""), true);
    assert.equal(await readPage(`${base}/report.pdf`), null);
    assert.equal(await readPage(`${base}/thin`), null);
    assert.equal(await readPage(`${base}/missing`), null);
    const huge = await readPage(`${base}/huge`);
    assert.ok(huge && huge.text.length <= 20_000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
