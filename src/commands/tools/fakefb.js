import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import logger from '#lib/logger.js';
import { uploadToTmpFiles } from '#lib/uploader.js';

export default {
    name: 'fakefb',
    aliases: ['ffb'],
    category: 'tools',
    description: 'Membuat gambar chat Facebook palsu.',
    async execute({ sock, m, args }) {
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

        const hasMedia = messageToProcess.message?.imageMessage;
        if (!hasMedia) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Kirim atau reply sebuah gambar untuk dijadikan foto profil, dengan format:\n\n`.fakefb Nama | Komentar`'
            }, { quoted: m });
        }
        
        const inputText = args.join(' ');
        if (!inputText || !inputText.includes('|')) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Format salah, bro. Pisahkan nama dan komentar dengan `|`.\n\nContoh: `.fakefb Budi | Halo semua!`'
            }, { quoted: m });
        }

        const [name, comment] = inputText.split('|').map(s => s.trim());
        if (!name || !comment) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Nama dan komentar tidak boleh kosong.'
            }, { quoted: m });
        }

        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: '*Sip, lagi bikin chat palsunya...* ✍️' }, { quoted: m });

        try {
            const buffer = await downloadMediaMessage(messageToProcess, 'buffer', {}, { logger });
            const profileUrl = await uploadToTmpFiles(buffer, 'profile-pic.jpg');

            const apiUrl = `https://api.sxtream.xyz/maker/fake-chat-fb?name=${encodeURIComponent(name)}&comment=${encodeURIComponent(comment)}&profileUrl=${encodeURIComponent(profileUrl)}`;

            const { data: resultBuffer } = await axios.get(apiUrl, {
                responseType: 'arraybuffer',
                timeout: 60000
            });

            await sock.sendMessage(m.key.remoteJid, {
                image: resultBuffer,
                caption: 'Nih, chat palsunya udah jadi!'
            }, { quoted: m });

            await sock.sendMessage(m.key.remoteJid, { delete: initialMessage.key });

        } catch (error) {
            logger.error({ err: error }, 'Error pada fitur .fakefb');
            const errorMessage = `Waduh, gagal bikin gambarnya, bro.\n\n*Pesan Error:* ${error.message || 'Server API tidak merespon.'}`;
            try {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage, edit: initialMessage.key });
            } catch (finalEditError) {
                await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
            }
        }
    }
};