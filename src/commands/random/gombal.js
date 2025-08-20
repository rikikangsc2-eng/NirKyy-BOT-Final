import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'gombal',
    category: 'random',
    description: 'Memberikan gombalan acak.',
    async execute({ sock, m }) {
        await sock.sendMessage(m.key.remoteJid, { text: 'Lagi nyari kata-kata maut...' }, { quoted: m });

        try {
            const apiUrl = 'https://api.sxtream.xyz/randomtext/gombal';
            const { data: apiResponse } = await axios.get(apiUrl, { timeout: 30000 });

            if (!apiResponse.success || !apiResponse.data) {
                throw new Error('API tidak mengembalikan data gombalan yang valid.');
            }

            const gombalan = apiResponse.data;
            await sock.sendMessage(m.key.remoteJid, { text: gombalan }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Gagal mengambil gombalan');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, lagi kehabisan ide gombal nih. Coba lagi nanti ya.' }, { quoted: m });
        }
    }
};