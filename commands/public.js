// Store public mode state and owner ID
let publicMode = true; // Default: anyone can use the bot
let ownerId = null; // Will be set when bot starts

export const command = 'public';
export const execute = async (sock, m) => {
  const jid = m.key.remoteJid;
  const sender = m.key.participant || m.key.remoteJid;
  
  // Set owner on first use if not set (use the first person who uses the command)
  if (!ownerId) {
    ownerId = sender;
    console.log(`👑 Owner set to: ${ownerId}`);
  }
  
  // Check if user is owner
  const isOwner = sender === ownerId;
  
  if (!isOwner) {
    const notOwnerResponse = `
🚫 *ACCESS DENIED*

You are not authorized to change bot settings.
Only the bot owner can use this command.

👑 Owner: ${ownerId ? formatNumber(ownerId) : 'Not set'}
    `;
    await sock.sendMessage(jid, { text: notOwnerResponse });
    return;
  }
  
  const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
  const args = text.split(' ');
  
  if (args.length < 2) {
    const usageResponse = `
⚙️ *PUBLIC MODE SETTINGS*

Usage:
• .public on  - Allow everyone to use bot
• .public off - Only owner can use bot

Current mode: ${publicMode ? '🟢 PUBLIC' : '🔴 PRIVATE'}
Owner: ${formatNumber(ownerId)}
    `;
    await sock.sendMessage(jid, { text: usageResponse });
    return;
  }
  
  const mode = args[1].toLowerCase();
  
  if (mode === 'on') {
    publicMode = true;
    const response = `
🟢 *PUBLIC MODE ENABLED*

Now everyone can use the bot commands.

📊 Status: Public access granted
👥 Users: All users allowed
🔓 Restrictions: None
    `;
    await sock.sendMessage(jid, { text: response });
    console.log('✅ Public mode enabled');
    
  } else if (mode === 'off') {
    publicMode = false;
    const response = `
🔴 *PRIVATE MODE ENABLED*

Now only the owner can use bot commands.

📊 Status: Restricted access
👥 Users: Owner only
🔐 Restrictions: Enabled
    `;
    await sock.sendMessage(jid, { text: response });
    console.log('✅ Private mode enabled');
    
  } else {
    const errorResponse = `
❌ *INVALID OPTION*

Usage:
• .public on  - Allow everyone to use bot
• .public off - Only owner can use bot

Current mode: ${publicMode ? '🟢 PUBLIC' : '🔴 PRIVATE'}
    `;
    await sock.sendMessage(jid, { text: errorResponse });
  }
};

// Function to format number for display
function formatNumber(jid) {
  if (!jid) return 'Unknown';
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

// Export functions to check access
export const isPublicMode = () => publicMode;
export const getOwnerId = () => ownerId;
export const isOwner = (userId) => userId === ownerId;