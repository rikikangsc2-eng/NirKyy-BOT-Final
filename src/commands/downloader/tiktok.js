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
            const apiUrl = 'https://api.siputzx.my.id/api/tiktok/v2';
            const payload = { url: tiktokUrl };
            
            const { data: response } = await axios.post(apiUrl, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.success || !response.data?.download) {
                logger.warn({ apiResponse: response }, 'API TikTok gagal atau tidak ada data download ditemukan.');
                return await sock.sendMessage(m.key.remoteJid, { text: '*Waduh, gagal ngambil video TikTok-nya.* Coba link lain atau coba lagi nanti ya, bro.' }, { quoted: m });
            }

            const videoUrl = response.data.download.video?.[0];
            const audioUrl = response.data.download.audio;
            const caption = response.data.metadata?.title || 'Nih videonya!';

            if (videoUrl) {
                const videoBuffer = await axios.get(videoUrl, { responseType: 'arraybuffer' });
                await sock.sendMessage(m.key.remoteJid, {
                    video: videoBuffer.data,
                    caption: `*✅ Berhasil download TikTok!*\n*Judul:* \`${caption}\``,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } else if (audioUrl) {
                const audioBuffer = await axios.get(audioUrl, { responseType: 'arraybuffer' });
                await sock.sendMessage(m.key.remoteJid, {
                    audio: audioBuffer.data,
                    mimetype: 'audio/mp4',
                    caption: `*✅ Gagal dapat video, tapi ini audionya!*\n*Judul:* \`${caption}\``
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