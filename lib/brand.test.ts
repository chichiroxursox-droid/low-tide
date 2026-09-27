import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  htmlToText, isSafeUrl, parseBrandInput, readPage, guardChecks, verdictFor, namesBrand, hostNamesBrand, ruleName, sourceTier, CHECKS,
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
  assert.equal(namesBrand("Levi Strauss set a science based target", "Levi Strauss & Co."), true);
  assert.equal(namesBrand("An op-ed on packaging", "Co-op"), false);
  assert.equal(namesBrand("Marks and Spencer set a target", "Marks & Spencer"), true);
  assert.equal(namesBrand("Ben and Jerry's said on Monday", "Ben & Jerry's"), true);
  // A link's name is squashed ("hm", "thenorthface"); the page spells it with spaces.
  assert.equal(namesBrand("H&M reported its emissions", "hm"), true);
  assert.equal(namesBrand("The North Face jacket", "thenorthface"), true);
  assert.equal(namesBrand("Ben & Jerry's ice cream", "benjerry"), true);
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
const LABOR = "An investigation found workers at two of its supplier factories were paid below the minimum wage for months";
const FAIR = "The brand is an accredited member of the Fair Labor Association, which audits the factories that make its products";

const PAGES = [
  page("S1", "brand.example", `${CERT}. ${CLIMATE}. ${LOW}. ${FAIR}`), // the brand's own site
  page("S2", "bcorp.example", CERT),
  page("S3", "rater.example", `${RATING}. ${LOW}`),
  page("S4", "regulator.example", WATCH),
  page("S5", "shop.brand.example", RATING), // the brand's shop, a subdomain of its site
  page("S6", "law.example", LEGAL),
  page("S7", "reuters.com", `${LABOR}. ${WATCH}`), // a known source
  page("S8", "blog.example", `${FAIR}. ${RATING}`), // a lesser-known site
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
  assert.equal(hostNamesBrand("sustainability.aboutamazon.com", "Amazon"), true);
  assert.equal(hostNamesBrand("hmrc.gov.uk", "H&M"), false);
  assert.equal(hostNamesBrand("msci.com", "M&S"), false);
  assert.equal(hostNamesBrand("sciencebasedtargets.org", "Target"), false);
  assert.equal(hostNamesBrand("stanford.edu", "Ford"), false);
  assert.equal(hostNamesBrand("levi.com", "Levi's"), true);
  assert.equal(hostNamesBrand("benjerry.com", "Ben & Jerry's"), true);
  assert.equal(hostNamesBrand("marksandspencer.com", "Marks & Spencer"), true);
  assert.equal(hostNamesBrand("handmade.com", "H&M"), false);
  assert.equal(hostNamesBrand("coop.co.uk", "Co-op"), true);
  assert.equal(hostNamesBrand("openai.com", "Co-op"), false);
});

test("guardChecks keeps verified findings and marks every check, in order", () => {
  const r = guard({
    certifications: [f("good", "S2", CERT)],
    climate: [f("good", "S1", CLIMATE)],
    ratings: [f("good", "S3", RATING), f("red", "S3", LOW)],
    watchdogs: [f("red", "S4", WATCH)],
  });
  assert.deepEqual(r.checks.map((c) => c.check), [...CHECKS]);
  assert.deepEqual(marks(r), { certifications: "good", climate: "good", labor: "not_found", ratings: "both", watchdogs: "red" });
  assert.deepEqual(r.removed, { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 });
  assert.equal(r.checks[1].signals[0].own, true);
  assert.equal(r.checks[0].signals[0].own, false);
  assert.equal(r.checks[0].signals[0].url, "https://bcorp.example/S2");
});

test("a check with no surviving quote is not found", () => {
  const r = guard({ certifications: [f("good", "S2", CERT.replace("151.4", "160"))] });
  assert.deepEqual(marks(r), { certifications: "not_found", climate: "not_found", labor: "not_found", ratings: "not_found", watchdogs: "not_found" });
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
  assert.equal(r.checks[3].signals[0].own, true);
  assert.equal(r.removed.wrongSite, 0);
});

test("missing source ids and banned words are dropped", () => {
  const r = guard({ watchdogs: [f("red", "S9", WATCH), f("red", "S6", LEGAL)] });
  assert.equal(marks(r).watchdogs, "not_found");
  assert.deepEqual(r.removed, { mismatch: 1, offCheck: 0, wrongSite: 0, banned: 1 });
  const host = guardChecks(pick({ watchdogs: [f("red", "S1", WATCH)] }), [page("S1", "aboutlawsuits.com", WATCH)], "Brand");
  assert.equal(marks(host).watchdogs, "not_found");
  assert.equal(host.removed.banned, 1);
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
  assert.equal(r.checks[3].signals.length, 2);
  assert.equal(marks(r).ratings, "good");
  assert.equal(BANNED.test(r.checks[3].signals[0].note), false);
});

test("labor can go either way, but the brand can't vouch for its own factories", () => {
  const r = guard({ labor: [f("good", "S1", FAIR), f("red", "S7", LABOR)] });
  assert.equal(marks(r).labor, "red");
  assert.equal(r.removed.wrongSite, 1);
  assert.equal(marks(guard({ labor: [f("good", "S8", FAIR)] })).labor, "good");
});

