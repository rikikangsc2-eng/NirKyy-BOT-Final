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
            const apiUrl = `https://nirkyy-dev.hf.space/api/v1/savegram?url=${encodeURIComponent(url)}`;
            const { data } = await axios.get(apiUrl);

            if (!data.success || !data.data || data.data.length === 0) {
                throw new Error('API download gagal atau tidak menemukan data.');
            }

            const downloadUrl = data.data[0].url_download;
            const mediaType = data.data[0].type;

            if (!downloadUrl) {
                throw new Error('URL download tidak ditemukan dalam respons API.');
            }

            const mediaBuffer = await axios.get(downloadUrl, { responseType: 'arraybuffer' });

            if (mediaType === 'video') {
                await sock.sendMessage(m.key.remoteJid, { 
                    video: mediaBuffer.data, 
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } else if (mediaType === 'image') {
                await sock.sendMessage(m.key.remoteJid, { 
                    image: mediaBuffer.data,
                    mimetype: 'image/jpeg'
                }, { quoted: m });
            }
           
        } catch (error) {
            logger.error({ err: error, url }, 'Gagal download Instagram');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal download dari Instagram, bro. Mungkin link-nya salah atau API-nya lagi error.' }, { quoted: m });
        }
    }
};