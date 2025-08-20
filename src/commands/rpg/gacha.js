import db, { getRpgUser, rpgUserCache } from '#database';

const GACHA_COST = 50000;
const formatToRupiah = (number) => `${Math.floor(number).toLocaleString('id-ID')} 🪙`;

const gachaPrizes = [
    { type: 'money', value: 20000, weight: 40, message: (val) => `Zonk! Kamu hanya mendapatkan kembali *${formatToRupiah(val)}*. Mungkin lain kali lebih beruntung.` },
    { type: 'item', name: 'Daging', quantity: 15, weight: 25, message: (qty, name) => `Kamu mendapatkan tumpukan *${qty} ${name}*. Lumayan untuk bekal.` },
    { type: 'item', name: 'Tulang', quantity: 30, weight: 20, message: (qty, name) => `Setumpuk *${qty} ${name}* jatuh ke tanganmu. Bisa untuk bahan kerajinan.` },
    { type: 'money', value: 75000, weight: 10, message: (val) => `Hoki! Kamu mendapatkan *${formatToRupiah(val)}*! Sedikit untung, nih.` },
    { type: 'item', name: 'Eliksir Energi Kecil', quantity: 3, weight: 4, message: (qty, name) => `Wow! Kamu mendapatkan *${qty} ${name}*! Stok energi aman.` },
    { type: 'money', value: 250000, weight: 0.9, message: (val) => `JACKPOT! 🎰 Kamu mendapatkan rejeki nomplok sebesar *${formatToRupiah(val)}*! Sungguh luar biasa!` },
    { type: 'item', name: 'Kristal Arcadia', quantity: 1, weight: 0.1, message: (qty, name) => `LUAR BIASA! Kamu mendapatkan item legendaris: *${qty} ${name}*! Benda ini sangat langka dan berharga.` }
];

const gachaTransaction = db.transaction((jid, prize) => {
    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(GACHA_COST, jid);
    if (prize.type === 'money') {
        db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(prize.value, jid);
    } else if (prize.type === 'item') {
        const upsertStmt = db.prepare(`
            INSERT INTO rpg_inventory (user_jid, item_name, quantity) VALUES (?, ?, ?)
            ON CONFLICT(user_jid, item_name) DO UPDATE SET quantity = quantity + excluded.quantity
        `);
        upsertStmt.run(jid, prize.name, prize.quantity);
    }
    rpgUserCache.delete(jid);
});

function selectPrize() {
    const totalWeight = gachaPrizes.reduce((sum, prize) => sum + prize.weight, 0);
    let random = Math.random() * totalWeight;
    for (const prize of gachaPrizes) {
        if (random < prize.weight) return prize;
        random -= prize.weight;
    }
}

export default {
    name: 'gacha',
    category: 'rpg',
    description: 'Uji keberuntunganmu dengan mempertaruhkan koin untuk hadiah acak.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const user = getRpgUser(jid);

        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum terdaftar di dunia ini.' }, { quoted: m });
        }

        if (user.money < GACHA_COST) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Butuh ${formatToRupiah(GACHA_COST)} untuk melakukan gacha. Koinmu tidak cukup.` }, { quoted: m });
        }

        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: `Memutar Roda Takdir dengan *${formatToRupiah(GACHA_COST)}*...\n\nSemoga dewi fortuna berpihak padamu! 🎲` }, { quoted: m });

        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
            const prize = selectPrize();
            gachaTransaction(jid, prize);
            
            let resultMessage;
            if (prize.type === 'money') {
                resultMessage = prize.message(prize.value);
            } else {
                resultMessage = prize.message(prize.quantity, prize.name);
            }

            const finalText = `*Hasil Gacha:*\n\n${resultMessage}`;
            await sock.sendMessage(m.key.remoteJid, { text: finalText, edit: initialMessage.key });
        } catch (error) {
            console.error(error);
            await sock.sendMessage(m.key.remoteJid, { text: 'Roda Takdir macet! Gacha gagal karena gangguan teknis.' }, { quoted: m });
        }
    }
};