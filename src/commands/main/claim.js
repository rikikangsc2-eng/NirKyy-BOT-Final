import { statements, userLimitCache } from '#database';
import logger from '#lib/logger.js';

const CLAIM_COOLDOWN = 24 * 60 * 60 * 1000;
const CLAIM_AMOUNT = 20;

export default {
    name: 'claim',
    aliases: ['daily'],
    category: 'main',
    description: `Klaim hadiah ${CLAIM_AMOUNT} limit harian gratis.`,
    
    async execute({ sock, m }) {
        const jid = m.sender;
        
        statements.upsertUserForLimiting.run(jid);
        const user = statements.getUserForLimiting.get(jid);
        
        const now = Date.now();
        const lastClaim = user?.last_claim || 0;
        
        if (now - lastClaim < CLAIM_COOLDOWN) {
            const timeLeft = CLAIM_COOLDOWN - (now - lastClaim);
            const hours = Math.floor(timeLeft / 3600000);
            const minutes = Math.floor((timeLeft % 3600000) / 60000);
            
            return await sock.sendMessage(m.key.remoteJid, { 
                text: `Kamu sudah mengklaim hadiah harianmu. Tunggu *${hours} jam ${minutes} menit* lagi ya.` 
            }, { quoted: m });
        }
        
        try {
            statements.performDailyClaim.run(now, jid);
            userLimitCache.delete(jid);
            
            await sock.sendMessage(m.key.remoteJid, { 
                text: `🎉 *Berhasil!* Kamu telah mengklaim *${CLAIM_AMOUNT} limit* harianmu. Gunakan dengan bijak!` 
            }, { quoted: m });
            
        } catch (error) {
            logger.error({ err: error, user: jid }, "Gagal melakukan klaim harian.");
            await sock.sendMessage(m.key.remoteJid, { 
                text: 'Waduh, ada masalah saat mencoba klaim hadiah. Coba lagi nanti.' 
            }, { quoted: m });
        }
    }
};