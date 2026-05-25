import React, { useState, useEffect, useRef } from 'react';

interface PlayerPanelProps {
  playerId: 'P1' | 'P2';
  name: string;
  turn: 'P1' | 'P2';
  status: 'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER';
  targetNumber: number | null;
  ticks: Set<number>;
  onTick?: (id: number) => void;
  onStart: () => void;
  isCompact?: boolean;
}

export default function PlayerPanel({
    playerId, name, turn, status, targetNumber, ticks, onTick, onStart, isCompact = false
}: PlayerPanelProps) {
    const isMyTurn = turn === playerId;
    const isReady = status === 'READY';
    const isPlaying = status === 'PLAYING';
    
    const themeColor = playerId === 'P1' ? 'text-sky-500' : 'text-pink-500';
    const bgTheme = playerId === 'P1' ? 'bg-sky-400' : 'bg-pink-400';
    const shadowTheme = playerId === 'P1' ? 'shadow-[0_0_10px_rgba(56,189,248,0.4)]' : 'shadow-[0_0_10px_rgba(244,114,182,0.4)]';

    const [dragTarget, setDragTarget] = useState<{ id: number, startX: number, pointerId: number } | null>(null);
    const dragTargetRef = useRef<typeof dragTarget>(null);
    const dragElementRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        dragTargetRef.current = dragTarget;
    }, [dragTarget]);

    useEffect(() => {
        if (!dragTarget) return;

        const handleWindowPointerMove = (e: PointerEvent) => {
            const target = dragTargetRef.current;
            if (!target || e.pointerId !== target.pointerId) return;
            if (!isPlaying) return;
            if (ticks.has(target.id)) return;

            const deltaX = Math.abs(e.clientX - target.startX);
            if (deltaX > 20) {
                onTick(target.id);
                setDragTarget(null);
                if (dragElementRef.current) {
                    try {
                        dragElementRef.current.releasePointerCapture(target.pointerId);
                    } catch {}
                }
            }
        };

        const handleWindowPointerUp = (e: PointerEvent) => {
            const target = dragTargetRef.current;
            if (!target || e.pointerId !== target.pointerId) return;
            setDragTarget(null);
            if (dragElementRef.current) {
                try {
                    dragElementRef.current.releasePointerCapture(target.pointerId);
                } catch {}
            }
        };

        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handleWindowPointerUp);
        window.addEventListener('pointercancel', handleWindowPointerUp);

        return () => {
            window.removeEventListener('pointermove', handleWindowPointerMove);
            window.removeEventListener('pointerup', handleWindowPointerUp);
            window.removeEventListener('pointercancel', handleWindowPointerUp);
        };
    }, [dragTarget, isPlaying, onTick, ticks]);

    return (
        <div className={`w-full h-full flex flex-col items-center justify-center select-none container mx-auto min-h-0 ${isCompact ? 'gap-0.5 p-0.5' : 'gap-2 p-1 sm:p-2'}`}>
             {/* Header */}
             <div className={`flex items-center justify-between w-full z-10 relative ${isCompact ? 'px-1 mb-0' : 'px-2 sm:px-4 mb-0 sm:mb-1'}`}>
                 <span className={`font-bold ${themeColor} drop-shadow-sm ${isCompact ? 'text-[10px]' : 'text-sm sm:text-base'}`}>{name}</span>
                 <span className={`text-slate-400 uppercase tracking-widest font-semibold ${isCompact ? 'text-[8px]' : 'text-[10px] sm:text-xs'}`}>{100 - ticks.size} LEFT</span>
             </div>

             {/* Main Play Area */}
             <div className={`flex-1 flex flex-col items-center justify-center w-full min-h-0 relative ${isCompact ? 'overflow-hidden' : ''}`}>
                 {isMyTurn ? (
                     <div className="flex flex-col items-center justify-center h-full gap-4 w-full px-2">
                         {isReady && (
                             <button
                                 onPointerDown={onStart}
                                 className={`w-full max-w-xs bg-slate-900 border-slate-800 text-white rounded-xl font-bold uppercase tracking-widest border shadow-lg active:scale-95 transition-all hover:bg-slate-800 ${isCompact ? 'px-3 py-1.5 text-[10px]' : 'px-4 py-3 sm:py-4 text-xs sm:text-sm'}`}
                             >
                                Start Searching
                             </button>
                         )}
                         {isPlaying && (
                             <div className={`flex flex-col items-center justify-center w-full max-w-xs h-full bg-slate-50 border border-slate-200 shadow-inner relative overflow-hidden ${isCompact ? 'rounded-lg' : 'rounded-2xl sm:rounded-3xl'}`}>
                                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.2),transparent_70%)]" style={{ opacity: playerId === 'P1' ? 1 : 0 }}></div>
                                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(244,114,182,0.2),transparent_70%)]" style={{ opacity: playerId === 'P2' ? 1 : 0 }}></div>
                                 {!isCompact && <span className={`text-[10px] sm:text-xs font-bold tracking-[0.3em] uppercase mb-1 sm:mb-2 z-10 ${themeColor}`}>Search Target</span>}
                                 <span className={`font-black text-slate-800 drop-shadow-md z-10 leading-none ${isCompact ? 'text-2xl' : 'text-5xl sm:text-7xl'}`}>{targetNumber}</span>
                             </div>
                         )}
                     </div>
                 ) : (
                     <div className="w-full h-full flex flex-col items-center justify-center flex-1 min-h-0 px-2">
                         {(!isPlaying && isReady) ? (
                            <div className={`my-auto text-slate-400 animate-pulse tracking-widest uppercase font-bold text-center ${isCompact ? 'text-[9px]' : 'text-xs'}`}>
                                Opponent preparing...
                            </div>
                         ) : (
                             <div className={`w-full h-full max-w-md flex flex-col justify-center min-h-0 relative ${isCompact ? 'mt-1' : 'mt-4'}`}>
                                 {!isCompact && (
                                   <div className="absolute top-0 left-0 w-full text-center -mt-6 sm:-mt-8 text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-widest animate-pulse pointer-events-none">
                                      SWIPE BOXES HORIZONTALLY TO ATTACK
                                   </div>
                                 )}
                                 <div className={`grid grid-cols-10 grid-rows-10 w-full h-full relative z-10 flex-1 ${isCompact ? 'gap-[1px]' : 'gap-0.5 sm:gap-[2px]'}`}>
                                     {Array.from({length: 100}).map((_, i) => {
                                         const ticked = ticks.has(i);
                                         const isDraggingThis = dragTarget?.id === i;
                                         const canTick = !ticked && isPlaying && !!onTick;
                                         return (
                                             <div
                                                key={i}
                                                onPointerDown={(e) => {
                                                    e.preventDefault();
                                                    if (canTick) {
                                                        setDragTarget({ id: i, startX: e.clientX, pointerId: e.pointerId });
                                                        dragElementRef.current = e.currentTarget as HTMLDivElement;
                                                        e.currentTarget.setPointerCapture(e.pointerId);
                                                    }
                                                }}
                                                onPointerMove={(e) => {
                                                    e.preventDefault();
                                                    if (dragTarget?.id === i && canTick) {
                                                        const deltaX = Math.abs(e.clientX - dragTarget.startX);
                                                        if (deltaX > 20) {
                                                            onTick?.(i);
                                                            setDragTarget(null);
                                                            try {
                                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                                            } catch {}
                                                        }
                                                    }
                                                }}
                                                onPointerUp={(e) => {
                                                    if (dragTarget?.id === i) {
                                                        setDragTarget(null);
                                                        try {
                                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                                        } catch {}
                                                    }
                                                }}
                                                onPointerCancel={(e) => {
                                                    if (dragTarget?.id === i) {
                                                        setDragTarget(null);
                                                        try {
                                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                                        } catch {}
                                                    }
                                                }}
                                                className={`
                                                    rounded-[2px] ${canTick ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} touch-none w-full h-full overflow-hidden relative transition-all duration-75
                                                    ${!ticked 
                                                        ? `${bgTheme} ${shadowTheme} ${isDraggingThis ? 'brightness-110 scale-[0.85]' : canTick ? 'hover:brightness-105 opacity-90' : 'opacity-80'}` 
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
