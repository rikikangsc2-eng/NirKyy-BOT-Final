import os from 'os';

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default {
    name: 'ping',
    description: 'Cek kecepatan respon dan status sistem bot.',
    execute: async ({ sock, m }) => {
        const before = Date.now();

        const memoryUsage = process.memoryUsage();
        const totalRAM = os.totalmem();
        const freeRAM = os.freemem();
        const usedRAM = totalRAM - freeRAM;

        const after = Date.now();
        const latency = after - before;

        const replyText = 
`Pong! 🏓

*Kecepatan Proses:* \`${latency} ms\`

*📊 Status Memori Bot:*
- Heap Used: \`${formatBytes(memoryUsage.heapUsed)}\`

*🖥️ Status Memori Server:*
- RAM: \`${formatBytes(usedRAM)} / ${formatBytes(totalRAM)}\``;

        await sock.sendMessage(m.key.remoteJid, { text: replyText }, { quoted: m });
    }
};