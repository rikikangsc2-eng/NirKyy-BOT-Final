/*
* Lokasi: src/commands/tools/solve.js
* Versi: v1
*/

export default {
    name: 'solve',
    aliases: ['calc', 'kalkulator'],
    category: 'tools',
    description: 'Menghitung ekspresi matematika dengan kecerdasan buatan internal.',
    async execute({ sock, m, text }) {
        const expression = text.slice(text.indexOf(' ') + 1);

        if (!expression) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kasih soal matematikanya dong, bro.\n\nContoh: `.solve (5 + 3) * 2`' }, { quoted: m });
        }

        try {
            const cleanExpression = expression
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/[=]/g, '');

            const safeChars = /^[0-9+\-*/.\s()]+$/;
            if (!safeChars.test(cleanExpression)) {
                return await sock.sendMessage(m.key.remoteJid, { text: 'Ekspresi mengandung karakter yang tidak valid. Hanya angka dan operator (+, -, *, /, ()) yang diizinkan.' }, { quoted: m });
            }

            const result = new Function(`return ${cleanExpression}`)();
            
            if (typeof result !== 'number' || !isFinite(result)) {
                 return await sock.sendMessage(m.key.remoteJid, { text: 'Hasil perhitungan tidak valid atau tak terhingga.' }, { quoted: m });
            }

            const response = `🧠 *Hasil Perhitungan AI*\n\nSoal:\n\`\`\`${expression}\`\`\`\n\nHasil:\n\`\`\`${result.toLocaleString('id-ID')}\`\`\``;
            await sock.sendMessage(m.key.remoteJid, { text: response }, { quoted: m });

        } catch (error) {
            await sock.sendMessage(m.key.remoteJid, { text: `Waduh, soalnya salah ketik kayaknya, bro.\n\nError: \`${error.message}\`` }, { quoted: m });
        }
    }
};