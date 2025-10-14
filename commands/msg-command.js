import { scheduleJob } from 'node-schedule';
import { promises as fs } from 'fs';
import path from 'path';

// Store scheduled messages
const scheduledMessages = new Map();
const SCHEDULE_FILE = path.join(process.cwd(), 'scheduled_messages.json');

export const command = 'msg';

export async function execute(sock, m) {
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    
    // Check if the message starts with the command
    if (!text.startsWith('.msg ')) {
        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ *Invalid command!*\n\nUse: .msg |@number| |time| |message|\n\nExamples:\n• .msg |@2347012345678| |12:00pm| Hello there!\n• .msg |@2347012345678| |2023-12-25 10:30| Merry Christmas!\n• .msg |@2347012345678| |in 2 hours| Reminder message\n\nTime formats:\n• 12:00pm (today at that time)\n• 2023-12-25 10:30 (specific date)\n• in 2 hours (relative time)\n• tomorrow 9am (next day)`
        });
        return;
    }

    // Remove the command prefix
    const commandArgs = text.substring(5).trim();
    
    // Parse the command: |@number| |time| |message|
    const match = commandArgs.match(/^\|@([^|]+)\|\s+\|([^|]+)\|\s+(.+)$/);
    
    if (!match) {
        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ *Invalid format!*\n\nUse: .msg |@number| |time| |message|\n\nExamples:\n• .msg |@2347012345678| |12:00pm| Hello there!\n• .msg |@2347012345678| |2023-12-25 10:30| Merry Christmas!\n• .msg |@2347012345678| |in 2 hours| Reminder message\n\nTime formats:\n• 12:00pm (today at that time)\n• 2023-12-25 10:30 (specific date)\n• in 2 hours (relative time)\n• tomorrow 9am (next day)`
        });
        return;
    }

    const [, number, timeStr, message] = match;
    const targetJid = number.includes('@') ? number : number + '@s.whatsapp.net';

    try {
        // Parse the time
        const scheduleTime = parseTime(timeStr);
        
        if (!scheduleTime || scheduleTime < new Date()) {
            await sock.sendMessage(m.key.remoteJid, {
                text: '❌ Invalid time! Please provide a future time.'
            });
            return;
        }

        // Schedule the message
        const jobId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const job = scheduleJob(jobId, scheduleTime, async () => {
            try {
                await sock.sendMessage(targetJid, { text: message });
                console.log(`✅ Scheduled message sent to ${targetJid}: ${message}`);
                
                // Remove from storage after sending
                scheduledMessages.delete(jobId);
                await saveScheduledMessages();
            } catch (error) {
                console.error('❌ Error sending scheduled message:', error);
            }
        });

        // Store the job
        scheduledMessages.set(jobId, {
            targetJid,
            message,
            scheduleTime: scheduleTime.toISOString(),
            job: job
        });

        // Save to file
        await saveScheduledMessages();

        await sock.sendMessage(m.key.remoteJid, {
            text: `✅ *Message Scheduled!*\n\n📨 To: ${targetJid}\n⏰ Time: ${scheduleTime.toLocaleString()}\n💬 Message: ${message}\n\nID: ${jobId}`
        });

        console.log(`📅 Message scheduled for ${scheduleTime.toLocaleString()} to ${targetJid}`);

    } catch (error) {
        console.error('Error scheduling message:', error);
        await sock.sendMessage(m.key.remoteJid, {
            text: '❌ Error scheduling message. Please check the time format.'
        });
    }
}

// Helper function to parse various time formats
function parseTime(timeStr) {
    const now = new Date();
    timeStr = timeStr.trim().toLowerCase();
    
    // Relative time: "in 2 hours", "in 30 minutes"
    if (timeStr.startsWith('in ')) {
        const parts = timeStr.split(' ');
        if (parts.length >= 3) {
            const amount = parseInt(parts[1]);
            const unit = parts[2];
            
            if (isNaN(amount)) return null;
            
            const result = new Date(now);
            switch (unit) {
                case 'second': case 'seconds':
                    result.setSeconds(result.getSeconds() + amount);
                    break;
                case 'minute': case 'minutes':
                    result.setMinutes(result.getMinutes() + amount);
                    break;
                case 'hour': case 'hours':
                    result.setHours(result.getHours() + amount);
                    break;
                case 'day': case 'days':
                    result.setDate(result.getDate() + amount);
                    break;
                case 'week': case 'weeks':
                    result.setDate(result.getDate() + (amount * 7));
                    break;
                default:
                    return null;
            }
            return result;
        }
    }
    
    // Specific date: "2023-12-25 10:30"
    if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$/.test(timeStr)) {
        return new Date(timeStr);
    }
    
    // Time today: "12:00pm", "3:30am"
    if (/^\d{1,2}:\d{2}(am|pm)?$/.test(timeStr)) {
        const [time, period] = timeStr.split(/(am|pm)/);
        const [hours, minutes] = time.split(':').map(Number);
        
        const result = new Date(now);
        result.setHours(
            period === 'pm' && hours < 12 ? hours + 12 :
            period === 'am' && hours === 12 ? 0 : hours,
            minutes, 0, 0
        );
        
        // If time is in the past, schedule for tomorrow
        if (result < now) {
            result.setDate(result.getDate() + 1);
        }
        
        return result;
    }
    
    // Tomorrow at specific time: "tomorrow 9am"
    if (timeStr.startsWith('tomorrow ')) {
        const timePart = timeStr.replace('tomorrow ', '');
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (/^\d{1,2}:\d{2}(am|pm)?$/.test(timePart)) {
            const [time, period] = timePart.split(/(am|pm)/);
            const [hours, minutes] = time.split(':').map(Number);
            
            tomorrow.setHours(
                period === 'pm' && hours < 12 ? hours + 12 :
                period === 'am' && hours === 12 ? 0 : hours,
                minutes, 0, 0
            );
            
            return tomorrow;
        }
    }
    
    return null;
}

