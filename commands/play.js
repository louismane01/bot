const { cmd } = require('../command');
const axios = require('axios');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');

cmd({
    'pattern': 'song',
    'alias': ['play', 'music'],
    'react': '🎵',
    'desc': 'Download audio from YouTube using Toxxic API',
    'category': 'media',
    'use': '.song <song name>',
    'filename': __filename
}, async (m, sock, obj, { from, q, reply }) => {
    try {
        if (!q) return await reply('❌ Please provide a song name! Example: .play alabi');

        await reply('🔍 Searching for the song...');
        const searchResults = await yts(q);
        
        if (!searchResults.videos || searchResults.videos.length === 0) 
            return await reply('❌ No results found!');

        const firstVideo = searchResults.videos[0];
        const videoUrl = firstVideo.url;
        const videoTitle = firstVideo.title || q;

        await reply('⏳ Downloading audio...');
        const apiUrl = 'https://api-toxxic.zone.id/api/downloader/ytmp3?url=' + encodeURIComponent(videoUrl);
        
        let apiResponse;
        try {
            apiResponse = await axios.get(apiUrl, {
                'timeout': 30000,
                'headers': {
                    'User-Agent': 'Mozilla/5.0 (compatible; TracleBot/1.0)'
                }
            });
        } catch (error) {
            console.warn('[song] API request failed:', error && (error.message || error));
            return await reply('❌ Failed to contact the downloader API. Try again later.');
        }

        const responseData = apiResponse.data;

        function findAudioUrl(obj) {
            if (!obj) return null;
            
            if (typeof obj === 'string') {
                const trimmed = obj.trim();
                if (/^https?:\/\/\S+/i.test(trimmed)) return trimmed;
                if (/^data:audio\/[a-z0-9.+-]+;base64,/.test(trimmed)) return trimmed;
                return null;
            }
            
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const url = findAudioUrl(item);
                    if (url) return url;
                }
                return null;
            }
            
            const audioKeys = ['url', 'link', 'download_link', 'audio', 'data', 'result', 'file', 'videos', 'media'];
            for (const key of audioKeys) {
                if (obj[key]) {
                    const url = findAudioUrl(obj[key]);
                    if (url) return url;
                }
            }
            
            for (const key of Object.keys(obj)) {
                try {
                    const url = findAudioUrl(obj[key]);
                    if (url) return url;
                } catch (error) {}
            }
            return null;
        }

        const audioUrl = findAudioUrl(responseData);
        
        if (!audioUrl) {
            console.warn('[song] No audio URL found in API response. Dumping response for debug:');
            try {
                console.warn(JSON.stringify(responseData, null, 2));
            } catch (error) {
                console.warn('[song] Failed to stringify API response for debug.');
            }
            return await reply('❌ Failed to get download link from API. (Debug logged to console)');
        }

        if (/^data:audio\/[a-z0-9.+-]+;base64,/.test(audioUrl)) {
            const base64Data = audioUrl.split(',')[1];
            const audioBuffer = Buffer.from(base64Data, 'base64');
            const tempDir = path.join(__dirname, 'temp');
            
            if (!fs.existsSync(tempDir)) 
                fs.mkdirSync(tempDir, { recursive: true });
            
            const filename = videoTitle.replace(/[<>:"/\\|?*]/g, '_') + '_' + Date.now() + '.mp3';
            const filePath = path.join(tempDir, filename);
            
            fs.writeFileSync(filePath, audioBuffer);
            await sock.sendMessage(from, {
                'audio': fs.readFileSync(filePath),
                'mimetype': 'audio/mpeg',
                'ptt': false,
                'fileName': videoTitle + '.mp3'
            }, { 'quoted': obj });
            
            try {
                fs.unlinkSync(filePath);
            } catch (error) {}
            
            await reply('✅ Song downloaded successfully (from base64)!');
            return;
        }

        if (/^https?:\/\//i.test(audioUrl)) {
            if (/youtube\.com\/watch|youtu\.be/.test(audioUrl)) {
                return await reply('❌ The downloader API returned a YouTube link instead of a direct audio file. Try again or use another API.');
            }

            try {
                await sock.sendMessage(from, {
                    'audio': { 'url': audioUrl },
                    'mimetype': 'audio/mpeg',
                    'ptt': false,
                    'fileName': (videoTitle + '.mp3').replace(/[<>:"/\\|?*]/g, '_')
                }, { 'quoted': obj });
                
                await reply('✅ Song downloaded successfully!');
                return;
            } catch (error) {
                console.warn('[song] Sending remote URL as audio failed, will try to download and send as buffer:', error && error.message);
                
                try {
                    const downloadResponse = await axios({
                        'url': audioUrl,
                        'method': 'GET',
                        'responseType': 'arraybuffer',
                        'timeout': 30000,
                        'headers': {
                            'User-Agent': 'Mozilla/5.0'
                        }
                    });
                    
                    const audioBuffer = Buffer.from(downloadResponse.data);
                    const tempDir = path.join(__dirname, 'temp');
                    
                    if (!fs.existsSync(tempDir)) 
                        fs.mkdirSync(tempDir, { recursive: true });
                    
                    const filename = videoTitle.replace(/[<>:"/\\|?*]/g, '_') + '_' + Date.now() + '.mp3';
                    const filePath = path.join(tempDir, filename);
                    
                    fs.writeFileSync(filePath, audioBuffer);
                    await sock.sendMessage(from, {
                        'audio': fs.readFileSync(filePath),
                        'mimetype': 'audio/mpeg',
                        'ptt': false,
                        'fileName': (videoTitle + '.mp3').replace(/[<>:"/\\|?*]/g, '_')
                    }, { 'quoted': obj });
                    
                    try {
                        fs.unlinkSync(filePath);
                    } catch (error) {}
                    
                    await reply('✅ Song downloaded successfully (via downloaded file)!');
                    return;
                } catch (downloadError) {
                    console.error('Song download error:', downloadError);
                    return await reply('❌ Failed to download or send the audio file.');
                }
            }
        }

        return await reply('❌ Unsupported audio format returned by API.');
    } catch (error) {
        console.error('Song download error:', error);
        await reply('❌ Error: ' + (error.message || 'Failed to download song'));
    }
});
