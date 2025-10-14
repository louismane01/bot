export const command = 'getpp';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;

  try {
    // Fetch group profile picture
    const ppUrl = await sock.profilePictureUrl(jid, 'image');

    if (!ppUrl) {
      await sock.sendMessage(jid, { text: '❌ No profile picture found.' });
      return;
    }

    // Send profile picture
    await sock.sendMessage(jid, {
      image: { url: ppUrl },
      caption: `📸 *Group Profile Picture*`
    });

  } catch (err) {
    console.error('getpp error:', err);
    await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` });
  }
}
