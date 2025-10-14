// commands/tag.js
export const command = 'tag';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;

    // Only works in groups
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: "❌ This command only works in groups." });
        return;
    }

    // Get group participants
    const metadata = await sock.groupMetadata(jid);
    const participants = metadata.participants.map(p => p.id);

    // Extract message after .tag
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const message = text.replace('.tag', '').trim() || "👥 Tagged Everyone!";

    await sock.sendMessage(jid, {
        text: message,
        mentions: participants
    });
}
