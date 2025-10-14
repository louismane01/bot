export const command = 'chr';
export const alias = ['channel-react', 'creact', 'reactch'];
export const description = "React to a channel message with styled text";

export const execute = async (sock, m) => {
  const jid = m.key.remoteJid;
  const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
  const args = text.split(" ").slice(1); // after .chr

  // Char map for fancy reaction
  const charMap = {
    a: "🅐", b: "🅑", c: "🅒", d: "🅓", e: "🅔",
    f: "🅕", g: "🅖", h: "🅗", i: "🅘", j: "🅙",
    k: "🅚", l: "🅛", m: "🅜", n: "🅝", o: "🅞",
    p: "🅟", q: "🅠", r: "🅡", s: "🅢", t: "🅣",
    u: "🅤", v: "🅥", w: "🅦", x: "🅧", y: "🅨", z: "🅩",
    0: "⓿", 1: "➊", 2: "➋", 3: "➌", 4: "➍",
    5: "➎", 6: "➏", 7: "➐", 8: "➑", 9: "➒"
  };

  try {
    if (!args[0]) {
      return await sock.sendMessage(jid, { text: "⚠️ Usage: .chr <channel-link> <text>" });
    }

    const [channelLink, ...textParts] = args;

    if (!channelLink.includes("whatsapp.com/channel/")) {
      return await sock.sendMessage(jid, { text: "❌ Invalid channel link format" });
    }

    const inputText = textParts.join(" ").toLowerCase();
    if (!inputText) {
      return await sock.sendMessage(jid, { text: "❌ Please provide text to react with" });
    }

    const styledText = inputText.split("")
      .map(ch => (ch === " " ? "―" : charMap[ch] || ch))
      .join("");

    // Parse link
    const parts = channelLink.split("/");
    const channelId = parts[4];
    const messageId = parts[5];

    if (!channelId || !messageId) {
      return await sock.sendMessage(jid, { text: "❌ Invalid link - missing IDs" });
    }

    const channelMeta = await sock.newsletterMetadata("invite", channelId);

    await sock.newsletterReactMessage(channelMeta.id, messageId, styledText);

    await sock.sendMessage(jid, {
      text: `✅ Reaction sent!\n📢 Channel: ${channelMeta.name}\n💬 Reaction: ${styledText}`
    });

  } catch (err) {
    console.error("Error in .chr:", err);
    await sock.sendMessage(jid, { text: `❌ Error: ${err.message || "Failed to send reaction"}` });
  }
};
