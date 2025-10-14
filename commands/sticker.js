// commands/sticker.js
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

const unlinkAsync = promisify(fs.unlink);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_DIR = path.join(__dirname, "../tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

export const command = "sticker";

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function execute(sock, m) {
  const jid = m.key.remoteJid;

  try {
    // If replying to media, use quoted; else, use current message
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const messageWithMedia = quoted
      ? (quoted.imageMessage ? { imageMessage: quoted.imageMessage } : { videoMessage: quoted.videoMessage })
      : (m.message.imageMessage ? { imageMessage: m.message.imageMessage } : m.message.videoMessage ? { videoMessage: m.message.videoMessage } : null);

    if (!messageWithMedia) {
      await sock.sendMessage(jid, { text: "❌ Reply to or send an *image/video* with `.sticker`" });
      return;
    }

    let type = messageWithMedia.imageMessage ? "image" : "video";

    // Download the media properly
    const msgContent = messageWithMedia[type + "Message"];
    const stream = await downloadContentFromMessage(msgContent, type);
    const buffer = await streamToBuffer(stream);

    // Temp input/output paths
    const inputExt = type === "image" ? "jpg" : "mp4";
    const inputFile = path.join(TMP_DIR, `in-${Date.now()}.${inputExt}`);
    const outputFile = path.join(TMP_DIR, `out-${Date.now()}.webp`);
    fs.writeFileSync(inputFile, buffer);

    // Convert using ffmpeg
    await new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputFile).setFfmpegPath(ffmpegPath);

      cmd.outputOptions([
        "-vcodec", "libwebp",
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=white,fps=15",
        "-lossless", "1",
        "-qscale", "75",
        "-preset", "default",
        "-loop", "0",
        "-an",
        "-vsync", "0"
      ]);

      if (type === "video") cmd.duration(10);

      cmd.toFormat("webp")
        .save(outputFile)
        .on("end", resolve)
        .on("error", reject);
    });

    const webpBuffer = fs.readFileSync(outputFile);

    await sock.sendMessage(jid, { sticker: webpBuffer }, { quoted: m });

    // cleanup
    await unlinkAsync(inputFile).catch(() => {});
    await unlinkAsync(outputFile).catch(() => {});
  } catch (err) {
    console.error("Sticker error:", err);
    await sock.sendMessage(jid, { text: "❌ Sticker failed: " + (err.message || err) });
  }
}
