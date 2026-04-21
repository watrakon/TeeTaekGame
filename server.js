const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const localtunnel = require('localtunnel');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// Game State
let players = [];
let pot = 0;
let deck = [];
let centerCard = null;
let currentTurnIndex = 0;
let gameStarted = false;
let actionsInRound = 0;
let pendingFight = null;

const suits = ['Clubs', 'Diamonds', 'Hearts', 'Spades']; 
const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function initDeck() {
    deck = [];
    suits.forEach((suit, sIndex) => {
        ranks.forEach((rank, rIndex) => {
            deck.push({ 
                suit, 
                rank, 
                power: (rIndex + 2) * 10 + (sIndex + 1), // e.g. A Spades = 14*10 + 4 = 144
                id: `${rank}_of_${suit}`
            });
        });
    });
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function drawCard() {
    if (deck.length === 0) initDeck();
    return deck.pop();
}

function checkAnte() {
    if (pot === 0 && players.length === 2) {
        players.forEach(p => {
            if(p.chips >= 10) {
                p.chips -= 10;
                pot += 10;
            }
        });
        io.emit('system_message', '💰 ระบบหักเงินเดิมพันเริ่มตาใหม่ คนละ 10 กองกลาง');
    }
}

function completeTurn() {
    actionsInRound++;
    if (actionsInRound >= 2) {
        actionsInRound = 0;
        io.emit('start_shuffle');
        io.emit('system_message', '🔄 จบ 1 รอบ ทำการล้างไพ่ ชับๆ!');
        setTimeout(() => {
            initDeck();
            players.forEach(p => {
                p.hand = [];
                for(let i=0; i<4; i++) p.hand.push(drawCard());
            });
            checkAnte();
            currentTurnIndex = (currentTurnIndex + 1) % 2;
            broadcastState();
        }, 3600);
    } else {
        checkAnte();
        currentTurnIndex = (currentTurnIndex + 1) % 2;
        broadcastState();
    }
}

function broadcastState() {
    players.forEach((p, idx) => {
        const opponent = players[(idx + 1) % 2];
        io.to(p.socketId).emit('game_state', {
            me: {
                name: p.name,
                chips: p.chips,
                hand: p.hand,
                isMyTurn: gameStarted && currentTurnIndex === idx
            },
            opponent: opponent ? {
                name: opponent.name,
                chips: opponent.chips,
                handCount: opponent.hand.length
            } : null,
            pot,
            gameStarted
        });
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_game', (name) => {
        if (players.length >= 2) {
            socket.emit('error_msg', 'ห้องเต็มแล้วครับ รอให้คนเก่าออกก่อน');
            return;
        }
        players.push({
            id: socket.id,
            socketId: socket.id,
            name: name,
            chips: 100,
            hand: []
        });
        
        io.emit('system_message', `👋 ${name} เข้าร่วมเข้าโต๊ะแล้ว`);
        
        if (players.length === 2 && !gameStarted) {
            gameStarted = true;
            io.emit('system_message', '🔥 เกมเริ่มแล้ว! เตรียมสับไพ่!!');
            io.emit('start_shuffle');
            setTimeout(() => {
                initDeck();
                pot = 0; 
                players.forEach(p => {
                    p.hand = [];
                    for(let i=0; i<4; i++) p.hand.push(drawCard());
                });
                checkAnte();
                currentTurnIndex = 0;
                actionsInRound = 0;
                broadcastState();
            }, 3600);
        }
        broadcastState();
    });

    socket.on('action_pass', () => {
        const player = players.find(p => p.id === socket.id);
        if (!player || players[currentTurnIndex].id !== socket.id) return;
        io.emit('system_message', `😴 ${player.name} ขอผ่าน หมอบจ้า!`);
        setTimeout(() => { completeTurn(); }, 1500);
    });

    socket.on('action_fight', ({ betAmount }) => {
        if (pendingFight) return;
        const player = players.find(p => p.id === socket.id);
        if (!player || players[currentTurnIndex].id !== socket.id) return;
        if (betAmount > pot || betAmount <= 0) return;
        if (betAmount > player.chips) return;

        pendingFight = { player, betAmount };

        const flipper = players[(currentTurnIndex + 1) % 2];
        io.emit('wait_for_flip', {
            flipperId: flipper.id,
            flipperName: flipper.name
        });
    });

    socket.on('flip_center_card', () => {
        if (!pendingFight) return;
        
        const expectedFlipperId = players[(currentTurnIndex + 1) % 2].id;
        if (socket.id !== expectedFlipperId) return;

        const player = pendingFight.player;
        const betAmount = pendingFight.betAmount;
        pendingFight = null;

        const drawnCenterCard = drawCard(); // เปิดไพ่กองกลาง

        // ลอจิกสู้ไพ่ 4 ใบ (หาค่ายิ่งใหญ่สุดในดอกเดียวกัน)
        let playedCard = null;
        let isWin = false;
        let failReason = "";

        const matchingCards = player.hand.filter(c => c.suit === drawnCenterCard.suit);
        
        if (matchingCards.length > 0) {
            // ดึงไพ่ดอกเดียวกันที่แต้มสูงที่สุดออกมา
            matchingCards.sort((a,b) => b.power - a.power);
            playedCard = matchingCards[0];
            
            if (playedCard.power > drawnCenterCard.power) {
                isWin = true;
            } else {
                failReason = "(มีดอกตรง แต่แต้มต่ำกว่า)";
            }
        } else {
            // ถ้าไม่มีดอกตรงกันเลย ถือว่าแพ้ และสุ่มดึงไพ่ที่ห่วยสุดในมือทิ้ง
            const sortedHand = [...player.hand].sort((a,b) => a.power - b.power);
            playedCard = sortedHand[0];
            failReason = "(ไม่มีดอกไพ่ชนิดนี้ในมือ)";
        }

        // หักไพ่ที่ถูกใช้งาน (หรือถูกทิ้ง) และไม่มีการจั่วจนกว่าจะจบวง
        const cardIndex = player.hand.findIndex(c => c.id === playedCard.id);
        if (cardIndex !== -1) player.hand.splice(cardIndex, 1);

        io.emit('fight_result', {
            playerName: player.name,
            playedCard: playedCard,
            centerCard: drawnCenterCard,
            betAmount: betAmount,
            isWin: isWin,
            failReason: failReason
        });

        if (isWin) {
            // Win
            player.chips += betAmount;
            pot -= betAmount;
            io.emit('system_message', `🎉 ${player.name} ตีแตกสำเร็จ! คว้าเงิน ${betAmount}`);
        } else {
            // Lose
            player.chips -= betAmount;
            pot += betAmount;
            io.emit('system_message', `❌ ${player.name} หน้าแตก! เสียเงิน ${betAmount} ให้กองกลาง`);
        }

        // Check bankrupt
        const loser = players.find(p => p.chips <= 0);
        if (loser) {
            io.emit('game_over', {
                loser: loser.name,
                punishment: ['ดึงแก้ม 5 ที', 'นวดไหล่ 15 นาที', 'ซักผ้า 1 ตะกร้า', 'เลี้ยงข้าว 1 มื้อ', 'ตามใจ 1 วันเต็มๆ', 'หอมแก้ม 1 ฟอด'][Math.floor(Math.random()*6)]
            });
            gameStarted = false;
        } else {
            // Delay next turn for animation
            setTimeout(() => {
                completeTurn();
            }, 4500);
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        gameStarted = false;
        io.emit('system_message', '⚠️ มีผู้เล่นหลุดออกจากเกม รบกวนกดรีเฟรชหน้าเว็บเพื่อเข้าใหม่ครับ');
        broadcastState();
    });
});

const PORT = 3000;
server.listen(PORT, async () => {
    console.log(`\nLocal Server is setting up...`);
    try {
        const tunnel = await localtunnel({ port: PORT });
        console.log(`\n\n======================================================`);
        console.log(`  🎉 สร้างห้องเจาะทะลุจังหวัดสำเร็จแล้ว! `);
        console.log(`  ✨ ก๊อปลิ้งก์ตัวแดงๆ ด้านล่างนี้ส่งให้แฟนกดเข้าได้เลย:`);
        console.log(`\n  👉  ${tunnel.url}  👈\n`);
        console.log(`  (ปล. เวลาเข้าเว็บครั้งแรก อาจจะต้องกดปุ่ม 'Click to Continue' 1 ทีนะครับ)`);
        console.log(`======================================================\n\n`);
        
        tunnel.on('close', () => {
             console.log('Tunnel Closed');
        });
        
        tunnel.on('error', (err) => {
             console.log('⚠️ Tunnel Connection Error (ระบบอุโมงค์สะดุดชั่วคราว):', err.message);
             console.log('ไม่ต้องตกใจ เซิร์ฟเวอร์ยังทำงานต่อได้ครับ! ถ้าค้างให้ลองรัน npm start ใหม่');
        });
    } catch (err) {
        console.log("Error creating tunnel: ", err);
    }
});
