import fs from 'fs';
const azaFile = './aza.json';

export const command = 'delaza';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const user = m.key.participant || jid;
  
  try {
    // Read existing data
    const data = fs.existsSync(azaFile) ? JSON.parse(fs.readFileSync(azaFile)) : {};
    
    if (!data[user]) {
      await sock.sendMessage(jid, {
        text: '❌ No bank details found to delete.\nUse `.setaza` to add your bank details first.'
      });
      return;
    }

    // Delete user's bank details
    delete data[user];
    fs.writeFileSync(azaFile, JSON.stringify(data, null, 2));

    await sock.sendMessage(jid, {
      text: '✅ Your bank details have been deleted successfully.\nUse `.setaza` to add new details anytime.'
    });
    
    await sock.sendMessage(jid, { react: { text: '🗑️', key: m.key } });

  } catch (error) {
    console.error('DelAza command error:', error);
    await sock.sendMessage(jid, {
      text: '❌ Error deleting bank details. Please try again.'
    });
  }
}