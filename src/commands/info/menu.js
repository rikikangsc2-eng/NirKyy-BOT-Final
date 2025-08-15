import config from '#config';

export default {
    name: 'menu',
    description: 'Menampilkan daftar command yang tersedia.',
    execute: async ({ sock, m, commands }) => {
        const categorizedCommands = {};

        for (const command of commands.values()) {
            if (!categorizedCommands[command.category]) {
                categorizedCommands[command.category] = [];
            }
            categorizedCommands[command.category].push(command.name);
        }

        let menuText = `Halo, Bro! 👋\nIni daftar command yang bisa lu pake di *${config.botName}*:\n\n`;

        for (const category in categorizedCommands) {
            menuText += `╭─「 *${category.toUpperCase()}* 」\n`;
            const commandList = categorizedCommands[category]
                .map(cmd => `› \`${config.prefix}${cmd}\``)
                .join('\n');
            menuText += `${commandList}\n`;
            menuText += `╰────\n\n`;
        }

        menuText += `Ketik \`${config.prefix}command\` untuk menggunakan.`;

        await sock.sendMessage(m.key.remoteJid, { text: menuText.trim() }, { quoted: m });
    }
};