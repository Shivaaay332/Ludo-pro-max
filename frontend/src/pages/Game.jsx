import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';

export default function Game() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const roomParam = searchParams.get('room') || '';

    // ── GAME VARIABLES ──────────────────────────────────────────────────────
    const colorRotations = { blue: '0deg', red: '-90deg', green: '180deg', yellow: '90deg' };
    const dicePatterns = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const starPositions = [[7,2],[3,7],[2,9],[7,13],[9,14],[13,9],[14,7],[9,3]];
    const mainPath = [[7,2],[7,3],[7,4],[7,5],[7,6],[6,7],[5,7],[4,7],[3,7],[2,7],[1,7],[1,8],[1,9],[2,9],[3,9],[4,9],[5,9],[6,9],[7,10],[7,11],[7,12],[7,13],[7,14],[7,15],[8,15],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[10,9],[11,9],[12,9],[13,9],[14,9],[15,9],[15,8],[15,7],[14,7],[13,7],[12,7],[11,7],[10,7],[9,6],[9,5],[9,4],[9,3],[9,2],[9,1],[8,1],[7,1]];
    const homePaths = { red:[[8,2],[8,3],[8,4],[8,5],[8,6],[8,7]], green:[[2,8],[3,8],[4,8],[5,8],[6,8],[7,8]], yellow:[[8,14],[8,13],[8,12],[8,11],[8,10],[8,9]], blue:[[14,8],[13,8],[12,8],[11,8],[10,8],[9,8]] };
    const colorOffsets = { red: 0, green: 13, yellow: 26, blue: 39 };

    let socket = io("https://ludo-pro-max.onrender.com", {
        transports: ["websocket", "polling"]
    });
    
    let myRoomId = '', myColor = '', myName = '', isHost = false, wasHost = false;
    let winnersRanking = [], roomPlayersInfo = [], pendingJoinReqId = null;
    let soundEnabled = true, fireworksInterval = null, gameResultReported = false;
    let activeColors = [];
    let gameState = { red:[-1,-1,-1,-1], green:[-1,-1,-1,-1], yellow:[-1,-1,-1,-1], blue:[-1,-1,-1,-1] };
    let currentTurnColor = '', currentRoll = 0, hasRolled = false, isAnimating = false, isRequestingRoll = false;
    let cells = {};
    let currentUser = null;
    let audioCtx;

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function $(id) { return document.getElementById(id); }

    // ── AUTH CHECK ───────────────────────────────────────────────────────────
    (async () => {
      try {
        const token = localStorage.getItem('ludo_token');
        const url = token ? '/api/auth/me?token=' + encodeURIComponent(token) : '/api/auth/me';
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) { localStorage.removeItem('ludo_token'); navigate('/'); return; }
        currentUser = data.user;
        if ($('playerNameInput')) $('playerNameInput').value = data.user.username;
        if (roomParam && $('roomIdInput')) $('roomIdInput').value = roomParam;
      } catch { navigate('/'); }
    })();

    // ── AUDIO ────────────────────────────────────────────────────────────────
    const handleAudioInit = () => { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); };
    document.body.addEventListener('click', handleAudioInit, { once: false });

    function playSound(type) {
      if (!audioCtx || audioCtx.state === 'suspended' || !soundEnabled) return;
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      if (type === 'dice') { osc.type='triangle'; osc.frequency.setValueAtTime(300,audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(800,audioCtx.currentTime+0.1); gain.gain.setValueAtTime(0.5,audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1); osc.start(); osc.stop(audioCtx.currentTime+0.1); }
      else if (type === 'move') { osc.type='sine'; osc.frequency.setValueAtTime(400,audioCtx.currentTime); gain.gain.setValueAtTime(0.4,audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1); osc.start(); osc.stop(audioCtx.currentTime+0.1); }
      else if (type === 'kill') { osc.type='sawtooth'; osc.frequency.setValueAtTime(100,audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(30,audioCtx.currentTime+0.3); gain.gain.setValueAtTime(0.8,audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.3); osc.start(); osc.stop(audioCtx.currentTime+0.3); }
      else if (type === 'halal') { osc.type='sine'; osc.frequency.setValueAtTime(500,audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(1000,audioCtx.currentTime+0.5); gain.gain.setValueAtTime(0.3,audioCtx.currentTime); osc.start(); osc.stop(audioCtx.currentTime+0.5); }
    }

    function toggleSound() { soundEnabled = !soundEnabled; if ($('soundBtn')) $('soundBtn').innerText = soundEnabled ? '🔊' : '🔇'; if (soundEnabled) playSound('move'); }
    window.__toggleSound = toggleSound;

    // ── UI HELPERS ───────────────────────────────────────────────────────────
    function showToast(msg) { const t=$('scoreToast'); if(!t)return; t.innerText=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
    function showBanner(html, isLoser=false) { const b=$('winBanner'); if(!b)return; b.innerHTML=html; if(isLoser)b.classList.add('loser'); else b.classList.remove('loser'); b.classList.add('show'); setTimeout(()=>b.classList.remove('show'),4000); }

    function toggleMenu(id) {
      const emojiMenu=$('emojiMenu'), chatMenu=$('chatMenu');
      const target=$(id);
      const isOpen = target && target.style.display==='flex';
      if(emojiMenu) emojiMenu.style.display='none';
      if(chatMenu) chatMenu.style.display='none';
      if(target && !isOpen) target.style.display='flex';
    }
    window.__toggleMenu = toggleMenu;

    function sendInteract(type, content) {
      const emojiMenu=$('emojiMenu'), chatMenu=$('chatMenu');
      if(emojiMenu) emojiMenu.style.display='none';
      if(chatMenu) chatMenu.style.display='none';
      socket.emit('sendInteraction',{roomId:myRoomId,color:myColor,type,content});
    }
    window.__sendInteract = sendInteract;

    socket.on('showInteraction',(data)=>{
      const base=$(`base-${data.color}`);
      if(base){const el=document.createElement('div');el.className=data.type==='emoji'?'floating-anim float-emoji':'floating-anim float-chat';el.innerText=data.content;base.appendChild(el);setTimeout(()=>el.remove(),3000);}
    });

    // ── FIREWORKS ────────────────────────────────────────────────────────────
    function launchFireworks(colorHex) {
      const canvas=$('fireworks'),ctx=canvas.getContext('2d');
      canvas.width=window.innerWidth; canvas.height=window.innerHeight;
      const x=Math.random()*canvas.width, y=Math.random()*canvas.height*0.5, particles=[];
      for(let i=0;i<40;i++){const angle=(Math.PI*2/40)*i,speed=Math.random()*4+2;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,color:colorHex||'#ffd700'});}
      function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.05;p.life-=0.02;ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();});if(particles.some(p=>p.life>0))requestAnimationFrame(draw);else ctx.clearRect(0,0,canvas.width,canvas.height);}
      draw();
    }
    function startContinuousFireworks(colorHex) { clearInterval(fireworksInterval); fireworksInterval=setInterval(()=>launchFireworks(colorHex),800); }
    function launchMiniFireworks(colorName) { const base=$(`base-${colorName}`); if(!base)return; const em=document.createElement('div');em.className='floating-anim float-emoji';em.innerText='✨';base.appendChild(em);setTimeout(()=>em.remove(),2500); }

    // ── GAME OVER MODAL ──────────────────────────────────────────────────────
    function showGameOverModal(rankings) {
      const colorH={blue:'#0084ff',red:'#ff3b3b',green:'#00b84c',yellow:'#ffcc00'};
      let html='';
      rankings.forEach(e=>{html+=`<div class="go-row"><div class="go-rank gr${e.rank}">${e.rank}</div><div class="go-color-dot" style="background:${colorH[e.color]||'#fff'}"></div><div class="go-name">${esc(e.name)}</div><div class="go-kills">💀 ${e.kills||0}</div></div>`;});
      if($('gameOverContent'))$('gameOverContent').innerHTML=html;
      if($('goSaved'))$('goSaved').style.display='none';
      if($('gameOverModal'))$('gameOverModal').style.display='flex';
    }

    socket.on('scoreSaved',(data)=>{
      if(data.success){if($('goSaved'))$('goSaved').style.display='block';showToast('✅ Score saved to leaderboard!');}
    });

    // ── BOARD INIT ───────────────────────────────────────────────────────────
    function initEmptyBoard() {
      const board=$('board'); if(!board)return;
      document.querySelectorAll('.cell').forEach(c => c.remove());
      cells = {};

      for(let r=1;r<=15;r++){for(let c=1;c<=15;c++){
        if((r<=6&&c<=6)||(r<=6&&c>=10)||(r>=10&&c<=6)||(r>=10&&c>=10)||(r>=7&&r<=9&&c>=7&&c<=9)) continue;
        const cell=document.createElement('div');cell.className='cell';cell.style.gridArea=`${r}/${c}`;cell.id=`c_${r}_${c}`;
        if(r==8&&c>1&&c<7) cell.style.backgroundColor='rgba(255,59,59,0.2)';
        if(c==8&&r>1&&r<7) cell.style.backgroundColor='rgba(0,184,76,0.2)';
        if(r==8&&c>9&&c<15) cell.style.backgroundColor='rgba(255,204,0,0.2)';
        if(c==8&&r>9&&r<15) cell.style.backgroundColor='rgba(0,132,255,0.2)';
        if(starPositions.some(p=>p[0]==r&&p[1]==c)) cell.classList.add('safe-zone');
        board.appendChild(cell); cells[`${r}_${c}`]=cell;
      }}
    }

    function buildActiveBases() {
      document.querySelectorAll('.token').forEach(t=>t.remove());
      document.querySelectorAll('.base').forEach(e=>e.remove());
      if($('restartContainer'))$('restartContainer').innerHTML='';
      ['red','green','yellow','blue'].forEach(color=>{
        const base=document.createElement('div');base.className=`base base-${color}`;base.id=`base-${color}`;
        const winDisp=document.createElement('div');winDisp.className='winner-display';winDisp.id=`win-disp-${color}`;base.appendChild(winDisp);
        const inner=document.createElement('div');inner.className='base-inner';
        if(activeColors.includes(color)){
          for(let i=0;i<4;i++){const spot=document.createElement('div');spot.className='base-spot';spot.id=`spot_${color}_${i}`;const t=document.createElement('div');t.className=`token ${color}`;t.id=`t_${color}_${i}`;t.onclick=()=>requestTokenMove(color,i);spot.appendChild(t);inner.appendChild(spot);}
          const diceHTML=`<div class="dice-neon-container" id="box-${color}" style="display:flex;"><div class="online-dot" id="status-${color}"></div><div class="dice-box" id="dice-${color}" onclick="window.__rollDice('${color}')"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
          base.insertAdjacentHTML('beforeend',diceHTML);
        }
        base.appendChild(inner);
        const board=$('board');if(board)board.appendChild(base);
        if(activeColors.includes(color)) drawDice(color,1);
      });
    }

    function getPlayerName(col){const p=roomPlayersInfo.find(x=>x.color===col);return p?p.name:col;}

    // ── JOIN ROOM ────────────────────────────────────────────────────────────
    let reconnectRoomId = null;
    
    function joinRoom() {
      const inputName=($('playerNameInput')?.value||'').trim()||currentUser?.username||'Player';
      const inputCode=($('roomIdInput')?.value||'').trim();
      if(!inputCode){alert('Enter Room Code!');return;}
      if($('playerNameInput'))$('playerNameInput').style.display='none';
      if($('roomIdInput'))$('roomIdInput').style.display='none';
      if($('joinBtn'))$('joinBtn').style.display='none';
      if($('lobbyStatus'))$('lobbyStatus').innerHTML='Connecting...';
      myRoomId=inputCode;
      socket.emit('joinRoom',{id:myRoomId,name:inputName,userId:currentUser?.id});
      
      // Show share section
      if($('shareSection'))$('shareSection').style.display='block';
      const shareLink = window.location.origin + '/game?room=' + encodeURIComponent(inputCode);
      if($('shareLinkInput'))$('shareLinkInput').value=shareLink;
    }
    window.__joinRoom = joinRoom;

    // Rejoin functionality
    function attemptRejoin() {
      if (!reconnectRoomId || !currentUser?.id) return;
      socket.emit('rejoinRoom', { roomId: reconnectRoomId, userId: currentUser.id });
    }
    window.__attemptRejoin = attemptRejoin;
    
    // Leave from rejoin modal
    function leaveFromRejoin() {
      reconnectRoomId = null;
      localStorage.removeItem('lastRoomId');
      if($('rejoinModal'))$('rejoinModal').style.display='none';
      navigate('/dashboard');
    }
    window.__leaveFromRejoin = leaveFromRejoin;

    // Check for stored room ID on page load
    if (roomParam) {
      const storedRoom = localStorage.getItem('lastRoomId');
      if (storedRoom && storedRoom !== roomParam) {
        // User has previous room, show rejoin option
        reconnectRoomId = storedRoom;
      }
    }

    socket.on('errorMsg',(msg)=>{
      alert(msg);
      if($('playerNameInput'))$('playerNameInput').style.display='block';
      if($('roomIdInput'))$('roomIdInput').style.display='block';
      if($('joinBtn'))$('joinBtn').style.display='block';
      if($('lobbyStatus'))$('lobbyStatus').innerHTML='';
    });

    socket.on('joined',(data)=>{
      if($('playerNameInput'))$('playerNameInput').style.display='none';
      if($('roomIdInput'))$('roomIdInput').style.display='none';
      if($('joinBtn'))$('joinBtn').style.display='none';
      if($('rejoinModal'))$('rejoinModal').style.display='none';
      myColor=data.color; isHost=data.isHost; myName=data.name; wasHost=isHost;
      reconnectRoomId = data.roomId;
      localStorage.setItem('lastRoomId', data.roomId);
      if($('roomCodeDisplay'))$('roomCodeDisplay').innerText=`Room: ${data.roomId}`;
      if($('myColorDisp'))$('myColorDisp').innerHTML=`You: <b style="color:var(--${myColor})">${myName} (${myColor.toUpperCase()})</b>`;
      const gw=$('gameWrapper');if(gw)gw.style.setProperty('--board-rot',colorRotations[myColor]);
      
      // Show share section
      if($('shareSection'))$('shareSection').style.display='block';
      const shareLink = window.location.origin + '/game?room=' + encodeURIComponent(data.roomId);
      if($('shareLinkInput'))$('shareLinkInput').value=shareLink;
    });

    socket.on('rejoined',(data)=>{
      if($('rejoinModal'))$('rejoinModal').style.display='none';
      myColor=data.color; isHost=data.isHost; myName=data.name; wasHost=isHost;
      reconnectRoomId = data.roomId;
      localStorage.setItem('lastRoomId', data.roomId);
      if($('roomCodeDisplay'))$('roomCodeDisplay').innerText=`Room: ${data.roomId}`;
      if($('myColorDisp'))$('myColorDisp').innerHTML=`You: <b style="color:var(--${myColor})">${myName} (${myColor.toUpperCase()})</b>`;
      const gw=$('gameWrapper');if(gw)gw.style.setProperty('--board-rot',colorRotations[myColor]);
      
      // If game is in progress, restore state
      if(data.gameState) {
        activeColors = data.gameState.activeColors;
        currentTurnColor = data.gameState.turnColor;
        gameState = data.gameState.gameState;
        buildActiveBases();
        render();
        updateTurnStatus();
      }
      
      showToast('🔄 Reconnected!');
    });

    // Player disconnected/reconnected
    socket.on('playerDisconnected',(data)=>{
      showToast(`${data.name} disconnected`);
    });
    
    socket.on('playerRejoined',(data)=>{
      showToast(`${data.name} reconnected!`);
    });

    // Game invite
    socket.on('gameInvite',(data)=>{
      if($('inviteText'))$('inviteText').innerText=`${data.fromName} invited you to play! Room: ${data.roomId}`;
      if($('inviteModal'))$('inviteModal').style.display='flex';
      window.__inviteRoom = data.roomId;
    });
    
    if(typeof window.__acceptInvite === 'undefined') {
      window.__acceptInvite = function() {
        const room = window.__inviteRoom;
        if($('inviteModal'))$('inviteModal').style.display='none';
        if(room) {
          navigate('/game?room=' + encodeURIComponent(room));
        }
      };
    }
    
    if(typeof window.__declineInvite === 'undefined') {
      window.__declineInvite = function() {
        if($('inviteModal'))$('inviteModal').style.display='none';
      };
    }

    // In-game chat
    function sendChatMsg() {
      const input = $('chatInput');
      if(!input || !input.value.trim()) return;
      const msg = input.value.trim();
      input.value = '';
      socket.emit('sendChat', { roomId: myRoomId, message: msg });
    }
    window.__sendChatMsg = sendChatMsg;
    
    socket.on('chatHistory', (data) => {
      const container = $('chatMessages');
      if(!container) return;
      container.innerHTML = '';
      data.messages.forEach(msg => addChatMessage(msg));
    });
    
    socket.on('newChat', (data) => {
      addChatMessage(data);
    });
    
    function addChatMessage(data) {
      const container = $('chatMessages');
      if(!container) return;
      const colorHex = { blue: '#0084ff', red: '#ff3b3b', green: '#00b84c', yellow: '#ffcc00' };
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-msg';
      msgEl.innerHTML = `<span class="chat-username" style="color:${colorHex[data.color]||'#fff'}">${esc(data.user)}:</span> ${esc(data.message)}`;
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    }

    // Setup chat button to open panel
    const originalToggleMenu = toggleMenu;
    toggleMenu = function(id) {
      originalToggleMenu(id);
      if(id === 'chatMenu') {
        const chatPanel = $('chatPanel');
        if(chatPanel) chatPanel.classList.add('show');
      }
    };
    window.__toggleMenu = toggleMenu;

    socket.on('updatePlayers',(data)=>{
      roomPlayersInfo=data.players; isHost=(socket.id===data.hostId);
      if(isHost&&!wasHost){alert('The previous host left. YOU are now the Host!');wasHost=true;}
      let lobbyText='Players Joined:<br><br>',adminText='';
      data.players.forEach((p,i)=>{
        lobbyText+=`<div style="margin-bottom:5px;">${i+1}. ${p.name} (${p.color.toUpperCase()})</div>`;
        const status=p.online?'🟢':'🔴';
        adminText+=`<div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:bold;font-size:14px;">${i+1}. ${p.name} ${status}</span>`;
        if(isHost&&p.id!==socket.id)adminText+=`<button class="kick-btn" onclick="window.__kickPlayer('${p.id}')">KICK</button>`;
        adminText+=`</div>`;
        const dot=$(`status-${p.color}`);if(dot){if(p.online)dot.classList.remove('offline');else dot.classList.add('offline');}
      });
      if($('adminPlayerList'))$('adminPlayerList').innerHTML=adminText;
      if(isHost&&data.players.length>0){
        if($('adminBtn'))$('adminBtn').style.display='block';
        if(activeColors.length>0){if($('restartBtn'))$('restartBtn').style.display='block';if($('startBtn'))$('startBtn').style.display='none';}
        else{if($('startBtn'))$('startBtn').style.display='block';if($('restartBtn'))$('restartBtn').style.display='none';}
      } else {
        if($('startBtn'))$('startBtn').style.display='none';
        if($('adminBtn'))$('adminBtn').style.display='none';
        if($('restartBtn'))$('restartBtn').style.display='none';
        if(!isHost&&activeColors.length===0)lobbyText+='<br>Waiting for Host to start...';
      }
      if($('lobbyStatus'))$('lobbyStatus').innerHTML=lobbyText;
      updateTurnStatus();
    });

    socket.on('migrateColor',(data)=>{
      const oldC=data.oldColor,newC=data.newColor,oldState=gameState[oldC],newState=[-1,-1,-1,-1];
      for(let i=0;i<4;i++){const p=oldState[i];if(p===-1)newState[i]=-1;else if(p>=51)newState[i]=p;else{const physicalPos=(p+colorOffsets[oldC])%52;newState[i]=(physicalPos-colorOffsets[newC]+52)%52;}}
      gameState[newC]=newState;gameState[oldC]=[-1,-1,-1,-1];
      if(myColor===oldC){myColor=newC;if($('myColorDisp'))$('myColorDisp').innerHTML=`You: <b style="color:var(--${myColor})">${myName} (${myColor.toUpperCase()})</b>`;const gw=$('gameWrapper');if(gw)gw.style.setProperty('--board-rot',colorRotations[myColor]);}
    });

    socket.on('playerStatus',(data)=>{const dot=$(`status-${data.color}`);if(dot&&data.status==='offline')dot.classList.add('offline');});
    socket.on('kickedOut',()=>{alert('You were kicked by the host.');navigate('/dashboard');});

    function kickPlayer(id){if(confirm('Kick this player?'))socket.emit('kickPlayer',{roomId:myRoomId,targetId:id});}
    window.__kickPlayer = kickPlayer;

    socket.on('playerKicked',(data)=>{
      activeColors=data.activeColors;gameState[data.color]=[-1,-1,-1,-1];
      document.querySelectorAll(`.token.${data.color}`).forEach(t=>t.remove());
      buildActiveBases();render();if($('adminModal'))$('adminModal').style.display='none';
    });

    socket.on('waitingForHostApproval',()=>{if($('lobbyStatus'))$('lobbyStatus').innerHTML='Waiting for Host to approve your entry...';});
    socket.on('joinRequest',(data)=>{pendingJoinReqId=data.requesterId;if($('reqPlayerName'))$('reqPlayerName').innerText=`${data.requesterName} wants to join!`;if($('joinRequestModal'))$('joinRequestModal').style.display='flex';});

    function answerJoinReq(accepted){if($('joinRequestModal'))$('joinRequestModal').style.display='none';socket.emit('handleJoinRequest',{roomId:myRoomId,requesterId:pendingJoinReqId,accepted,currentGameState:gameState});}
    window.__answerJoinReq = answerJoinReq;

    socket.on('midGameJoin',(data)=>{
      if($('lobby'))$('lobby').style.display='none';
      if($('mainEmojiBtn'))$('mainEmojiBtn').style.display='flex';
      if($('mainChatBtn'))$('mainChatBtn').style.display='flex';
      activeColors=data.activeColors;currentTurnColor=data.turnColor;
      if(data.gameState)gameState=data.gameState;
      buildActiveBases();render();updateTurnStatus();
    });

    // ── START GAME FIX ───────────────────────────────────────────────────────
    function startGame(){
      const btn = document.getElementById('startBtn');
      if(btn) btn.innerText = "Starting...";
      
      const safeRoomId = myRoomId || document.getElementById('roomIdInput')?.value?.trim();
      socket.emit('startGame', safeRoomId);
    }
    window.__startGame = startGame;

    function restartGame(){if(confirm('Restart game for everyone?'))socket.emit('restartGame',myRoomId);}
    window.__restartGame = restartGame;

    socket.on('gameStarted',(data)=>{
      try {
        if($('lobby'))$('lobby').style.display='none';
        if($('mainEmojiBtn'))$('mainEmojiBtn').style.display='flex';
        if($('mainChatBtn'))$('mainChatBtn').style.display='flex';
        if(isHost&&$('restartBtn'))$('restartBtn').style.display='block';
        clearInterval(fireworksInterval);
        activeColors=data.activeColors;currentTurnColor=data.turnColor;winnersRanking=[];gameResultReported=false;
        gameState={red:[-1,-1,-1,-1],green:[-1,-1,-1,-1],yellow:[-1,-1,-1,-1],blue:[-1,-1,-1,-1]};
        buildActiveBases();currentRoll=0;hasRolled=false;isAnimating=false;isRequestingRoll=false;updateTurnStatus();
      } catch (e) {
        alert("Error in loading board: " + e.message);
      }
    });

    socket.on('gameRestarted',(data)=>{
      clearInterval(fireworksInterval);
      if($('winBanner'))$('winBanner').classList.remove('show');
      if($('gameOverModal'))$('gameOverModal').style.display='none';
      activeColors=data.activeColors;currentTurnColor=data.turnColor;winnersRanking=[];gameResultReported=false;
      gameState={red:[-1,-1,-1,-1],green:[-1,-1,-1,-1],yellow:[-1,-1,-1,-1],blue:[-1,-1,-1,-1]};
      document.querySelectorAll('.winner-display').forEach(w=>w.style.display='none');
      buildActiveBases();currentRoll=0;hasRolled=false;isAnimating=false;isRequestingRoll=false;updateTurnStatus();render();
    });

    // ── DICE & MOVES ─────────────────────────────────────────────────────────
    function requestDiceRoll(color){
      if(currentTurnColor!==color||myColor!==color||isAnimating||hasRolled||isRequestingRoll||winnersRanking.includes(color))return;
      isRequestingRoll=true;socket.emit('rollDice',{roomId:myRoomId,color});
      setTimeout(()=>{if(isRequestingRoll)isRequestingRoll=false;},2000);
    }
    window.__rollDice = requestDiceRoll;

    socket.on('diceRolled',(data)=>{
      isRequestingRoll=false;isAnimating=true;playSound('dice');
      const d=$(`dice-${data.color}`);if(d)d.classList.add('rolling');
      setTimeout(()=>{currentRoll=data.roll;if(d)d.classList.remove('rolling');drawDice(data.color,currentRoll);isAnimating=false;hasRolled=true;checkMovesLocally(data.color);},500);
    });

    function checkMovesLocally(color){
      const playable=[];
      gameState[color].forEach((pos,i)=>{if((pos===-1&&currentRoll===6)||(pos!==-1&&pos+currentRoll<=56)){playable.push(i);if(color===myColor){const t=$(`t_${color}_${i}`);if(t)t.classList.add('highlight');}}});
      if(color===myColor){
        if(playable.length===0)setTimeout(()=>socket.emit('passTurn',{roomId:myRoomId}),800);
        else if(playable.length===1)setTimeout(()=>requestTokenMove(color,playable[0]),400);
      }
    }

    function requestTokenMove(color,idx){
      if(currentTurnColor!==color||myColor!==color||!hasRolled||isAnimating)return;
      const pos=gameState[color][idx];
      if(pos===-1&&currentRoll!==6)return;if(pos!==-1&&pos+currentRoll>56)return;
      hasRolled=false;document.querySelectorAll('.token').forEach(t=>t.classList.remove('highlight'));
      socket.emit('moveToken',{roomId:myRoomId,color,idx,roll:currentRoll});
    }

    socket.on('tokenMoved',async(data)=>{
      isAnimating=true;let extraTurn=false;const color=data.color;
      try{
        const idx=data.idx,syncRoll=data.roll;let currentPos=gameState[color][idx];const target=(currentPos===-1)?0:currentPos+syncRoll;
        if(currentPos===-1){gameState[color][idx]=0;playSound('move');render();await new Promise(r=>setTimeout(r,200));}
        else{for(let p=currentPos+1;p<=target;p++){gameState[color][idx]=p;playSound('move');render();await new Promise(r=>setTimeout(r,150));}}
        extraTurn=(syncRoll===6);
        if(target===56){
          extraTurn=true;playSound('halal');launchMiniFireworks(color);
          if(gameState[color].every(p=>p===56)&&!winnersRanking.includes(color)){
            winnersRanking.push(color);const rank=winnersRanking.length;
            const disp=$(`win-disp-${color}`);if(disp){disp.innerHTML=`🏆<br>#${rank}`;disp.style.display='flex';}
            if(color===myColor){showBanner(`🎉 You Won #${rank} 🏆`,false);startContinuousFireworks(getComputedStyle(document.documentElement).getPropertyValue(`--${color}`));}
          }
        }else if(target<=50){
          const myGlobalIdx=(target+colorOffsets[color])%52;let killed=false;
          for(const c of activeColors){
            if(c===color)continue;
            for(let i=0;i<gameState[c].length;i++){
              const enemyPos=gameState[c][i];
              if(enemyPos!==-1&&enemyPos<=50){
                const enemyIdx=(enemyPos+colorOffsets[c])%52;
                if(myGlobalIdx===enemyIdx&&!starPositions.some(s=>s[0]===mainPath[myGlobalIdx][0]&&s[1]===mainPath[myGlobalIdx][1])){
                  extraTurn=true;playSound('kill');
                  for(let k=enemyPos;k>=-1;k--){gameState[c][i]=k;render();await new Promise(r=>setTimeout(r,30));}
                  killed=true;if(color===myColor)socket.emit('reportKill',{roomId:myRoomId,color:myColor});
                  break;
                }
              }
            }
            if(killed)break;
          }
        }
      }catch(e){console.error(e);}
      finally{
        isAnimating=false;
        if(color===myColor){if(extraTurn&&!winnersRanking.includes(color))updateTurnStatus();else socket.emit('passTurn',{roomId:myRoomId});}
      }
    });

    socket.on('turnChanged',(data)=>{currentTurnColor=data.color;updateTurnStatus();});

    function updateTurnStatus(){
      if(activeColors.length===0)return;
      isAnimating=false;hasRolled=false;isRequestingRoll=false;
      if(winnersRanking.length>=activeColors.length-1&&activeColors.length>1){
        const statusEl=$('turnStatus');
        if(statusEl){statusEl.innerHTML='Game Over! 🏁';statusEl.style.color='white';}
        if(isHost&&$('restartContainer'))$('restartContainer').innerHTML=`<button class="btn-green" style="display:block;padding:6px 15px;font-size:14px;" onclick="window.__restartGame()">↻ Restart</button>`;
        if(!winnersRanking.includes(myColor)){showBanner('😢 YOU LOST!<br>Better luck next time.',true);if(statusEl){statusEl.innerHTML+=' (You Lost)';statusEl.style.color='var(--red)';}}
        if(!gameResultReported){
          gameResultReported=true;
          const allColors=[...activeColors],rankings=[];
          winnersRanking.forEach((c,i)=>{const p=roomPlayersInfo.find(x=>x.color===c);rankings.push({name:p?p.name:c,color:c,rank:i+1,kills:0});});
          allColors.filter(c=>!winnersRanking.includes(c)).forEach(c=>{const p=roomPlayersInfo.find(x=>x.color===c);rankings.push({name:p?p.name:c,color:c,rank:rankings.length+1,kills:0});});
          if(isHost)socket.emit('gameFinished',{roomId:myRoomId,rankings});
          setTimeout(()=>showGameOverModal(rankings),1500);
        }
        return;
      }
      const color=currentTurnColor;
      if(winnersRanking.includes(color)){if(color===myColor)socket.emit('passTurn',{roomId:myRoomId});return;}
      const pName=getPlayerName(color);
      const statusEl=$('turnStatus');
      if(statusEl){statusEl.innerHTML=color===myColor?`🎲 YOUR TURN (${myName.toUpperCase()})!`:`⏳ ${pName.toUpperCase()}'S TURN`;statusEl.style.color=`var(--${color})`;}
      document.querySelectorAll('.dice-box').forEach(d=>d.classList.remove('active-dice-box'));
      const activeDice=$(`dice-${color}`);if(activeDice)activeDice.classList.add('active-dice-box');
    }

    function drawDice(color,num){const dots=document.querySelectorAll(`#dice-${color} .dot`);if(!dots.length)return;dots.forEach(d=>d.style.visibility='hidden');dicePatterns[num].forEach(i=>dots[i].style.visibility='visible');}

    function render(){
      Object.values(cells).forEach(c=>c.classList.remove('has-many'));
      activeColors.forEach(color=>{
        gameState[color].forEach((pos,i)=>{
          const t=$(`t_${color}_${i}`);if(!t)return;
          if(pos===-1){const spot=$(`spot_${color}_${i}`);if(spot)spot.appendChild(t);}
          else if(pos===56){const wz=$(`win-zone-${color}`);if(wz)wz.appendChild(t);}
          else{
            const cIdx=(pos+colorOffsets[color])%52;
            let cell=cells[`${mainPath[cIdx][0]}_${mainPath[cIdx][1]}`];
            if(pos>=51)cell=cells[`${homePaths[color][pos-51][0]}_${homePaths[color][pos-51][1]}`];
            if(cell){cell.appendChild(t);if(cell.children.length>1)cell.classList.add('has-many');}
          }
        });
      });
    }

    initEmptyBoard();

    // FIXED CLEANUP: Isme se window. delete command hata di gayi hain, taaki start button hamesha chalta rahe!
    return () => {
      socket.disconnect();
      clearInterval(fireworksInterval);
      document.body.removeEventListener('click', handleAudioInit);
    };
  }, [searchParams]);

  return (
    <>
      <style>{gameStyles}</style>
      <canvas id="fireworks"></canvas>
      <div id="winBanner"></div>
      <div className="score-toast" id="scoreToast"></div>

      {/* LOBBY */}
      <div id="lobby">
        <div className="lobby-box">
          <h1 style={{ color: 'var(--yellow)', marginBottom: 20 }}>🎲 Ludo Pro</h1>
          <input type="text" id="playerNameInput" placeholder="Your Name" maxLength={10} readOnly />
          <input type="text" id="roomIdInput" placeholder="Enter Room Code" />
          <button id="joinBtn" onClick={() => window.__joinRoom && window.__joinRoom()}>Join Game</button>
          <div id="lobbyStatus" style={{ marginTop: 15, color: '#aaa', fontWeight: 'bold' }}></div>
          <button id="startBtn" className="btn-green" onClick={() => window.__startGame && window.__startGame()}>▶ Start Game</button>
          
          {/* Share Room Section */}
          <div id="shareSection" style={{ marginTop: 20, display: 'none' }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>📤 Share Room Link</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" id="shareLinkInput" readOnly style={{ flex: 1, padding: '10px', fontSize: 12, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
              <button id="copyLinkBtn" onClick={() => { const link = document.getElementById('shareLinkInput').value; navigator.clipboard.writeText(link); showToast('Link copied!'); }} style={{ padding: '10px 15px', background: 'var(--green)', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>📋</button>
            </div>
          </div>
        </div>
        <button className="btn-back" onClick={() => window.location.href = '/dashboard'} style={{ width: '90%', maxWidth: 400, background: 'rgba(255,255,255,0.08)' }}>← Back to Dashboard</button>
      </div>
      
      {/* REJOIN MODAL */}
      <div id="rejoinModal" className="modal-overlay">
        <div className="req-box" style={{ borderColor: 'var(--yellow)' }}>
          <h3 style={{ color: 'var(--yellow)', marginBottom: 15 }}>🔄 Rejoin Match?</h3>
          <p style={{ color: '#ccc', marginBottom: 15, fontSize: 14 }}>You were disconnected from the game. Would you like to rejoin?</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button id="rejoinBtn" style={{ background: 'var(--green)', flex: 1 }}>Rejoin Game</button>
            <button id="leaveBtn" style={{ background: 'var(--red)', flex: 1 }}>Leave</button>
          </div>
        </div>
      </div>
      
      {/* GAME INVITE MODAL */}
      <div id="inviteModal" className="modal-overlay">
        <div className="req-box" style={{ borderColor: 'var(--blue)' }}>
          <h3 style={{ color: 'var(--blue)', marginBottom: 15 }}>🎮 Game Invite!</h3>
          <p id="inviteText" style={{ color: '#ccc', marginBottom: 15 }}></p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button id="acceptInviteBtn" style={{ background: 'var(--green)', flex: 1 }}>Accept</button>
            <button id="declineInviteBtn" style={{ background: 'var(--red)', flex: 1 }}>Decline</button>
          </div>
        </div>
      </div>

      {/* JOIN REQUEST MODAL */}
      <div id="joinRequestModal" className="modal-overlay">
        <div className="req-box">
          <h3 style={{ color: 'white', marginBottom: 15 }}>New Player Wants to Join!</h3>
          <p id="reqPlayerName" style={{ color: 'var(--yellow)', marginBottom: 15, fontWeight: 'bold' }}></p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ background: 'var(--green)' }} onClick={() => window.__answerJoinReq && window.__answerJoinReq(true)}>Accept</button>
            <button style={{ background: 'var(--red)' }} onClick={() => window.__answerJoinReq && window.__answerJoinReq(false)}>Reject</button>
          </div>
        </div>
      </div>

      {/* ADMIN MODAL */}
      <div id="adminModal" className="modal-overlay">
        <div className="req-box">
          <h3 style={{ color: 'white', marginBottom: 15 }}>Manage Players ⚙️</h3>
          <div id="adminPlayerList" style={{ textAlign: 'left', marginBottom: 20, color: '#ccc' }}></div>
          <button style={{ background: '#666' }} onClick={() => { const m = document.getElementById('adminModal'); if (m) m.style.display = 'none'; }}>Close</button>
        </div>
      </div>

      {/* GAME OVER MODAL */}
      <div className="go-modal" id="gameOverModal">
        <div className="go-box">
          <div className="go-title">🏁 Game Over — Final Scores</div>
          <div id="gameOverContent"></div>
          <div className="go-saved" id="goSaved">✅ Scores saved to leaderboard!</div>
          <div className="go-actions">
            <button className="go-btn go-btn-dash" onClick={() => window.location.href = '/dashboard'}>🏠 Dashboard</button>
            <button className="go-btn go-btn-restart" id="goRestartBtn" style={{ background: 'linear-gradient(135deg,#0084ff,#5b21b6)', color: 'white' }} onClick={() => window.__restartGame && window.__restartGame()}>↻ Play Again</button>
            <button className="go-btn go-btn-close" onClick={() => { const m = document.getElementById('gameOverModal'); if (m) m.style.display = 'none'; try { if(socket && socket.emit) socket.emit('leaveRoom', {roomId: myRoomId}); if(socket && socket.disconnect) socket.disconnect(); } catch(e) { console.log(e); } localStorage.removeItem('lastRoomId'); window.location.href = '/dashboard'; }}>✕ Exit & Go Home</button>
          </div>
        </div>
      </div>

      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/dashboard" style={{ color: '#aaa', textDecoration: 'none', fontSize: 18 }} title="Dashboard">🏠</a>
          <h2 style={{ fontSize: 18 }}>Ludo Pro</h2>
          <button id="soundBtn" style={{ background: 'transparent', fontSize: 18, padding: 0, width: 'auto', boxShadow: 'none' }} onClick={() => window.__toggleSound && window.__toggleSound()}>🔊</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div id="roomCodeDisplay" style={{ fontWeight: 'bold', color: 'var(--yellow)', fontSize: 13 }}>Room: ---</div>
          <button id="adminBtn" className="btn-green" style={{ padding: '4px 8px', fontSize: 12, width: 'auto', display: 'none' }} onClick={() => { const m = document.getElementById('adminModal'); if (m) m.style.display = 'flex'; }}>⚙️</button>
          <button id="restartBtn" className="btn-red" style={{ padding: '4px 8px', fontSize: 12, width: 'auto', display: 'none' }} onClick={() => window.__restartGame && window.__restartGame()}>↻</button>
          <button id="exitBtn" style={{ padding: '4px 10px', fontSize: 12, width: 'auto', background: 'var(--red)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }} onClick={() => { if(confirm('Exit game and leave room?')) { try { if(socket && socket.emit) socket.emit('leaveRoom', {roomId: myRoomId}); if(socket && socket.disconnect) socket.disconnect(); } catch(e) { console.log(e); } localStorage.removeItem('lastRoomId'); window.location.href = '/dashboard'; } }}>🚪 Exit</button>
        </div>
      </header>

      <div className="main-container">
        <div className="game-wrapper" id="gameWrapper">
          <div className="ludo-board" id="board">
            <div className="center-home">
              <div className="tri tri-top"></div><div className="tri tri-right"></div>
              <div className="tri tri-bottom"></div><div className="tri tri-left"></div>
              <div id="win-zone-green" className="win-zone"></div>
              <div id="win-zone-yellow" className="win-zone"></div>
              <div id="win-zone-blue" className="win-zone"></div>
              <div id="win-zone-red" className="win-zone"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer">
        <div className="status-container">
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <div className="status-text" id="turnStatus">Game not started...</div>
            <div id="restartContainer"></div>
            <div id="myColorDisp"></div>
          </div>
          <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
            <div className="interaction-menu" id="emojiMenu">
              {['😂','😡','😭','🥳','👍'].map(em => <div key={em} className="interact-item" onClick={() => window.__sendInteract && window.__sendInteract('emoji', em)}>{em}</div>)}
            </div>
            <div className="interaction-menu chat-menu" id="chatMenu">
              {['Jaldi chal bhai! ⏳','Kya kismat hai! 😲','Arre yaar! 🤦‍♂️','Bhai maar mat! 🙏'].map(msg => <div key={msg} className="interact-item chat-item" onClick={() => window.__sendInteract && window.__sendInteract('chat', msg)}>{msg}</div>)}
            </div>
            <div className="btn-interact" onClick={() => window.__toggleMenu && window.__toggleMenu('chatMenu')} style={{ display: 'none' }} id="mainChatBtn">💬</div>
            <div className="btn-interact" onClick={() => window.__toggleMenu && window.__toggleMenu('emojiMenu')} style={{ display: 'none' }} id="mainEmojiBtn">😀</div>
          </div>
        </div>
      </div>
      
      {/* IN-GAME CHAT PANEL */}
      <div id="chatPanel" className="chat-panel">
        <div className="chat-header">
          <span>💬 Game Chat</span>
          <button id="closeChatBtn" onClick={() => { const p = document.getElementById('chatPanel'); if(p) p.classList.remove('show'); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div className="chat-messages" id="chatMessages"></div>
        <div className="chat-input-container">
          <input type="text" id="chatInput" placeholder="Type a message..." maxLength={200} onKeyDown={(e) => { if(e.key === 'Enter') window.__sendChatMsg && window.__sendChatMsg(); }} />
          <button id="sendChatBtn" onClick={() => window.__sendChatMsg && window.__sendChatMsg()}>Send</button>
        </div>
      </div>
    </>
  );
}

const gameStyles = `
  :root { --bg-color:#0f0c29; --room-gradient:linear-gradient(135deg,#0f0c29,#302b63,#24243e); --text-color:#fff; --board-bg:#fff; --border-color:#bbb; --red:#ff3b3b; --green:#00b84c; --yellow:#ffcc00; --blue:#0084ff; }
  * { box-sizing:border-box; margin:0; padding:0; font-family:'Segoe UI',sans-serif; user-select:none; -webkit-tap-highlight-color:transparent; }
  html, body { width:100%; height:100%; margin:0; padding:0; overflow:hidden; background:var(--room-gradient); color:var(--text-color); }
  #root { width:100%; height:100%; display:flex; flex-direction:column; }
  #fireworks { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:200; }
  #winBanner { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) scale(0); background:rgba(0,0,0,0.95); border:3px solid gold; border-radius:20px; padding:30px; color:gold; font-size:24px; font-weight:bold; text-align:center; z-index:3000; box-shadow:0 0 50px gold,inset 0 0 20px rgba(255,215,0,0.5); transition:0.5s cubic-bezier(0.175,0.885,0.32,1.275); pointer-events:none; }
  #winBanner.show { transform:translate(-50%,-50%) scale(1); }
  #winBanner.loser { border-color:var(--red); color:white; box-shadow:0 0 50px var(--red); }
  #lobby { position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:1000; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:15px; overflow-y:auto; padding:20px; }
  .lobby-box { background:#24243e; padding:25px; border-radius:15px; text-align:center; box-shadow:0 0 20px rgba(0,255,255,0.2); width:90%; max-width:400px; }
  input { padding:12px; font-size:16px; border-radius:8px; border:none; text-align:center; outline:none; margin-bottom:15px; width:100%; font-weight:bold; }
  button { padding:12px; border:none; border-radius:8px; cursor:pointer; background:var(--blue); color:white; font-weight:bold; font-size:18px; width:100%; box-shadow:0 4px 10px rgba(0,0,0,0.3); transition:0.2s; }
  button:active { transform:scale(0.95); }
  button:disabled { opacity:0.5; cursor:not-allowed; }
  .btn-green { background:var(--green); margin-top:10px; display:none; }
  .btn-red { background:var(--red); display:none; }
  .btn-back { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); font-size:14px; padding:10px; }
  .modal-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:2000; justify-content:center; align-items:center; }
  .req-box { background:#1a1a2e; padding:25px; border-radius:12px; text-align:center; border:2px solid var(--yellow); width:85%; max-width:380px; max-height:85vh; overflow-y:auto; }
  .kick-btn { background:var(--red); padding:4px 8px; font-size:12px; border-radius:4px; margin-left:10px; cursor:pointer; display:inline-block; width:auto; font-weight:bold; }
  header { width:100%; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); flex-shrink:0; z-index:10; }
  .main-container { flex:1; display:flex; justify-content:center; align-items:center; width:100%; min-height:0; overflow:hidden; padding:5px; }
  .game-wrapper { position:relative; display:flex; justify-content:center; align-items:center; padding:5px; background:rgba(0,0,0,0.2); border-radius:10px; transform:rotate(var(--board-rot,0deg)); transition:transform 1s cubic-bezier(0.4,0,0.2,1); width:min(92vw,92vw); height:min(92vw,60vh); max-width:500px; max-height:500px; }
  .ludo-board { display:grid; grid-template-columns:repeat(15,1fr); grid-template-rows:repeat(15,1fr); width:100%; height:100%; background-color:var(--board-bg); border:2px solid #333; position:relative; border-radius:4px; }
  .cell { border:1px solid var(--border-color); position:relative; display:flex; justify-content:center; align-items:center; }
  .cell.has-many { display:grid; grid-template-columns:50% 50%; grid-template-rows:50% 50%; justify-items:center; align-items:center; padding:1px; gap:0; }
  .cell.has-many .token { width:85%!important; height:85%!important; margin:0; position:relative; }
  .safe-zone { background-color:rgba(0,0,0,0.1); background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.4) 0,rgba(255,255,255,0.4) 3px,transparent 3px,transparent 6px); }
  .base { position:absolute; width:40%; height:40%; border:2px solid white; display:flex; justify-content:center; align-items:center; flex-direction:column; }
  .base-red { top:0; left:0; background:var(--red); } .base-green { top:0; right:0; background:var(--green); } .base-yellow { bottom:0; right:0; background:var(--yellow); } .base-blue { bottom:0; left:0; background:var(--blue); }
  .winner-display { position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); color:gold; display:none; flex-direction:column; justify-content:center; align-items:center; font-weight:bold; font-size:22px; text-align:center; z-index:50; transform:rotate(calc(var(--board-rot,0deg)*-1)); text-shadow:0 0 10px black; }
  .base-inner { background:white; border-radius:15px; width:65%; height:65%; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:15%; padding:15%; box-shadow:inset 0 5px 15px rgba(0,0,0,0.3); }
  .base-spot { width:100%; height:100%; border-radius:50%; background:#eaeaea; display:flex; justify-content:center; align-items:center; position:relative; box-shadow:inset 0 3px 6px rgba(0,0,0,0.2); }
  .dice-neon-container { position:absolute; width:36px; height:36px; background:rgba(255,255,255,0.2); border:2px solid rgba(255,255,255,0.5); border-radius:10px; display:none; justify-content:center; align-items:center; backdrop-filter:blur(5px); z-index:100; }
  #box-red { top:3px; left:3px; box-shadow:0 0 10px var(--red); } #box-green { top:3px; right:3px; box-shadow:0 0 10px var(--green); } #box-yellow { bottom:3px; right:3px; box-shadow:0 0 10px var(--yellow); } #box-blue { bottom:3px; left:3px; box-shadow:0 0 10px var(--blue); }
  .online-dot { position:absolute; top:-4px; right:-4px; width:10px; height:10px; border-radius:50%; background:var(--green); border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.5); z-index:110; }
  .online-dot.offline { background:var(--red); }
  .dice-box { width:28px; height:28px; background:#fff; border:2px solid #444; border-radius:6px; display:grid; grid-template:repeat(3,1fr)/repeat(3,1fr); padding:2px; cursor:pointer; transform:rotate(calc(var(--board-rot,0deg)*-1)); transition:0.3s; }
  .dot { background-color:#333; border-radius:50%; width:100%; height:100%; visibility:hidden; }
  .active-dice-box { transform:scale(1.15) rotate(calc(var(--board-rot,0deg)*-1)); outline:3px solid #fff; }
  .rolling { animation:roll 0.2s infinite linear; }
  @keyframes roll { 0%{transform:scale(1.1) rotate(0deg);} 100%{transform:scale(1.1) rotate(360deg);} }
  .token { width:80%; height:80%; border-radius:50%; position:relative; box-shadow:0 3px 6px rgba(0,0,0,0.5); cursor:pointer; z-index:20; border:2px solid rgba(255,255,255,0.3); transition:all 0.2s; }
  .token::after { content:''; position:absolute; top:15%; left:15%; width:50%; height:50%; border-radius:50%; border:2px solid rgba(255,255,255,0.4); }
  .token.red { background:radial-gradient(circle at 35% 35%,#ff8a8a,var(--red)); } .token.green { background:radial-gradient(circle at 35% 35%,#5aff96,var(--green)); } .token.yellow { background:radial-gradient(circle at 35% 35%,#ffe680,var(--yellow)); } .token.blue { background:radial-gradient(circle at 35% 35%,#8acfff,var(--blue)); }
  .token.highlight { box-shadow:0 0 15px 5px rgba(255,255,255,0.9); border:2px solid #000; animation:bounce 0.6s infinite alternate; }
  @keyframes bounce { 0%{transform:scale(1);} 100%{transform:scale(1.15);} }
  .center-home { grid-area:7/7/10/10; position:relative; display:flex; justify-content:center; align-items:center; }
  .tri { position:absolute; width:100%; height:100%; overflow:hidden; z-index:10; }
  .tri-top { background:var(--green); clip-path:polygon(0 0,100% 0,50% 50%); } .tri-right { background:var(--yellow); clip-path:polygon(100% 0,100% 100%,50% 50%); } .tri-bottom { background:var(--blue); clip-path:polygon(0 100%,100% 100%,50% 50%); } .tri-left { background:var(--red); clip-path:polygon(0 0,0 100%,50% 50%); }
  .win-zone { position:absolute; width:35%; height:35%; display:flex; flex-wrap:wrap; justify-content:center; align-items:center; z-index:100; gap:2px; }
  #win-zone-green { top:8%; left:32.5%; } #win-zone-yellow { right:8%; top:32.5%; } #win-zone-blue { bottom:8%; left:32.5%; } #win-zone-red { left:8%; top:32.5%; }
  .win-zone .token { width:40%!important; height:40%!important; margin:0; box-shadow:0 0 6px gold!important; border:1.5px solid white!important; }
  .footer { padding:8px 12px; width:100%; z-index:10; flex-shrink:0; background:rgba(0,0,0,0.3); border-top:1px solid rgba(255,255,255,0.1); }
  .status-container { display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px; }
  .status-text { font-size:13px; font-weight:bold; background:rgba(0,0,0,0.7); padding:6px 12px; border-radius:20px; border:1px solid rgba(255,255,255,0.2); white-space:nowrap; text-transform:uppercase; }
  #myColorDisp { font-size:11px; color:#ddd; }
  .btn-interact { background:#24243e; border:2px solid var(--blue); color:white; border-radius:50%; width:36px; height:36px; font-size:16px; display:flex; justify-content:center; align-items:center; cursor:pointer; box-shadow:0 3px 8px rgba(0,0,0,0.3); transition:0.2s; flex-shrink:0; }
  .interaction-menu { display:none; position:absolute; bottom:50px; right:0; background:rgba(0,0,0,0.85); border-radius:10px; padding:8px; gap:8px; flex-direction:row; border:1px solid #555; z-index:1000; box-shadow:0 5px 15px rgba(0,0,0,0.5); }
  .chat-menu { flex-direction:column; width:max-content; right:40px; }
  .interact-item { font-size:20px; cursor:pointer; }
  .chat-item { font-size:13px; font-weight:bold; padding:6px 10px; background:rgba(255,255,255,0.1); border-radius:6px; color:white; }
  .floating-anim { position:absolute; z-index:500; pointer-events:none; animation:floatUp 3s ease-out forwards; transform:rotate(calc(var(--board-rot,0deg)*-1)); }
  .float-emoji { font-size:36px; }
  .float-chat { font-size:12px; font-weight:bold; background:white; color:black; padding:4px 8px; border-radius:10px; box-shadow:0 3px 8px rgba(0,0,0,0.3); white-space:nowrap; border:2px solid #222; }
  @keyframes floatUp { 0%{opacity:0;margin-top:0;transform:scale(0.5) rotate(calc(var(--board-rot,0deg)*-1));} 15%{opacity:1;transform:scale(1.1) rotate(calc(var(--board-rot,0deg)*-1));} 85%{opacity:1;transform:scale(1) rotate(calc(var(--board-rot,0deg)*-1));} 100%{opacity:0;margin-top:-50px;transform:scale(1) rotate(calc(var(--board-rot,0deg)*-1));} }
  .go-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:2500; justify-content:center; align-items:center; padding:15px; }
  .go-box { background:#1a1a2e; border:2px solid gold; border-radius:16px; padding:20px; width:100%; max-width:340px; max-height:85vh; overflow-y:auto; }
  .go-title { color:gold; font-size:18px; font-weight:900; text-align:center; margin-bottom:16px; }
  .go-row { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
  .go-row:last-child { border-bottom:none; }
  .go-rank { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; flex-shrink:0; }
  .gr1 { background:rgba(255,215,0,0.2); color:gold; border:2px solid gold; } .gr2 { background:rgba(192,192,192,0.2); color:#c0c0c0; border:2px solid #c0c0c0; } .gr3 { background:rgba(205,127,50,0.2); color:#cd7f32; border:2px solid #cd7f32; } .gr4 { background:rgba(100,100,100,0.2); color:#aaa; border:2px solid #555; }
  .go-color-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .go-name { flex:1; font-weight:700; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .go-kills { color:#ff6b6b; font-size:12px; font-weight:700; }
  .go-saved { color:#00d45a; font-size:11px; text-align:center; margin-top:10px; display:none; }
  .go-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .go-btn { flex:1; min-width:90px; padding:10px; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
  .go-btn-dash { background:linear-gradient(135deg,#b8860b,#ffd700); color:#000; }
  .go-btn-restart { background:linear-gradient(135deg,#0084ff,#5b21b6); color:#fff; }
  .go-btn-close { background:rgba(255,255,255,0.1); color:#ccc; }
  .score-toast { position:fixed; bottom:70px; left:50%; transform:translateX(-50%); background:rgba(0,180,0,0.92); color:white; padding:8px 16px; border-radius:16px; font-weight:bold; z-index:5000; opacity:0; transition:opacity 0.4s; pointer-events:none; white-space:nowrap; font-size:13px; }
  .score-toast.show { opacity:1; }
  .chat-panel { display:none; position:fixed; bottom:70px; right:10px; width:280px; height:350px; background:rgba(26,26,46,0.98); border:2px solid var(--blue); border-radius:12px; flex-direction:column; z-index:2000; box-shadow:0 8px 30px rgba(0,0,0,0.5); }
  .chat-panel.show { display:flex; }
  .chat-header { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(0,132,255,0.2); border-radius:10px 10px 0 0; font-weight:bold; font-size:13px; }
  .chat-messages { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
  .chat-msg { font-size:12px; line-height:1.4; padding:5px 8px; background:rgba(255,255,255,0.05); border-radius:6px; }
  .chat-username { font-weight:bold; margin-right:4px; }
  .chat-input-container { display:flex; gap:6px; padding:8px; border-top:1px solid rgba(255,255,255,0.1); }
  .chat-input-container input { flex:1; padding:8px; border:none; border-radius:16px; background:rgba(255,255,255,0.1); color:#fff; font-size:13px; }
  .chat-input-container button { padding:8px 12px; background:var(--blue); border:none; border-radius:16px; color:white; font-weight:bold; cursor:pointer; width:auto; }
  
  @media (max-width: 500px) {
    header { padding: 6px 10px; }
    .status-text { font-size: 11px !important; padding: 5px 10px !important; }
    .btn-interact { width: 32px !important; height: 32px !important; font-size: 14px !important; }
    .go-box { padding: 16px !important; }
    .go-btn { padding: 8px !important; font-size: 12px !important; min-width: 80px; }
    .chat-panel { width: 90% !important; height: 50vh !important; bottom: 65px !important; right: 5% !important; }
  }
`;