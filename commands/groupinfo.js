// commands/groupinfo.js
import fs from 'fs';
import path from 'path';

// Store group rules
const groupRules = new Map();
const RULES_FILE = path.join(process.cwd(), 'group_rules.json');

// Load rules from file
function loadRules() {
    try {
        if (fs.existsSync(RULES_FILE)) {
            const data = fs.readFileSync(RULES_FILE, 'utf8');
            const rules = JSON.parse(data);
            for (const [jid, rule] of Object.entries(rules)) {
                groupRules.set(jid, rule);
            }
        }
    } catch (error) {
        console.error('Error loading rules:', error);
    }
}

// Save rules to file
function saveRules() {
    try {
        const dataToSave = {};
        for (const [jid, rules] of groupRules.entries()) {
            dataToSave[jid] = rules;
        }
        fs.writeFileSync(RULES_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Error saving rules:', error);
    }
}

// Load rules on startup
loadRules();

export const command = 'groupinfo';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    try {
        const metadata = await sock.groupMetadata(jid);
        
        // Get group creator info
        let creatorInfo = 'Unknown';
        if (metadata.owner) {
            const creator = metadata.participants.find(p => p.id === metadata.owner);
            creatorInfo = creator?.notify || metadata.owner.split('@')[0];
        }
        
        // Count admins and regular members
        const admins = metadata.participants.filter(p => p.admin).length;
        const regularMembers = metadata.participants.length - admins;
        
        // Get group rules
        const rules = groupRules.get(jid) || 'No rules set yet. Use .setrules to add rules.';
        
        // Format creation date
        const creationDate = metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString() : 'Unknown';
        
        // Create fancy group info
        const info = `
🏰 *GROUP INFORMATION* 🏰

📛 *Group Name:* ${metadata.subject}
👑 *Creator:* ${creatorInfo}
📅 *Created:* ${creationDate}

👥 *Participants:* ${metadata.participants.length} members
   ├─ 👑 Admins: ${admins}
   └─ 👤 Members: ${regularMembers}

🔒 *Settings:*
   ├─ 🔐 Restricted: ${metadata.restrict ? '✅ Yes' : '❌ No'}
   ├─ 📢 Announcement: ${metadata.announce ? '✅ Yes' : '❌ No'}
   └─ 🔗 Join Approval: ${metadata.memberAddMode ? '✅ Required' : '❌ Not Required'}

📜 *Group Rules:*
${rules.split('\n').map(rule => `   › ${rule}`).join('\n')}

💫 *Group ID:* ${jid}
        `.trim();

        await sock.sendMessage(jid, { text: info });
        
    } catch (error) {
        console.error('Groupinfo command error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Error!*\n\nFailed to fetch group information. Please try again.'
        });
    }
}

// Command to set group rules
export const setRulesCommand = 'setrules';

export async function setRulesExecute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    // Check if user is admin
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, {
            text: '❌ *Permission Denied!*\n\nOnly group admins can set rules.'
        });
        return;
    }
    
    const rulesText = text.replace('.setrules', '').trim();
    
    if (!rulesText) {
        await sock.sendMessage(jid, {
            text: '❌ *Please provide rules!*\n\nUsage: .setrules <rules>\nExample: .setrules 1. No spam\\n2. Be respectful\\n3. No NSFW content'
        });
        return;
    }
    
    try {
        groupRules.set(jid, rulesText);
        saveRules();
        
        await sock.sendMessage(jid, {
            text: `✅ *Group Rules Updated!*\n\nThe group rules have been successfully updated. Use .groupinfo to view them.`
        });
        
    } catch (error) {
        console.error('Set rules error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Error!*\n\nFailed to update group rules. Please try again.'
        });
    }
}

// Command to clear group rules
export const clearRulesCommand = 'clearrules';

export async function clearRulesExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    // Check if user is admin
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, {
            text: '❌ *Permission Denied!*\n\nOnly group admins can clear rules.'
        });
        return;
    }
    
    try {
        groupRules.delete(jid);
        saveRules();
        
        await sock.sendMessage(jid, {
            text: `✅ *Group Rules Cleared!*\n\nThe group rules have been successfully removed.`
        });
        
    } catch (error) {
        console.error('Clear rules error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Error!*\n\nFailed to clear group rules. Please try again.'
        });
    }
}

// Command to view rules only
export const rulesCommand = 'rules';

export async function rulesExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    try {
        const rules = groupRules.get(jid) || 'No rules set yet. Use .setrules to add rules.';
        
        const rulesMessage = `
📜 *GROUP RULES* 📜

${rules}

Use .setrules to update these rules.
        `.trim();
        
        await sock.sendMessage(jid, { text: rulesMessage });
        
    } catch (error) {
        console.error('Rules command error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Error!*\n\nFailed to fetch group rules. Please try again.'
        });
    }
}