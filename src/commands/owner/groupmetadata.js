/*
* Lokasi: src/commands/owner/groupmetadata.js
* Versi: v1
*/

import { inspect } from 'util';
import config from '#config';

export default {
    name: 'groupmetadata',
    aliases: ['gmeta', 'groupinfo'],
    category: 'owner',
    description: 'Menampilkan metadata mentah dari grup saat ini. (Owner only)',
    async execute({ sock, m }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: m });
        }

        try {
            const metadata = await sock.groupMetadata(groupId);
            const output = inspect(metadata, { depth: null, colors: false });
            await sock.sendMessage(m.key.remoteJid, { text: `\`\`\`${output}\`\`\`` }, { quoted: m });
        } catch (error) {
            await sock.sendMessage(m.key.remoteJid, { text: `Gagal mengambil metadata grup: ${error.message}` }, { quoted: m });
        }
    }
};