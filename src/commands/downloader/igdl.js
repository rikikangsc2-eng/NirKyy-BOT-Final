import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'igdl',
    aliases: ['ig'],
    category: 'downloader',
    description: 'Download video atau foto dari Instagram.',
    async execute({ sock, m, args }) {
        const url = args[0];
        if (!url || !url.includes('instagram.com')) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'URL Instagram-nya mana, bro? Contoh: .igdl https://www.instagram.com/...' }, { quoted: m });
        }
        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses download dari Instagram... ⌛' }, { quoted: m });
        try {
            const apiUrl = `https://api.sxtream.xyz/downloader/instagram?url=${encodeURIComponent(url)}`;
            const { data: apiResponse } = await axios.get(apiUrl);

            if (apiResponse.status !== 200 || !apiResponse.result?.url || apiResponse.result.url.length === 0) {
                throw new Error('API download gagal atau tidak menemukan data.');
            }

            const downloadUrl = apiResponse.result.url[0];
            const isVideo = apiResponse.result.isVideo;
            const caption = apiResponse.result.caption || 'Nih, medianya udah jadi!';

            if (!downloadUrl) {
                throw new Error('URL download tidak ditemukan dalam respons API.');
            }

            const mediaBuffer = await axios.get(downloadUrl, { responseType: 'arraybuffer' });

            if (isVideo) {
                await sock.sendMessage(m.key.remoteJid, { 
                    video: mediaBuffer.data, 
                    mimetype: 'video/mp4',
                    caption: caption
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, { 
                    image: mediaBuffer.data,
                    mimetype: 'image/jpeg',
                    caption: caption
                }, { quoted: m });
            }
           
        } catch (error) {
            logger.error({ err: error, url }, 'Gagal download Instagram');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal download dari Instagram, bro. Mungkin link-nya salah, post-nya private, atau API-nya lagi error.' }, { quoted: m });
        }
    }
};