test("known sources come first: a lesser-known site only speaks for a check nothing better covers", () => {
  const r = guard({
    climate: [f("red", "S3", LOW), f("good", "S1", CLIMATE), f("red", "S7", LABOR)],
    ratings: [f("good", "S8", RATING)],
    watchdogs: [f("red", "S4", WATCH), f("red", "S7", WATCH)],
  });
  const hosts = (i: number) => r.checks[i].signals.map((s) => s.host);
  assert.deepEqual(hosts(1), ["reuters.com", "brand.example"]); // the brand's own site stays next to a known source
  assert.equal(marks(r).climate, "both");
  assert.deepEqual(hosts(3), ["blog.example"]); // nothing better covers ratings
  assert.equal(r.checks[3].signals[0].known, false);
  assert.deepEqual(hosts(4), ["reuters.com"]);
  assert.equal(r.checks[4].signals[0].known, true);
  assert.deepEqual(r.removed, { mismatch: 0, offCheck: 0, wrongSite: 0, banned: 0 });
  // The brand's own findings listed first can't push a known source's red flag out of the two kept.
  const own = guard({ climate: [f("good", "S1", CLIMATE), f("good", "S1", CLIMATE), f("red", "S7", LABOR)] });
  assert.equal(marks(own).climate, "both");
  assert.equal(own.checks[1].signals[0].host, "reuters.com");
});

test("sourceTier knows established publishers and official sites, and never reads junk", () => {
  for (const h of ["reuters.com", "news.bbc.co.uk", "directory.goodonyou.eco", "ftc.gov", "gov.uk", "hmrc.gov.uk",
    "economie.gouv.fr", "ec.europa.eu", "harvard.edu", "ox.ac.uk", "forbrukertilsynet.no", "business-humanrights.org"]) {
    assert.equal(sourceTier(h), "known", h);
  }
  for (const h of ["bettertrail.com", "giveactions.com", "tabithawhiting.com", "notreuters.com", "reuters.com.evil.io",
    "microsoft.com", "en.wikipedia.org", "gov.example.com", "evil-gov.uk"]) {
    assert.equal(sourceTier(h), "other", h);
  }
  for (const h of ["reddit.com", "old.reddit.com", "someone.wordpress.com", "amazon.com", "studocu.com"]) {
    assert.equal(sourceTier(h), "junk", h);
  }
});

const mk = (...ms: Mark[]): CheckResult[] => ms.map((mark, i) => ({ check: CHECKS[i], mark, signals: [] }));

test("verdictFor follows the rule on every branch", () => {
  const v = (...ms: Mark[]) => verdictFor(mk(...ms)).verdict;
  assert.equal(v("good", "not_found", "not_found", "not_found", "not_found"), "not_enough");
  assert.equal(v("not_found", "not_found", "not_found", "not_found", "not_found"), "not_enough");
  assert.equal(v("good", "good", "good", "not_found", "not_found"), "strong");
  assert.equal(v("good", "good", "good", "both", "not_found"), "mixed");
  assert.equal(v("good", "good", "red", "good", "not_found"), "mixed"); // a labor red flag counts like any other
  assert.equal(v("good", "good", "not_found", "not_found", "not_found"), "mixed");
  assert.equal(v("both", "good", "not_found", "not_found", "not_found"), "mixed");
  assert.equal(v("good", "red", "not_found", "not_found", "not_found"), "red_flags");
  assert.equal(v("red", "red", "not_found", "good", "not_found"), "red_flags");
  assert.deepEqual(verdictFor(mk("good", "good", "red", "both", "not_found")), { verdict: "mixed", good: 2, red: 1 });
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

test("ruleName names a link or a bare domain by the label its site is registered under", () => {
  const name = (s: string) => ruleName(parseBrandInput(s)!);
  assert.equal(name("https://www2.hm.com/en_us/index.html"), "hm");
  assert.equal(name("https://eu.patagonia.com/gb/en/home/"), "patagonia");
  assert.equal(name("https://corporate.walmart.com/purpose/sustainability"), "walmart");
  assert.equal(name("www.coop.co.uk/environment"), "coop");
  assert.equal(name("https://allbirds.com.kw/"), "allbirds");
  assert.equal(name("patagonia.com"), "patagonia");
  assert.equal(name("L.L.Bean"), "L.L.Bean");
  assert.equal(name("J.Crew"), "J.Crew");
  assert.equal(name("H&M"), "H&M");
  assert.equal(namesBrand("Patagonia is a certified B Corp and has been since 2011", name("patagonia.com")), true);
  // An independent rater whose address starts with the subdomain's word is not the brand's own site.
  const r = guardChecks(pick({ ratings: [f("good", "S1", RATING)] }), [page("S1", "corporateknights.com", RATING)], name("https://corporate.walmart.com/"));
  assert.equal(marks(r).ratings, "good");
  assert.equal(r.removed.wrongSite, 0);
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
