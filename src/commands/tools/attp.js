import axios from 'axios';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import logger from '#lib/logger.js';
import config from '#config';

export default {
    name: 'attp',
    category: 'tools',
    description: 'Membuat stiker teks animasi (ATTP).',
    async execute({ sock, m, args }) {
        const text = args.join(' ');
        if (!text) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Teksnya mana, bro? Contoh: `.attp halo dunia`' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi bikin stiker ATTP...' }, { quoted: m });

        try {
            const apiUrl = `https://api.sxtream.xyz/maker/attp?text=${encodeURIComponent(text)}`;
            
            const { data: gifBuffer } = await axios.get(apiUrl, {
                responseType: 'arraybuffer',
                timeout: 60000
            });

            const sticker = new Sticker(gifBuffer, {
                pack: config.botName,
                author: 'ATTP Maker',
                type: StickerTypes.FULL,
                quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(m.key.remoteJid, { sticker: stickerBuffer }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, text }, 'Gagal membuat stiker ATTP');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal bikin stikernya, bro. Mungkin API-nya lagi error.' }, { quoted: m });
        }
    }
};