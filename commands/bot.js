// commands/bot.js
// Chat with memory using Gemini API, branded reply

import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "config.json");
const GEMINI_API_KEY = (
  process.env.GEMINI_API_KEY ||
  (fs.existsSync(CONFIG_PATH) ? (JSON.parse(fs.readFileSync(CONFIG_PATH)).gemini_api_key || "") : "") ||
  "AIzaSyDIU7U8hq2VAVhljpJv9YPlcb5Luy9-PwA"
).trim();

// store chat history per JID
const conversations = new Map();

async function callGemini(jid, question) {
  const history = conversations.get(jid) || [];

  // include history so AI replies in context
  const contents = [
    ...history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    })),
    { role: "user", parts: [{ text: question }] }
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    }
  );

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  // update history (keep last 10 exchanges)
  const newHistory = [
    ...history,
    { role: "user", text: question },
    { role: "model", text: text || "⚠️ No response" }
  ].slice(-20);

  conversations.set(jid, newHistory);

  return text || "⚠️ Sorry, I couldn't generate a reply.";
}

export const command = "bot";

export const execute = async (sock, m) => {
  const jid = m.key.remoteJid;
  const body =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    "";

  const question = body.replace(/^\.(bot)\s*/i, "").trim();
  if (!question) {
    await sock.sendMessage(jid, { text: "Usage: `.bot <your question>`" });
    return;
  }

  try {
    await sock.sendPresenceUpdate("composing", jid);

    const answer = await callGemini(jid, question);

    await sock.sendPresenceUpdate("paused", jid);

    const finalText = `${answer}\n\n— Powered by ICEY`;

    await sock.sendMessage(jid, { text: finalText });
  } catch (err) {
    console.error("❌ .bot error:", err);
    await sock.sendMessage(jid, { text: "⚠️ Something went wrong while generating the answer." });
  }
};
