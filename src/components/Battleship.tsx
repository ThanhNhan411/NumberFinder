import React, { useState, useEffect } from 'react';

const SHIP_TYPES = [
    { id: 'S1', size: 5, color: '#fca5a5' }, // Red (Carrier)
    { id: 'S2', size: 4, color: '#fcd34d' }, // Yellow (Battleship)
    { id: 'S3', size: 3, color: '#86efac' }, // Green (Cruiser)
    { id: 'S4', size: 3, color: '#93c5fd' }, // Blue (Submarine)
    { id: 'S5', size: 2, color: '#d8b4fe' }, // Purple (Destroyer)
];

export default function BattleshipGame({ 
    socket, roomId, myPlayerId, status, turn, winner, 
    p1Board, p2Board, p1Ready, p2Ready, p1Shots, p2Shots 
}: any) {
    const isP1 = myPlayerId === 'P1';
    
    // Local setup state
    const [shipsToPlace, setShipsToPlace] = useState(SHIP_TYPES);
    const [placedShips, setPlacedShips] = useState<any[]>([]);
    const [selectedShipInfo, setSelectedShipInfo] = useState<any | null>(null);

    // Audio effects...
    const playEffect = (type: 'hit' | 'miss') => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            if (type === 'hit') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                gain.gain.setValueAtTime(0.5, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            } else {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch (e) { }
    };

    useEffect(() => {
        const handleShootRes = (data: any) => {
            if (data.hit) {
                playEffect('hit');
            } else {
                playEffect('miss');
            }
        };
        socket.on('battleshipShotResult', handleShootRes);
        return () => {
            socket.off('battleshipShotResult', handleShootRes);
        };
    }, [socket]);

    const handleGridTap = (x: number, y: number) => {
        if (status === 'READY') {
            // Placement logic
            if (selectedShipInfo) {
                const { id, size, isVertical, color } = selectedShipInfo;
                // check bounds
                if (isVertical && y + size > 10) return;
                if (!isVertical && x + size > 10) return;

                const cells = [];
                for(let i=0; i<size; i++){
                    cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                }

                // check collision
                const hasCollision = placedShips.some(ship => 
                    ship.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y))
                );

                if (hasCollision) return;

                setPlacedShips([...placedShips, { id, size, isVertical, color, cells, x, y }]);
                setShipsToPlace(shipsToPlace.filter(s => s.id !== id));
                setSelectedShipInfo(null);
            }
        } else if (status === 'PLAYING') {
            // Shooting logic
            if (turn !== myPlayerId) return;
            const myShots = isP1 ? p1Shots : p2Shots;
            if (myShots.some((s: any) => s.x === x && s.y === y)) return; // already shot
            
            socket.emit('battleshipShoot', { roomId, playerId: myPlayerId, x, y });
        }
    };

    const toggleRotation = (e: any) => {
        if (selectedShipInfo) {
            setSelectedShipInfo({ ...selectedShipInfo, isVertical: !selectedShipInfo.isVertical });
        }
    };

    const undoPlacement = () => {
        if (placedShips.length === 0) return;
        const last = placedShips[placedShips.length - 1];
        setPlacedShips(placedShips.slice(0, placedShips.length - 1));
        setShipsToPlace([...shipsToPlace, { id: last.id, size: last.size, color: last.color }]);
    }

    const commitBoard = () => {
        if (placedShips.length === 5) {
            socket.emit("battleshipReady", { roomId, playerId: myPlayerId, board: placedShips });
        }
    }

    const myBoardState = isP1 ? p1Board : p2Board;
    const oppBoardState = isP1 ? p2Board : p1Board; // oppBoard is not fully sent if PLAYING, only what we know, but we use shots to draw

    const myShots = isP1 ? p1Shots : p2Shots;
    const oppShots = isP1 ? p2Shots : p1Shots;

    const myReady = isP1 ? p1Ready : p2Ready;
    const oppReady = isP1 ? p2Ready : p1Ready;

    return (
        <div className="flex flex-col h-[100dvh] w-screen bg-slate-900 text-slate-100 font-sans">
            <div className="flex flex-col items-center justify-center p-4 h-full relative">
                
                <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-pink-500 mb-2">SEA STRIKE</h1>

                {(status === 'WAITING' || status === 'SETUP') && (
                    <div className="flex flex-col items-center flex-1 justify-center">
                        <div className="p-6 bg-slate-800 rounded-2xl border border-slate-700 text-center mb-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Room Code</p>
                            <p className="text-4xl font-black text-white tracking-[0.2em]">{roomId}</p>
                        </div>
                        {status === 'WAITING' ? (
                           <div className="flex items-center gap-3 bg-slate-800 px-6 py-4 rounded-full border border-slate-700">
                               <div className="w-3 h-3 rounded-full bg-sky-500 animate-ping"></div>
                               <span className="text-sm font-bold text-slate-300 uppercase tracking-widest">Waiting for Opponent...</span>
                           </div>
                        ) : (
                           <button onPointerDown={() => socket.emit("startGame", roomId)} className="px-10 py-4 bg-sky-500 text-white rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(14,165,233,0.4)] active:scale-95 transition-all outline-none">
                               ENTER FLEET
                           </button>
                        )}
                    </div>
                )}

                {status === 'READY' && (
                    <div className="flex flex-col items-center w-full max-w-sm flex-1">
                        {!myReady ? (
                            <>
                                <h2 className="text-lg font-bold text-slate-300 mb-2 uppercase tracking-widest">Deploy Your Fleet</h2>
                                <div className="text-xs text-slate-500 mb-4 h-4">{selectedShipInfo ? 'Tap grid to place, tap here to rotate' : 'Select a ship to place'}</div>
                                
                                <div className="mb-4">
                                    <Grid size={10} onCellTap={handleGridTap} myShips={placedShips} oppShots={[]} myShots={[]} />
                                </div>

                                <div className="flex flex-col gap-2 w-full mt-4">
                                    <div className="flex items-center justify-between gap-2 overflow-x-auto p-2 border border-slate-700 bg-slate-800 rounded-xl min-h-[80px]" onClick={toggleRotation}>
                                        {shipsToPlace.map(ship => (
                                            <div 
                                                key={ship.id} 
                                                onClick={(e) => { e.stopPropagation(); setSelectedShipInfo({ ...ship, isVertical: false }); }}
                                                className={`flex gap-1 p-2 rounded cursor-pointer transition-all ${selectedShipInfo?.id === ship.id ? 'bg-slate-700 scale-110 shadow-lg border border-slate-500' : 'opacity-70 hover:opacity-100'}`}
                                            >
                                                {Array.from({length: ship.size}).map((_,i) => (
                                                    <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: ship.color }}></div>
                                                ))}
                                            </div>
                                        ))}
                                        {shipsToPlace.length === 0 && <span className="text-sm text-slate-400 font-bold m-auto">All Ships Deployed</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={undoPlacement} disabled={placedShips.length === 0} className="flex-1 py-3 bg-slate-700 rounded-xl font-bold text-sm tracking-widest disabled:opacity-50">UNDO</button>
                                        <button onClick={commitBoard} disabled={placedShips.length < 5} className="flex-1 py-3 bg-sky-500 rounded-xl font-bold text-sm tracking-widest disabled:opacity-50">READY</button>
                                    </div>
                                    {selectedShipInfo && (
                                       <div className="text-center text-xs text-slate-400 mt-2 font-bold animate-pulse">SHIP SELECTED - {selectedShipInfo.isVertical ? 'VERTICAL' : 'HORIZONTAL'}</div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <div className="flex items-center gap-3 bg-slate-800 px-6 py-4 rounded-full border border-slate-700">
                                   <div className="w-3 h-3 rounded-full bg-pink-500 animate-ping"></div>
                                   <span className="text-sm font-bold text-slate-300 uppercase tracking-widest text-center">Fleet Deployed<br/>Waiting for enemy...</span>
                               </div>
                            </div>
                        )}
                    </div>
                )}

                {status === 'PLAYING' && (
                    <div className="flex flex-col w-full max-w-md flex-1">
                        {/* Opponent's Board (Top) */}
                        <div className="flex flex-col mb-4">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className={`text-sm font-bold uppercase tracking-widest ${turn === myPlayerId ? 'text-sky-400 animate-pulse' : 'text-slate-500'}`}>
                                    Enemy Waters {turn === myPlayerId && '- YOUR TURN'}
                                </span>
                            </div>
                            <div className={`transition-opacity ${turn !== myPlayerId ? 'opacity-50 pointer-events-none' : ''}`}>
                                <Grid size={10} onCellTap={handleGridTap} myShips={[]} oppShots={[]} myShots={myShots} isTargetMode />
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="w-full h-px bg-slate-700 my-2 relative">
                            <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                            </div>
                        </div>

                        {/* My Board (Bottom) */}
                        <div className="flex flex-col mt-4 opacity-80 scale-95 origin-bottom">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Your Fleet
                                </span>
                            </div>
                            <div>
                                <Grid size={10} onCellTap={()=>{}} myShips={myBoardState || placedShips} oppShots={oppShots} myShots={[]} shrink />
                            </div>
                        </div>
                    </div>
                )}

                {status === 'GAME_OVER' && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur pb-20">
                        <div className="text-sm font-semibold text-slate-400 tracking-[0.2em] uppercase mb-4">Battle Result</div>
                        <div className={`text-5xl font-black uppercase tracking-widest mb-10 text-center animate-pulse ${winner === myPlayerId ? 'text-sky-400 drop-shadow-[0_0_20px_rgba(56,189,248,0.5)]' : 'text-pink-500 drop-shadow-[0_0_20px_rgba(236,72,153,0.5)]'}`}>
                            {winner === myPlayerId ? 'VICTORY' : 'DEFEAT'}
                        </div>
                        {myPlayerId === 'P1' && (
                           <button onPointerDown={() => socket.emit("startGame", roomId)} className="px-10 py-4 bg-white text-slate-900 rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all outline-none">
                               PLAY AGAIN
                           </button>
                        )}
                        {myPlayerId === 'P2' && (
                           <div className="text-sm font-bold text-slate-400 uppercase">Waiting for Host...</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Grid({ size, onCellTap, myShips, oppShots, myShots, isTargetMode, shrink }: any) {
    const cells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells.push({ x, y });
        }
    }

    return (
        <div className={`grid w-full aspect-square bg-slate-800 border-[2px] border-slate-700 shadow-inner p-1 ${shrink ? 'gap-[2px]' : 'gap-1'}`} style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
            {cells.map((cell) => {
                let status = 'empty';
                let shipColor = 'transparent';
                
                // My ships rendering
                if (!isTargetMode && myShips) {
                    const ship = myShips.find((s: any) => s.cells.some((c: any) => c.x === cell.x && c.y === cell.y));
                    if (ship) {
                        status = 'ship';
                        shipColor = ship.color;
                    }
                }

                // Opponent shots on me
                if (!isTargetMode && oppShots) {
                    const shot = oppShots.find((s: any) => s.x === cell.x && s.y === cell.y);
                    if (shot) {
                        status = shot.hit ? 'opp_hit' : 'opp_miss';
                    }
                }

                // My shots on opponent
                if (isTargetMode && myShots) {
                    const shot = myShots.find((s: any) => s.x === cell.x && s.y === cell.y);
                    if (shot) {
                        status = shot.hit ? 'my_hit' : 'my_miss';
                    }
                }

                return (
                    <div 
                        key={`${cell.x}-${cell.y}`}
                        onClick={() => onCellTap(cell.x, cell.y)}
                        className={`relative w-full h-full rounded-sm transition-all duration-200 ${isTargetMode ? 'cursor-crosshair hover:bg-slate-700' : 'cursor-pointer'}
                            ${status === 'empty' ? (isTargetMode ? 'bg-slate-800/80' : 'bg-slate-700/30') : ''}
                        `}
                        style={{ backgroundColor: status === 'ship' ? shipColor : undefined }}
                    >
                        {status === 'my_miss' && (
                            <div className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-slate-400 opacity-80" />
                        )}
                        {status === 'my_hit' && (
                            <div className="absolute inset-0 flex border-2 border-pink-500 rounded-sm bg-pink-500/20 items-center justify-center">
                                <div className="w-2 h-2 rotate-45 bg-pink-500 shadow-[0_0_10px_#ec4899]" />
                            </div>
                        )}
                        {status === 'opp_miss' && (
                            <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-slate-400 opacity-60" />
                        )}
                        {status === 'opp_hit' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-animate-shake z-10 text-xl font-bold text-red-500 drop-shadow-md">
                                X
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    );
}
