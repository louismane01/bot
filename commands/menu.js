// commands/menu.js
export const command = 'menu';

function fmtUptime() {
  const total = Math.floor(process.uptime());
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(', ');
}

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const senderName = m.pushName || (m.key.participant ? m.key.participant.split('@')[0] : (jid || '').split('@')[0]);

  const ownerJid = globalThis.botOwner || process.env.OWNER_JID || null;
  let ownerName = 'ICEY';
  if (ownerJid) {
    try {
      const info = await sock.onWhatsApp([ownerJid]);
      if (info && info[0] && info[0].notify) ownerName = info[0].notify;
      else ownerName = ownerJid.split('@')[0];
    } catch {
      ownerName = ownerJid.split('@')[0];
    }
  }

  const runtime = fmtUptime();
  const ice = '❄️';

  const menuText = `
⛧┈${ice}  *ICEY MD*  ${ice}┈⛧

${ice} ʜɪ , *${senderName}*
${ice} sᴛᴀᴛᴜs : ᴏɴʟɪɴᴇ
${ice} ᴏᴡɴᴇʀ : *${ownerName}*
${ice} ʀᴜɴᴛɪᴍᴇ : *${runtime}*
${ice} ᴘʀᴇꜰɪx : [ . ]
${ice} ᴠᴇʀꜱɪᴏɴ : *ICEY-MD*

┃┌─〔 👑  OWNER 〕
┃${ice} .owner
┃${ice} .update
┃${ice} .setpp
┃${ice} .statusdl
┃${ice} .bot
┃└──────────

┃┌─〔 🛡  GROUPS 〕
┃${ice} .add
┃${ice} .antilink
┃${ice} .groupinfo
┃${ice} .invite
┃${ice} .kick
┃${ice} .mute
┃${ice} .promote
┃${ice} .demote
┃${ice} .tag
┃${ice} .tagall
┃${ice} .unmute
┃${ice} .warn
┃${ice} .welcome
┃└──────────

┃┌─〔 🎭  FUN 〕
┃${ice} .hack
┃${ice} .hacker
┃${ice} .horo
┃${ice} .secure
┃└──────────

┃┌─〔 👤  ACCOUNT / USER 〕
┃${ice} .adduser
┃${ice} .antidelete
┃${ice} .aza
┃${ice} .autoreact
┃${ice} .chr
┃${ice} .getpp
┃└──────────

┃┌─〔 🆘  UTILITIES 〕
┃${ice} .help
┃${ice} .msg
┃${ice} .menu
┃${ice} .public
┃${ice} .ping
┃${ice} .ai
┃${ice} .speed
┃└──────────

┃┌─〔 📥  MEDIA 〕
┃${ice} .play
┃${ice} .vv
┃${ice} .setaza
┃${ice} .ss
┃${ice} .sticker
┃${ice} .txt2img
┃└──────────

${ice} *ICEY MD* — Always watching, always online.
`.trim();

  try {
    const mentionArray = [];
    if (m.sender) mentionArray.push(m.sender);
    if (ownerJid) mentionArray.push(ownerJid);

    await sock.sendMessage(jid, {
      text: menuText,
      contextInfo: {
        mentionedJid: mentionArray.length ? mentionArray : undefined,
        forwardingScore: 999,
        isForwarded: true
      }
    });
  } catch (error) {
    console.error('Menu command error:', error);
    await sock.sendMessage(jid, { text: '⚠️ ICEY could not load the menu.' });
  }
}

export const monitor = () => {
  console.log('✅ ICEY menu command loaded');
};
