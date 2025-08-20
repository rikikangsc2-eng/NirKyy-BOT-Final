/*
* Lokasi: src/commands/ai/ghibli.js
* Versi: v3
*/

import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { getBotJid, getNumber } from '#lib/utils.js';

const OPENAI_API_KEY = process.env.OPENAI || "YOUR-APIKEY";
const API_URL = 'https://api.openai.com/v1/images/edits';

export default {
    name: 'ghibli',
    category: 'ai',
    description: 'Mengubah gambar menjadi gaya anime Studio Ghibli.',
    async execute({ sock, m }) {
        let messageToProcess = m;
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (isQuoted) {
            const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
            const botJid = getBotJid(sock);
            messageToProcess = {
                key: {
                    remoteJid: m.key.remoteJid,
                    id: stanzaId,
                    fromMe: getNumber(participant) === getNumber(botJid),
                    participant: participant,
                },
                message: quotedMessage,
            };
        }

        const hasMedia = messageToProcess.message?.imageMessage;

        if (!hasMedia) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Kirim atau reply gambar dengan caption `.ghibli` untuk diubah jadi anime style, bro!'
            }, { quoted: m });
        }

        const initialMessage = await sock.sendMessage(
            m.key.remoteJid,
            { text: '*Sip, lagi proses ngubah gambar jadi Ghibli style...* 🎨' },
            { quoted: m }
        );

        try {
            const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {}, { logger });

            await sock.sendMessage(
                m.key.remoteJid,
                { text: 'Gambar diterima, lagi diubah ke format yang benar (PNG)...', edit: initialMessage.key }
            );

            const pngBuffer = await sharp(buffer).png().toBuffer();

            const ghibliPrompt = "Convert this image into the Studio Ghibli art style, focusing on vibrant colors, soft lighting, and detailed natural backgrounds.";

            const form = new FormData();
            form.append('image', pngBuffer, { filename: 'image.png', contentType: 'image/png' });
            form.append('prompt', ghibliPrompt);
            form.append('model', 'gpt-image-1');
            form.append('n', 1);
            form.append('size', '1024x1024');

            const { data: responseData } = await axios.post(API_URL, form, {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                timeout: 120000
            });

            if (!responseData.data || !responseData.data[0] || !responseData.data[0].b64_json) {
                throw new Error('API tidak mengembalikan data base64 yang valid.');
            }

            const imageB64 = responseData.data[0].b64_json;
            const finalImageBuffer = Buffer.from(imageB64, 'base64');

            await sock.sendMessage(m.key.remoteJid, {
                image: finalImageBuffer,
                caption: 'Ini dia gambarnya versi Ghibli, keren kan? ✨'
            }, { quoted: m });

            await sock.sendMessage(m.key.remoteJid, { delete: initialMessage.key });

        } catch (error) {
            logger.error({ err: error?.response?.data || error.message }, 'Error pada fitur .ghibli');
            const apiError = error.response?.data?.error?.message || error.message;
            const errorMessage = `Waduh, gagal bikin gambar Ghibli-nya, bro.\n\n*Pesan Error:* ${apiError}`;
            try {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage, edit: initialMessage.key });
            } catch (finalEditError) {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
            }
        }
    }
};