import React, { useState } from 'react';

interface PlayerPanelProps {
  playerId: 'P1' | 'P2';
  name: string;
  turn: 'P1' | 'P2';
  status: 'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER';
  targetNumber: number | null;
  ticks: Set<number>;
  onTick: (id: number) => void;
  onStart: () => void;
}

export default function PlayerPanel({
    playerId, name, turn, status, targetNumber, ticks, onTick, onStart
}: PlayerPanelProps) {
    const isMyTurn = turn === playerId;
    const isReady = status === 'READY';
    const isPlaying = status === 'PLAYING';
    
    const themeColor = playerId === 'P1' ? 'text-sky-500' : 'text-pink-500';
    const bgTheme = playerId === 'P1' ? 'bg-sky-400' : 'bg-pink-400';
    const shadowTheme = playerId === 'P1' ? 'shadow-[0_0_10px_rgba(56,189,248,0.4)]' : 'shadow-[0_0_10px_rgba(244,114,182,0.4)]';

    const [dragTarget, setDragTarget] = useState<{ id: number, startX: number } | null>(null);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 select-none container mx-auto p-1 sm:p-2 min-h-0">
             {/* Header */}
             <div className="flex items-center justify-between w-full px-2 sm:px-4 mb-0 sm:mb-1 z-10 relative">
                 <span className={`text-sm sm:text-base font-bold ${themeColor} drop-shadow-sm`}>{name}</span>
                 <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-widest font-semibold">{100 - ticks.size} REMAINING</span>
             </div>

             {/* Main Play Area */}
             <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 relative">
                 {isMyTurn ? (
                     <div className="flex flex-col items-center justify-center h-full gap-4 w-full px-2">
                         {isReady && (
                             <button
                                 onPointerDown={onStart}
                                 className="w-full max-w-xs px-4 py-3 sm:py-4 bg-slate-900 border-slate-800 text-white rounded-xl font-bold uppercase tracking-widest border shadow-lg active:scale-95 transition-all text-xs sm:text-sm hover:bg-slate-800"
                             >
                                Start Searching
                             </button>
                         )}
                         {isPlaying && (
                             <div className="flex flex-col items-center justify-center w-full max-w-xs h-full bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-inner relative overflow-hidden">
                                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.2),transparent_70%)]" style={{ opacity: playerId === 'P1' ? 1 : 0 }}></div>
                                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(244,114,182,0.2),transparent_70%)]" style={{ opacity: playerId === 'P2' ? 1 : 0 }}></div>
                                 <span className={`text-[10px] sm:text-xs font-bold tracking-[0.3em] uppercase mb-1 sm:mb-2 z-10 ${themeColor}`}>Search Target</span>
                                 <span className="text-5xl sm:text-7xl font-black text-slate-800 drop-shadow-md z-10 leading-none">{targetNumber}</span>
                             </div>
                         )}
                     </div>
                 ) : (
                     <div className="w-full h-full flex flex-col items-center justify-center flex-1 min-h-0 px-2">
                         {(!isPlaying && isReady) ? (
                            <div className="my-auto text-slate-400 animate-pulse tracking-widest text-xs uppercase font-bold text-center">
                                Opponent preparing...
                            </div>
                         ) : (
                             <div className="w-full h-full max-w-md flex flex-col justify-center min-h-0 relative mt-4">
                                 <div className="absolute top-0 left-0 w-full text-center -mt-6 sm:-mt-8 text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-widest animate-pulse pointer-events-none">
                                    SWIPE BOXES HORIZONTALLY TO ATTACK
                                 </div>
                                 <div className="grid grid-cols-10 grid-rows-10 gap-0.5 sm:gap-[2px] w-full h-full relative z-10 flex-1">
                                     {Array.from({length: 100}).map((_, i) => {
                                         const ticked = ticks.has(i);
                                         const isDraggingThis = dragTarget?.id === i;
                                         return (
                                             <div
                                                key={i}
                                                onPointerDown={(e) => {
                                                    e.preventDefault();
                                                    if (!ticked && isPlaying) {
                                                        setDragTarget({ id: i, startX: e.clientX });
                                                        e.currentTarget.setPointerCapture(e.pointerId);
                                                    }
                                                }}
                                                onPointerMove={(e) => {
                                                    e.preventDefault();
                                                    if (dragTarget?.id === i && isPlaying && !ticked) {
                                                        const deltaX = Math.abs(e.clientX - dragTarget.startX);
                                                        if (deltaX > 20) {
                                                            onTick(i);
                                                            setDragTarget(null);
                                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                                        }
                                                    }
                                                }}
                                                onPointerUp={(e) => {
                                                    if (dragTarget?.id === i) {
                                                        setDragTarget(null);
                                                        e.currentTarget.releasePointerCapture(e.pointerId);
                                                    }
                                                }}
                                                onPointerCancel={(e) => {
                                                    if (dragTarget?.id === i) {
                                                        setDragTarget(null);
                                                        e.currentTarget.releasePointerCapture(e.pointerId);
                                                    }
                                                }}
                                                className={`
                                                    rounded-[2px] cursor-grab active:cursor-grabbing touch-none w-full h-full overflow-hidden relative transition-all duration-75
                                                    ${!ticked 
                                                        ? `${bgTheme} ${shadowTheme} ${isDraggingThis ? 'brightness-110 scale-[0.85]' : 'hover:brightness-105 opacity-90'}` 
                                                        : 'bg-slate-100 border border-slate-200'
                                                    }
                                                `}
                                             >
                                                {!ticked && isDraggingThis && (
                                                    <div className="absolute inset-0 bg-white/40 animate-pulse pointer-events-none" />
                                                )}
                                             </div>
                                         )
                                     })}
                                 </div>
                             </div>
                         )}
                     </div>
                 )}
             </div>
        </div>
    );
}
