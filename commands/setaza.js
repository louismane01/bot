import fs from 'fs';
const azaFile = './aza.json';

export const command = 'setaza';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const user = m.key.participant || jid;
  
  try {
    // Get message text
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = text.split(' ').slice(1).join(' '); // Remove .setaza
    
    if (!args) {
      await sock.sendMessage(jid, {
        text: `❌ *INVALID FORMAT*\n\nUse: .setaza Holder Name | Bank Name | Account Number\n\n📌 *Example:*\n.setaza John Doe | GTBank | 0123456789\n\n💡 *Tip:* Use "|" to separate the fields`
      });
      return;
    }

    // Parse the input (format: Name | Bank | Account)
    const parts = args.split('|').map(part => part.trim());
    
    if (parts.length < 3) {
      await sock.sendMessage(jid, {
        text: `❌ *MISSING INFORMATION*\n\nFormat: .setaza Holder Name | Bank Name | Account Number\n\n📌 *Example:*\n.setaza John Doe | GTBank | 0123456789\n\n💡 Make sure to include all 3 parts separated by "|"`
      });
      return;
    }

    const [holder, bank, account] = parts;

    // Validate account number (basic validation)
    if (!/^\d+$/.test(account)) {
      await sock.sendMessage(jid, {
        text: '❌ *INVALID ACCOUNT NUMBER*\n\nAccount number should contain only numbers.'
      });
      return;
    }

    if (account.length < 10) {
      await sock.sendMessage(jid, {
        text: '❌ *ACCOUNT NUMBER TOO SHORT*\n\nAccount number should be at least 10 digits.'
      });
      return;
    }

    // Read existing data
    const data = fs.existsSync(azaFile) ? JSON.parse(fs.readFileSync(azaFile)) : {};
    
    // Update user's bank details
    data[user] = {
      holder: holder,
      bank: bank,
      account: account,
      timestamp: new Date().toISOString()
    };

    // Save to file
    fs.writeFileSync(azaFile, JSON.stringify(data, null, 2));

    // Success response
    const successResponse = `
✅ *BANK DETAILS SAVED SUCCESSFULLY*

┌─────────────────────────────┐
│        📋 DETAILS           │
├─────────────────────────────┤
│ 🚹 Holder: ${holder}        │
│ 🔢 Account: ${account}      │
│ 🏦 Bank: ${bank}            │
└─────────────────────────────┘

📊 Now use \`.aza\` to view your details anytime!
🔒 Your information is stored securely.
    `;

    await sock.sendMessage(jid, { text: successResponse });
    await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    console.log(`💳 Bank details saved for user: ${user}`);

  } catch (error) {
    console.error('SetAza command error:', error);
    await sock.sendMessage(jid, {
      text: '❌ Error saving bank details. Please try again.'
    });
  }
}

// Create aza.json file if it doesn't exist
export const monitor = () => {
  if (!fs.existsSync(azaFile)) {
    fs.writeFileSync(azaFile, JSON.stringify({}));
    console.log('💳 Created aza.json file for bank details');
  }
};