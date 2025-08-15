/*
* Lokasi: src/commands/ai/resetchat.js
* Versi: v2
*/

import { clearHistory } from '#lib/aiHelper.js';

export default {
    name: 'resetchat',
    category: 'ai',
    description: 'Reset obrolan kamu sama Alicia, biar mulai dari awal lagi.',
    execute: async ({ sock, m }) => {
        const success = await clearHistory(m.sender);
        if (success) {
            await sock.sendMessage(m.key.remoteJid, { text: 'Hmph! Yaudah, obrolan kita aku lupain. Anggep aja kita baru kenal 😒.' }, { quoted: m });
        } else {
            await sock.sendMessage(m.key.remoteJid, { text: 'Astaga, gagal reset chat. Gatau kenapa, coba lagi ntar aja.' }, { quoted: m });
        }
    }
};