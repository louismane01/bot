// commands/kick.js
export const command = 'kick';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = text.split(' ');
    
    // Check if this is a group chat
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    // Check if user has permission (admin or bot owner)
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, {
            text: '❌ *Permission Denied!*\n\nOnly group admins can use this command.'
        });
        return;
    }
    
    // Check if user mentioned someone or provided a number
    if (args.length < 2 && !m.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        await sock.sendMessage(jid, {
            text: '❌ *Please mention someone or provide a number!*\n\nUsage:\n• .kick @user\n• .kick 2347012345678'
        });
        return;
    }
    
    try {
        let targetUser;
        
        // Check if someone was mentioned
        if (m.message.extendedTextMessage?.contextInfo?.mentionedJid) {
            targetUser = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else {
            // Extract number from command
            const number = args[1].replace(/[^0-9]/g, '');
            if (!number) {
                await sock.sendMessage(jid, {
                    text: '❌ *Invalid number!*\n\nPlease provide a valid phone number.'
                });
                return;
            }
            targetUser = number + '@s.whatsapp.net';
        }
        
        // Check if target user is in the group
        const participants = groupMetadata.participants;
        const targetParticipant = participants.find(p => p.id === targetUser);
        
        if (!targetParticipant) {
            await sock.sendMessage(jid, {
                text: '❌ *User not found!*\n\nThe mentioned user is not in this group.'
            });
            return;
        }
        
        // Check if trying to kick yourself
        if (targetUser === participant) {
            await sock.sendMessage(jid, {
                text: '❌ *You cannot kick yourself!*'
            });
            return;
        }
        
        // Check if trying to kick another admin
        if (targetParticipant.admin) {
            await sock.sendMessage(jid, {
                text: '❌ *Cannot kick another admin!*\n\nYou can only remove regular participants.'
            });
            return;
        }
        
        // Remove the user from group
        await sock.groupParticipantsUpdate(jid, [targetUser], 'remove');
        
        // Get the target user's name
        const targetName = targetParticipant.notify || targetUser.split('@')[0];
        
        await sock.sendMessage(jid, {
            text: `✅ *User Kicked!*\n\n👤 *User:* ${targetName}\n🚫 *Removed by:* @${participant.split('@')[0]}`,
            mentions: [participant]
        });
        
    } catch (error) {
        console.error('Kick command error:', error);
        
        let errorMessage = '❌ *Error!*\n\nFailed to remove user. ';
        
        if (error.message.includes('not authorized')) {
            errorMessage += 'I need admin permissions to remove users.';
        } else if (error.message.includes('401')) {
            errorMessage += 'I am not an admin in this group.';
        } else {
            errorMessage += 'Please make sure I have admin permissions.';
        }
        
        await sock.sendMessage(jid, {
            text: errorMessage
        });
    }
}