import db, { getRpgUser, rpgUserCache } from '#database';
import { getGameMasterResponse } from '#lib/aiHelper.js';

const FISHING_COOLDOWN = 4 * 60 * 1000;
const ENERGY_COST = 10;
const SUCCESS_RATE = 0.70;

const FISHING_NARRATOR_PROMPT = `KAMU ADALAH "NARATOR RPG" YANG DESKRIPTIF DAN DRAMATIS. Tugasmu adalah menulis narasi pendek (2-3 kalimat) tentang *aksi* memancing seorang pemain.

### ATURAN SUPER KETAT - WAJIB DIIKUTI! ###
1.  **FOKUS PADA AKSI**: Ceritakan HANYA momen aksi memancing berdasarkan input yang diberikan.
2.  **JANGAN SEBUTKAN HASIL**: JANGAN PERNAH menulis kata "mendapat", "berhasil", "gagal", atau menyebutkan ikan/item apa pun yang ditangkap. Biarkan bot yang menyampaikan hasilnya.
3.  **GAYA BAHASA**: Gunakan gaya bahasa yang imersif dan membangun ketegangan.
    -   Jika input \`[TONE: SUKSES]\`, narasikan aksi yang terampil dan penuh antisipasi. Contoh: "Permukaan air yang tenang pecah oleh sentakan kuat. Kau mengeratkan peganganmu, menggulung senar dengan ritme yang stabil melawan perlawanan dari bawah air."
    -   Jika input \`[TONE: GAGAL]\`, narasikan momen kegagalan berdasarkan \`[PENYEBAB]\`. Contoh: "Sebuah tarikan mengejutkanmu, namun senar pancingmu terlalu tegang. Dengan suara 'plak' yang menyakitkan, senar itu putus dan membuat perlawanan di bawah sana lenyap seketika."
4.  **OUTPUT**: Kembalikan HANYA teks narasi mentah. JANGAN tambahkan tag, judul, atau penjelasan apa pun.`;

const processFishingResult = db.transaction((jid, items, now) => {
    db.prepare('UPDATE rpg_users SET energy = energy - ?, last_fish = ? WHERE jid = ?').run(ENERGY_COST, now, jid);
    const stmt = db.prepare(`
        INSERT INTO rpg_inventory (user_jid, item_name, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_jid, item_name) DO UPDATE SET
        quantity = quantity + excluded.quantity;
    `);
    for (const item of items) {
        stmt.run(jid, item.name, item.quantity);
    }
});

const processFishingFailure = db.transaction((jid, now) => {
    db.prepare('UPDATE rpg_users SET energy = energy - ?, last_fish = ? WHERE jid = ?').run(ENERGY_COST, now, jid);
});

const failureReasons = [
    "senar pancingmu putus karena tarikan yang terlalu kuat",
    "umpanmu dimakan ikan kecil sebelum target besar menyambarnya",
    "seekor burung bangau tiba-tiba menyambar ikan tepat saat kau akan mengangkatnya",
    "kau terpeleset dan jatuh ke air, membuat semua ikan kabur"
];

const lootTable = {
    common: [{ name: 'Ikan Mas', quantity: 1 }, { name: 'Lele', quantity: 1 }],
    uncommon: [{ name: 'Gurame', quantity: 1 }],
    junk: [{ name: 'Sepatu Bot Bekas', quantity: 1 }]
};

export default {
    name: 'mancing',
    aliases: ['fish'],
    category: 'rpg',
    description: 'Memancing ikan di sungai untuk mendapatkan item atau uang.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar, bro. Ketik `.register` dulu ya.' }, { quoted: m });
        }
        
        if (user.energy < ENERGY_COST) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Waduh, energimu kurang. Untuk memancing, kamu butuh *${ENERGY_COST}* energi, tapi cuma punya *${user.energy}*. Coba deh \`.makan\` dulu.` }, { quoted: m });
        }

        const now = Date.now();
        const timeSinceLastFish = now - (user.last_fish || 0);

        if (timeSinceLastFish < FISHING_COOLDOWN) {
            const timeLeft = FISHING_COOLDOWN - timeSinceLastFish;
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = ((timeLeft % 60000) / 1000).toFixed(0);
            return await sock.sendMessage(m.key.remoteJid, { text: `Sabar dulu, bro! Kamu baru aja memancing. Tunggu *${minutes} menit ${seconds} detik* lagi.` }, { quoted: m });
        }
        
        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: `*${user.name}* melemparkan kail ke perairan yang tenang... 🎣` }, { quoted: m });
        
        let aiQuery;
        let lootText = '› _Tidak ada hasil_';
        const isSuccess = Math.random() < SUCCESS_RATE;

        if (isSuccess) {
            const loot = [];
            const random = Math.random();
            if (random < 0.60) {
                loot.push(lootTable.common[Math.floor(Math.random() * lootTable.common.length)]);
            } else if (random < 0.85) {
                loot.push(lootTable.uncommon[Math.floor(Math.random() * lootTable.uncommon.length)]);
            } else {
                loot.push(lootTable.junk[0]);
            }
            
            processFishingResult(jid, loot, now);
            lootText = loot.map(item => `› *${item.name}*: ${item.quantity}`).join('\n');
            aiQuery = `[TONE: SUKSES]\n[DESKRIPSI: Pemain merasakan tarikan kuat pada pancingnya dan berjuang untuk menariknya.]`;
        } else {
            processFishingFailure(jid, now);
            const reason = failureReasons[Math.floor(Math.random() * failureReasons.length)];
            aiQuery = `[TONE: GAGAL]\n[PENYEBAB: ${reason}]`;
        }

        rpgUserCache.delete(jid);

        try {
            const narrativeResponse = await getGameMasterResponse(FISHING_NARRATOR_PROMPT, aiQuery);
            const finalMessage = `${narrativeResponse.trim()}\n\n*Hasil Pancingan:*\n${lootText}\n\nKamu kehilangan *${ENERGY_COST}* energi.`;
            await sock.sendMessage(m.key.remoteJid, { text: finalMessage, edit: initialMessage.key });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, AI naratornya lagi mancing juga. Gagal dapet cerita, coba lagi nanti ya.' }, { quoted: m });
        }
    }
};