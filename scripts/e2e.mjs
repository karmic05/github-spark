// End-to-end suite: drives real Chrome through the whole journaling workflow.
//   BASE=http://localhost:8080 node scripts/e2e.mjs
// Each test runs in a fresh incognito context (clean localStorage).
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.env.BASE || "http://localhost:8080").replace(/\/$/, "");
const FALLBACK_OK = process.env.ALLOW_FALLBACK === "1"; // skip model-quality asserts if the LLM is off
const TEXTAREA = 'textarea[aria-label="Today\'s entry"]';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const results = [];
const pageErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fresh(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.on("pageerror", (e) => pageErrors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) {
      pageErrors.push(`[console.error] ${m.text().slice(0, 200)}`);
    }
  });
  return { ctx, page };
}

const text = (page) => page.evaluate(() => document.body.innerText);
async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "networkidle0", timeout: 60000 });
}
async function clickText(page, label) {
  const ok = await page.evaluate((label) => {
    const el = [...document.querySelectorAll("button,a")].find((b) => b.innerText.trim().includes(label));
    if (el) el.click();
    return !!el;
  }, label);
  if (!ok) throw new Error(`no button/link with text "${label}"`);
}
async function signup(page, name = "Maya") {
  await go(page, "/");
  await page.type('input[aria-label="Your name"]', name);
  await clickText(page, "Begin");
  await page.waitForFunction(() => location.pathname === "/today", { timeout: 15000 });
  await page.waitForSelector(TEXTAREA, { timeout: 15000 });
}
async function write(page, entry) {
  await page.evaluate((v) => {
    const ta = document.querySelector("textarea");
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(ta, v);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, entry);
  await clickText(page, "Set it down");
  await page.waitForFunction(() => document.body.innerText.includes("emotion fingerprint"), { timeout: 60000 });
}
const stored = (page, id = "maya") =>
  page.evaluate((id) => JSON.parse(localStorage.getItem("throughline.entries." + id) || "[]"), id);
async function seedDemo(page) {
  await go(page, "/timeline");
  await page.waitForFunction(() => document.body.innerText.includes("Load a demo life"), { timeout: 15000 });
  await clickText(page, "Load a demo life");
  await page.waitForFunction(() => /\b(8\d|9\d) entries so far/.test(document.body.innerText), { timeout: 30000 });
}

function test(name, fn) {
  results.push({ name, fn });
}
function assert(c, msg) {
  if (!c) throw new Error(msg);
}

const HAPPY =
  "Best day in months! Went for a long run at sunrise, then had coffee with Dana and we laughed the whole time. I feel so grateful, light and genuinely excited about what's coming.";
const SAD =
  "I barely slept. Missed the deadline and my boss was furious. I feel completely alone and anxious about everything, and I cried in the stairwell.";
const MIXED =
  "Mom's birthday dinner was beautiful and I'm so grateful for her, but afterwards I sat in the car crying because I miss Dad so much.";
const MUNDANE = "Did laundry, answered some emails and made pasta for dinner. Nothing much else happened.";

// ---------- onboarding & navigation ----------
test("01 landing page renders hero, form and how-it-works", async () => {
  const { ctx, page } = await fresh();
  await go(page, "/");
  const t = await text(page);
  assert(/Your life,\s*quietly written/i.test(t), "hero headline missing");
  assert(/How it works/i.test(t) && /The reveal/.test(t), "how-it-works missing");
  assert(await page.$('input[aria-label="Your name"]'), "name input missing");
  await ctx.close();
});
test("02 empty name does not begin", async () => {
  const { ctx, page } = await fresh();
  await go(page, "/");
  await clickText(page, "Begin");
  await sleep(500);
  assert(new URL(page.url()).pathname === "/", "navigated with empty name");
  await ctx.close();
});
test("03 Begin stores a slugified user and opens Today", async () => {
  const { ctx, page } = await fresh();
  await signup(page, "Maya Lopez");
  const u = await page.evaluate(() => JSON.parse(localStorage.getItem("throughline.user")));
  assert(u.id === "maya-lopez" && u.name === "Maya Lopez", "bad user " + JSON.stringify(u));
  await ctx.close();
});
test("04 Enter key begins", async () => {
  const { ctx, page } = await fresh();
  await go(page, "/");
  await page.type('input[aria-label="Your name"]', "Sam");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname === "/today", { timeout: 15000 });
  await ctx.close();
});
test("05 returning user sees Continue; Start fresh resets", async () => {
  const { ctx, page } = await fresh();
  await signup(page, "Ria");
  await go(page, "/");
  await page.waitForFunction(() => document.body.innerText.includes("Continue as Ria"), { timeout: 10000 });
  await clickText(page, "Not you? Start fresh");
  await page.waitForSelector('input[aria-label="Your name"]', { timeout: 5000 });
  assert((await page.evaluate(() => localStorage.getItem("throughline.user"))) === null, "user not cleared");
  await ctx.close();
});
test("06 app routes redirect to landing when signed out", async () => {
  const { ctx, page } = await fresh();
  for (const r of ["/today", "/timeline", "/insights"]) {
    await go(page, r);
    await page.waitForFunction(() => location.pathname === "/", { timeout: 10000 });
  }
  await ctx.close();
});
test("07 bottom nav reaches Today, Timeline and Reveal", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await clickText(page, "Timeline");
  await page.waitForFunction(() => location.pathname === "/timeline");
  await clickText(page, "Reveal");
  await page.waitForFunction(() => location.pathname === "/insights");
  await clickText(page, "Today");
  await page.waitForFunction(() => location.pathname === "/today");
  await ctx.close();
});
test("08 unknown route shows the 404 page", async () => {
  const { ctx, page } = await fresh();
  await go(page, "/definitely-not-a-page");
  assert(/404/.test(await text(page)) && /Page not found/.test(await text(page)), "no 404 page");
  await ctx.close();
});

