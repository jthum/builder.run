import puppeteer from "puppeteer-core";

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4173";
const executablePath = process.env.CHROME_PATH ?? "/snap/bin/chromium";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
page.setDefaultTimeout(40000);
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("requestfailed", (req) => errors.push(`failed ${req.url()} ${req.failure()?.errorText}`));

await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForFunction(
  () => {
    const text = document.body?.innerText ?? "";
    return (
      text.includes("Personal") ||
      text.includes("Home") ||
      text.includes("error") ||
      text.includes("unavailable")
    );
  },
  { timeout: 20000 },
);
console.log("text", await page.evaluate(() => document.body?.innerText?.slice(0, 4000)));
console.log("errors", errors);
const text = await page.evaluate(() => document.body?.innerText ?? "");
if (text.includes("Starting") && !text.includes("Home")) {
  throw new Error(`runtime did not boot\n${errors.join("\n")}\n${text}`);
}

await page.evaluate(() => {
  const title = [...document.querySelectorAll("*")].find(
    (el) =>
      el.childNodes.length &&
      [...el.childNodes].some(
        (node) => node.nodeType === 3 && node.textContent?.trim() === "Freelance CRM",
      ),
  );
  const root = title?.closest("[data-slot='card']") ?? title?.parentElement?.parentElement;
  const button = [...(root?.querySelectorAll("button") ?? [])].find(
    (el) => el.textContent?.trim() === "Load",
  );
  if (!button) throw new Error("Freelance CRM Load not found");
  button.click();
});
await page.waitForFunction(() => document.body.innerText.includes("Invoice"));
await page.goto(`${base}/t/organisation/new`, { waitUntil: "networkidle0" });
await page.waitForSelector("input");
const nameInput = await page.$("input");
if (!nameInput) throw new Error("No name input");
await nameInput.click({ clickCount: 3 });
await nameInput.type("Acme");
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === "Create",
  );
  button?.click();
});
await page.waitForFunction(
  () => location.pathname.includes("/t/organisation/") && !location.pathname.endsWith("/new"),
);

await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("builder.run"));
await page.goto(`${base}/t/organisation`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Acme"));

await page.goto(`${base}/diagnostics`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("sqlite"));

const diagnostics = await page.evaluate(() => document.body.innerText);
if (!diagnostics.includes("organisation")) {
  throw new Error(`Diagnostics did not list organisation table:\n${diagnostics}`);
}

await browser.close();

if (errors.length) {
  console.warn("page errors", errors);
}

console.log("browser smoke ok");
console.log(diagnostics.split("\n").slice(0, 40).join("\n"));
