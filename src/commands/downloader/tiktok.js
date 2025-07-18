import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'tiktok',
    aliases: ['tt'],
    description: 'Download video TikTok tanpa watermark dari URL.',
    execute: async ({ sock, m, args }) => {
        const tiktokUrl = args[0];

        if (!tiktokUrl || (!tiktokUrl.includes('tiktok.com') && !tiktokUrl.includes('douyin.com'))) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kasih link TikTok-nya dong, bro! Contoh: `.tiktok https://vm.tiktok.com/ZSjBQ6t9g/`' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: '*Sip, lagi proses download video TikTok-nya...* ⏳' }, { quoted: m });

        try {
            const apiUrl = `https://nirkyy-dev.hf.space/api/v1/tiktokdl?url=${encodeURIComponent(tiktokUrl)}`;
            const { data: response } = await axios.get(apiUrl);

            if (!response.success || !response.data || response.data.downloads.length === 0) {
                logger.warn({ apiResponse: response }, 'API TikTok gagal atau tidak ada video ditemukan.');
                return await sock.sendMessage(m.key.remoteJid, { text: '*Waduh, gagal ngambil video TikTok-nya.* Coba link lain atau coba lagi nanti ya, bro.' }, { quoted: m });
            }

            const videoSD = response.data.downloads.find(dl => dl.label.includes('Unduh MP4') && !dl.label.includes('HD'));
            const audioMP3 = response.data.downloads.find(dl => dl.label === 'Unduh MP3');

            if (videoSD && videoSD.url) {
                const videoBuffer = await axios.get(videoSD.url, { responseType: 'arraybuffer' });
                await sock.sendMessage(m.key.remoteJid, {
                    video: videoBuffer.data,
                    caption: `*✅ Berhasil download TikTok!*\n*Judul:* \`${response.data.title || '-'}\``,
                    fileName: `${response.data.title || 'tiktok_video'}.mp4`,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } else if (audioMP3 && audioMP3.url) {
                const audioBuffer = await axios.get(audioMP3.url, { responseType: 'arraybuffer' });
                await sock.sendMessage(m.key.remoteJid, {
                    audio: audioBuffer.data,
                    mimetype: 'audio/mp4',
                    fileName: `${response.data.title || 'tiktok_audio'}.mp3`,
                    caption: `*✅ Berhasil download Audio TikTok!*\n*Judul:* \`${response.data.title || '-'}\``
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, { text: '*Maaf, tidak ditemukan link video atau audio yang bisa diunduh dari link TikTok itu.*' }, { quoted: m });
            }

        } catch (error) {
            logger.error({ err: error, url: tiktokUrl }, 'Error saat mengunduh video TikTok');
            await sock.sendMessage(m.key.remoteJid, { text: '*Ada masalah nih saat mencoba download video TikTok.* Mungkin link-nya rusak atau ada gangguan di server.' }, { quoted: m });
        }
    }
};