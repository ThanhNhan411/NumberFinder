import React, { useState, useCallback } from 'react';
import NumberBoard from './components/NumberBoard';
import PlayerPanel from './components/PlayerPanel';
import { playAudio } from './lib/audio';

export default function App() {
  const [status, setStatus] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [turn, setTurn] = useState<'P1' | 'P2'>('P1');
  const [targetNumber, setTargetNumber] = useState<number | null>(null);
  const [winner, setWinner] = useState<'P1' | 'P2' | null>(null);
  const [p1Ticks, setP1Ticks] = useState<Set<number>>(new Set());
  const [p2Ticks, setP2Ticks] = useState<Set<number>>(new Set());
  const [numbersData, setNumbersData] = useState<any[]>([]);
  const [foundNumbers, setFoundNumbers] = useState<Set<number>>(new Set());

  const pickTarget = (currentFound: Set<number>, numbers: any[]) => {
      const valid = numbers.filter(n => n !== null);
      const remaining = valid.filter(n => !currentFound.has(n.value));
      if (remaining.length === 0) {
          setStatus('GAME_OVER');
          return;
      }
      const randomTarget = remaining[Math.floor(Math.random() * remaining.length)].value;
      setTargetNumber(randomTarget);
  };

  const startGame = useCallback(() => {
    const pool = Array.from({ length: 99 }, (_, i) => i + 1);
    pool.sort(() => Math.random() - 0.5);
    const chosenNumbers = pool.slice(0, 50);

    const indices = Array.from({ length: 100 }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);

    const colors = [
        '#22d3ee', '#f43f5e', '#34d399', '#fbbf24', 
        '#a78bfa', '#f472b6', '#2dd4bf', '#38bdf8',
        '#e879f9', '#818cf8', '#4ade80', '#fb923c'
    ];
    
    const generated = Array(100).fill(null);
    chosenNumbers.forEach((val, i) => {
        generated[indices[i]] = {
            id: val,
            value: val,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: (Math.random() - 0.5) * 90,
            scale: Math.random() * 0.4 + 0.7, // 0.7 to 1.1 helps prevent overlapping
            tx: (Math.random() - 0.5) * 6, // very small translation to stay within grid bounds
            ty: (Math.random() - 0.5) * 6,
        };
    });
    setNumbersData(generated);
    setP1Ticks(new Set());
    setP2Ticks(new Set());
    setFoundNumbers(new Set());
    setTurn('P1');
    setWinner(null);
    pickTarget(new Set(), generated);
    setStatus('READY');
  }, []);

  const endGame = (winPlayer: 'P1' | 'P2') => {
      playAudio('win');
      setWinner(winPlayer);
      setStatus('GAME_OVER');
  }

  const handleStart = () => {
      setStatus('PLAYING');
  };

  const autoAddTick = (masherId: 'P1' | 'P2', count: number = 1) => {
      const updateFn = (prev: Set<number>) => {
          const next = new Set(prev);
          let added = 0;
          for (let i = 0; i < 100; i++) {
              if (!next.has(i)) {
                  next.add(i);
                  added++;
                  if (added >= count) break;
              }
          }
          if (next.size >= 100) endGame(masherId);
          return next;
      };
      if (masherId === 'P1') setP1Ticks(updateFn);
      else setP2Ticks(updateFn);
  };

  const handleNumberClick = (val: number) => {
      if (status !== 'PLAYING') return;

      if (val === targetNumber) {
          playAudio('correct');
          // Correct -> finding success
          const nextFound = new Set(foundNumbers).add(val);
          setFoundNumbers(nextFound);
          const nextTurn = turn === 'P1' ? 'P2' : 'P1';
          setTurn(nextTurn);
          pickTarget(nextFound, numbersData);
          setStatus('READY');
      } else {
          playAudio('wrong');
          // Wrong -> Opponent gets 3 free ticks!
          const opId = turn === 'P1' ? 'P2' : 'P1';
          autoAddTick(opId, 3);
      }
  };

  const handleTick = (playerId: 'P1' | 'P2', cellId: number) => {
      if (status !== 'PLAYING') return;
      if (turn === playerId) return; // Cannot tick on your own finding turn!

      playAudio('tick');
      if (playerId === 'P1') {
          setP1Ticks(prev => {
              const next = new Set(prev).add(cellId);
              if (next.size >= 100) endGame('P1');
              return next;
          });
      } else {
          setP2Ticks(prev => {
              const next = new Set(prev).add(cellId);
              if (next.size >= 100) endGame('P2');
              return next;
          });
      }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-orange-50 text-slate-900 font-sans touch-none overscroll-none relative select-none">

      {/* SETUP / WIN Overlay */}
      {(status === 'SETUP' || status === 'GAME_OVER') && (
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-orange-50/95 backdrop-blur-xl transition-all">
            <h1 className="text-[min(12vw,6rem)] font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-sky-500 via-orange-400 to-pink-500 mb-10 text-center w-full leading-tight">
               NUMERO<span className="text-sky-500">.</span>DUO
            </h1>

            {status === 'GAME_OVER' && (
                <div className="flex flex-col items-center mb-12">
                   <div className="text-sm font-semibold text-slate-500 tracking-[0.2em] uppercase mb-2">Match Result</div>
                   <div className={`text-4xl md:text-5xl font-black uppercase tracking-wider animate-pulse drop-shadow-[0_0_15px_rgba(0,0,0,0.1)] ${winner === 'P1' ? 'text-sky-500' : 'text-pink-500'}`}>
                      {winner === 'P1' ? 'P1 WINS!' : 'P2 WINS!'}
                   </div>
                </div>
            )}

            <button
               onPointerDown={startGame}
               className="px-10 py-4 bg-slate-900 text-white rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all outline-none hover:bg-slate-800"
            >
               {status === 'SETUP' ? 'START MATCH' : 'PLAY AGAIN'}
            </button>
         </div>
      )}

      {/* Player 2 Area (Top) */}
      <div className="flex-[0.8] sm:flex-1 w-full bg-white p-2 sm:p-4 rotate-180 relative border-b border-orange-200 shadow-sm flex flex-col justify-center min-h-0">
         <PlayerPanel
            playerId="P2"
            name="P2 - DEFENDER"
            turn={turn}
            status={status}
            targetNumber={targetNumber}
            ticks={p2Ticks}
            onTick={(cellId) => handleTick('P2', cellId)}
            onStart={handleStart}
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
             />
         </div>
      </div>

      {/* Player 1 Area (Bottom) */}
      <div className="flex-[0.8] sm:flex-1 w-full bg-white p-2 sm:p-4 relative border-t border-orange-200 shadow-sm flex flex-col justify-center min-h-0">
         <PlayerPanel
            playerId="P1"
            name="P1 - ATTACKER"
            turn={turn}
            status={status}
            targetNumber={targetNumber}
            ticks={p1Ticks}
            onTick={(cellId) => handleTick('P1', cellId)}
            onStart={handleStart}
         />
      </div>

    </div>
  );
}

