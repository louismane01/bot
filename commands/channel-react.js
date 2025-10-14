module.exports = [ 
  {
    command: ["channel-react"],
    alias: ["chr", "creact", "chreact", "reactch"],
    description: "React to channel messages with stylized text",
    category: "Owner",
    use: ".chr <channel-link> <text>",
    filename: __filename,

    async execute(message, { ednut: conn, args, isOwner, reply }) {
      // 🔹 Map of characters to styled characters
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
        // ✅ Only owner can use this command
        if (!isOwner) {
          return reply("❌ Owner only command");
        }

        // ✅ Require arguments
        if (!args[0]) {
          return reply("⚠️ Usage: .chr <channel-link> <text>");
        }

        const [channelLink, ...textParts] = args;

        // ✅ Validate channel link
        if (!channelLink.includes("whatsapp.com/channel/")) {
          return reply("❌ Invalid channel link format");
        }

        // ✅ Join words into a text string
        const inputText = textParts.join(" ").toLowerCase();
        if (!inputText) {
          return reply("❌ Please provide text to convert");
        }

        // ✅ Convert characters to styled versions
        const styledText = inputText
          .split("")
          .map(ch => (ch === " " ? "―" : charMap[ch] || ch))
          .join("");

        // ✅ Extract channel ID and message ID from the link
        const parts = channelLink.split("/");
        const channelId = parts[4];
        const messageId = parts[5];

        if (!channelId || !messageId) {
          return reply("❌ Invalid link - missing IDs");
        }

        // ✅ Fetch channel metadata
        const channelMeta = await conn.newsletterMetadata("invite", channelId);

        // ✅ Send reaction
        await conn.newsletterReactMessage(channelMeta.id, messageId, styledText);

        // ✅ Success response (Icey version)
        reply(
          `╭━━━〔 *ICEY-MD* 〕━━━┈⊷\n` +
          `┃▸ *Success!* Reaction sent\n` +
          `┃▸ *Channel:* ${channelMeta.name}\n` +
          `┃▸ *Reaction:* ${styledText}\n` +
          `╰────────────────┈⊷\n` +
          `> *© Powered By Icey TechX 🚹*`
        );

      } catch (err) {
        console.error("Error in chr:", err);
        reply(`❎ Error: ${err.message || "Failed to send reaction"}`);
      }
    }
  }
];
