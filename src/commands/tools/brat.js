/*
* Lokasi: src/commands/tools/brat.js
* Versi: v2
*/

import axios from 'axios';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import logger from '#lib/logger.js';
import config from '#config';

const API_TOKEN = 'sk-paxsenix-ImdMKbWzB6ztCfdbLn_1bYiNONyIKs2ZS-M6nELU9mEYe_Qb';

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
            const endpoint = isAnimated ? 'bratvid' : 'brat';
            const apiUrl = `https://api.paxsenix.biz.id/maker/${endpoint}?text=${encodeURIComponent(text)}`;
            
            const { data: apiResponse } = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (!apiResponse.ok || !apiResponse.url) {
                throw new Error(apiResponse.message || 'API tidak mengembalikan URL media yang valid.');
            }
            
            const { data: responseBuffer } = await axios.get(apiResponse.url, {
                responseType: 'arraybuffer',
                timeout: 60000
            });

            const sticker = new Sticker(responseBuffer, {
                pack: 'Brat Stickers',
                author: config.botName,
                type: StickerTypes.FULL,
                quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(m.key.remoteJid, { sticker: stickerBuffer }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, text }, 'Gagal membuat stiker brat');
            await sock.sendMessage(m.key.remoteJid, { text: `Waduh, gagal bikin stikernya, bro. Pesan error: ${error.message}` }, { quoted: m });
        }
    }
};