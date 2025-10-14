// commands/mute.js
export const command = "mute";

export const execute = async (sock, m) => {
  const from = m.key.remoteJid;

  // Only groups
  if (!from || !from.endsWith("@g.us")) {
    await sock.sendMessage(from || m.key.remoteJid, { text: "❌ This command only works in groups." });
    return;
  }

  // Extract message text (same pattern your bot uses)
  const msg = m.message || {};
  let text = "";
  if (msg.conversation) text = msg.conversation;
  else if (msg.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
  else if (msg.imageMessage?.caption) text = msg.imageMessage.caption;
  else if (msg.videoMessage?.caption) text = msg.videoMessage.caption;
  else if (msg.documentMessage?.caption) text = msg.documentMessage.caption;

  const sender = m.key.participant || m.key.remoteJid;

  // Best-effort admin check
  let isAdmin = false;
  try {
    const meta = await sock.groupMetadata(from);
    const participants = meta?.participants || [];
    const p = participants.find(x => (x.id || x.jid || x) === sender || x.id === sender || x.jid === sender);
    if (p) {
      // different baielys shapes
      if (p.admin === "admin" || p.admin === "superadmin") isAdmin = true;
      if (p.isAdmin !== undefined && p.isAdmin) isAdmin = true;
      if (p.admin !== undefined && p.admin) isAdmin = true;
    }
  } catch (e) {
    console.error("Admin check failed (continuing best-effort):", e?.message || e);
  }

  if (!isAdmin) {
    await sock.sendMessage(from, { text: "❌ Only group admins can use this command." });
    return;
  }

  // Try muting (announcement mode = only admins can send)
  try {
    await sock.groupSettingUpdate(from, "announcement"); // only admins can send
    await sock.sendMessage(from, { text: "🔒 Group muted — only admins can send messages now." });
  } catch (err) {
    console.error("Mute failed:", err);
    await sock.sendMessage(from, {
      text: "⚠️ Failed to mute group. Make sure the bot is an admin with permission to change group settings.",
    });
  }
};
