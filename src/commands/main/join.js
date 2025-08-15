/*
* Lokasi: src/commands/main/join.js
* Versi: v2
*/

import logger from '#lib/logger.js';
import config from '#config';

const GROUP_INVITE_REGEX = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;

export default {
    name: 'join',
    category: 'owner',
    description: 'Memerintahkan bot untuk bergabung ke grup menggunakan tautan undangan. (Owner only)',
    async execute({ sock, m, args }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        const link = args[0];
        if (!link) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: `Mana link grupnya, bro? Format: \`.join <link_grup>\``
            }, { quoted: m });
        }

        const match = link.match(GROUP_INVITE_REGEX);
        if (!match) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Tautan undangan yang kamu berikan sepertinya tidak valid.' }, { quoted: m });
        }

        const inviteCode = match[1];

        try {
            await sock.sendMessage(m.key.remoteJid, { text: `Oke, siap! Aku akan coba bergabung ke grup...` }, { quoted: m });
            await sock.groupAcceptInvite(inviteCode);
            await sock.sendMessage(m.key.remoteJid, { text: `Berhasil bergabung ke grup!` }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, groupCode: inviteCode, user: m.sender }, 'Gagal bergabung ke grup via undangan');
            await sock.sendMessage(m.key.remoteJid, {
                text: `Aku gagal bergabung. Mungkin tautannya sudah tidak valid, grupnya penuh, atau aku sudah ada di sana.`
            }, { quoted: m });
        }
    }
};