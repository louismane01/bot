export const command = 'add';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const user = m.key.participant || jid;
  
  if (!jid.endsWith('@g.us')) {
    await sock.sendMessage(jid, {
      text: '❌ This command only works in groups!'
    });
    return;
  }

  const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
  const number = text.split(' ')[1]; // Get the number after .add

  if (!number) {
    await sock.sendMessage(jid, {
      text: `❌ *USAGE:* .add phone_number\n\n📌 *Example:*\n.add 2349123456789\n\n💡 Include country code without + or spaces`
    });
    return;
  }

  try {
    // Format number to WhatsApp JID format
    const formattedNumber = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    
    // Add user to group
    await sock.groupParticipantsUpdate(jid, [formattedNumber], 'add');
    
    await sock.sendMessage(jid, {
      text: `✅ *USER ADDED*\n\n📞 Number: ${number}\n👥 Added to group successfully!`,
      mentions: [formattedNumber]
    });
    
    await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

  } catch (error) {
    console.error('Add command error:', error);
    
    let errorMessage = '❌ Failed to add user: ';
    if (error.message.includes('not authorized')) {
      errorMessage += 'Bot needs admin privileges!';
    } else if (error.message.includes('not found')) {
      errorMessage += 'User not found on WhatsApp!';
    } else {
      errorMessage += error.message;
    }
    
    await sock.sendMessage(jid, { text: errorMessage });
  }
}