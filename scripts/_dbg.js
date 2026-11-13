const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const failed = [];
  p.on("response", r => { if (r.status() >= 400) failed.push(r.status()+" "+r.url()); });
  await p.goto("https://pincraftly.vercel.app", { waitUntil: "networkidle" });
  console.log([...new Set(failed)].join("\n"));
  await b.close();
})();
