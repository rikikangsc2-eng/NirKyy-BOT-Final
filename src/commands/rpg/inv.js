/*
* Lokasi: src/commands/rpg/inv.js
* Versi: v2
*/

import { getRpgUser, statements } from '#database';
import { getAndManageUserLimit } from '#processors/limitProcessor.js';
import { checkSpecialGroupMembership } from '#lib/utils.js';

const itemEffects = {
    'Armor Kulit': '🛡️ Mengurangi kerugian koin saat gagal menyergap.',
    'Panah Tulang': '🏹 Meningkatkan hasil buruan.',
    'Sup Ikan Energi': '🍲 Memulihkan 100 energi.',
    'Sashimi Keberuntungan': '🍣 Memberikan sejumlah koin secara acak saat dikonsumsi.',
    'Eliksir Energi Kecil': '🧪 Memulihkan 40 energi secara instan.'
};

export default {
    name: 'inv',
    aliases: ['inventory', 'profile'],
    category: 'rpg',
    description: 'Membuka Status Window untuk melihat profil dan inventaris.',
    async execute({ sock, m }) {
        const jid = m.sender;
        const user = getRpgUser(jid);
        
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` untuk memulai.' }, { quoted: m });
        }

        const mainUser = await getAndManageUserLimit(sock, jid);
        const inventory = statements.getRpgInventory.all(jid);
        
        const isMemberOfSpecialGroup = await checkSpecialGroupMembership(sock, jid);

        let responseText = `*STATUS WINDOW: Orang Tersesat - ${user.name}*\n\n`;
        responseText += `*Informasi Dasar:*\n`;
        responseText += `- Gender: ${user.gender}\n`;
        responseText += `- Umur: ${user.age} tahun\n`;
        responseText += `- Koin: ${user.money.toLocaleString('id-ID')} 🪙\n`;
        responseText += `- Energi: ${user.energy}/${user.max_energy} ⚡\n\n`;

        responseText += `*Status Koneksi (Dunia Nyata):*\n`;
        if (mainUser && mainUser.is_premium) {
            const expires = new Date(mainUser.premium_expires_at).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
            responseText += `› Tipe: *Premium* ✨\n`;
            responseText += `› Berakhir: ${expires}\n`;
            responseText += `› Batas Perintah: Tak Terbatas\n\n`;
        } else {
            const maxLimit = isMemberOfSpecialGroup ? 700 : 5;
            const limitType = isMemberOfSpecialGroup ? 'Mingguan' : 'Harian';
            responseText += `› Tipe: ${isMemberOfSpecialGroup ? 'Anggota Spesial' : 'Standar'}\n`;
            responseText += `› Batas Perintah ${limitType}: ${mainUser?.limit_usage || 0} / ${maxLimit}\n\n`;
        }

        responseText += `*🎒 Kantung Dimensi:*\n`;
        if (inventory.length > 0) {
            const inventoryText = inventory.map(item => {
                let itemLine = `› *${item.item_name}*: ${item.quantity}`;
                if (itemEffects[item.item_name]) {
                    itemLine += `\n  └ _Efek: ${itemEffects[item.item_name]}_`;
                }
                return itemLine;
            }).join('\n\n');
            responseText += inventoryText;
        } else {
            responseText += `_Kosong. Saatnya mencari sumber daya._`;
        }
        
        await sock.sendMessage(m.key.remoteJid, { text: responseText.trim() }, { quoted: m });
    }
};