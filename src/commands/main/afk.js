import { setAfkUser } from '#database';
import logger from '#lib/logger.js';

export default {
    name: 'afk',
    description: 'Menandai diri sendiri sebagai AFK (Away From Keyboard).',
    category: 'main',
    execute: async ({ sock, m, args }) => {
        const jid = m.sender;
        const reason = args.join(' ').trim() || 'Tanpa alasan';
        const afkSince = Date.now();

        try {
            setAfkUser(jid, reason, afkSince);
            
            const afkMessage = `*Kamu sekarang AFK!*\n\n*Alasan:* ${reason}\n\nAku bakal kasih tau siapa aja yang nyariin kamu.`;
            await sock.sendMessage(m.key.remoteJid, { text: afkMessage }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, user: jid }, "Gagal set AFK");
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal set status AFK. Coba lagi nanti.' }, { quoted: m });
        }
    }
};