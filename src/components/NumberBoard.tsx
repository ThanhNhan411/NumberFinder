import React, { useState } from 'react';

export default function NumberBoard({ status, numbers, foundNumbers, onNumberClick, turn, targetNumber, myPlayerId }: any) {
    const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());

    const handleNumberDown = (val: number) => {
        if (status === 'PLAYING' && val !== targetNumber && myPlayerId === turn) {
            setWrongIds(prev => new Set(prev).add(val));
            setTimeout(() => {
                setWrongIds(prev => {
                    const next = new Set(prev);
                    next.delete(val);
                    return next;
                });
            }, 400);
        }
        onNumberClick(val);
    };

    return (
        <div className="relative w-full h-full bg-slate-50 overflow-hidden flex flex-col justify-center">
            {/* The Overlay for Game Statuses */}
            {(status === 'READY') && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                   <div className="flex flex-col items-center">
                       <div className="text-3xl md:text-4xl font-black text-slate-400 tracking-[0.4em] uppercase animate-pulse text-center px-4">
                           READY
                       </div>
                   </div>
                </div>
            )}

            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.05),transparent_70%)]"></div>

            <div className="grid grid-cols-10 grid-rows-10 gap-2 sm:gap-2 w-full h-full p-2 z-10">
                {numbers.map((item: any, idx: number) => {
                    if (!item) {
                        return <div key={`empty-${idx}`} className="relative flex items-center justify-center pointer-events-none" />;
                    }
                    const isFound = foundNumbers.has(item.value);
                    const isWrong = wrongIds.has(item.value);
                    const finalRotation = item.rotation;

                    return (
                        <div key={item.id} className="relative flex items-center justify-center overflow-visible">
                             <div
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!isFound) handleNumberDown(item.value);
                                }}
                                className={`
                                    relative flex items-center justify-center w-full h-full rounded-lg overflow-visible
                                    font-bold cursor-pointer select-none font-sans
                                    transition-all duration-300 ease-out
                                    ${isFound ? 'opacity-10 scale-[0.4] grayscale blur-[2px] pointer-events-none' : 'opacity-100 hover:scale-110 active:scale-[0.9] hover:z-50 active:z-50'}
                                    ${isWrong ? 'z-50' : ''}
                                `}
                                style={{
                                    color: isWrong ? '#f43f5e' : item.color,
                                    transform: isFound ? undefined : `translate(${item.tx}px, ${item.ty}px) rotate(${finalRotation}deg) scale(${isWrong ? item.scale * 1.2 : item.scale})`,
                                    fontSize: 'clamp(12px, 2.8vmin, 24px)',
                                    zIndex: isWrong ? 100 : (isFound ? 0 : Math.floor(item.scale * 10))
                                }}
                             >
                               <span className={`rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 backdrop-blur-sm pointer-events-none shadow-sm transition-colors duration-150 ${isWrong ? 'bg-pink-500/20 border-2 border-pink-500 animate-shake' : 'bg-white border border-slate-200'}`}>
                                   {item.value}
                               </span>
                             </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
