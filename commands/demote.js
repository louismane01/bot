// commands/demote.js
export const command = 'demote';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    
    // Check if this is a group chat
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    // Check if user has permission (admin)
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, {
            text: '❌ *Permission Denied!*\n\nOnly group admins can use this command.'
        });
        return;
    }
    
    // Check if user mentioned someone
    if (!m.message.extendedTextMessage?.contextInfo?.mentionedJid) {
        await sock.sendMessage(jid, {
            text: '❌ *Please mention someone to demote!*\n\nUsage: .demote @user'
        });
        return;
    }
    
    try {
        const targetUser = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        
        // Check if target user is in the group
        const participants = groupMetadata.participants;
        const targetParticipant = participants.find(p => p.id === targetUser);
        
        if (!targetParticipant) {
            await sock.sendMessage(jid, {
                text: '❌ *User not found!*\n\nThe mentioned user is not in this group.'
            });
            return;
        }
        
        // Check if user is not an admin
        if (!targetParticipant.admin) {
            await sock.sendMessage(jid, {
                text: '❌ *User is not an admin!*'
            });
            return;
        }
        
        // Check if trying to demote yourself
        if (targetUser === participant) {
            await sock.sendMessage(jid, {
                text: '❌ *You cannot demote yourself!*'
            });
            return;
        }
        
        // Check if trying to demote group owner
        if (groupMetadata.owner === targetUser) {
            await sock.sendMessage(jid, {
                text: '❌ *Cannot demote group owner!*'
            });
            return;
        }
        
        // Demote the user - FIXED SYNTAX
        await sock.groupParticipantsUpdate(
            jid,
            [targetUser],
            'demote' // This should work with baileys
        );
        
        // Get the target user's name
        const targetName = targetParticipant.notify || targetUser.split('@')[0];
        const adminName = groupMetadata.participants.find(p => p.id === participant)?.notify || participant.split('@')[0];
        
        await sock.sendMessage(jid, {
            text: `🔻 *User Demoted!*\n\n👤 *Demoted:* ${targetName}\n📉 *Demoted by:* @${adminName}`,
            mentions: [participant, targetUser]
        });
        
    } catch (error) {
        console.error('Demote command error:', error);
        
        let errorMessage = '❌ *Error!*\n\nFailed to demote user. ';
        
        if (error.message.includes('not authorized')) {
            errorMessage += 'I need admin permissions to demote users.';
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