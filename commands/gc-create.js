export const command = 'gc-create';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const user = m.key.participant || jid;
  const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
  
  // Extract group name from command
  const groupName = text.split(' ').slice(1).join(' ').trim();
  
  if (!groupName) {
    await sock.sendMessage(jid, {
      text: `❌ *GROUP CREATION FAILED*\n\nUsage: .gc-create Group Name\n\n📌 *Example:*\n.gc-create Family Group`
    });
    return;
  }

  try {
    // Create the group
    const group = await sock.groupCreate(groupName, [user]);
    
    const successResponse = `
✅ *GROUP CREATED SUCCESSFULLY*

┌─────────────────────────────┐
│         🎉 DETAILS          │
├─────────────────────────────┤
│ 📛 Name: ${groupName}       │
│ 🆔 ID: ${group.id}          │
│ 👥 Members: 1               │
│ 👑 You are the admin        │
└─────────────────────────────┘

📋 *Next Steps:*
• Add members with .gc-add
• Change settings with .gc-settings
• Use .gc-info to view group details
    `;

    await sock.sendMessage(jid, { text: successResponse });
    await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

  } catch (error) {
    console.error('Group creation error:', error);
    await sock.sendMessage(jid, {
      text: `❌ Failed to create group: ${error.message}\n\nMake sure you have permission to create groups.`
    });
  }
}