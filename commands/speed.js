export const command = 'speed';
export const execute = async (sock, m) => {
  const jid = m.key.remoteJid;

  // React to the command instantly
  await sock.sendMessage(jid, { react: { text: "⚡", key: m.key } });

  // Fake "loading" effect
  const loadingMsg = await sock.sendMessage(jid, { text: "🚀 Checking speed..." }, { quoted: m });

  // Measure actual ping
  const start = Date.now();
  await sock.sendMessage(jid, { text: "⚡ Pong!" });
  const speed = Date.now() - start;

  // Replace the loading message with final cool result
  const result = `
╔═══❖•🌐 SPEED TEST •❖═══╗
┃ ⚡ Ping: ${speed} ms
┃ 📡 Connection: ${speed <= 150 ? "🔥 Fast" : speed <= 400 ? "⚠️ Moderate" : "🐌 Slow"}
┃ 🕐 Uptime: ${process.uptime().toFixed(0)}s
╚═══════════════════════╝

✨ Bot is running smoothly 🚀
  `;

  await sock.sendMessage(jid, { text: result }, { quoted: m });
};
