// Path: src/commands/downloader/fbdl.js
import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'fbdl',
    aliases: ['fb', 'facebook'],
    category: 'downloader',
    description: 'Download video dari Facebook pake link.',
    async execute({ sock, m, args }) {
        const url = args[0];
        if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch'))) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Link Facebook-nya mana, bro? Contoh: .fbdl https://www.facebook.com/...' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses download video dari Facebook... ⌛' }, { quoted: m });

        try {
            const apiUrl = 'https://api.siputzx.my.id/api/d/facebook';
            const payload = { url: url };

            const { data: apiResponse } = await axios.post(apiUrl, payload);

            if (!apiResponse.status || !apiResponse.data || apiResponse.data.length === 0) {
                throw new Error('API tidak mengembalikan data video yang valid.');
            }

            const downloadUrl = apiResponse.data[0].url;

            const videoBuffer = await axios.get(downloadUrl, {
                responseType: 'arraybuffer'
            });

            await sock.sendMessage(m.key.remoteJid, {
                video: videoBuffer.data,
                mimetype: 'video/mp4',
                caption: 'Nih, videonya udah jadi, bro!'
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, url }, 'Gagal download Facebook');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal download dari Facebook, bro. Mungkin link-nya salah atau API-nya lagi error.' }, { quoted: m });
        }
    }
};