// ---------- writing & sentiment ----------
test("09 Set it down is disabled for empty/whitespace text", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  const dis = () =>
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Set it down")).disabled);
  assert(await dis(), "enabled when empty");
  await page.type("textarea", "   ");
  assert(await dis(), "enabled for whitespace");
  await page.type("textarea", "hello");
  assert(!(await dis()), "still disabled with text");
  await ctx.close();
});
test("10 first-time user gets the blank-page opener", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await page.waitForFunction(() => document.body.innerText.includes("blank page"), { timeout: 20000 });
  await ctx.close();
});
test("11 happy entry scores clearly positive", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, HAPPY);
  const [e] = await stored(page);
  assert(e.sentiment_score > 0.3, `score ${e.sentiment_score} not positive`);
  assert(["good", "great"].includes(e.sentiment_label), "label " + e.sentiment_label);
  assert(e.emotions.joy + e.emotions.gratitude > e.emotions.sadness + e.emotions.anxiety, "axes not positive-leaning");
  assert(/a (good|bright) day/.test(await text(page)), "result card missing mood text");
  assert(await page.$(".recharts-radar"), "radar missing");
  await page.waitForFunction(() => /1 day/.test(document.body.innerText), { timeout: 10000 });
  await ctx.close();
});
test("12 sad & anxious entry scores clearly negative", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, SAD);
  const [e] = await stored(page);
  assert(e.sentiment_score < -0.3, `score ${e.sentiment_score} not negative`);
  assert(["low", "very_low"].includes(e.sentiment_label), "label " + e.sentiment_label);
  assert(
    e.emotions.anxiety + e.emotions.sadness + e.emotions.loneliness > e.emotions.joy + e.emotions.hope,
    "axes not negative-leaning",
  );
  await ctx.close();
});
test("13 mixed entry registers both warmth and sadness", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, MIXED);
  const [e] = await stored(page);
  if (!FALLBACK_OK) {
    assert(e.emotions.gratitude >= 0.3, "gratitude " + e.emotions.gratitude);
    assert(e.emotions.sadness >= 0.3, "sadness " + e.emotions.sadness);
  }
  await ctx.close();
});
test("14 mundane entry stays near neutral", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, MUNDANE);
  const [e] = await stored(page);
  assert(Math.abs(e.sentiment_score) <= 0.5, "score " + e.sentiment_score);
  await ctx.close();
});
test("15 stored entry has date, text and all 8 axes within 0..1", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, HAPPY);
  const [e] = await stored(page);
  const axes = ["joy", "calm", "hope", "gratitude", "sadness", "anxiety", "anger", "loneliness"];
  assert(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.text === HAPPY, "bad date/text");
  assert(axes.every((a) => typeof e.emotions[a] === "number" && e.emotions[a] >= 0 && e.emotions[a] <= 1), "bad axes");
  assert(e.sentiment_score >= -1 && e.sentiment_score <= 1, "score out of range");
  await ctx.close();
});
const BATTERY = [
  { name: "anger", text: "My roommate ate my food again and lied about it to my face. I'm furious. I slammed the door and could not stop shaking with rage.", axis: "anger", sign: -1 },
  { name: "loneliness", text: "Everyone went out without me again. I ate dinner alone and stared at my phone. Nobody even noticed I was gone.", axis: "loneliness", sign: -1 },
  { name: "anxiety", text: "Big presentation tomorrow and my heart will not stop racing. I keep imagining everything going wrong and I can't sleep.", axis: "anxiety", sign: -1 },
  { name: "gratitude", text: "My neighbor brought soup over when I was sick. I'm so thankful for people who show up like that.", axis: "gratitude", sign: 1 },
  { name: "joy", text: "I got the job!! I was screaming and dancing around the kitchen, I can't stop smiling.", axis: "joy", sign: 1 },
  { name: "grief", text: "Today was the funeral. I cried through the whole thing and I miss him so much it hurts to breathe.", axis: "sadness", sign: -1 },
  { name: "calm", text: "A slow Sunday. Tea by the window, rain on the glass, nowhere to be. Everything felt still and easy.", axis: "calm", sign: 1 },
  { name: "hope", text: "The treatment results were good. For the first time in months I believe things are going to get better.", axis: "hope", sign: 1 },
];
test("16 sentiment battery: 8 differently-toned entries land on the right emotion and side", async () => {
  const failures = [];
  const seen = [];
  for (const c of BATTERY) {
    const { ctx, page } = await fresh();
    await signup(page);
    await write(page, c.text);
    const [e] = await stored(page);
    const top3 = Object.entries(e.emotions).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k);
    seen.push(`${c.name}: score ${e.sentiment_score.toFixed(2)} (${e.sentiment_label}) top ${top3.join("/")}`);
    if (!FALLBACK_OK) {
      if (!top3.includes(c.axis)) failures.push(`${c.name}: expected ${c.axis} in top 3, got ${top3.join("/")}`);
      if (Math.sign(e.sentiment_score) !== c.sign) failures.push(`${c.name}: score ${e.sentiment_score} on the wrong side`);
    }
    await ctx.close();
  }
  console.log("        " + seen.join(String.fromCharCode(10) + "        "));
  assert(failures.length === 0, failures.join("; "));
});
test("17 timeline lists the saved entry and its mood chart", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, SAD);
  await clickText(page, "Timeline");
  await page.waitForFunction(() => document.body.innerText.includes("1 entry so far"), { timeout: 10000 });
  assert((await text(page)).includes("I barely slept"), "entry text missing");
  assert(await page.$(".recharts-area"), "mood chart missing");
  await ctx.close();
});
test("18 expanding a timeline entry shows 8 emotion bars", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, HAPPY);
  await clickText(page, "Timeline");
  await page.waitForFunction(() => document.body.innerText.includes("1 entry so far"));
  await page.evaluate(() =>
    [...document.querySelectorAll("main button")].find((b) => b.innerText.includes("Best day")).click(),
  );
  await page.waitForFunction(() => /how the day felt/i.test(document.body.innerText), { timeout: 5000 });
  const t = await text(page);
  for (const a of ["Joy", "Calm", "Hope", "Gratitude", "Sadness", "Anxiety", "Anger", "Loneliness"]) {
    assert(t.includes(a), "missing axis " + a);
  }
  await ctx.close();
});
test("19 a second note the same day joins the first (not overwritten)", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, MUNDANE);
  await clickText(page, "Add another note");
  await write(page, "Evening update: called Mom and it was lovely.");
  const es = await stored(page);
  assert(es.length === 1, "expected 1 entry, got " + es.length);
  assert(es[0].text.includes("laundry") && es[0].text.includes("called Mom"), "notes not merged");
  await ctx.close();
});
test("20 entries survive a reload", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, HAPPY);
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Timeline");
  await page.waitForFunction(() => document.body.innerText.includes("1 entry so far"), { timeout: 10000 });
  await ctx.close();
});
test("21 different people keep separate journals", async () => {
  const { ctx, page } = await fresh();
  await signup(page, "Maya");
  await write(page, HAPPY);
  await go(page, "/");
  await clickText(page, "Not you? Start fresh");
  await page.type('input[aria-label="Your name"]', "Jordan");
  await clickText(page, "Begin");
  await page.waitForFunction(() => location.pathname === "/today");
  await clickText(page, "Timeline");
  await page.waitForFunction(() => document.body.innerText.includes("0 entries so far"), { timeout: 10000 });
  assert((await stored(page, "maya")).length === 1, "maya's journal lost");
  await ctx.close();
});
test("22 emoji and non-Latin text round-trip", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  const s = "Hoy fue un día bonito 🌞 — 今日はとても嬉しかった! Cafe with Zoë ☕";
  await write(page, s);
  const [e] = await stored(page);
  assert(e.text === s, "text altered");
  await ctx.close();
});
test("23 a 7,000-character entry saves", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  const long = "Today I walked around the lake and thought about everything. ".repeat(115).slice(0, 7000);
  await write(page, long);
  const [e] = await stored(page);
  assert(e.text.length === 7000, "length " + e.text.length);
  await ctx.close();
});
test("24 HTML in an entry is rendered inert", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await write(page, `<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script> Quiet day, feeling okay.`);
  await clickText(page, "Timeline");
  await page.waitForFunction(() => document.body.innerText.includes("1 entry so far"));
  await sleep(500);
  assert(!(await page.evaluate(() => window.__pwned)), "script executed");
  assert((await text(page)).includes("<img"), "markup not shown as text");
  await ctx.close();
});

