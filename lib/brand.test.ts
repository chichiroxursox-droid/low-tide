import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { htmlToText, isSafeUrl, parseBrandInput, readPage, guardBrand, type Picked, type SourcePage } from "./brand.ts";
import { verifyQuote } from "./guard.ts";

const CLAIM = "We repair more than 100,000 items a year so our clothes stay in use for as long as possible";
const BACKS = "An independent audit found the repair program kept more garments in use than any other retailer it surveyed";
const PUSH = "Critics say a repair program cannot offset the emissions from making millions of new jackets every single year";
const LEGAL = "The company settled a lawsuit over how it marketed recycled materials in its outdoor clothing line";

const page = (id: string, host: string, text: string): SourcePage => ({
  id,
  url: `https://${host}/${id}`,
  host,
  text: `Intro text here. ${text}. Closing text here.`,
});
const PAGES = [
  page("S1", "brand.example", CLAIM),
  page("S2", "news.example", BACKS),
  page("S3", "ngo.example", PUSH),
  page("S4", "brand.example", BACKS), // the brand's own host, but not listed in ownSites
  page("S5", "law.example", LEGAL),
];
type Claim = Picked["claims"][number];
const pick = (evidence: Claim["evidence"], over: Partial<Claim> = {}, ownSites = ["S1"]): Picked => ({
  ownSites,
  claims: [{ claim: "Repairs keep clothes in use", sourceId: "S1", quote: CLAIM, evidence, ...over }],
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

test("guardBrand keeps a real claim and its real evidence", () => {
  const { claims, removed } = guardBrand(
    pick([
      { stance: "backs", sourceId: "S2", quote: BACKS },
      { stance: "pushes_back", sourceId: "S3", quote: PUSH },
    ]),
    PAGES,
  );
  assert.deepEqual(removed, { mismatch: 0, wrongSite: 0, banned: 0 });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].url, "https://brand.example/S1");
  assert.equal(claims[0].host, "brand.example");
  assert.deepEqual(
    claims[0].evidence.map((e) => [e.stance, e.host]),
    [
      ["backs", "news.example"],
      ["pushes_back", "ngo.example"],
    ],
  );
});

test("guardBrand drops a claim quote with one word changed, evidence and all", () => {
  const { claims, removed } = guardBrand(
    pick([{ stance: "backs", sourceId: "S2", quote: BACKS }], { quote: CLAIM.replace("repair", "recycle") }),
    PAGES,
  );
  assert.equal(claims.length, 0);
  assert.deepEqual(removed, { mismatch: 1, wrongSite: 0, banned: 0 });
});

test("guardBrand drops evidence that cites a source id that doesn't exist", () => {
  const { claims, removed } = guardBrand(pick([{ stance: "backs", sourceId: "S9", quote: BACKS }]), PAGES);
  assert.equal(claims[0].evidence.length, 0);
  assert.equal(removed.mismatch, 1);
});

test("guardBrand drops evidence from the brand's own sites and claims from other sites", () => {
  const own = guardBrand(
    pick([
      { stance: "backs", sourceId: "S1", quote: CLAIM }, // listed in ownSites
      { stance: "backs", sourceId: "S4", quote: BACKS }, // same host as the claim
    ]),
    PAGES,
  );
  assert.equal(own.claims[0].evidence.length, 0);
  assert.equal(own.removed.wrongSite, 2);
  const notTheirs = guardBrand(pick([], { sourceId: "S2", quote: BACKS }), PAGES);
  assert.equal(notTheirs.claims.length, 0);
  assert.equal(notTheirs.removed.wrongSite, 1);
});

test("guardBrand drops quotes that use a banned word", () => {
  const { claims, removed } = guardBrand(pick([{ stance: "pushes_back", sourceId: "S5", quote: LEGAL }]), PAGES);
  assert.equal(claims[0].evidence.length, 0);
  assert.equal(removed.banned, 1);
});

test("guardBrand accepts sloppy source ids", () => {
  const { claims } = guardBrand(
    pick([{ stance: "backs", sourceId: " S2 ", quote: BACKS }], { sourceId: "[S1]" }, ["s1"]),
    PAGES,
  );
  assert.equal(claims.length, 1);
  assert.equal(claims[0].evidence.length, 1);
});

test("guardBrand returns nothing when no source belongs to the brand", () => {
  const { claims, removed } = guardBrand(pick([{ stance: "backs", sourceId: "S2", quote: BACKS }], {}, []), PAGES);
  assert.equal(claims.length, 0);
  assert.equal(removed.wrongSite, 1);
});

test("guardBrand keeps at most 3 claims and 2 evidence items each", () => {
  const ev = [
    { stance: "backs" as const, sourceId: "S2", quote: BACKS },
    { stance: "pushes_back" as const, sourceId: "S3", quote: PUSH },
    { stance: "backs" as const, sourceId: "S2", quote: BACKS },
  ];
  const one = pick(ev).claims[0];
  const { claims } = guardBrand({ ownSites: ["S1"], claims: [one, one, one, one] }, PAGES);
  assert.equal(claims.length, 3);
  assert.equal(claims[0].evidence.length, 2);
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
    "Patagonia",
  ]) {
    assert.equal(isSafeUrl(bad), null, bad);
  }
});

test("parseBrandInput tells brand names from links", () => {
  assert.deepEqual(parseBrandInput("H&M"), { name: "H&M" });
  assert.deepEqual(parseBrandInput("  Patagonia: Worn Wear "), { name: "Patagonia: Worn Wear" });
  const link = parseBrandInput("www.patagonia.com/our-footprint")!;
  assert.equal(link.name, "patagonia.com");
  assert.equal(link.url?.href, "https://www.patagonia.com/our-footprint");
  assert.equal(parseBrandInput("http://127.0.0.1/admin"), null);
});

test("readPage reads HTML, follows redirects, and skips PDFs, errors, thin and huge pages", async () => {
  const body = `<p>${"Real sentence about recycled fabric in our jackets. ".repeat(20)}</p>`;
  const server = http.createServer((req, res) => {
    if (req.url === "/page") res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
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
