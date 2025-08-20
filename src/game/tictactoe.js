/*
* Lokasi: src/game/tictactoe.js
* Versi: v4
*/
import db, { statements, gameSessionCache, rpgUserCache } from '#database';
import { formatCoin } from '#lib/utils.js';

const TTT_GAME_TIMEOUT_MS = 10 * 60 * 1000;
const tttNumberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function generateBoard(board) {
    let boardStr = '';
    for (let i = 0; i < 9; i++) {
        boardStr += board[i] === '' ? tttNumberEmojis[i] : board[i];
        if ((i + 1) % 3 === 0) boardStr += '\n';
    }
    return boardStr.trim();
}

function createGameMessage(session, statusText) {
    const boardText = generateBoard(session.board);
    const currentPlayer = session.players[session.currentPlayerIndex];
    const playerTag = currentPlayer.jid === 'AI' ? 'AI' : `@${currentPlayer.jid.split('@')[0]}`;
    const turnText = `Giliran: ${playerTag} (${currentPlayer.symbol})`;
    const ZWS = '\u200B';
    const metadata = `${ZWS.repeat(3)}TICTACTOE:${session.gameId}${ZWS.repeat(3)}`;
    return `✨ *Tic Tac Toe* ✨\n\n${boardText}\n\nTaruhan: *${formatCoin(session.bet)}*\nStatus: _${statusText}_\n\n${turnText}\n${metadata}`;
}

function checkWin(board, playerSymbol) {
    for (const combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board[a] === playerSymbol && board[b] === playerSymbol && board[c] === playerSymbol) {
            return true;
        }
    }
    return false;
}

function checkDraw(board) {
    return board.every(cell => cell !== '');
}

function minimax(board, depth, isMaximizing, aiSymbol, playerSymbol) {
    if (checkWin(board, aiSymbol)) return 10 - depth;
    if (checkWin(board, playerSymbol)) return depth - 10;
    if (checkDraw(board)) return 0;

    const availableMoves = board.map((cell, index) => cell === '' ? index : null).filter(val => val !== null);

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (const move of availableMoves) {
            board[move] = aiSymbol;
            let score = minimax(board, depth + 1, false, aiSymbol, playerSymbol);
            board[move] = '';
            bestScore = Math.max(score, bestScore);
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (const move of availableMoves) {
            board[move] = playerSymbol;
            let score = minimax(board, depth + 1, true, aiSymbol, playerSymbol);
            board[move] = '';
            bestScore = Math.min(score, bestScore);
        }
        return bestScore;
    }
}

function findBestMove(board, aiSymbol, playerSymbol) {
    let bestScore = -Infinity;
    let bestMove;
    const availableMoves = board.map((cell, index) => cell === '' ? index : null).filter(val => val !== null);

    for (const move of availableMoves) {
        board[move] = aiSymbol;
        let score = minimax(board, 0, false, aiSymbol, playerSymbol);
        board[move] = '';
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }
    return bestMove;
}

