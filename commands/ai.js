// commands/ai.js (advanced version with better error handling)
import axios from 'axios';

export const command = 'ai';
export const aliases = ['gpt', 'ask', 'bot'];

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    const args = text.split(' ');

    // Help command
    if (args.length < 2 || args[1].toLowerCase() === 'help') {
        await sock.sendMessage(jid, {
            text: `🤖 *AI Chat Bot Commands*\n\n• .ai <question> - Ask anything\n• .ai help - Show this help\n\n📝 *Examples:*\n.ai What is quantum physics?\n.ai Explain photosynthesis\n.ai How to make pizza\n\n🔄 *Aliases:* .gpt, .ask, .bot\n\n_Powered by Icey_md`
        });
        return;
    }

    const question = args.slice(1).join(' ').trim();
    
    if (question.length < 2) {
        await sock.sendMessage(jid, {
            text: '❌ Please ask a meaningful question (at least 2 characters).'
        });
        return;
    }

    try {
        await sock.sendMessage(jid, { 
            text: '⏳ Thinking...' 
        });

        const apiUrl = `https://ab-blackboxai.abrahamdw882.workers.dev/?q=${encodeURIComponent(question)}`;
        
        const response = await axios.get(apiUrl, { 
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        let answer = response.data;

        // Handle different response formats
        if (typeof answer === 'object') {
            // Try to extract meaningful content from object
            if (answer.response) answer = answer.response;
            else if (answer.answer) answer = answer.answer;
            else if (answer.text) answer = answer.text;
            else if (answer.content) answer = answer.content;
            else answer = JSON.stringify(answer);
        }

        // Clean and format the answer
        answer = answer.toString().trim();
        
        if (!answer) {
            throw new Error('Empty response from AI');
        }

        // Split long messages
        if (answer.length > 4000) {
            const parts = [];
            while (answer.length > 0) {
                parts.push(answer.substring(0, 4000));
                answer = answer.substring(4000);
            }
            
            // Send first part with header
            await sock.sendMessage(jid, {
                text: `🤖 *AI Response* (Part 1/${parts.length})\n\n💬 *Question:* ${question}\n\n📝 ${parts[0]}`
            });
            
            // Send remaining parts
            for (let i = 1; i < parts.length; i++) {
                await sock.sendMessage(jid, {
                    text: `📄 Part ${i + 1}/${parts.length}\n\n${parts[i]}`
                });
            }
        } else {
            await sock.sendMessage(jid, {
                text: `🤖 *AI Response*\n\n💬 *Question:* ${question}\n\n📝 ${answer}\n\n_Powered by Icey_md`
            });
        }

    } catch (error) {
        console.error('AI Command Error:', error);
        
        let errorMsg = '❌ *AI Service Unavailable*\n\n';
        
        if (error.code === 'ECONNABORTED') {
            errorMsg += 'Request timed out. The AI is thinking too long.';
        } else if (error.response?.status === 404) {
            errorMsg += 'AI service not found.';
        } else if (error.response?.status >= 500) {
            errorMsg += 'AI server is busy. Try again later.';
        } else {
            errorMsg += 'Please try again in a few moments.';
        }
        
        errorMsg += '\n\n💡 Try a simpler question or try again later.';

        await sock.sendMessage(jid, { text: errorMsg });
    }
}

export const monitor = (sock) => {
    console.log('✅ AI command loaded successfully');
};
