import db, { rpgUserCache } from '#database';

export default {
    name: 'register',
    category: 'rpg',
    description: 'Terbangun di dunia Arcadia dan memulai petualangan bertahan hidup.',
    async execute({ sock, m, args }) {
        const inputText = args.join(' ');
        const parts = inputText.split('|').map(arg => arg.trim());
        const [name, gender, ageStr] = parts;

        if (!name || !gender || !ageStr) {
            const usage = 'Kesadaranmu perlahan pulih di dunia asing. Siapakah dirimu?\n\nFormat: `.register Nama | Gender | Umur`\nContoh: `.register Arata | Pria | 20`';
            return await sock.sendMessage(m.key.remoteJid, { text: usage }, { quoted: m });
        }

        if (name.length > 10) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Identitasmu terlalu panjang. Nama tidak boleh lebih dari 10 karakter.' }, { quoted: m });
        }
        if (gender.length > 5) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Informasi gender tidak valid. Maksimal 5 karakter.' }, { quoted: m });
        }
        if (ageStr.length > 2) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Umur yang kamu masukkan tidak masuk akal. Maksimal 2 digit.' }, { quoted: m });
        }
        
        const age = parseInt(ageStr, 10);
        if (isNaN(age)) {
            const usage = 'Umurmu adalah sebuah angka, bukan teka-teki.\n\nContoh: `.register Arata | Pria | 20`';
            return await sock.sendMessage(m.key.remoteJid, { text: usage }, { quoted: m });
        }

        const jid = m.sender;

        try {
            const stmt = db.prepare(`
                INSERT INTO rpg_users (jid, name, gender, age, money, bank_balance)
                VALUES (?, ?, ?, ?, 
                    COALESCE((SELECT money FROM rpg_users WHERE jid = ?), 500), 
                    COALESCE((SELECT bank_balance FROM rpg_users WHERE jid = ?), 0))
                ON CONFLICT(jid) DO UPDATE SET
                    name = excluded.name,
                    gender = excluded.gender,
                    age = excluded.age;
            `);
            stmt.run(jid, name, gender, age, jid, jid);
            
            rpgUserCache.delete(jid);
            
            const successMsg = `*Sebuah Awal yang Baru di Arcadia* ✅\n\nKamu terbangun di bawah langit yang tidak dikenal. Ingatanmu kabur, tetapi identitasmu kini terukir: *${name}*.\n\nSelamat datang, *Orang Tersesat*. Perjuanganmu untuk bertahan hidup dimulai sekarang.\n\nKetik \`.inv\` untuk membuka *Status Window* pertamamu.`;
            await sock.sendMessage(m.key.remoteJid, { text: successMsg }, { quoted: m });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Sebuah kekuatan tak terlihat menghalangi takdirmu. Coba lagi nanti.' }, { quoted: m });
        }
    }
};