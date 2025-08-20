import { setPremium } from '#database';
import config from '#config';

function parseDuration(durationStr) {
    if (!durationStr) return null;
    const match = durationStr.match(/^(\d+)([dhms])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        case 's': return value * 1000;
        default: return null;
    }
}

export default {
    name: 'addprem',
    category: 'owner',
    description: 'Menambahkan status premium ke pengguna.',
    async execute({ sock, m, args }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Fitur ini cuma buat owner, bro.' }, { quoted: m });
        }
        
        const targetJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const durationStr = args.find(arg => arg.match(/^(\d+)([dhms])$/i));

        if (!targetJid || !durationStr) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Format salah. Reply/mention user dan kasih durasi.\nContoh: `.addprem 30d`' }, { quoted: m });
        }

        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Format durasi salah. Gunakan `d` (hari), `h` (jam), `m` (menit).' }, { quoted: m });
        }

        const expiresAt = Date.now() + durationMs;

        try {
            setPremium(targetJid, expiresAt);
            const targetName = `@${targetJid.split('@')[0]}`;
            const expiryDate = new Date(expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            
            const ownerMessage = `✅ Berhasil menambahkan premium untuk ${targetName} selama ${durationStr}.\nBerakhir pada: ${expiryDate}`;
            await sock.sendMessage(m.key.remoteJid, { text: ownerMessage, mentions: [targetJid] }, { quoted: m });

            const userMessage = `🎉 Selamat! Kamu telah di-upgrade menjadi pengguna *Premium* oleh owner.\nNikmati limit tak terbatas sampai *${expiryDate}*.`;
            await sock.sendMessage(targetJid, { text: userMessage });

        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal menambahkan premium. Ada error di database.' }, { quoted: m });
        }
    }
};