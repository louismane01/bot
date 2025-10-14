// commands/txt2img.js
import axios from "axios";
import cheerio from "cheerio";

async function txttoimage(prompt) {
  const data = "prompt=" + encodeURIComponent(prompt);

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
    "Referer": "https://www.texttoimage.org/"
  };

  // Step 1: POST request with prompt
  const res = await axios.post("https://www.texttoimage.org/generate", data, { headers });

  if (!res?.data?.url) {
    throw new Error("No response from texttoimage.org");
  }

  // Step 2: Build full URL from returned data
  const imagePageUrl = "https://www.texttoimage.org/" + res.data.url;

  // Step 3: Fetch generated image page
  const page = await axios.get(imagePageUrl);

  // Step 4: Parse image URL from HTML
  const $ = cheerio.load(page.data);
  const imageUrl = $("a[data-lightbox=\"image-set\"] img").attr("src");

  if (!imageUrl) throw new Error("Failed to fetch image URL");

  return "https://www.texttoimage.org" + imageUrl;
}

export const command = "txt2img";
export const alias = ["text2image"];
export const description = "Generate an image based on your text prompt";
export const category = "Ai";

export async function execute(sock, m) {
  try {
    const text =
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      "";

    if (!text.trim()) {
      return await sock.sendMessage(m.key.remoteJid, {
        text: "📝 Example:\n.txt2img Cute Anime Girl"
      });
    }

    await sock.sendMessage(m.key.remoteJid, {
      text: "⏳ Generating image..."
    });

    const imageUrl = await txttoimage(text.trim());

    await sock.sendMessage(
      m.key.remoteJid,
      { image: { url: imageUrl }, caption: `✅ Generated from: "${text}"` },
      { quoted: m }
    );
  } catch (err) {
    console.error("txt2img error:", err);
    await sock.sendMessage(m.key.remoteJid, {
      text: "❌ Failed to generate image.\n" + (err.message || err)
    });
  }
}

export const monitor = () => {
  console.log("✅ txt2img command loaded");
};
