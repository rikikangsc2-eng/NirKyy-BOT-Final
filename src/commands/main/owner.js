import config from '#config';

export default {
    name: 'owner',
    description: 'Ngasih kontak owner bot.',
    aliases: ['creator'],
    execute: async ({ sock, m }) => {
        const ownerJid = config.ownerNumber[0];
        const ownerName = config.ownerName;

        const vcard = `BEGIN:VCARD\n` +
                      `VERSION:3.0\n` +
                      `FN:${ownerName}\n` +
                      `ORG:NirKyy Dev;\n` +
                      `TEL;type=CELL;type=VOICE;waid=${ownerJid.split('@')[0]}:+${ownerJid.split('@')[0]}\n` +
                      `END:VCARD`;

        await sock.sendMessage(m.key.remoteJid, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        }, { quoted: m });
    }
};