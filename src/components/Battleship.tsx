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
    const [dragInfo, setDragInfo] = useState<any>(null);
    const [hoverCell, setHoverCell] = useState<{x: number, y: number} | null>(null);

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
            // Placement logic (fallback for click-to-place)
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

    const handleDragStartDock = (e: React.DragEvent, ship: any) => {
        const isVertical = selectedShipInfo?.id === ship.id ? selectedShipInfo.isVertical : false;
        setDragInfo({ ship: { ...ship, isVertical }, source: 'dock', offsetIndex: 0 });
        e.dataTransfer.setData('text/plain', ship.id);
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
        e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragStartBoard = (e: React.DragEvent, ship: any) => {
        const target = e.target as HTMLElement;
        const rect = target.getBoundingClientRect();
        const isVertical = ship.isVertical;
        const cellSize = isVertical ? rect.height / ship.size : rect.width / ship.size;
        
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const offsetIndex = isVertical ? Math.floor(clickY / cellSize) : Math.floor(clickX / cellSize);
        
        setDragInfo({ ship, source: 'board', offsetIndex: Math.max(0, Math.min(offsetIndex, ship.size - 1)) });
        e.dataTransfer.setData('text/plain', ship.id);
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
        e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragOverCell = (e: React.DragEvent, x: number, y: number) => {
        e.preventDefault(); 
        if (!dragInfo) return;
        setHoverCell(prev => prev?.x === x && prev?.y === y ? prev : { x, y });
    };

    const handleDragLeaveGrid = () => {
        // Do nothing to prevent flickering when moving between cells
    };

    const handleDragEnd = () => {
        setDragInfo(null);
        setHoverCell(null);
    };

    const getHoverState = (cx?: number, cy?: number) => {
        if (!dragInfo) return null;
        const currentX = cx ?? hoverCell?.x;
        const currentY = cy ?? hoverCell?.y;
        if (currentX === undefined || currentY === undefined) return null;

        const { ship, offsetIndex } = dragInfo;
        
        const startX = ship.isVertical ? currentX : currentX - offsetIndex;
        const startY = ship.isVertical ? currentY - offsetIndex : currentY;

        const cells = [];
        for(let i=0; i<ship.size; i++){
            cells.push({ x: ship.isVertical ? startX : startX + i, y: ship.isVertical ? startY + i : startY });
        }

        const isOutOfBounds = cells.some(c => c.x < 0 || c.x > 9 || c.y < 0 || c.y > 9);

        const hasCollision = placedShips.some((p:any) => 
            p.id !== ship.id && p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y))
        );

        const isValid = !isOutOfBounds && !hasCollision;

        return { shipId: ship.id, cells, isValid, hx: startX, hy: startY };
    };

    const handleDropGrid = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragInfo || !hoverCell) {
            setDragInfo(null);
            setHoverCell(null);
            return;
        }
        
        const hState = getHoverState(hoverCell.x, hoverCell.y);
        if (hState && hState.isValid) {
            const newShip = { ...dragInfo.ship, x: hState.hx, y: hState.hy, cells: hState.cells };
            
            let newPlaced = [...placedShips];
            if (dragInfo.source === 'board') {
                newPlaced = newPlaced.filter((s:any) => s.id !== newShip.id);
            } else {
                setShipsToPlace(shipsToPlace.filter((s:any) => s.id !== newShip.id));
                if (selectedShipInfo && selectedShipInfo.id === newShip.id) {
                    setSelectedShipInfo(null);
                }
            }
            newPlaced.push(newShip);
            setPlacedShips(newPlaced);
        }
        
        setDragInfo(null);
        setHoverCell(null);
    };

    const handleShipTap = (ship: any) => {
        if (status !== 'READY') return;
        const newIsVertical = !ship.isVertical;
        
        const cells = [];
        for(let i=0; i<ship.size; i++){
            cells.push({ x: newIsVertical ? ship.x : ship.x + i, y: newIsVertical ? ship.y + i : ship.y });
        }

        const isOutOfBounds = cells.some(c => c.x < 0 || c.x > 9 || c.y < 0 || c.y > 9);

        const hasCollision = placedShips.some((p:any) => 
            p.id !== ship.id && p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y))
        );

        if (!isOutOfBounds && !hasCollision) {
            setPlacedShips(placedShips.map((p:any) => p.id === ship.id ? { ...p, isVertical: newIsVertical, cells } : p));
        } else {
            playEffect('miss'); 
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

    const placeRandomShips = () => {
        let currentPlaced: any[] = [];
        let available = [...SHIP_TYPES];

        for (const ship of available) {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 100) {
                const isVertical = Math.random() > 0.5;
                const x = Math.floor(Math.random() * (isVertical ? 10 : 10 - ship.size + 1));
                const y = Math.floor(Math.random() * (isVertical ? 10 - ship.size + 1 : 10));

                const cells = [];
                for(let i=0; i<ship.size; i++){
                    cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                }

                const hasCollision = currentPlaced.some(p => 
                    p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y))
                );

                if (!hasCollision) {
                    currentPlaced.push({ ...ship, isVertical, cells, x, y });
                    placed = true;
                }
                attempts++;
            }
        }
        setPlacedShips(currentPlaced);
        setShipsToPlace([]);
        setSelectedShipInfo(null);
    };

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
                        <div className="mb-4 text-center">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Room Code:</span>
                            <span className="text-xl font-black text-white tracking-[0.2em]">{roomId}</span>
                        </div>
                        {!myReady ? (
                            <>
                                <h2 className="text-lg font-bold text-slate-300 mb-2 uppercase tracking-widest">Deploy Your Fleet</h2>
                                <div className="text-xs text-slate-500 mb-4 h-4">{selectedShipInfo ? 'Tap grid to place, tap here to rotate' : 'Drag ships to the grid, tap placed ships to rotate'}</div>
                                
                                <div className="mb-4 w-full px-2 max-w-[350px] mx-auto" onDragEnd={handleDragEnd}>
                                    <Grid 
                                        size={10} 
                                        onCellTap={handleGridTap} 
                                        myShips={placedShips} 
                                        oppShots={[]} 
                                        myShots={[]}
                                        onDragStartShip={handleDragStartBoard}
                                        onDragEndShip={handleDragEnd}
                                        onDragOverCell={handleDragOverCell}
                                        onDropGrid={handleDropGrid}
                                        onDragLeaveGrid={handleDragLeaveGrid}
                                        hoverState={getHoverState()}
                                        onShipTap={handleShipTap}
                                    />
                                </div>

                                <div className="flex flex-col gap-2 w-full mt-4">
                                    <div className="flex items-center justify-between gap-2 overflow-x-auto p-2 border border-slate-700 bg-slate-800 rounded-xl min-h-[80px]" onClick={toggleRotation}>
                                        {shipsToPlace.map(ship => (
                                            <div 
                                                key={ship.id} 
                                                draggable
                                                onDragStart={(e) => handleDragStartDock(e, ship)}
                                                onDragEnd={handleDragEnd}
                                                onClick={(e) => { e.stopPropagation(); setSelectedShipInfo({ ...ship, isVertical: false }); }}
                                                className={`flex gap-1 p-2 rounded cursor-grab active:cursor-grabbing transition-all flex-shrink-0 ${selectedShipInfo?.id === ship.id ? 'bg-slate-700 scale-110 shadow-lg border border-slate-500' : 'opacity-70 hover:opacity-100'} ${dragInfo?.ship?.id === ship.id ? 'opacity-50' : ''}`}
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
                                        <button onClick={placeRandomShips} className="flex-1 py-3 bg-slate-700 rounded-xl font-bold text-sm tracking-widest hover:bg-slate-600 active:scale-95 transition-all text-sky-300">RANDOM</button>
                                        <button onClick={commitBoard} disabled={placedShips.length < 5} className="flex-1 py-3 bg-sky-500 rounded-xl font-bold text-sm tracking-widest disabled:opacity-50 text-white">READY</button>
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
                        <div className="flex flex-col mb-4 w-full px-2 max-w-[400px] mx-auto">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className={`text-sm font-bold uppercase tracking-widest ${turn === myPlayerId ? 'text-sky-400 animate-pulse' : 'text-slate-500'}`}>
                                    Enemy Waters {turn === myPlayerId && '- YOUR TURN'}
                                </span>
                            </div>
                            <div className={`transition-opacity w-full ${turn !== myPlayerId ? 'opacity-50 pointer-events-none' : ''}`}>
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
                        <div className="flex flex-col mt-4 opacity-80 scale-95 origin-bottom w-full px-2 max-w-[400px] mx-auto">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    Your Fleet
                                </span>
                            </div>
                            <div className="w-full">
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

function Grid({ size, onCellTap, onDragStartShip, onDragEndShip, onDragOverCell, onDropGrid, onDragLeaveGrid, myShips, oppShots, myShots, isTargetMode, shrink, hoverState, onShipTap }: any) {
    const cells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells.push({ x, y });
        }
    }

    return (
        <div 
           className={`grid w-full aspect-square bg-slate-800 border-[2px] border-slate-700 shadow-inner p-1 relative ${shrink ? 'gap-[2px]' : 'gap-1'}`} 
           style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}
           onDragOver={(e) => e.preventDefault()}
           onDrop={(e) => onDropGrid && onDropGrid(e)}
           onDragLeave={onDragLeaveGrid}
        >
            {/* Background cells */}
            {cells.map((cell) => {
                let status = 'empty';
                
                if (!isTargetMode && oppShots) {
                    const shot = oppShots.find((s: any) => s.x === cell.x && s.y === cell.y);
                    if (shot) status = shot.hit ? 'opp_hit' : 'opp_miss';
                }

                if (isTargetMode && myShots) {
                    const shot = myShots.find((s: any) => s.x === cell.x && s.y === cell.y);
                    if (shot) status = shot.hit ? 'my_hit' : 'my_miss';
                }

                return (
                    <div 
                        key={`cell-${cell.x}-${cell.y}`}
                        onClick={() => onCellTap && onCellTap(cell.x, cell.y)}
                        onDragEnter={(e) => { e.preventDefault(); onDragOverCell && onDragOverCell(e, cell.x, cell.y); }}
                        onDragOver={(e) => { e.preventDefault(); onDragOverCell && onDragOverCell(e, cell.x, cell.y); }}
                        className={`relative w-full h-full rounded-sm transition-colors duration-200 ${isTargetMode ? 'cursor-crosshair hover:bg-slate-700' : ''}
                            ${status === 'empty' ? (isTargetMode ? 'bg-slate-700/50' : 'bg-slate-700/30') : ''}
                        `}
                    >
                        {status === 'my_miss' && (
                            <div className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-slate-400 opacity-80 pointer-events-none" />
                        )}
                        {status === 'my_hit' && (
                            <div className="absolute inset-0 flex border-2 border-pink-500 rounded-sm bg-pink-500/20 items-center justify-center pointer-events-none">
                                <div className="w-2 h-2 rotate-45 bg-pink-500 shadow-[0_0_10px_#ec4899]" />
                            </div>
                        )}
                        {status === 'opp_miss' && (
                            <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-slate-400 opacity-60 pointer-events-none" />
                        )}
                    </div>
                )
            })}
            
            {/* Ships */}
            {!isTargetMode && myShips && myShips.map((ship: any) => {
                const isDragging = hoverState && hoverState.shipId === ship.id;
                return (
                    <div 
                        key={ship.id}
                        draggable={!!onDragStartShip}
                        onDragStart={(e) => onDragStartShip && onDragStartShip(e, ship)}
                        onDragEnd={(e) => onDragEndShip && onDragEndShip(e)}
                        onClick={(e) => { e.stopPropagation(); onShipTap && onShipTap(ship); }}
                        style={{ 
                            gridColumn: `${ship.x + 1} / span ${ship.isVertical ? 1 : ship.size}`,
                            gridRow: `${ship.y + 1} / span ${ship.isVertical ? ship.size : 1}`,
                            backgroundColor: ship.color
                        }}
                        className={`rounded-sm z-20 transition-opacity flex items-center justify-center ${hoverState ? 'pointer-events-none' : 'pointer-events-auto'}
                            ${onDragStartShip ? 'cursor-grab active:cursor-grabbing hover:brightness-110 shadow-sm' : ''} 
                            ${isDragging ? 'opacity-0' : 'opacity-90'}
                        `}
                    />
                );
            })}

            {/* Render opponent hits on top of ships */}
            {!isTargetMode && oppShots && oppShots.map((shot: any) => {
                if (shot.hit) {
                    return (
                        <div 
                            key={`opp-hit-${shot.x}-${shot.y}`}
                            style={{ gridColumn: shot.x + 1, gridRow: shot.y + 1 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none group-animate-shake z-30 text-xl font-bold text-red-500 drop-shadow-md w-full h-full"
                        >
                            X
                        </div>
                    );
                }
                return null;
            })}

            {/* Hover overlay for dragging */}
            {hoverState && hoverState.cells.map((c: any) => {
                if (c.x < 0 || c.x > 9 || c.y < 0 || c.y > 9) return null;
                return (
                    <div key={`hover-${c.x}-${c.y}`} 
                         style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
                         className={`w-full h-full rounded-sm opacity-80 z-40 pointer-events-none border-[2px] ${hoverState.isValid ? 'bg-green-500/50 border-green-400' : 'bg-red-500/50 border-red-400'}`} />
                )
            })}
        </div>
    );
}
