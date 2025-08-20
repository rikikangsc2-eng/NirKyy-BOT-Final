/*
 * Lokasi: index.js
 * Versi: v9
 */

import { exec, spawn } from 'child_process';
import os from 'os';

const pm2Command = `node sw.cjs && > input.txt && npx pm2 start start.js --name "baileys-bot" --watch src --max-memory-restart 700M`;

function streamLogs() {
    console.log('\nMenampilkan log dari PM2. Tekan CTRL+C untuk berhenti.');
    
    const logProcess = spawn('npx', ['pm2', 'logs', 'baileys-bot', '--raw'], {
        shell: true,
        stdio: 'inherit'
    });

    logProcess.on('error', (err) => {
        console.error('Gagal menjalankan `pm2 logs`:', err);
    });
}

console.log('Mencoba memulai bot menggunakan PM2...');
console.log(`Menjalankan perintah: ${pm2Command}`);

exec(pm2Command, (error, stdout, stderr) => {
    if (error) {
        console.error(`Gagal memulai PM2: ${error.message}`);
        if (stdout?.includes('already launched') || stderr?.includes('already launched')) {
            console.log('Bot sudah berjalan sebelumnya. Langsung menampilkan logs...');
            streamLogs();
        }
        return;
    }
    
    if (stderr && !stderr.includes('already launched')) {
        console.error(`Error dari PM2: ${stderr}`);
        return;
    }
    
    console.log(`Output dari PM2:\n${stdout}`);
    streamLogs();
});