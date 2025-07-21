import axios from 'axios';
import FormData from 'form-data';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';

export default {
    name: 'ghibli',
    category: 'tools',
    description: 'Mengubah gambar menjadi gaya anime Studio Ghibli.',
    async execute({ sock, m }) {
        let messageToProcess = m;
        const isQuoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (isQuoted) {
            const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
            messageToProcess = {
                key: {
                    remoteJid: m.key.remoteJid,
                    id: stanzaId,
                    fromMe: participant === sock.user.id.split(':')[0] + '@s.whatsapp.net',
                    participant: participant,
                },
                message: quotedMessage,
            };
        }

        const messageContent = messageToProcess.message;
        const hasMedia = messageContent?.imageMessage;

        if (!hasMedia) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Kirim gambar atau reply gambar dengan caption `.ghibli` untuk diubah jadi anime style, bro!'
            }, { quoted: m });
        }

        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: '*Sip, lagi proses ngubah gambar jadi Ghibli style...* 🎨' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {}, { logger });

            const form = new FormData();
            form.append('image', buffer, {
                filename: 'ghibli-input.jpg',
                contentType: 'image/jpeg'
            });

            const { data: resultBuffer } = await axios.post('https://api.siputzx.my.id/api/image2ghibli', form, {
                headers: {
                    ...form.getHeaders(),
                    'accept': '*/*'
                },
                responseType: 'arraybuffer',
                timeout: 60000 
            });

            await sock.sendMessage(m.key.remoteJid, {
                image: resultBuffer,
                caption: 'Ini dia gambarnya versi Ghibli, keren kan? ✨'
            }, { quoted: m });
            
            await sock.sendMessage(m.key.remoteJid, { delete: initialMessage.key });

        } catch (error) {
            logger.error({ err: error }, 'Error pada fitur .ghibli');
            const errorMessage = `Waduh, gagal bikin gambar Ghibli-nya, bro.\n\n*Pesan Error:* ${error.message || 'Server API tidak merespon.'}\n\nMungkin gambarnya nggak didukung atau servernya lagi sibuk.`;
            try {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage, edit: initialMessage.key });
            } catch (finalEditError) {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
            }
        }
    }
};