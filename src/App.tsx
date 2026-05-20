import React, { useState, useEffect, useCallback } from 'react';
import NumberBoard from './components/NumberBoard';
import PlayerPanel from './components/PlayerPanel';
import { playAudio } from './lib/audio';
import { io, Socket } from 'socket.io-client';

let socket: Socket;

export default function App() {
  const [inLobby, setInLobby] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [myPlayerId, setMyPlayerId] = useState<'P1' | 'P2' | null>(null);

  const [status, setStatus] = useState<'SETUP' | 'READY' | 'PLAYING' | 'WAITING' | 'GAME_OVER'>('SETUP');
  const [turn, setTurn] = useState<'P1' | 'P2'>('P1');
  const [targetNumber, setTargetNumber] = useState<number | null>(null);
  const [winner, setWinner] = useState<'P1' | 'P2' | null>(null);
  const [p1Ticks, setP1Ticks] = useState<Set<number>>(new Set());
  const [p2Ticks, setP2Ticks] = useState<Set<number>>(new Set());
  const [numbersData, setNumbersData] = useState<any[]>([]);
  const [foundNumbers, setFoundNumbers] = useState<Set<number>>(new Set());

  useEffect(() => {
     socket = io(window.location.origin);
     socket.on('connect', () => console.log('Connected to server'));

     socket.on('roomCreated', (data) => {
         setRoomId(data.roomId);
         setMyPlayerId(data.playerId);
         setInLobby(false);
         setStatus('WAITING');
     });

     socket.on('roomJoined', (data) => {
         setRoomId(data.roomId);
         setMyPlayerId(data.playerId);
         setInLobby(false);
     });

     socket.on('gameState', (state) => {
         setStatus(state.status);
         setTurn(state.turn);
         setTargetNumber(state.targetNumber);
         setWinner(state.winner);
         setP1Ticks(new Set(state.p1Ticks));
         setP2Ticks(new Set(state.p2Ticks));
         setNumbersData(state.numbersData);
         setFoundNumbers(new Set(state.foundNumbers));
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

      socket.emit('tick', { roomId, playerId, cellId });
  };

  if (inLobby) {
      return (
          <div className="flex flex-col h-[100dvh] w-screen items-center justify-center bg-orange-50 text-slate-900 font-sans p-4">
              <img src="/favicon.svg" alt="Numero Duo Icon" className="w-32 h-32 md:w-40 md:h-40 mb-6 drop-shadow-xl animate-bounce" style={{ animationDuration: '3s' }} />
              <h1 className="text-[min(12vw,6rem)] font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-sky-500 via-orange-400 to-pink-500 mb-10 text-center w-full leading-tight">
                 NUMERO<span className="text-sky-500">.</span>DUO
              </h1>
              <div className="flex flex-col w-full max-w-sm gap-4 bg-white p-6 rounded-3xl shadow-xl border border-orange-200">
                  <button 
                      onPointerDown={() => socket.emit('createRoom')}
                      className="w-full py-4 bg-sky-500 text-white rounded-xl font-bold uppercase tracking-widest shadow-md active:scale-95 transition-all text-sm hover:bg-sky-600"
                  >
                      Create Game
                  </button>
                  <div className="w-full h-px bg-slate-200 my-2 relative">
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs font-bold text-slate-400 uppercase">OR</span>
                  </div>
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          value={joinCode}
                          onChange={e => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="Enter Room Code"
                          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 tracking-widest text-center uppercase focus:outline-none focus:border-pink-400 Focus:ring-2 focus:ring-pink-400/20"
                          maxLength={4}
                      />
                      <button 
                          onPointerDown={() => {
                              if (joinCode.length === 4) socket.emit('joinRoom', joinCode);
                          }}
                          className="px-6 bg-pink-500 text-white rounded-xl font-bold uppercase tracking-widest shadow-md active:scale-95 transition-all text-sm hover:bg-pink-600 disabled:opacity-50 disabled:active:scale-100"
                          disabled={joinCode.length !== 4}
                      >
                          Join
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-orange-50 text-slate-900 font-sans touch-none overscroll-none relative select-none">

      {/* SETUP / WIN Overlay */}
      {((status === 'SETUP' || status === 'WAITING' || status === 'GAME_OVER') && myPlayerId === 'P1') && (
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-orange-50/95 backdrop-blur-xl transition-all">
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

    </div>
  );
}