export function makeAiMove(board, difficulty, aiSymbol, playerSymbol, turnCount) {
    const availableMoves = board.map((cell, index) => cell === '' ? index : null).filter(val => val !== null);
    
    if (difficulty === 'king') {
        if (turnCount <= 3) {
            const strategicMoves = [0, 2, 4, 6, 8].filter(pos => availableMoves.includes(pos));
            return strategicMoves[Math.floor(Math.random() * strategicMoves.length)];
        }
        return findBestMove(board, aiSymbol, playerSymbol);
    }
    
    if (difficulty === 'sulit') {
        for (const move of availableMoves) {
            const nextBoard = [...board]; nextBoard[move] = aiSymbol;
            if (checkWin(nextBoard, aiSymbol)) return move;
        }
        for (const move of availableMoves) {
            const nextBoard = [...board]; nextBoard[move] = playerSymbol;
            if (checkWin(nextBoard, playerSymbol)) return move;
        }
        if (availableMoves.includes(4)) return 4;
        const corners = [0, 2, 6, 8].filter(c => availableMoves.includes(c));
        if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    }
    
    return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

async function handleGameEnd(sock, chatId, session, winnerSymbol, isDraw) {
    statements.deleteGameSession.run(chatId);
    gameSessionCache.delete(chatId);
    let endMessage;
    const mentions = session.players.filter(p => p.jid !== 'AI').map(p => p.jid);

    try {
        if (winnerSymbol) {
            const winner = session.players.find(p => p.symbol === winnerSymbol);
            const prizeMultiplier = session.mode === 'pvp' ? 2 : (session.mode === 'king' ? 2.5 : 1.5);
            const totalPrize = Math.floor(session.bet * prizeMultiplier);
            endMessage = `*Permainan Selesai!* Pemenangnya adalah ${winner.jid === 'AI' ? 'AI' : `@${winner.jid.split('@')[0]}`}! Hadiah *${formatCoin(totalPrize)}* telah diterima.`;
            if (winner.jid !== 'AI') {
                db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(totalPrize, winner.jid);
                rpgUserCache.delete(winner.jid);
            }
        } else if (isDraw) {
            endMessage = `*Permainan Berakhir Seri!* Taruhan dikembalikan ke masing-masing pemain.`;
            session.players.forEach(p => {
                if (p.jid !== 'AI') {
                    db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(session.bet, p.jid);
                    rpgUserCache.delete(p.jid);
                }
            });
        }
    } catch (dbError) {
        console.error('Error saat transaksi TTT', dbError);
        endMessage = "Permainan berakhir, tapi terjadi error saat memproses hadiah.";
    }
    const finalText = `✨ *Tic Tac Toe* ✨\n\n${generateBoard(session.board)}\n\n${endMessage}`;
    await sock.sendMessage(chatId, { text: finalText, mentions });
}

export async function handleTictactoeInvite(sock, m, session, gameId, text) {
    if (session.gameId !== gameId || session.game_type !== 'ttt_invite') return;
    if (text.toLowerCase() !== 'terima') return;

    if (m.sender !== session.players[1].jid) {
        return sock.sendMessage(m.key.remoteJid, { text: 'Hanya pemain yang ditantang yang bisa menerima.' }, { quoted: m });
    }

    const p1 = statements.getRpgUser.get(session.players[0].jid);
    const p2 = statements.getRpgUser.get(session.players[1].jid);

    if (!p1 || !p2 || p1.money < session.bet || p2.money < session.bet) {
        statements.deleteGameSession.run(m.key.remoteJid);
        gameSessionCache.delete(m.key.remoteJid);
        return sock.sendMessage(m.key.remoteJid, { text: 'Salah satu pemain tidak memiliki cukup koin lagi. Tantangan dibatalkan.' }, { quoted: m });
    }

    try {
        db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(session.bet, session.players[0].jid);
        db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(session.bet, session.players[1].jid);
        rpgUserCache.delete(session.players[0].jid);
        rpgUserCache.delete(session.players[1].jid);

        const newSession = { ...session, game_type: 'tictactoe', mode: 'pvp', board: Array(9).fill(''), currentPlayerIndex: 0 };
        const expiresAt = Date.now() + TTT_GAME_TIMEOUT_MS;
        statements.insertOrReplaceGameSession.run(m.key.remoteJid, 'tictactoe', JSON.stringify(newSession), expiresAt);
        newSession.db_expires_at = expiresAt;
        gameSessionCache.set(m.key.remoteJid, newSession);

        const messageText = createGameMessage(newSession, 'Permainan dimulai!');
        await sock.sendMessage(m.key.remoteJid, { text: messageText, mentions: [session.players[0].jid, session.players[1].jid] });
    } catch (error) {
        console.error("Gagal memulai game PvP TTT:", error);
    }
}

export async function handleTictactoeMove(sock, m, session, gameId, text) {
    if (session.gameId !== gameId || session.game_type !== 'tictactoe') return;

    const currentPlayer = session.players[session.currentPlayerIndex];
    if (currentPlayer.jid !== m.sender) {
        return sock.sendMessage(m.key.remoteJid, { text: 'Bukan giliranmu.' }, { quoted: m });
    }

    const move = parseInt(text.trim(), 10) - 1;
    if (isNaN(move) || move < 0 || move > 8 || session.board[move] !== '') {
        return sock.sendMessage(m.key.remoteJid, { text: 'Pilihan tidak valid. Pilih nomor kotak yang masih kosong.' }, { quoted: m });
    }

    session.board[move] = currentPlayer.symbol;
    let winnerSymbol = checkWin(session.board, currentPlayer.symbol) ? currentPlayer.symbol : null;
    let isDraw = !winnerSymbol && checkDraw(session.board);

    if (winnerSymbol || isDraw) {
        return handleGameEnd(sock, m.key.remoteJid, session, winnerSymbol, isDraw);
    }

    session.currentPlayerIndex = 1 - session.currentPlayerIndex;
    
    const nextPlayer = session.players[session.currentPlayerIndex];
    if (nextPlayer.jid === 'AI') {
        const aiPlayer = nextPlayer;
        const humanPlayer = session.players[1 - session.currentPlayerIndex];
        const turnCount = 9 - session.board.filter(c => c === '').length;
        const aiMove = makeAiMove(session.board, session.mode, aiPlayer.symbol, humanPlayer.symbol, turnCount);
        session.board[aiMove] = aiPlayer.symbol;
        
        winnerSymbol = checkWin(session.board, aiPlayer.symbol) ? aiPlayer.symbol : null;
        isDraw = !winnerSymbol && checkDraw(session.board);

        if (winnerSymbol || isDraw) {
            return handleGameEnd(sock, m.key.remoteJid, session, winnerSymbol, isDraw);
        }
        session.currentPlayerIndex = 1 - session.currentPlayerIndex;
    }

    const expiresAt = Date.now() + TTT_GAME_TIMEOUT_MS;
    statements.insertOrReplaceGameSession.run(m.key.remoteJid, 'tictactoe', JSON.stringify(session), expiresAt);
    session.db_expires_at = expiresAt;
    gameSessionCache.set(m.key.remoteJid, session);
    
    const messageText = createGameMessage(session, 'Lanjutkan!');
    const mentions = session.players.filter(p => p.jid !== 'AI').map(p => p.jid);
    await sock.sendMessage(m.key.remoteJid, { text: messageText, mentions });
}