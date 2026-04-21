const socket = io();

// UI Elements
const screenLogin = document.getElementById('login-screen');
const screenGame = document.getElementById('game-screen');
const btnJoin = document.getElementById('btn-join');
const inputName = document.getElementById('username');

const oppName = document.getElementById('opp-name');
const oppChips = document.getElementById('opp-chips');
const oppHands = document.getElementById('opp-hands');

const potAmount = document.getElementById('pot-amount');
const centerSlot = document.getElementById('center-slot');
const systemMsg = document.getElementById('system-msg');

const myName = document.getElementById('my-name');
const myChips = document.getElementById('my-chips');
const myHands = document.getElementById('my-hands');
const actionPanel = document.getElementById('action-panel');
const betRange = document.getElementById('bet-range');
const betValue = document.getElementById('bet-value');
const btnFight = document.getElementById('btn-fight');
const btnPass = document.getElementById('btn-pass');

const resultModal = document.getElementById('result-modal');
const gameoverModal = document.getElementById('gameover-modal');
const shuffleOverlay = document.getElementById('shuffle-overlay');

let myCards = [];
let selectedCardId = null;
let maxBet = 0;
let isMyTurn = false;

// Helpers
const getSuitSymbol = (suit) => {
    switch(suit) {
        case 'Spades': return '♠';
        case 'Hearts': return '♥';
        case 'Diamonds': return '♦';
        case 'Clubs': return '♣';
    }
};
const getSuitColor = (suit) => {
    return (suit === 'Hearts' || suit === 'Diamonds') ? 'red' : 'black';
};

const renderCard = (card) => {
    return `
        <div class="playing-card ${getSuitColor(card.suit)} anim-pop">
            <span class="rank-top">${card.rank}</span>
            <span>${getSuitSymbol(card.suit)}</span>
            <span class="rank-bot">${card.rank}</span>
        </div>
    `;
};

// Listeners
btnJoin.addEventListener('click', () => {
    const name = inputName.value.trim();
    if(name) {
        socket.emit('join_game', name);
    } else {
        alert("ใส่ชื่อเล่นก่อนงับ!");
    }
});

betRange.addEventListener('input', (e) => {
    betValue.innerText = e.target.value;
});

btnPass.addEventListener('click', () => {
    if(!isMyTurn) return;
    socket.emit('action_pass');
    actionPanel.style.display = 'none';
});

btnFight.addEventListener('click', () => {
    if(!isMyTurn) return;
    const bet = parseInt(betRange.value);
    socket.emit('action_fight', { betAmount: bet });
    actionPanel.style.display = 'none';
});

// Socket Events
socket.on('error_msg', (msg) => { alert(msg); });

socket.on('wait_for_flip', (data) => {
    actionPanel.style.display = 'none';
    if (socket.id === data.flipperId) {
        centerSlot.innerHTML = `
            <div id="btn-flip" class="card-back pulse-glow" style="width:110px; height:160px; margin:0 auto; box-shadow: 0 0 25px #10b981; border-color:#10b981; cursor:pointer;" onclick="socket.emit('flip_center_card'); centerSlot.innerHTML='<div class=\\'card-back\\' style=\\'width:110px; height:160px; margin:0;\\'></div>';">
                <div style="display:flex; justify-content:center; align-items:center; height:100%; font-size:4rem;">👆</div>
            </div>
            <div style="position:absolute; bottom:-35px; font-size:1.1rem; color:#10b981; font-weight:bold; text-shadow:0 0 10px #10b981; width:200px; text-align:center; left:50%; transform:translateX(-50%); z-index:50;">👉 จิ้มเพื่อเปิดไพ่! 👈</div>
        `;
        systemMsg.innerText = "คู่แข่งสู้แล้ว! ตานี้ตาคุณเป็นคนเปิดไพ่ตัดสิน!";
    } else {
        systemMsg.innerText = `⏳ ลุ้นระทึก! รอ ${data.flipperName} กระชากไพ่กองกลาง...`;
        centerSlot.innerHTML = '<div class="card-back pulse-glow" style="width:110px; height:160px; margin:0 auto; box-shadow: 0 0 10px #ff3366; border-color:#ff3366;"></div><div style="position:absolute; bottom:-30px; font-size:0.9rem; color:#ff3366; font-weight:bold;">🔥 ไพ่ชี้ชะตา!</div>';
    }
});

