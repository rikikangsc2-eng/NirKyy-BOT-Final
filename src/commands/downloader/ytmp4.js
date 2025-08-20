import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'ytmp4',
    aliases: ['ytv', 'ytvideo'],
    category: 'downloader',
    description: 'Download video dari YouTube pake link.',
    async execute({ sock, m, args }) {
        const url = args[0];
        if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'URL YouTube-nya mana, bro? Contoh: .ytmp4 https://youtu.be/...' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses download video dari YouTube... ⌛' }, { quoted: m });

        try {
            const apiUrl = `https://api.yogik.id/downloader/youtube?url=${encodeURIComponent(url)}&format=video`;
            
            const { data: apiResponse } = await axios.get(apiUrl);

            if (!apiResponse.status || !apiResponse.result?.download_url) {
                throw new Error('API tidak mengembalikan data video yang valid.');
            }

            const downloadUrl = apiResponse.result.download_url;
            const title = apiResponse.result.title;

            const videoBuffer = await axios.get(downloadUrl, {
                responseType: 'arraybuffer'
            });

            await sock.sendMessage(m.key.remoteJid, {
                video: videoBuffer.data,
                mimetype: 'video/mp4',
                caption: `*Judul:* ${title}\n\nNih, videonya udah jadi, bro!`
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, url }, 'Gagal download YouTube video');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal download videonya, bro. Mungkin link-nya salah atau API-nya lagi error.' }, { quoted: m });
        }
    }
};