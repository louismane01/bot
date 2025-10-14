// commands/ping.js
export const command = 'ping';

export async function execute(sock, m) {
  try {
    const start = performance.now();

    // test sending a dummy packet (faster than sending full message)
    await sock.presenceSubscribe(m.key.remoteJid);

    const end = performance.now();
    const speed = (end - start).toFixed(2); // milliseconds

    const response = `
\`\`\`🧊 ɪᴄᴇʏ-ᴍᴅ-ᴘᴀɪʀ 🧊\`\`\`
➤   ⚡ 𝚂𝙿𝙴𝙴𝙳 : ${speed} ᴍs
    `.trim();

    await sock.sendMessage(m.key.remoteJid, { text: response });
  } catch (err) {
    console.error("Ping error:", err);
    await sock.sendMessage(m.key.remoteJid, { text: "⚠️ Failed to calculate ping." });
  }
}

export const monitor = () => {
  console.log("✅ ICEY ping command loaded");
};
