import { groupMetadataCache } from '#connection';

export default {
    name: 'hidetag',
    aliases: ['h'],
    description: 'Tag semua member grup secara tersembunyi.',
    execute: async ({ sock, m, args }) => {
        const groupId = m.key.remoteJid;
        if (!groupId.endsWith('@g.us')) {
            return await sock.sendMessage(groupId, { text: 'Cuma bisa di grup, bro.' }, { quoted: m });
        }

        let metadata = groupMetadataCache.get(groupId);
        if (!metadata) {
            metadata = await sock.groupMetadata(groupId);
            groupMetadataCache.set(groupId, metadata);
        }

        const participants = metadata.participants;
        const sender = participants.find(p => p.id === m.sender);
        if (!sender || (sender.admin !== 'admin' && sender.admin !== 'superadmin')) {
            return await sock.sendMessage(groupId, { text: 'Lu bukan admin, ga bisa pake command ini.' }, { quoted: m });
        }

        const messageText = args.join(' ').trim();
        if (!messageText) {
            return await sock.sendMessage(groupId, { text: 'Pesennya mana, bro? Contoh: .hidetag Rapat dadakan!' }, { quoted: m });
        }

        const allParticipantJids = participants.map(p => p.id);

        await sock.sendMessage(
            groupId,
            {
                text: messageText,
                mentions: allParticipantJids
            }
        );
    }
};