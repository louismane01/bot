export const command = 'gc-delete';

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const user = m.key.participant || jid;
  const text = m.message.conversation || m.message.extendedTextMessage?.text || '';

  try {
    let group;

    if (jid.endsWith('@g.us')) {
      // Case 1: command used inside a group
      group = await sock.groupMetadata(jid);
    } else {
      // Case 2: command used in DM -> group name is required
      const groupName = text.split(' ').slice(1).join(' ').trim();
      if (!groupName) {
        await sock.sendMessage(jid, {
          text: `❌ *GROUP DELETION FAILED*\n\nUsage: .gc-delete Group Name\n\n📌 *Example:*\n.gc-delete Old Group`
        });
        return;
      }

      const groups = await sock.groupFetchAllParticipating();
      const found = Object.values(groups).find(g =>
        g.subject.toLowerCase().includes(groupName.toLowerCase())
      );

      if (!found) {
        await sock.sendMessage(jid, {
          text: `❌ Group "${groupName}" not found.\n\nMake sure:\n• You're in the group\n• The name is correct\n• You're the admin`
        });
        return;
      }

      group = await sock.groupMetadata(found.id);
    }

    // Check if user is admin in the group
    const isAdmin = group.participants.find(p => p.id === user)?.admin;
    if (!isAdmin) {
      await sock.sendMessage(jid, {
        text: `❌ *PERMISSION DENIED*\n\nYou must be an admin of "${group.subject}" to delete it.`
      });
      return;
    }

    // Remove all participants (except bot)
    for (const participant of group.participants) {
      if (participant.id !== sock.user.id) {
        await sock.groupParticipantsUpdate(group.id, [participant.id], 'remove');
      }
    }

    // Leave and delete group
    await sock.groupLeave(group.id);
    await sock.groupLeave(group.id); // double leave just in case
    await sock.groupLeave(group.id); // ensures it's gone

    await sock.sendMessage(jid, {
      text: `✅ *Group "${group.subject}" deleted successfully!*`
    });

  } catch (error) {
    console.error('Group deletion error:', error);
    await sock.sendMessage(jid, {
      text: `❌ Error: ${error.message}`
    });
  }
}
