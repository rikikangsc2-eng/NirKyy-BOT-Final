import db, { getRpgUser, rpgUserCache } from '#database';

export default {
    name: 'makan',
    category: 'rpg',
    description: 'Jalan pintas untuk `.konsumsi 1` (biasanya makanan dasar).',
    async execute({ sock, m, commands }) {
        const consumeCommand = commands.get('konsumsi');
        if (consumeCommand) {
            const modifiedArgs = ['1'];
            await consumeCommand.execute({ sock, m, args: modifiedArgs, commands });
        } else {
            await sock.sendMessage(m.key.remoteJid, { text: 'Perintah konsumsi tidak ditemukan.' }, { quoted: m });
        }
    }
};