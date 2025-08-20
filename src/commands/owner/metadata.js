/*
 * Lokasi: src/commands/owner/metadata.js
 * Versi: v2
 */

import { inspect } from 'util';
import config from '#config';

export default {
    name: 'metadata',
    aliases: ['meta', 'msginfo'],
    category: 'owner',
    description: 'Menampilkan metadata mentah dari objek pesan. (Owner only)',
    async execute({ sock, m }) {
        if (!config.ownerNumber.includes(m.sender)) {
           return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        try {
            const output = inspect(m, { depth: null, colors: false });
            await sock.sendMessage(m.key.remoteJid, { text: `\`\`\`${output}\`\`\`` }, { quoted: m });
        } catch (error) {
            await sock.sendMessage(m.key.remoteJid, { text: `Gagal memproses metadata: ${error.message}` }, { quoted: m });
        }
    }
};