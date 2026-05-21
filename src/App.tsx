import React, { useState, useEffect, useCallback, useRef } from 'react';
import NumberBoard from './components/NumberBoard';
import PlayerPanel from './components/PlayerPanel';
import BattleshipGame from './components/Battleship';
import { playAudio } from './lib/audio';
import { io, Socket } from 'socket.io-client';

let socket: Socket;

export default function App() {
  const [selectedApp, setSelectedApp] = useState<'NUMERO_DUO' | 'BATTLESHIP' | null>(null);

  const [inLobby, setInLobby] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [myPlayerId, setMyPlayerId] = useState<'P1' | 'P2' | null>(null);
  const [gameType, setGameType] = useState<'NUMERO_DUO' | 'BATTLESHIP' | null>(null);

  const [status, setStatus] = useState<'SETUP' | 'READY' | 'PLAYING' | 'WAITING' | 'GAME_OVER'>('SETUP');
  const [turn, setTurn] = useState<'P1' | 'P2'>('P1');
  const [targetNumber, setTargetNumber] = useState<number | null>(null);
  const [winner, setWinner] = useState<'P1' | 'P2' | null>(null);
  const [p1Ticks, setP1Ticks] = useState<Set<number>>(new Set());
  const [p2Ticks, setP2Ticks] = useState<Set<number>>(new Set());
  const [numbersData, setNumbersData] = useState<any[]>([]);
  const [foundNumbers, setFoundNumbers] = useState<Set<number>>(new Set());

  // Refs to access current values inside socket callbacks (avoid stale closures)
  const roomIdRef = useRef('');
  const myPlayerIdRef = useRef<'P1' | 'P2' | null>(null);
  const inLobbyRef = useRef(true);

  // Battleship states
  const [p1Board, setP1Board] = useState<any>(null);
  const [p2Board, setP2Board] = useState<any>(null);
  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [p1Shots, setP1Shots] = useState<any[]>([]);
  const [p2Shots, setP2Shots] = useState<any[]>([]);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number | null>(null);

  useEffect(() => {
     socket = io(window.location.origin, {
         // Enable auto-reconnection with short delay
         reconnection: true,
         reconnectionDelay: 500,
         reconnectionAttempts: Infinity,
     });

     socket.on('connect', () => {
         console.log('Connected to server:', socket.id);
         // Auto-rejoin room if we were in one (e.g. after phone went to background)
         if (!inLobbyRef.current && roomIdRef.current && myPlayerIdRef.current) {
             console.log('Rejoining room after reconnect:', roomIdRef.current, myPlayerIdRef.current);
             socket.emit('rejoinRoom', { roomId: roomIdRef.current, playerId: myPlayerIdRef.current });
         }
     });

     socket.on('roomCreated', (data) => {
         roomIdRef.current = data.roomId;
         myPlayerIdRef.current = data.playerId;
         inLobbyRef.current = false;
         setRoomId(data.roomId);
         setMyPlayerId(data.playerId);
         setGameType(data.gameType);
         setInLobby(false);
     });

     socket.on('roomJoined', (data) => {
         roomIdRef.current = data.roomId;
         myPlayerIdRef.current = data.playerId;
         inLobbyRef.current = false;
         setRoomId(data.roomId);
         setMyPlayerId(data.playerId);
         setGameType(data.gameType);
         setInLobby(false);
     });

     socket.on('gameState', (state) => {
         setStatus(state.status);
         setTurn(state.turn);
         setTargetNumber(state.targetNumber);
         setWinner(state.winner);
         setP1Ticks(new Set(state.p1Ticks || []));
         setP2Ticks(new Set(state.p2Ticks || []));
         setNumbersData(state.numbersData || []);
         setFoundNumbers(new Set(state.foundNumbers || []));
         
         setP1Board(state.p1Board);
         setP2Board(state.p2Board);
         setP1Ready(state.p1Ready);
         setP2Ready(state.p2Ready);
         setP1Shots(state.p1Shots || []);
         setP2Shots(state.p2Shots || []);
         setTurnTimeLeft(state.turnTimeLeft !== undefined ? state.turnTimeLeft : null);
     });

     socket.on('battleshipTimer', (data) => {
         setTurnTimeLeft(data.turnTimeLeft);
         if (data.turn) {
             setTurn(data.turn);
         }
     });

     socket.on('battleshipTurnTimeout', (data) => {
         if (data.turn) {
             setTurn(data.turn);
         }
     });

     socket.on('correctClick', () => playAudio('correct'));
     socket.on('wrongClick', () => playAudio('wrong'));
     socket.on('tickSound', () => playAudio('tick'));
     
     socket.on('error', (err) => alert(err));

     return () => {
         socket.disconnect();
     };
  }, []);

  const pickTarget = (currentFound: Set<number>, numbers: any[]) => {
      // Logic moved to server
  };

  const startGame = useCallback(() => {
      if (myPlayerId === 'P1') {
          socket.emit('startGame', roomId);
      }
  }, [roomId, myPlayerId]);

  const endGame = (winPlayer: 'P1' | 'P2') => {
      // Handled by server
  }

  const handleStart = (panelPlayerId: 'P1' | 'P2') => {
      if (myPlayerId === panelPlayerId) {
         socket.emit('startTurn', roomId);
      }
  };

  const autoAddTick = (masherId: 'P1' | 'P2', count: number = 1) => {
      // Handled by server
  };

  const handleNumberClick = (val: number) => {
      if (status !== 'PLAYING') return;
      if (myPlayerId !== turn) return; // Only current searcher can click numbers
      
      socket.emit('numberClick', { roomId, playerId: myPlayerId, val });
  };

  const handleTick = (playerId: 'P1' | 'P2', cellId: number) => {
      if (status !== 'PLAYING') return;
      if (myPlayerId !== playerId) return; // Only tick your own panel
      if (turn === playerId) return; // Cannot tick when it's your turn to search
  };

  const handleLeaveRoom = useCallback(() => {
      // Clear refs first so reconnect handler doesn't try to rejoin
      roomIdRef.current = '';
      myPlayerIdRef.current = null;
      inLobbyRef.current = true;

      if (socket) {
          socket.emit('leaveRoom', { roomId, playerId: myPlayerId });
          socket.disconnect();
          socket.connect();
      }
      
      setRoomId('');
      setJoinCode('');
      setMyPlayerId(null);
      setGameType(null);
      setInLobby(true);
      setSelectedApp(null);
      setStatus('SETUP');
      setWinner(null);
      setP1Ready(false);
      setP2Ready(false);
      setP1Shots([]);
      setP2Shots([]);
      setTurnTimeLeft(null);
  }, [roomId, myPlayerId]);

  if (inLobby) {
      if (!selectedApp) {
          return (
              <div className="flex flex-col h-[100dvh] w-screen items-center justify-center bg-slate-50 text-slate-900 font-sans p-4 relative py-10 overflow-auto">
                  <h1 className="text-4xl sm:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 via-purple-400 to-pink-500 mb-12 text-center leading-tight">
                     ARCADE<span className="text-indigo-500">.</span>HUB
                  </h1>
                  
                  <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl px-4">
                      {/* Game 1 */}
                      <div 
                          onClick={() => setSelectedApp('NUMERO_DUO')}
                          className="flex-1 flex flex-col items-center bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200 cursor-pointer hover:scale-105 hover:shadow-2xl hover:border-sky-200 transition-all group"
                      >
                          <div className="w-24 h-24 mb-6 rounded-3xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/30 flex items-center justify-center group-hover:-translate-y-2 transition-transform duration-300">
                             <span className="text-5xl font-black text-white mix-blend-overlay">99</span>
                          </div>
                          <h2 className="text-2xl font-black tracking-tight text-slate-800 mb-2">Numero Duo</h2>
                          <p className="text-center text-sm font-semibold text-slate-500">Fast-paced competitive number finding action</p>
                      </div>

                      {/* Game 2 */}
                      <div 
                          onClick={() => setSelectedApp('BATTLESHIP')}
                          className="flex-1 flex flex-col items-center bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200 cursor-pointer hover:scale-105 hover:shadow-2xl hover:border-pink-200 transition-all group"
                      >
                          <div className="w-24 h-24 mb-6 rounded-3xl bg-gradient-to-br from-pink-400 to-red-500 shadow-lg shadow-pink-500/30 flex items-center justify-center group-hover:-translate-y-2 transition-transform duration-300">
                             <svg className="w-12 h-12 text-white mix-blend-overlay" fill="currentColor" viewBox="0 0 24 24"><path d="M22 20.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 20.5V19h20v1.5zm-5.5-12a1.5 1.5 0 0 0-1.5-1.5h-1a1.5 1.5 0 0 0-1.5 1.5v3h-2v-3a1.5 1.5 0 0 0-1.5-1.5h-1a1.5 1.5 0 0 0-1.5 1.5v3h-2v1.5a1.5 1.5 0 0 0 1.5 1.5h15a1.5 1.5 0 0 0 1.5-1.5V11.5h-2v-3zm-6-2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V7H10.5V6zM8 3.5A1.5 1.5 0 0 1 9.5 2h5A1.5 1.5 0 0 1 16 3.5V5H8V3.5z"/></svg>
                          </div>
                          <h2 className="text-2xl font-black tracking-tight text-slate-800 mb-2">Sea Strike</h2>
                          <p className="text-center text-sm font-semibold text-slate-500">Strategic naval combat and fleet deployment</p>
                      </div>
                  </div>
              </div>
          );
      }

      return (
          <div className="flex flex-col h-[100dvh] w-screen items-center justify-center bg-orange-50 text-slate-900 font-sans p-4 relative py-10 transition-colors duration-500">
              <button 
                  onClick={() => setSelectedApp(null)} 
                  className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm bg-white text-slate-650 hover:bg-slate-100 shadow border border-orange-200 transition-colors"
              >
                  &larr; Back
              </button>

              <div className={`w-24 h-24 mb-6 rounded-3xl shadow-xl flex items-center justify-center animate-bounce ${selectedApp === 'NUMERO_DUO' ? 'bg-gradient-to-br from-sky-400 to-sky-600 shadow-sky-500/30' : 'bg-gradient-to-br from-pink-400 to-red-500 shadow-pink-500/30'}`} style={{ animationDuration: '3s' }}>
                  {selectedApp === 'NUMERO_DUO' ? (
                      <span className="text-5xl font-black text-white mix-blend-overlay">99</span>
                  ) : (
                      <svg className="w-12 h-12 text-white mix-blend-overlay" fill="currentColor" viewBox="0 0 24 24"><path d="M22 20.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 20.5V19h20v1.5zm-5.5-12a1.5 1.5 0 0 0-1.5-1.5h-1a1.5 1.5 0 0 0-1.5 1.5v3h-2v-3a1.5 1.5 0 0 0-1.5-1.5h-1a1.5 1.5 0 0 0-1.5 1.5v3h-2v1.5a1.5 1.5 0 0 0 1.5 1.5h15a1.5 1.5 0 0 0 1.5-1.5V11.5h-2v-3zm-6-2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V7H10.5V6zM8 3.5A1.5 1.5 0 0 1 9.5 2h5A1.5 1.5 0 0 1 16 3.5V5H8V3.5z"/></svg>
                  )}
              </div>
              
              <h1 className={`text-4xl sm:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text mb-8 text-center leading-tight ${selectedApp === 'NUMERO_DUO' ? 'bg-gradient-to-br from-sky-500 via-orange-400 to-pink-500' : 'bg-gradient-to-br from-sky-600 to-pink-650'}`}>
                 {selectedApp === 'NUMERO_DUO' ? 'NUMERO.DUO' : 'SEA.STRIKE'}
              </h1>
              
              <div className="flex flex-col w-full max-w-sm gap-6 p-6 rounded-[2rem] shadow-xl border bg-white border-orange-200">
                  
                  <button 
                      onPointerDown={() => socket.emit('createRoom', selectedApp)}
                      className={`w-full py-4 text-white rounded-xl font-bold uppercase tracking-widest shadow-md active:scale-95 transition-all text-sm ${selectedApp === 'NUMERO_DUO' ? 'bg-sky-500 hover:bg-sky-600' : 'bg-pink-500 hover:bg-pink-600'}`}
                  >
                      Create Game
                  </button>
                  <div className="w-full h-px relative bg-slate-200">
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs font-bold uppercase bg-white text-slate-400">OR</span>
                  </div>
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          value={joinCode}
                          onChange={e => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="Room Code"
                          className="flex-1 px-4 py-3 border rounded-xl font-bold tracking-widest text-center uppercase focus:outline-none focus:ring-2 w-0 bg-slate-50 border-slate-200 text-slate-700 focus:border-pink-400 focus:ring-pink-400/20 placeholder:text-slate-400"
                          maxLength={4}
                      />
                      <button 
                          onPointerDown={() => {
                              if (joinCode.length === 4) socket.emit('joinRoom', joinCode);
                          }}
                          className={`px-6 text-white rounded-xl font-bold uppercase tracking-widest shadow-md active:scale-95 transition-all text-sm disabled:opacity-50 disabled:active:scale-100 ${selectedApp === 'NUMERO_DUO' ? 'bg-pink-500 hover:bg-pink-600' : 'bg-sky-500 hover:bg-sky-600'}`}
                          disabled={joinCode.length !== 4}
                      >
                          Join
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  if (gameType === 'BATTLESHIP') {
      return (
          <BattleshipGame 
              socket={socket} 
              roomId={roomId} 
              myPlayerId={myPlayerId} 
              status={status}
              turn={turn}
              winner={winner}
              p1Board={p1Board}
              p2Board={p2Board}
              p1Ready={p1Ready}
              p2Ready={p2Ready}
              p1Shots={p1Shots}
              p2Shots={p2Shots}
              turnTimeLeft={turnTimeLeft}
              onLeaveRoom={handleLeaveRoom}
          />
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-orange-50 text-slate-900 font-sans touch-none overscroll-none relative select-none">

      {/* SETUP / WIN Overlay */}
      {((status === 'SETUP' || status === 'WAITING' || status === 'GAME_OVER') && myPlayerId === 'P1') && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-orange-50/95 backdrop-blur-xl transition-all">
             <button 
                 onClick={handleLeaveRoom}
                 className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-orange-200 text-slate-600 rounded-full font-bold text-sm transition-colors shadow"
             >
                 &larr; Exit
             </button>
             <img src="/favicon.svg" alt="Numero Duo Icon" className="w-32 h-32 md:w-40 md:h-40 mb-6 drop-shadow-xl animate-bounce" style={{ animationDuration: '3s' }} />
             <div className="mb-8 p-4 bg-white rounded-2xl border border-orange-200 shadow-lg text-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Room Code</p>
                 <p className="text-4xl font-black text-slate-800 tracking-[0.2em]">{roomId}</p>
             </div>

             {status === 'GAME_OVER' && (
                 <div className="flex flex-col items-center mb-12">
                    <div className="text-sm font-semibold text-slate-500 tracking-[0.2em] uppercase mb-2">Match Result</div>
                    <div className={`text-4xl md:text-5xl font-black uppercase tracking-wider animate-pulse drop-shadow-[0_0_15px_rgba(0,0,0,0.1)] ${winner === 'P1' ? 'text-sky-500' : 'text-pink-500'}`}>
                       {winner === 'P1' ? 'P1 WINS!' : 'P2 WINS!'}
                    </div>
                 </div>
             )}

             {status === 'WAITING' ? (
                 <div className="flex items-center gap-3 bg-slate-100 px-6 py-4 rounded-full border border-slate-200 shadow-inner">
                     <div className="w-3 h-3 rounded-full bg-pink-500 animate-ping"></div>
                     <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">Waiting for Opponent...</span>
                 </div>
             ) : (
                 <button
                     onPointerDown={startGame}
                     className="px-10 py-4 bg-slate-900 text-white rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all outline-none hover:bg-slate-800"
                 >
                     {status === 'SETUP' ? 'START MATCH' : 'PLAY AGAIN'}
                 </button>
             )}
          </div>
      )}

      {/* Opponent Waiting Overlay for P2 */}
      {((status === 'SETUP' || status === 'WAITING' || status === 'GAME_OVER') && myPlayerId === 'P2') && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-orange-50/95 backdrop-blur-xl transition-all">
             <button 
                 onClick={handleLeaveRoom}
                 className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-orange-200 text-slate-600 rounded-full font-bold text-sm transition-colors shadow"
             >
                 &larr; Exit
             </button>
             <img src="/favicon.svg" alt="Numero Duo Icon" className="w-32 h-32 md:w-40 md:h-40 mb-6 drop-shadow-xl animate-bounce" style={{ animationDuration: '3s' }} />
             
             {status === 'GAME_OVER' && (
                 <div className="flex flex-col items-center mb-12">
                    <div className="text-sm font-semibold text-slate-500 tracking-[0.2em] uppercase mb-2">Match Result</div>
                    <div className={`text-4xl md:text-5xl font-black uppercase tracking-wider animate-pulse drop-shadow-[0_0_15px_rgba(0,0,0,0.1)] ${winner === 'P1' ? 'text-sky-500' : 'text-pink-500'}`}>
                       {winner === 'P1' ? 'P1 WINS!' : 'P2 WINS!'}
                    </div>
                 </div>
             )}

             <div className="flex items-center gap-3 bg-slate-100 px-6 py-4 rounded-full border border-slate-200 shadow-inner">
                 <div className="w-3 h-3 rounded-full bg-sky-500 animate-ping"></div>
                 <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">
                     {status === 'GAME_OVER' ? 'Waiting for Host to Restart...' : 'Waiting for Host to Start...'}
                 </span>
             </div>
          </div>
      )}

      {/* Top Area (Opponent) */}
      <div className="flex-[0.8] sm:flex-1 w-full bg-white p-2 sm:p-4 rotate-180 relative border-b border-orange-200 shadow-sm flex flex-col justify-center min-h-0">
         <PlayerPanel
            playerId={myPlayerId === 'P1' ? 'P2' : 'P1'}
            name={myPlayerId === 'P1' ? "P2 - OPPONENT" : "P1 - OPPONENT"}
            turn={turn}
            status={status}
            targetNumber={targetNumber}
            ticks={myPlayerId === 'P1' ? p2Ticks : p1Ticks}
            onTick={(cellId) => handleTick(myPlayerId === 'P1' ? 'P2' : 'P1', cellId)}
            onStart={() => handleStart(myPlayerId === 'P1' ? 'P2' : 'P1')}
         />
      </div>

      {/* Middle Board */}
      <div className="flex-[2] flex items-center justify-center w-full max-w-lg lg:max-w-4xl mx-auto p-3 sm:p-4 z-10 min-h-0">
         <div className="w-full h-full rounded-3xl border border-orange-200 relative overflow-hidden bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
             <NumberBoard
                status={status}
                numbers={numbersData}
                foundNumbers={foundNumbers}
                onNumberClick={handleNumberClick}
                turn={turn}
                targetNumber={targetNumber}
                myPlayerId={myPlayerId}
             />
         </div>
      </div>

      {/* Bottom Area (Me) */}
      <div className="flex-[0.8] sm:flex-1 w-full bg-white p-2 sm:p-4 relative border-t border-orange-200 shadow-sm flex flex-col justify-center min-h-0">
         <PlayerPanel
            playerId={myPlayerId || 'P1'}
            name={myPlayerId === 'P1' ? "P1 - YOU" : "P2 - YOU"}
            turn={turn}
            status={status}
            targetNumber={targetNumber}
            ticks={myPlayerId === 'P1' ? p1Ticks : p2Ticks}
            onTick={(cellId) => handleTick(myPlayerId || 'P1', cellId)}
            onStart={() => handleStart(myPlayerId || 'P1')}
         />
      </div>

      {/* Floating Exit Button during active gameplay */}
      {status === 'PLAYING' && (
         <button 
             onClick={handleLeaveRoom}
             className="absolute top-4 left-4 z-40 flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white text-slate-650 border border-orange-200 rounded-full font-bold text-xs tracking-wider transition-colors shadow-sm"
         >
             &larr; Exit
         </button>
      )}

    </div>
  );
}

