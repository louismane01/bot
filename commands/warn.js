// commands/warn.js
import fs from "fs";
import path from "path";

export const command = "warn";

const STORE = path.join(process.cwd(), "warns.json");

// Load or initialize store
function loadStore() {
  if (fs.existsSync(STORE)) {
    try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch (e) {}
  }
  return { groups: {} }; // groups: { "<groupJid>": { max: 3, warns: { "<jid>": count } } }
}
function saveStore(store) {
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
}

function getGroup(store, groupJid) {
  if (!store.groups[groupJid]) store.groups[groupJid] = { max: 3, warns: {} };
  return store.groups[groupJid];
}

// Best-effort admin check (may not work on every Baileys version — falls back to allowing)
async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (!meta?.participants) return false;
    const p = meta.participants.find((x) => (x.id || x.jid || x) === userJid || x.id === userJid || x.jid === userJid);
    if (!p) return false;
    // handle different shapes
    if (typeof p.admin === "string") return p.admin === "admin" || p.admin === "superadmin";
    if (p.isAdmin !== undefined) return !!p.isAdmin;
    if (p.admin !== undefined) return !!p.admin;
    return false;
  } catch (e) {
    // If metadata call fails, don't block the command (best-effort)
    return false;
  }
}

export const execute = async (sock, m) => {
  const store = loadStore();
  const jid = m.key.remoteJid;

  // extract text same way your index.js does
  const msg = m.message || {};
  let text = "";
  if (msg.conversation) text = msg.conversation;
  else if (msg.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
  else if (msg.imageMessage?.caption) text = msg.imageMessage.caption;
  else if (msg.videoMessage?.caption) text = msg.videoMessage.caption;
  else if (msg.documentMessage?.caption) text = msg.documentMessage.caption;

  const parts = text.trim().split(/\s+/);
  const sub = (parts[1] || "").toLowerCase();

  // If user wants to set limit
  if (sub === "set") {
    const num = parseInt(parts[2], 10);
    if (!num || num <= 0) {
      await sock.sendMessage(jid, { text: "❌ Usage: .warn set <number>" });
      return;
    }

    // require admin if possible
    const sender = m.key.participant || m.key.remoteJid;
    const admin = await isGroupAdmin(sock, jid, sender);
    if (!admin) {
      await sock.sendMessage(jid, { text: "⚠️ You must be a group admin to change warn limit." });
      return;
    }

    const grp = getGroup(store, jid);
    grp.max = num;
    saveStore(store);
    await sock.sendMessage(jid, { text: `✅ Max warnings for this group set to ${num}` });
    return;
  }

  // If status asking
  if (sub === "status") {
    // target either mentioned or replied participant
    let target = null;
    if (msg.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      target = msg.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    if (!target && msg.extendedTextMessage?.contextInfo?.participant) {
      target = msg.extendedTextMessage.contextInfo.participant;
    }
    if (!target) {
      await sock.sendMessage(jid, { text: "❌ Usage: .warn status <@user> or reply with .warn status" });
      return;
    }
    const grp = getGroup(store, jid);
    const c = grp.warns[target] || 0;
    await sock.sendMessage(jid, { text: `⚠️ ${target.split("@")[0]} has ${c}/${grp.max} warnings` });
    return;
  }

  // Normal warn flow: must be in a group and target must be specified via reply or mention
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "❌ .warn can only be used inside groups." });
    return;
  }

  // Who invoked?
  const sender = m.key.participant || m.key.remoteJid;

  // require admin to warn (best-effort)
  const admin = await isGroupAdmin(sock, jid, sender);
  if (!admin) {
    await sock.sendMessage(jid, { text: "⚠️ Only group admins can warn members." });
    return;
  }

  // Resolve target: reply -> contextInfo.participant, mention -> contextInfo.mentionedJid[0]
  let target = null;
  if (msg.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    target = msg.extendedTextMessage.contextInfo.mentionedJid[0];
  } else if (msg.extendedTextMessage?.contextInfo?.participant) {
    target = msg.extendedTextMessage.contextInfo.participant;
  } else {
    await sock.sendMessage(jid, { text: "❌ Reply to the user's message or mention them to warn." });
    return;
  }

  if (!target) {
    await sock.sendMessage(jid, { text: "❌ Could not resolve target user to warn." });
    return;
  }

  // Update store
  const grp = getGroup(store, jid);
  grp.warns[target] = (grp.warns[target] || 0) + 1;
  saveStore(store);

  // Notify group
  const count = grp.warns[target];
  await sock.sendMessage(jid, {
    text: `⚠️ @${target.split("@")[0]} has been warned. (${count}/${grp.max})`,
    mentions: [target],
  });

  // If reached limit -> remove
  if (count >= grp.max) {
    try {
      await sock.sendMessage(jid, {
        text: `🚫 @${target.split("@")[0]} reached ${grp.max} warnings — removing from group.`,
        mentions: [target],
      });
      // Kick user
      await sock.groupParticipantsUpdate(jid, [target], "remove");
    } catch (e) {
      console.error("Failed to remove participant:", e);
      await sock.sendMessage(jid, { text: "⚠️ Could not remove participant — make sure bot has admin rights." });
      return;
    }
    // reset their warns
    grp.warns[target] = 0;
    saveStore(store);
  }
};
