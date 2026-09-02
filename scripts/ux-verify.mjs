import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4176";
const executablePath = process.env.CHROME_PATH ?? "/snap/bin/chromium";
const out = fileURLToPath(new URL("../.workspace/ux-shots/", import.meta.url));

await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.setViewport({ width: 1400, height: 900 });
page.setDefaultTimeout(40000);
const errors = [];
page.on("pageerror", (error) => {
  const text = String(error);
  if (text.includes("favicon") || text.includes("filename")) return;
  errors.push(text);
});
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  if (msg.text().includes("favicon") || msg.text().includes("filename")) return;
  errors.push(`console: ${msg.text()}`);
});

async function shot(name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
}

async function text() {
  return page.evaluate(() => document.body?.innerText ?? "");
}

await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForFunction(() => (document.body?.innerText ?? "").includes("Home"));
await shot("01-home-blank");

await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find(
    (el) => el.getAttribute("data-sample") === "freelance_crm",
  );
  if (!button) throw new Error("Freelance CRM button missing");
  button.click();
});
await page.waitForFunction(
  () =>
    document.body.innerText.includes("INV-104") ||
    document.body.innerText.includes("Website redesign"),
);
await shot("02-home-crm");
{
  const body = await text();
  for (const needle of ["Website redesign", "INV-104", "Acme", "Invoices", "Active Projects"]) {
    if (!body.includes(needle)) throw new Error(`Home missing ${needle}\n${body.slice(0, 2000)}`);
  }
}

await page.goto(`${base}/t/invoice`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("INV-104"));
await shot("03-invoices");

const invoiceHref = await page.evaluate(() => {
  const link = [...document.querySelectorAll("a")].find((el) =>
    el.textContent?.includes("INV-104"),
  );
  return link?.getAttribute("href");
});
if (!invoiceHref) throw new Error("INV-104 link missing");
await page.goto(`${base}${invoiceHref}`, { waitUntil: "networkidle0" });
await page.waitForFunction(
  () =>
    /mark invoice paid/i.test(document.body.innerText) &&
    document.body.innerText.includes("Status"),
);
await shot("04-invoice-record");
{
  const body = await text();
  if (!/mark invoice paid/i.test(body))
    throw new Error(`Record missing action\n${body.slice(0, 2000)}`);
  if (!body.includes("£") && !body.includes("8,000") && !body.includes("8000")) {
    throw new Error(`Record missing amount formatting\n${body.slice(0, 2000)}`);
  }
}

await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((el) =>
    /mark invoice paid/i.test(el.textContent ?? ""),
  );
  button?.click();
});
await page.waitForFunction(
  () => document.body.innerText.includes("Paid") || document.body.innerText.includes("paid"),
);
await shot("05-invoice-paid");

await page.goto(`${base}/t/project`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Website redesign"));
await shot("06-projects");
const projectHref = await page.evaluate(() => {
  const link = [...document.querySelectorAll("a")].find((el) =>
    el.textContent?.includes("Website redesign"),
  );
  return link?.getAttribute("href");
});
await page.goto(`${base}${projectHref}`, { waitUntil: "networkidle0" });
await page.waitForFunction(
  () => document.body.innerText.includes("Invoices") || document.body.innerText.includes("INV"),
);
await shot("07-project-related");

await page.goto(`${base}/build/types`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Project"));
await shot("08-studio-types");
await page.goto(`${base}/build/types/invoice`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Add field"));
await shot("09-type-editor");
await page.goto(`${base}/build/views`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Unpaid"));
await shot("10-studio-views");
await page.goto(`${base}/build/views/unpaid_invoices`, { waitUntil: "networkidle0" });
await page.waitForFunction(
  () => document.body.innerText.includes("Columns") || document.body.innerText.includes("Preview"),
);
await shot("11-view-editor");
await page.goto(`${base}/build/flows`, { waitUntil: "networkidle0" });
await page.waitForFunction(
  () =>
    document.body.innerText.includes("Rules") ||
    document.body.innerText.includes("Mark invoice paid"),
);
await shot("12-studio-rules");
await page.goto(`${base}/build/flows/record_paid_date`, { waitUntil: "networkidle0" });
await page.waitForFunction(
  () => document.body.innerText.includes("When") || document.body.innerText.includes("Then"),
);
await shot("13-rule-editor");
{
  const body = await text();
  if (body.includes("{") && body.includes('"steps"')) {
    throw new Error("Rule editor still looks like JSON");
  }
}

await page.goto(`${base}/t/organisation/new`, { waitUntil: "networkidle0" });
await page.waitForSelector("input");
await shot("14-add-organisation");

if (errors.length) {
  console.warn("page errors", errors);
  throw new Error(errors.join("\n"));
}

await browser.close();
console.log("ux verify ok");
