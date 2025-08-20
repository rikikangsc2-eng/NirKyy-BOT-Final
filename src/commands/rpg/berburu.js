import db, { getRpgUser, rpgUserCache } from '#database';
import { getGameMasterResponse } from '#lib/aiHelper.js';

const HUNT_COOLDOWN = 3 * 60 * 1000;
const SUCCESS_RATE = 0.75;
const ARROW_BONUS = 2;

const HUNT_NARRATOR_PROMPT = `KAMU ADALAH "NARATOR DUNIA FANTASI" YANG DESKRIPTIF. Tugasmu adalah menulis narasi pendek (2-3 kalimat) tentang seorang "Orang Tersesat" yang sedang berburu di dunia Arcadia.

### ATURAN SUPER KETAT - WAJIB DIIKUTI! ###
1.  **FOKUS PADA AKSI**: Ceritakan HANYA momen aksi berdasarkan input yang diberikan.
2.  **JANGAN SEBUTKAN HASIL**: JANGAN PERNAH menulis kata "berhasil", "gagal", atau menyebutkan item/hadiah apa pun. Biarkan sistem yang menyampaikan hasilnya.
3.  **GAYA BAHASA**: Gunakan gaya bahasa yang imersif dan membangun suasana survival di dunia fantasi.
    -   Jika input \`[TONE: SUKSES]\`, narasikan aksi yang heroik dan presisi. Contoh: "Di bawah cahaya redup dua bulan Arcadia, kau menarik busurmu. Anak panah melesat tanpa suara, menemukan sasarannya dengan presisi mematikan di antara semak belukar."
    -   Jika input \`[TONE: GAGAL]\`, narasikan momen kegagalan berdasarkan \`[PENYEBAB]\`. Contoh: "Langkahmu terlalu berat. Sebuah ranting bercahaya patah di bawah kakimu, suara renyahnya menggema di keheningan hutan dan membuat makhluk itu kabur."
4.  **OUTPUT**: Kembalikan HANYA teks narasi mentah. JANGAN tambahkan tag, judul, atau penjelasan apa pun.`;

const updateHuntData = db.transaction((jid, now) => {
    db.prepare('UPDATE rpg_users SET last_hunt = ? WHERE jid = ?').run(now, jid);
});

const processSuccessfulHunt = db.transaction((jid, items, now, consumeArrow) => {
    const stmt = db.prepare(`
        INSERT INTO rpg_inventory (user_jid, item_name, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_jid, item_name) DO UPDATE SET
        quantity = quantity + excluded.quantity;
    `);
    for (const item of items) {
        stmt.run(jid, item.name, item.quantity);
    }
    if (consumeArrow) {
        db.prepare('UPDATE rpg_inventory SET quantity = quantity - 1 WHERE user_jid = ? AND item_name = ?').run(jid, 'Panah Tulang');
    }
    updateHuntData(jid, now);
});

const failureReasons = [
    "cuaca tiba-tiba memburuk dan menghapus jejak",
    "jejak buruanmu hilang di tepi sungai yang deras",
    "seekor predator yang lebih besar muncul dan merebut mangsamu",
    "kamu terpeleset di akar pohon dan membuat suara gaduh",
    "buruanmu ternyata terlalu lincah dan gesit untuk dikejar"
];

const successSubjects = ['Rusa Liar', 'Babi Hutan', 'Kawanan Kelinci'];

export default {
    name: 'berburu',
    aliases: ['hunt'],
    category: 'rpg',
    description: 'Berburu makhluk liar di hutan Arcadia untuk mendapatkan bahan.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }
        
        const now = Date.now();
        const timeSinceLastHunt = now - (user.last_hunt || 0);

        if (timeSinceLastHunt < HUNT_COOLDOWN) {
            const timeLeft = HUNT_COOLDOWN - timeSinceLastHunt;
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = ((timeLeft % 60000) / 1000).toFixed(0);
            return await sock.sendMessage(m.key.remoteJid, { text: `Naluri berburumu harus beristirahat. Tunggu *${minutes} menit ${seconds} detik* lagi.` }, { quoted: m });
        }
        
        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: `*${user.name}* memasuki Hutan Bisikan, insting bertahan hidupnya menajam... 🏹` }, { quoted: m });
        
        let aiQuery;
        let lootText = '› _Tidak ada hasil_';
        let usedArrow = false;
        const isSuccess = Math.random() < SUCCESS_RATE;

        if (isSuccess) {
            const arrow = db.prepare('SELECT quantity FROM rpg_inventory WHERE user_jid = ? AND item_name = ?').get(jid, 'Panah Tulang');
            usedArrow = arrow && arrow.quantity > 0;
            const bonus = usedArrow ? ARROW_BONUS : 0;

            const loot = [];
            loot.push({ name: 'Daging', quantity: Math.floor(Math.random() * 3) + 1 + bonus });
            if (Math.random() < 0.6 + (bonus / 10)) loot.push({ name: 'Tulang', quantity: Math.floor(Math.random() * 2) + 1 + bonus });
            if (Math.random() < 0.3 + (bonus / 20)) loot.push({ name: 'Kulit', quantity: 1 });
            
            processSuccessfulHunt(jid, loot, now, usedArrow);
            lootText = loot.map(item => `› *${item.name}*: ${item.quantity}`).join('\n');
            const subject = successSubjects[Math.floor(Math.random() * successSubjects.length)];
            aiQuery = `[TONE: SUKSES]\n[SUBJEK: ${subject}]\n[DESKRIPSI: Pemain berhasil melacak dan menyergap buruannya dengan terampil.]`;
        } else {
            updateHuntData(jid, now);
            const reason = failureReasons[Math.floor(Math.random() * failureReasons.length)];
            aiQuery = `[TONE: GAGAL]\n[PENYEBAB: ${reason}]`;
        }

        rpgUserCache.delete(jid);

        try {
            const narrativeResponse = await getGameMasterResponse(HUNT_NARRATOR_PROMPT, aiQuery);
            let finalMessage = `${narrativeResponse.trim()}\n\n*Hasil Perburuan:*\n${lootText}`;
            if (usedArrow) {
                finalMessage += `\n\n✨ _Berkat *Panah Tulang*, perburuanmu lebih efisien!_`;
            }
            await sock.sendMessage(m.key.remoteJid, { text: finalMessage, edit: initialMessage.key });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Narator dunia ini sedang beristirahat. Perburuan gagal, coba lagi nanti.' }, { quoted: m });
        }
    }
};