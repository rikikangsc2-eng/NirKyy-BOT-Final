import axios from 'axios';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import logger from '#lib/logger.js';
import config from '#config';

export default {
    name: 'brat',
    aliases: ['bratvid'],
    category: 'tools',
    description: 'Membuat stiker teks brat',
    async execute({ sock, m, args, commandName }) {
        const text = args.join(' ');
        if (!text) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Teksnya mana, bro? Contoh: `.brat ishh ape bende tuhh`' }, { quoted: m });
        }

        const isAnimated = commandName === 'bratvid';
        await sock.sendMessage(m.key.remoteJid, { text: `Sip, lagi bikinin stiker brat ${isAnimated ? 'video' : 'gambar'}... ✍️` }, { quoted: m });

        try {
            const apiUrl = `https://nirkyy-dev.hf.space/api/v1/brat?text=${encodeURIComponent(text)}&animasi=${isAnimated}`;
            
            const response = await axios.get(apiUrl, {
                responseType: 'arraybuffer'
            });

            const sticker = new Sticker(response.data, {
                pack: 'Brat Stickers',
                author: config.botName,
                type: StickerTypes.FULL,
                quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(m.key.remoteJid, { sticker: stickerBuffer }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, text }, 'Gagal membuat stiker brat');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal bikin stikernya, bro. Mungkin API-nya lagi error.' }, { quoted: m });
        }
    }
};