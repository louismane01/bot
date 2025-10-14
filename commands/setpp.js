import { downloadMediaMessage } from '@whiskeysockets/baileys';

export const command = 'setpp';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;

  try {
    // Check if it's a reply with image
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.imageMessage) {
      await sock.sendMessage(jid, { text: '❌ Reply to an *image* with `.setpp`' });
      return;
    }

    // Download the image
    const buffer = await downloadMediaMessage(
      { message: quoted }, // the quoted msg object
      'buffer',
      {},
      { logger: console }
    );

    if (!buffer) {
      await sock.sendMessage(jid, { text: '❌ Could not download image.' });
      return;
    }

    // Set group profile picture
    await sock.updateProfilePicture(jid, buffer);

    await sock.sendMessage(jid, { text: '✅ Group profile picture updated!' });

  } catch (err) {
    console.error('setpp error:', err);
    await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` });
  }
}