// Load scheduled messages on startup
export async function loadScheduledMessages(sock) {
    try {
        const data = await fs.readFile(SCHEDULE_FILE, 'utf8');
        const messages = JSON.parse(data);
        
        const now = new Date();
        
        for (const [jobId, { targetJid, message, scheduleTime }] of Object.entries(messages)) {
            const scheduleDate = new Date(scheduleTime);
            
            if (scheduleDate > now) {
                // Reschedule the message
                const job = scheduleJob(jobId, scheduleDate, async () => {
                    try {
                        await sock.sendMessage(targetJid, { text: message });
                        console.log(`✅ Scheduled message sent to ${targetJid}: ${message}`);
                        
                        // Remove from storage after sending
                        scheduledMessages.delete(jobId);
                        await saveScheduledMessages();
                    } catch (error) {
                        console.error('❌ Error sending scheduled message:', error);
                    }
                });
                
                scheduledMessages.set(jobId, {
                    targetJid,
                    message,
                    scheduleTime: scheduleTime,
                    job: job
                });
                
                console.log(`📅 Reloaded scheduled message for ${scheduleDate.toLocaleString()} to ${targetJid}`);
            } else {
                console.log(`🗑️ Skipping expired scheduled message for ${targetJid}`);
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error loading scheduled messages:', error);
        }
    }
}

// Save scheduled messages to file
async function saveScheduledMessages() {
    try {
        const dataToSave = {};
        for (const [jobId, { targetJid, message, scheduleTime }] of scheduledMessages.entries()) {
            dataToSave[jobId] = { targetJid, message, scheduleTime };
        }
        
        await fs.writeFile(SCHEDULE_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Error saving scheduled messages:', error);
    }
}

// List scheduled messages command
export const listCommand = 'listschedule';
export async function listExecute(sock, m) {
    if (scheduledMessages.size === 0) {
        await sock.sendMessage(m.key.remoteJid, {
            text: '📋 No scheduled messages.'
        });
        return;
    }
    
    let messageList = '📋 *Scheduled Messages:*\n\n';
    let index = 1;
    
    for (const [jobId, { targetJid, message, scheduleTime }] of scheduledMessages.entries()) {
        const time = new Date(scheduleTime).toLocaleString();
        messageList += `${index}. ⏰ ${time}\n📨 To: ${targetJid}\n💬 ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}\nID: ${jobId}\n\n`;
        index++;
    }
    
    await sock.sendMessage(m.key.remoteJid, { text: messageList });
}

// Cancel scheduled message command
export const cancelCommand = 'cancelschedule';
export async function cancelExecute(sock, m) {
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = text.split(' ');
    
    if (args.length < 2) {
        await sock.sendMessage(m.key.remoteJid, {
            text: '❌ Please provide a job ID. Use .listschedule to see all scheduled messages.'
        });
        return;
    }
    
    const jobId = args[1];
    const scheduledMessage = scheduledMessages.get(jobId);
    
    if (!scheduledMessage) {
        await sock.sendMessage(m.key.remoteJid, {
            text: '❌ Scheduled message not found.'
        });
        return;
    }
    
    // Cancel the job
    scheduledMessage.job.cancel();
    scheduledMessages.delete(jobId);
    await saveScheduledMessages();
    
    await sock.sendMessage(m.key.remoteJid, {
        text: `✅ Scheduled message canceled:\n📨 To: ${scheduledMessage.targetJid}\n⏰ Time: ${new Date(scheduledMessage.scheduleTime).toLocaleString()}`
    });
}