// ---------- demo life, reveal ----------
test("25 demo life loads 90 days onto the timeline", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await seedDemo(page);
  assert((await stored(page)).length >= 85, "too few seeded entries");
  assert(await page.$(".recharts-area"), "chart missing");
  await ctx.close();
});
test("26 reveal shows headline, spider-web and window pills; pills toggle", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await seedDemo(page);
  await clickText(page, "Reveal");
  await page.waitForFunction(() => document.body.innerText.includes("the shape of your seasons"), { timeout: 60000 });
  await page.waitForSelector(".recharts-radar-polygon", { timeout: 15000 });
  await sleep(1200);
  const polys = () => page.evaluate(() => document.querySelectorAll(".recharts-radar-polygon").length);
  const before = await polys();
  assert(before >= 2, "expected overlaid polygons, got " + before);
  await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Last week").click(),
  );
  await sleep(500);
  assert((await polys()) !== before, "toggling a window changed nothing");
  assert(/what i noticed/i.test(await text(page)), "eyebrow missing");
  await ctx.close();
});
test("27 reveal on an empty journal gives a gentle fallback", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await clickText(page, "Reveal");
  await page.waitForFunction(() => document.body.innerText.includes("Your story starts the moment"), {
    timeout: 30000,
  });
  await ctx.close();
});
test("28 opener becomes personal once there is history", async () => {
  const { ctx, page } = await fresh();
  await signup(page);
  await seedDemo(page);
  await clickText(page, "Today");
  await page.waitForFunction(() => location.pathname === "/today");
  await page.waitForFunction(
    () => !document.body.innerText.includes("reading back through") && document.querySelector("main p.animate-rise"),
    { timeout: 60000 },
  );
  const t = await text(page);
  if (!FALLBACK_OK) assert(!t.includes("blank page"), "still the first-time opener");
  await ctx.close();
});

