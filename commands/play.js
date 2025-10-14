// commands/ytplay.js
import fs from 'fs';
import os from 'os';
import path from 'path';
import yts from 'yt-search';
import axios from 'axios';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { fileURLToPath } from 'url';

ffmpeg.setFfmpegPath(ffmpegPath);

export const command = 'play'; // primary name .play
export const alias = ['ytplay', 'song', 'music'];
export const description = 'Search YouTube and send audio (mp3) as file/voice note';
export const category = 'Downloader';

function tmpFileName(ext = '.mp3') {
  return path.join(os.tmpdir(), `icey-${Date.now()}${Math.floor(Math.random()*1000)}${ext}`);
}

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  try {
    // get text (after command)
    const raw =
      m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      m.message?.videoMessage?.caption ||
      m.message?.documentMessage?.caption ||
      '';
    let query = raw.trim();
    // remove leading command token if present
    if (query.toLowerCase().startsWith('.play')) query = query.slice(5).trim();
    if (query.toLowerCase().startsWith('.ytplay')) query = query.slice(7).trim();

    if (!query) {
      await sock.sendMessage(jid, { text: '❌ Usage: .play <song name or url>' });
      return;
    }

    await sock.sendMessage(jid, { text: `🔎 Searching YouTube for *${query}*...` });

    // Search using yt-search
    const search = await yts(query);
    const video = (search && search.videos && search.videos[0]) || null;
    if (!video) {
      await sock.sendMessage(jid, { text: '❌ No YouTube results found.' });
      return;
    }

    const videoUrl = video.url;
    const title = video.title || 'audio';

    await sock.sendMessage(jid, { text: `🎵 Found: *${title}*\n⏳ Preparing audio...` });

    // === Try downloader API first (fast, no ffmpeg) ===
    // Primary API - you used izumi earlier; keep it but allow failures
    const apis = [
      `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`,
      // add other fallback APIs if you have them (optional)
    ];

    let audioUrl = null;
    for (const api of apis) {
      try {
        const resp = await axios.get(api, { timeout: 20000 });
        if (resp?.data?.status && resp.data.result?.download) {
          audioUrl = resp.data.result.download;
          break;
        }
      } catch (e) {
        // ignore and try next
        console.warn('Downloader API failed:', e.message || e);
      }
    }

    if (audioUrl) {
      // send remote audio URL directly
      await sock.sendMessage(
        jid,
        {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          ptt: false
        },
        { quoted: m }
      );
      return;
    }

    // === Fallback: download via ytdl-core + ffmpeg and send temp file ===
    const outFile = tmpFileName('.mp3');

    await new Promise((resolve, reject) => {
      const stream = ytdl(videoUrl, { filter: 'audioonly', quality: 'highestaudio' }).on('error', reject);

      ffmpeg(stream)
        .audioBitrate(128)
        .format('mp3')
        .on('error', (err) => {
          reject(err);
        })
        .on('end', () => resolve())
        .save(outFile);
    });

    // read buffer and send
    const buffer = fs.readFileSync(outFile);
    await sock.sendMessage(
      jid,
      {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${title}.mp3`,
        ptt: false
      },
      { quoted: m }
    );

    // cleanup
    try { fs.unlinkSync(outFile); } catch (e) { /* ignore */ }
  } catch (err) {
    console.error('Play command error:', err);
    await sock.sendMessage(m.key.remoteJid, { text: `❌ Error: ${err?.message || err}` });
  }
}

export const monitor = () => console.log('✅ play command loaded');
