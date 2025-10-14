export const command = 'invite';

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
  const number = text.split(' ')[1]; // Get the number after .invite

  if (!number) {
    await sock.sendMessage(jid, {
      text: `❌ *USAGE:* .invite phone_number\n\n📌 *Example:*\n.invite 2349123456789\n\n💡 Include country code without + or spaces`
    });
    return;
  }

  try {
    // Format number to WhatsApp JID format
    const formattedNumber = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    
    // Get group info for the invitation message
    const metadata = await sock.groupMetadata(jid);
    
    // Create cool invitation message
    const inviteMessage = `
🎉 *YOU'VE BEEN INVITED!* 🎉

✨ *GROUP INVITATION* ✨

🏷️ *Group:* ${metadata.subject}
👥 *Members:* ${metadata.participants.length}
👑 *Admin:* ${m.pushName}

🌟 *Join us for:*
• Great conversations
• Amazing community
• Fun activities
• Valuable discussions

🚀 *How to join:*
1. Accept the group invitation
2. Introduce yourself
3. Enjoy the community!

📜 *Group Rules:*
• Be respectful
• No spam
• Enjoy the vibe!

💫 We can't wait to have you!
    `;

    // Send invitation to the user
    await sock.sendMessage(formattedNumber, { 
      text: inviteMessage,
      contextInfo: {
        mentionedJid: [formattedNumber]
      }
    });
    
    // Also send group invite link
    const inviteCode = await sock.groupInviteCode(jid);
    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
    
    await sock.sendMessage(formattedNumber, {
      text: `🔗 *GROUP INVITATION LINK*\n\n${inviteLink}\n\nClick the link above to join the group!`
    });

    // Confirm in the group
    await sock.sendMessage(jid, {
      text: `✅ *INVITATION SENT!*\n\n📞 To: ${number}\n🎉 Cool invitation message delivered!\n\nThey can join using the invite link sent to them.`,
      mentions: [formattedNumber]
    });
    
    await sock.sendMessage(jid, { react: { text: '🎉', key: m.key } });

  } catch (error) {
    console.error('Invite command error:', error);
    
    let errorMessage = '❌ Failed to send invitation: ';
    if (error.message.includes('not authorized')) {
      errorMessage += 'Bot needs admin privileges to get invite link!';
    } else if (error.message.includes('not found')) {
      errorMessage += 'User not found on WhatsApp!';
    } else {
      errorMessage += error.message;
    }
    
    await sock.sendMessage(jid, { text: errorMessage });
  }
}