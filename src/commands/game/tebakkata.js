import axios from 'axios';
import crypto from 'crypto';
import { gameSessionCache, statements, tebakkataDataCache } from '#database';
import logger from '#lib/logger.js';

const GAME_DURATION_S = 60;
const DATA_URL = 'https://github.com/rikikangsc2-eng/metadata/raw/refs/heads/main/tebakkata.json';

async function getTebakKataData() {
    if (tebakkataDataCache.has('gameData')) {
        return tebakkataDataCache.get('gameData');
    }
    try {
        const { data } = await axios.get(DATA_URL);
        if (data && Array.isArray(data) && data.length > 0) {
            logger.info(`Berhasil memuat dan menyimpan cache ${data.length} soal Tebak Kata.`);
            tebakkataDataCache.set('gameData', data);
            return data;
        }
        throw new Error('Format data tidak valid atau kosong');
    } catch (error) {
        logger.error({ err: error }, 'Gagal memuat data game Tebak Kata');
        return [];
    }
}

const hashAnswer = (answer) => {
    return crypto.createHash('sha256').update(answer.toUpperCase()).digest('hex');
};

export default {
    name: 'tebakkata',
    category: 'game',
    description: 'Main game tebak kata berdasarkan petunjuk dan menangkan hadiah koin.',
    async execute({ sock, m }) {
        const chatId = m.key.remoteJid;

        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, { text: 'Game ini hanya bisa dimainkan di dalam grup.' }, { quoted: m });
        }
        
        const existingSession = gameSessionCache.get(chatId) || statements.getGameSession.get(chatId);
        if (existingSession) {
            return sock.sendMessage(chatId, { text: `Masih ada soal yang belum terjawab di grup ini. Silakan selesaikan dulu soal yang ada.` }, { quoted: m });
        }
        
        const gameData = await getTebakKataData();
        if (gameData.length === 0) {
            return sock.sendMessage(chatId, { text: 'Maaf, bank soal game sedang tidak tersedia. Coba lagi nanti.' }, { quoted: m });
        }

        const questionData = gameData[Math.floor(Math.random() * gameData.length)];
        const correctAnswer = questionData.jawaban;
        const answerHash = hashAnswer(correctAnswer);
        const expiresAt = Date.now() + (GAME_DURATION_S * 1000);

        const sessionData = {
            gameId: crypto.randomBytes(8).toString('hex'),
            question: questionData.pertanyaan,
            answer: correctAnswer,
            expiresAt: expiresAt
        };

        statements.insertOrReplaceGameSession.run(
            chatId,
            'tebakkata',
            JSON.stringify(sessionData),
            expiresAt
        );
        
        const fullSessionForCache = {
            ...sessionData,
            game_type: 'tebakkata',
            db_expires_at: expiresAt
        };
        gameSessionCache.set(chatId, fullSessionForCache);

        const ZWS = '\u200B';
        const metadata = `${ZWS.repeat(3)}TEBAKKATA:${expiresAt}:${answerHash}${ZWS.repeat(3)}`;
        const gameMessage = `✨ *Game Tebak Kata Dimulai!* ✨\n\nBalas (reply) pesan ini untuk menjawab pertanyaan di bawah ini dan dapatkan hadiah!\n\nPetunjuk: *${questionData.pertanyaan}*\n\nWaktu: *${GAME_DURATION_S} detik*\n\n${metadata}`;
        
        await sock.sendMessage(chatId, { text: gameMessage });
    }
};