// ---------- layout & health ----------
test("29 no horizontal overflow at 360px on every page", async () => {
  const { ctx, page } = await fresh({ width: 360, height: 740 });
  await go(page, "/");
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert((await over()) <= 1, "landing overflows by " + (await over()));
  await signup(page);
  await seedDemo(page);
  for (const r of ["Today", "Timeline", "Reveal"]) {
    await clickText(page, r);
    await sleep(1800);
    assert((await over()) <= 1, `${r} overflows by ${await over()}`);
  }
  await ctx.close();
});
// ---------- home-page demo ----------
test("30 home demo shows a real example result instantly, with all 8 emotion bars", async () => {
  const { ctx, page } = await fresh({ width: 1280, height: 900 });
  await go(page, "/");
  const t = await text(page);
  assert(/example result/i.test(t), "example badge missing");
  assert(/a good day/.test(t), "example stamp missing");
  for (const a of ["Joy", "Calm", "Hope", "Gratitude", "Sadness", "Anxiety", "Anger", "Loneliness"]) assert(t.includes(a), "missing axis " + a);
  await ctx.close();
});
test("31 home demo: choosing another sample swaps the result without a model call", async () => {
  const { ctx, page } = await fresh({ width: 1280, height: 900 });
  await go(page, "/");
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.innerText.includes("hard deadline")).click());
  await page.waitForFunction(() => document.body.innerText.includes("a heavy day"), { timeout: 5000 });
  assert(/example result/i.test(await text(page)), "should still be an example");
  assert((await page.$eval('textarea[aria-label="Demo entry"]', (e) => e.value)).includes("Missed the deadline"), "textarea not updated");
  await ctx.close();
});
test("32 home demo: Run it live scores new text with the real model and keeps the prose intact", async () => {
  const { ctx, page } = await fresh({ width: 1280, height: 900 });
  await go(page, "/");
  const entry = "My sister surprised me with a dinner party after I finished the thesis. I was so proud and so happy I could cry.";
  await page.evaluate((v) => {
    const ta = document.querySelector('textarea[aria-label="Demo entry"]');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(ta, v);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, entry);
  await clickText(page, "Run it live");
  await page.waitForFunction(() => document.body.innerText.includes("scored live just now"), { timeout: 60000 });
  const refl = await page.$eval("[aria-live] p.prose-serif", (e) => e.innerText);
  assert(/^[A-Z]/.test(refl) && /[.!?”"]$/.test(refl), "reflection not sentence-cased: " + refl);
  assert(/s/.test(refl) && refl.split(/\s+/).length >= 8, "reflection looks truncated or has dropped letters: " + refl);
  const t = await text(page);
  assert(/a (good|bright) day/.test(t), "a happy entry should read as good/bright");
  await ctx.close();
});
test("33 home page product screenshots all load", async () => {
  const { ctx, page } = await fresh({ width: 1280, height: 900 });
  await go(page, "/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1200);
  const imgs = await page.$$eval("figure img", (els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, src: e.getAttribute("src") })));
  assert(imgs.length === 3, "expected 3 screenshots, got " + imgs.length);
  assert(imgs.every((i) => i.ok), "broken image(s): " + imgs.filter((i) => !i.ok).map((i) => i.src).join(", "));
  await ctx.close();
});
test("34 no uncaught page errors during the whole run", async () => {
  assert(pageErrors.length === 0, "errors:\n  " + pageErrors.slice(0, 5).join("\n  "));
});

let pass = 0;
for (const t of results) {
  const t0 = Date.now();
  try {
    await t.fn();
    pass++;
    console.log(`PASS  ${t.name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`FAIL  ${t.name}\n        ${String(e.message).split("\n").join("\n        ")}`);
  }
}
await browser.close();
console.log(`\n${pass}/${results.length} passed against ${BASE}`);
process.exit(pass === results.length ? 0 : 1);
