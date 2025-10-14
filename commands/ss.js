// commands/ss.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

export const command = "ss";

export const execute = async (sock, m) => {
  const jid = m.key.remoteJid;

  // extract text same as other commands
  const msg = m.message || {};
  let text = "";
  if (msg.conversation) text = msg.conversation;
  else if (msg.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
  else if (msg.imageMessage?.caption) text = msg.imageMessage.caption;
  else if (msg.videoMessage?.caption) text = msg.videoMessage.caption;
  else if (msg.documentMessage?.caption) text = msg.documentMessage.caption;

  const args = text.replace(/^\.(ss)\s*/i, "").trim();
  if (!args) {
    await sock.sendMessage(jid, { text: "❌ Usage: .ss <url> (e.g. .ss google.com)" });
    return;
  }

  let url = args.split(/\s+/)[0];
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const out = path.join(process.cwd(), `screenshot_${Date.now()}.png`);

  try {
    await sock.sendMessage(jid, { text: `⏳ Taking screenshot of: ${url}` });
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.screenshot({ path: out, fullPage: true });
    await browser.close();

    const img = fs.readFileSync(out);
    await sock.sendMessage(jid, { image: img, caption: `📸 Screenshot of ${url}` });
    fs.unlinkSync(out);
  } catch (err) {
    console.error("SS error:", err);
    await sock.sendMessage(jid, { text: `❌ Failed to take screenshot: ${err.message}` });
  }
};
