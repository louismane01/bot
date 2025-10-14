import fs from 'fs';
const azaFile = './aza.json';

export const command = 'aza';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const user = m.key.participant || jid;
  
  try {
    // Read bank details from file
    const data = fs.existsSync(azaFile) ? JSON.parse(fs.readFileSync(azaFile)) : {};
    const aza = data[user];

    if (!aza) {
      await sock.sendMessage(jid, {
        text: `❌ *NO BANK DETAILS FOUND*\n\nUse \`.setaza Holder Name | Bank Name | Account Number\` to set your bank details.\n\n📌 *Example:*\n.setaza John Doe | GTBank | 0123456789`
      });
    } else {
      // Format beautiful bank details
      const bankResponse = `
🏦 *BANK ACCOUNT DETAILS*

┌─────────────────────────────┐
│          💳 ACCOUNT          │
├─────────────────────────────┤
│ 🚹 Holder: ${aza.holder}      │
│ 🔢 Number: ${aza.account}     │
│ 🏦 Bank: ${aza.bank}          │
└─────────────────────────────┘

📊 *Quick Actions:*
• Copy Account Number
• Share with friends
• Use for transfers
      `;
      
      await sock.sendMessage(jid, { text: bankResponse });
    }

    // Add reaction
    await sock.sendMessage(jid, { react: { text: '💳', key: m.key } });

  } catch (error) {
    console.error('Aza command error:', error);
    await sock.sendMessage(jid, {
      text: '❌ Error retrieving bank details. Please try again.'
    });
  }
}