socket.on('start_shuffle', () => {
    shuffleOverlay.classList.add('active');
    // โชว์แอนิเมชันสับไพ่
    shuffleOverlay.innerHTML = `
        <div class="shuffling-deck">
            <div class="shuffling-card anim-shuffle-1"></div>
            <div class="shuffling-card anim-shuffle-2" style="top:2px; left:2px;"></div>
            <div class="shuffling-card" style="top:4px; left:4px;"></div>
            <div class="shuffling-card" style="top:6px; left:6px;"></div>
        </div>
        <h2 style="position:absolute; bottom:20%; color:#facc15; text-shadow:0 0 10px #facc15;">กำลังสับไพ่...</h2>
    `;
    
    // เปลี่ยนเป็นแจกไพ่ปลิวไปบนล่าง
    setTimeout(() => {
        shuffleOverlay.innerHTML = `
            <div class="shuffling-deck">
                <div class="shuffling-card anim-fly-top"></div>
                <div class="shuffling-card anim-fly-bot"></div>
                <div class="shuffling-card anim-fly-top" style="animation-delay:0.1s"></div>
                <div class="shuffling-card anim-fly-bot" style="animation-delay:0.1s"></div>
                <div class="shuffling-card anim-fly-top" style="animation-delay:0.2s"></div>
                <div class="shuffling-card anim-fly-bot" style="animation-delay:0.2s"></div>
                <div class="shuffling-card anim-fly-top" style="animation-delay:0.3s"></div>
                <div class="shuffling-card anim-fly-bot" style="animation-delay:0.3s"></div>
            </div>
            <h2 style="position:absolute; bottom:20%; color:#10b981; text-shadow:0 0 10px #10b981;">แจกไพ่!</h2>
        `;
    }, 1800);
    
    // เอาหน้าต่างซ้อนออก
    setTimeout(() => {
        shuffleOverlay.classList.remove('active');
        shuffleOverlay.innerHTML = '';
    }, 3500); 
});

socket.on('system_message', (msg) => {
    systemMsg.innerText = msg;
});

socket.on('game_state', (data) => {
    screenLogin.classList.remove('active');
    screenGame.classList.add('active');

    // Default resetting selections
    // Player Info
    myName.innerText = data.me.name;
    myChips.innerText = '💰 ' + data.me.chips;
    
    // Opponent Info
    if (data.opponent) {
        oppName.innerText = data.opponent.name;
        oppChips.innerText = '💰 ' + data.opponent.chips;
        oppHands.innerHTML = '';
        for(let i=0; i<data.opponent.handCount; i++) {
            oppHands.innerHTML += '<div class="card-back"></div>';
        }
    } else {
        oppName.innerText = "รอผู้เล่น...";
        oppChips.innerText = "💰 0";
        oppHands.innerHTML = "";
    }

    // Pot & Center
    potAmount.innerText = data.pot;
    if (data.gameStarted && data.pot > 0) {
        centerSlot.innerHTML = '<div class="card-back" style="width:110px; height:160px; margin:0 auto; box-shadow: 0 5px 15px rgba(0,0,0,0.6);"></div><div style="position:absolute; bottom:-30px; font-size:0.9rem; color:#facc15; font-weight:bold;">🔥 ไพ่ปริศนา!</div>';
    } else {
        centerSlot.innerHTML = '';
    }

    // Render My Hands
    myHands.innerHTML = '';
    data.me.hand.forEach(card => {
        const btn = document.createElement('div');
        btn.className = 'my-card-btn';
        btn.innerHTML = renderCard(card);
        myHands.appendChild(btn);
    });

    // Handle Turn
    isMyTurn = data.me.isMyTurn;
    if (isMyTurn && data.gameStarted && data.pot > 0) {
        actionPanel.style.display = 'block';
        maxBet = Math.min(data.me.chips, data.pot);
        
        betRange.min = 1;
        betRange.max = maxBet;
        betRange.value = maxBet; 
        betValue.innerText = maxBet;
        systemMsg.innerText = "⭐ ตาของคุณแล้ว! เดาใจว่าไพ่ใบไหนจะใหญ่กว่าไพ่กองกลางที่คว่ำอยู่!";
    } else {
        actionPanel.style.display = 'none';
        if(data.gameStarted) {
            systemMsg.innerText = "⏳ รออีกฝ่ายตัดสินใจ...";
        }
    }
});

socket.on('fight_result', (data) => {
    resultModal.classList.add('show');
    document.getElementById('res-center-card').innerHTML = renderCard(data.centerCard);
    document.getElementById('res-player-card').innerHTML = renderCard(data.playedCard);
    document.getElementById('res-player-name').innerText = data.playerName;
    
    const title = document.getElementById('result-title');
    title.innerText = data.isWin ? "🔥 ตีแตกแตกกระจาย!" : "❌ หน้าแตก เสียเงิน!";
    title.style.color = data.isWin ? "#10b981" : "#ef4444";
    
    const actionText = data.isWin ? 'ได้เงินรางวัล' : `เสียเงิน ${data.failReason}`;
    document.getElementById('result-desc').innerText = 
        `${data.playerName} ${actionText} ${data.betAmount} เหรียญ`;

    setTimeout(() => {
        resultModal.classList.remove('show');
    }, 4500); // 4.5s
});

socket.on('game_over', (data) => {
    gameoverModal.classList.add('show');
    document.getElementById('bankrupt-msg').innerText = `${data.loser} เงินหมดเกลี้ยงแล้วจ้า! (ล้มละลาย)`;
    document.getElementById('punishment-text').innerText = data.punishment;
});
