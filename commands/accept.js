export const command = 'admincheck';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const sender = m.sender || m.key.participant || m.key.remoteJid;
    
    // Only works in groups
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *GROUP COMMAND ONLY*\nThis command only works in groups.'
        });
        return;
    }
    
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(jid);
        
        // Check user admin status
        const userParticipant = groupMetadata.participants.find(p => p.id === sender);
        const isUserAdmin = userParticipant && (userParticipant.admin === 'admin' || userParticipant.admin === 'superadmin');
        
        // Check bot admin status
        const botId = sock.user.id;
        const botParticipant = groupMetadata.participants.find(p => p.id === botId);
        const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');
        
        // Get all admins
        const admins = groupMetadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id.split('@')[0]);
        
        await sock.sendMessage(jid, {
            text: `🔍 *ADMIN CHECK RESULTS*\n\nGroup: ${groupMetadata.subject}\n\nYour Admin Status: ${isUserAdmin ? '✅ Admin' : '❌ Not Admin'}\nBot Admin Status: ${isBotAdmin ? '✅ Admin' : '❌ Not Admin'}\n\nTotal Admins: ${admins.length}\nAdmin Numbers: ${admins.join(', ')}`
        });
        
    } catch (error) {
        console.error('Admincheck error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Failed to check admin status!*'
        });
    }
}

export const monitor = (sock) => {
    console.log('✅ Admincheck command loaded: .admincheck');
};
