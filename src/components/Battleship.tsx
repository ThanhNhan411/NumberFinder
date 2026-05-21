import React, { useState, useEffect, useRef } from 'react';

const SHIP_TYPES = [
    { id: 'S1', size: 5, color: '#fca5a5' }, // Red (Carrier)
    { id: 'S2', size: 4, color: '#fcd34d' }, // Yellow (Battleship)
    { id: 'S3', size: 3, color: '#86efac' }, // Green (Cruiser)
    { id: 'S4', size: 3, color: '#93c5fd' }, // Blue (Submarine)
    { id: 'S5', size: 2, color: '#d8b4fe' }, // Purple (Destroyer)
];

const SHIP_NAMES: Record<string, string> = {
    'S1': 'Carrier (5)',
    'S2': 'Battleship (4)',
    'S3': 'Cruiser (3)',
    'S4': 'Submarine (3)',
    'S5': 'Destroyer (2)'
};

const SHIP_IMAGES: Record<string, string> = {
    'S1': '/ships/carrier.png',
    'S2': '/ships/battleship.png',
    'S3': '/ships/cruiser.png',
    'S4': '/ships/submarine.png',
    'S5': '/ships/destroyer.png'
};

export default function BattleshipGame({ 
    socket, roomId, myPlayerId, status, turn, winner, 
    p1Board, p2Board, p1Ready, p2Ready, p1Shots, p2Shots,
    turnTimeLeft, onLeaveRoom
}: any) {
    const isP1 = myPlayerId === 'P1';
    
    // Local setup state
    const [shipsToPlace, setShipsToPlace] = useState(SHIP_TYPES);
    const [placedShips, setPlacedShips] = useState<any[]>([]);
    const [selectedShipInfo, setSelectedShipInfo] = useState<any | null>(null);
    const [selectedPlacedShipId, setSelectedPlacedShipId] = useState<string | null>(null);
    const [selectedTarget, setSelectedTarget] = useState<{x: number, y: number} | null>(null);
    const [dragInfo, setDragInfo] = useState<any>(null);
    const [hoverCell, setHoverCell] = useState<{x: number, y: number} | null>(null);
    
    // Status announcements (e.g. sunk ships)
    const [toast, setToast] = useState<string | null>(null);
    const [sunkShips, setSunkShips] = useState<string[]>([]);
    const [mySunkShips, setMySunkShips] = useState<string[]>([]);

    // Mobile view tab state ('attack' | 'defense')
    const [activeTab, setActiveTab] = useState<'attack' | 'defense'>('attack');

    const gridRef = useRef<HTMLDivElement>(null);
    const gridRectRef = useRef<DOMRect | null>(null);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const hasMovedRef = useRef<boolean>(false);

    // Audio and haptic effects...
    const playEffect = (type: 'hit' | 'miss' | 'turn') => {
        try {
            if (navigator.vibrate) {
                if (type === 'hit') {
                    navigator.vibrate([100, 50, 100]);
                } else if (type === 'miss') {
                    navigator.vibrate([50]);
                } else if (type === 'turn') {
                    navigator.vibrate([150]);
                }
            }

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
            } else if (type === 'miss') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            } else if (type === 'turn') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.25);
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
                osc.start();
                osc.stop(ctx.currentTime + 0.25);
            }
        } catch (e) { }
    };

    // Trigger toast and audio on turn change
    useEffect(() => {
        if (status !== 'PLAYING') return;
        
        if (turn === myPlayerId) {
            setToast("LƯỢT CỦA BẠN!");
            playEffect('turn');
        } else {
            setToast("LƯỢT CỦA ĐỐI THỦ!");
        }
        
        const t = setTimeout(() => setToast(null), 2500);
        return () => clearTimeout(t);
    }, [turn, status, myPlayerId]);

    // Listen to shot results to declare hit/miss
    useEffect(() => {
        const handleShootRes = (data: any) => {
            if (data.playerId === myPlayerId) {
                if (data.hit) {
                    playEffect('hit');
                    setToast("BẮN TRÚNG! BẠN ĐƯỢC BẮN TIẾP!");
                } else {
                    playEffect('miss');
                    setToast("HỤT RỒI! ĐẾN LƯỢT ĐỐI THỦ!");
                }
            } else {
                if (data.hit) {
                    playEffect('hit');
                    setToast("ĐỐI THỦ BẮN TRÚNG! HỌ ĐƯỢC BẮN TIẾP!");
                } else {
                    playEffect('miss');
                    setToast("ĐỐI THỦ BẮN HỤT! ĐẾN LƯỢT BẠN!");
                }
            }
            setTimeout(() => setToast(null), 2500);
        };
        socket.on('battleshipShotResult', handleShootRes);
        return () => {
            socket.off('battleshipShotResult', handleShootRes);
        };
    }, [socket, myPlayerId]);

    // Listen to turn timeouts
    useEffect(() => {
        const handleTimeout = (data: { previousTurn: string }) => {
            if (data.previousTurn === myPlayerId) {
                setToast("QUÁ 90 GIÂY! BẠN BỊ MẤT LƯỢT!");
            } else {
                setToast("ĐỐI THỦ HẾT GIỜ! LƯỢT CỦA BẠN!");
            }
            playEffect('miss');
            setTimeout(() => setToast(null), 3000);
        };
        
        socket.on('battleshipTurnTimeout', handleTimeout);
        return () => {
            socket.off('battleshipTurnTimeout', handleTimeout);
        };
    }, [socket, myPlayerId]);

    // Auto-switch tabs on turn change
    useEffect(() => {
        if (status === 'PLAYING') {
            if (turn === myPlayerId) {
                setActiveTab('attack');
            } else {
                setActiveTab('defense');
            }
        }
    }, [turn, status, myPlayerId]);

    const myBoardState = isP1 ? p1Board : p2Board;
    const oppBoardState = isP1 ? p2Board : p1Board; 

    const myShots = isP1 ? p1Shots : p2Shots;
    const oppShots = isP1 ? p2Shots : p1Shots;

    const myReady = isP1 ? p1Ready : p2Ready;
    const oppReady = isP1 ? p2Ready : p1Ready;

    // Monitor opponent sunk ships
    useEffect(() => {
        if (status !== 'PLAYING') return;
        
        if (oppBoardState) {
            const currentSunk: string[] = [];
            oppBoardState.forEach((ship: any) => {
                const isSunk = ship.cells.every((cell: any) => 
                    myShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
                );
                if (isSunk) {
                    currentSunk.push(ship.id);
                }
            });

            const newlySunk = currentSunk.filter(id => !sunkShips.includes(id));
            if (newlySunk.length > 0) {
                setSunkShips(currentSunk);
                const name = SHIP_NAMES[newlySunk[0]].split(' ')[0];
                setToast(`ENEMY ${name.toUpperCase()} SUNK!`);
                setTimeout(() => setToast(null), 3000);
            }
        }
    }, [oppBoardState, myShots, status, sunkShips]);

    // Monitor my sunk ships
    useEffect(() => {
        if (status !== 'PLAYING') return;
        
        const board = myBoardState || placedShips;
        if (board) {
            const currentSunk: string[] = [];
            board.forEach((ship: any) => {
                const isSunk = ship.cells.every((cell: any) => 
                    oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
                );
                if (isSunk) {
                    currentSunk.push(ship.id);
                }
            });

            const newlySunk = currentSunk.filter(id => !mySunkShips.includes(id));
            if (newlySunk.length > 0) {
                setMySunkShips(currentSunk);
                const name = SHIP_NAMES[newlySunk[0]].split(' ')[0];
                setToast(`YOUR ${name.toUpperCase()} SUNK!`);
                setTimeout(() => setToast(null), 3000);
            }
        }
    }, [myBoardState, placedShips, oppShots, status, mySunkShips]);

    const handleGridTap = (x: number, y: number) => {
        if (status === 'READY') {
            if (selectedShipInfo) {
                const { id, size, isVertical, color } = selectedShipInfo;
                if (isVertical && y + size > 10) return;
                if (!isVertical && x + size > 10) return;

                const cells = [];
                for(let i=0; i<size; i++){
                    cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                }

                const hasCollision = placedShips.some(ship => 
                    ship.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y))
                );

                if (hasCollision) return;

                setPlacedShips([...placedShips, { id, size, isVertical, color, cells, x, y }]);
                setShipsToPlace(shipsToPlace.filter(s => s.id !== id));
                setSelectedShipInfo(null);
                setSelectedPlacedShipId(null);
            } else if (selectedPlacedShipId) {
                const ship = placedShips.find(s => s.id === selectedPlacedShipId);
                if (ship) {
                    const { id, size, isVertical, color } = ship;
                    if (isVertical && y + size > 10) return;
                    if (!isVertical && x + size > 10) return;

                    const cells = [];
                    for(let i=0; i<size; i++){
                        cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                    }

                    const hasCollision = placedShips.some(p => 
                        p.id !== id && p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y))
                    );

                    if (hasCollision) return;

                    setPlacedShips(placedShips.map(p => 
                        p.id === id ? { ...p, x, y, cells } : p
                    ));
                }
            }
        } else if (status === 'PLAYING') {
            if (turn !== myPlayerId) return;
            if (myShots.some((s: any) => s.x === x && s.y === y)) return;
            
            if (selectedTarget && selectedTarget.x === x && selectedTarget.y === y) {
                handleFire();
            } else {
                setSelectedTarget({ x, y });
            }
        }
    };

    const handleFire = () => {
        if (!selectedTarget || turn !== myPlayerId) return;
        socket.emit('battleshipShoot', { roomId, playerId: myPlayerId, x: selectedTarget.x, y: selectedTarget.y });
        setSelectedTarget(null);
    };

    // HTML5 Drag and Drop Start
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

    const handleDragLeaveGrid = () => {};

    const handleDragEnd = () => {
        setDragInfo(null);
        setHoverCell(null);
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
            setSelectedPlacedShipId(newShip.id);
        }
        
        setDragInfo(null);
        setHoverCell(null);
    };

    // Custom Mobile Touch Drag and Drop Handlers
    const handleTouchStartShip = (e: React.TouchEvent, ship: any, source: 'dock' | 'board') => {
        const touch = e.touches[0];
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        hasMovedRef.current = false;
        
        if (gridRef.current) {
            gridRectRef.current = gridRef.current.getBoundingClientRect();
        }
        
        let offsetIndex = 0;
        const isVertical = source === 'board' ? ship.isVertical : (selectedShipInfo?.id === ship.id ? selectedShipInfo.isVertical : false);
        
        if (source === 'board') {
            const cellSize = isVertical ? rect.height / ship.size : rect.width / ship.size;
            const clickX = touch.clientX - rect.left;
            const clickY = touch.clientY - rect.top;
            offsetIndex = isVertical ? Math.floor(clickY / cellSize) : Math.floor(clickX / cellSize);
            offsetIndex = Math.max(0, Math.min(offsetIndex, ship.size - 1));
        }
        
        setDragInfo({ ship: { ...ship, isVertical }, source, offsetIndex });
        
        if (source === 'board') {
            setSelectedPlacedShipId(ship.id);
            setSelectedShipInfo(null);
        } else {
            setSelectedShipInfo({ ...ship, isVertical });
            setSelectedPlacedShipId(null);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!dragInfo || !touchStartRef.current) return;
        
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 6) {
            hasMovedRef.current = true;
        }
        
        if (hasMovedRef.current) {
            if (e.cancelable) {
                e.preventDefault();
            }
            
            const gridRect = gridRectRef.current || (gridRef.current ? gridRef.current.getBoundingClientRect() : null);
            if (!gridRect) return;
            
            if (
                touch.clientX >= gridRect.left &&
                touch.clientX <= gridRect.right &&
                touch.clientY >= gridRect.top &&
                touch.clientY <= gridRect.bottom
            ) {
                const cellWidth = gridRect.width / 10;
                const cellHeight = gridRect.height / 10;
                const x = Math.floor((touch.clientX - gridRect.left) / cellWidth);
                const y = Math.floor((touch.clientY - gridRect.top) / cellHeight);
                
                const clampedX = Math.max(0, Math.min(x, 9));
                const clampedY = Math.max(0, Math.min(y, 9));
                
                setHoverCell(prev => {
                    if (prev && prev.x === clampedX && prev.y === clampedY) {
                        return prev;
                    }
                    return { x: clampedX, y: clampedY };
                });
            } else {
                setHoverCell(null);
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!dragInfo) return;
        
        if (!hasMovedRef.current) {
            setDragInfo(null);
            setHoverCell(null);
            touchStartRef.current = null;
            gridRectRef.current = null;
            
            const ship = dragInfo.ship;
            if (dragInfo.source === 'board') {
                handleShipTap(ship);
            } else {
                setSelectedShipInfo({ ...ship, isVertical: false });
                setSelectedPlacedShipId(null);
            }
            return;
        }
        
        if (hoverCell) {
            const hState = getHoverState(hoverCell.x, hoverCell.y);
            if (hState && hState.isValid) {
                const newShip = { ...dragInfo.ship, x: hState.hx, y: hState.hy, cells: hState.cells };
                
                let newPlaced = [...placedShips];
                if (dragInfo.source === 'board') {
                    newPlaced = newPlaced.filter((s:any) => s.id !== newShip.id);
                } else {
                    setShipsToPlace(shipsToPlace.filter((s:any) => s.id !== newShip.id));
                }
                newPlaced.push(newShip);
                setPlacedShips(newPlaced);
                setSelectedPlacedShipId(newShip.id);
                setSelectedShipInfo(null);
            }
        }
        
        setDragInfo(null);
        setHoverCell(null);
        touchStartRef.current = null;
        gridRectRef.current = null;
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

    const handleShipTap = (ship: any) => {
        if (status !== 'READY') return;
        
        if (selectedPlacedShipId === ship.id) {
            handleRotateSelected();
        } else {
            setSelectedPlacedShipId(ship.id);
            setSelectedShipInfo(null);
        }
    };

    const handleRotateSelected = () => {
        if (selectedShipInfo) {
            setSelectedShipInfo({ ...selectedShipInfo, isVertical: !selectedShipInfo.isVertical });
        } else if (selectedPlacedShipId) {
            const ship = placedShips.find(s => s.id === selectedPlacedShipId);
            if (ship) {
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
            }
        }
    };

    const handleRemoveSelected = () => {
        if (selectedPlacedShipId) {
            const ship = placedShips.find(s => s.id === selectedPlacedShipId);
            if (ship) {
                setPlacedShips(placedShips.filter(s => s.id !== selectedPlacedShipId));
                setShipsToPlace([...shipsToPlace, { id: ship.id, size: ship.size, color: ship.color }]);
                setSelectedPlacedShipId(null);
            }
        }
    };

    const undoPlacement = () => {
        if (placedShips.length === 0) return;
        const last = placedShips[placedShips.length - 1];
        setPlacedShips(placedShips.slice(0, placedShips.length - 1));
        setShipsToPlace([...shipsToPlace, { id: last.id, size: last.size, color: last.color }]);
        setSelectedPlacedShipId(null);
        setSelectedShipInfo(null);
    };

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
        setSelectedPlacedShipId(null);
    };

    const commitBoard = () => {
        if (placedShips.length === 5) {
            socket.emit("battleshipReady", { roomId, playerId: myPlayerId, board: placedShips });
        }
    };

    const getOpponentFleetStatus = () => {
        if (!oppBoardState) {
            return SHIP_TYPES.map(ship => ({ 
                id: ship.id, 
                size: ship.size, 
                color: ship.color, 
                name: SHIP_NAMES[ship.id].split(' ')[0], 
                isSunk: false, 
                hitCount: 0 
            }));
        }
        
        return oppBoardState.map((ship: any) => {
            const hitCount = ship.cells.filter((cell: any) => 
                myShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
            ).length;
            const isSunk = hitCount === ship.size;
            return {
                id: ship.id,
                size: ship.size,
                color: ship.color,
                name: SHIP_NAMES[ship.id].split(' ')[0],
                isSunk,
                hitCount
            };
        });
    };

    const getMyFleetStatus = () => {
        const board = myBoardState || placedShips;
        if (!board) {
            return SHIP_TYPES.map(ship => ({ 
                id: ship.id, 
                size: ship.size, 
                color: ship.color, 
                name: SHIP_NAMES[ship.id].split(' ')[0], 
                isSunk: false, 
                hitCount: 0 
            }));
        }
        
        return board.map((ship: any) => {
            const hitCount = ship.cells.filter((cell: any) => 
                oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
            ).length;
            const isSunk = hitCount === ship.size;
            return {
                id: ship.id,
                size: ship.size,
                color: ship.color,
                name: SHIP_NAMES[ship.id].split(' ')[0],
                isSunk,
                hitCount
            };
        });
    };

    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const opponentFleet = getOpponentFleetStatus();
    const myFleet = getMyFleetStatus();

    return (
        <div className="flex flex-col h-[100dvh] w-screen bg-orange-50 text-slate-800 font-sans select-none overflow-hidden relative">
            
            {/* Toast announcement */}
            {toast && (
                <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-50 border font-mono font-black text-xs sm:text-sm tracking-widest px-6 py-3 rounded-full shadow-lg animate-bounce text-center transition-all duration-300
                    ${toast.includes('LƯỢT CỦA BẠN') || toast.includes('LƯỢT CỦA BẠN!') || toast.includes('BẮN TÀU') || toast.includes('BẮN TRÚNG')
                        ? 'bg-sky-600 border-sky-500 text-white shadow-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.3)]' 
                        : toast.includes('ĐỐI THỦ') 
                            ? 'bg-white border-orange-200 text-slate-700 shadow-orange-100/40' 
                            : 'bg-red-650 border-red-500 text-white shadow-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                    }
                `}>
                    {toast}
                </div>
            )}

            {/* Header bar */}
            <div className="w-full max-w-lg md:max-w-4xl mx-auto flex items-center justify-between px-4 pt-4 pb-0 flex-shrink-0 relative z-40">
                <button 
                    onClick={onLeaveRoom}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-orange-50 text-slate-655 border border-orange-200 rounded-full font-bold text-xs tracking-wider transition-colors shadow-sm"
                >
                    &larr; Exit
                </button>
                <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-pink-650">SEA STRIKE</h1>
                <div className="w-[68px] sm:w-[74px]" />
            </div>

            <div className="flex flex-col items-center justify-center p-4 pt-1 h-full relative max-w-lg md:max-w-4xl mx-auto w-full overflow-hidden">

                {(status === 'WAITING' || status === 'SETUP') && (
                    <div className="flex flex-col items-center flex-1 justify-center">
                        <div className="p-6 bg-white/80 rounded-2xl border border-orange-200 text-center mb-4 shadow-xl backdrop-blur-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Room Code</p>
                            <p className="text-4xl font-black text-slate-800 tracking-[0.2em]">{roomId}</p>
                        </div>
                        {status === 'WAITING' ? (
                           <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-full border border-orange-200 shadow-lg">
                               <div className="w-3 h-3 rounded-full bg-sky-500 animate-ping"></div>
                               <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">Waiting for Opponent...</span>
                           </div>
                        ) : (
                           <button onPointerDown={() => socket.emit("startGame", roomId)} className="px-10 py-4 bg-sky-500 text-white rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(14,165,233,0.4)] active:scale-95 transition-all outline-none hover:bg-sky-600">
                               ENTER FLEET
                           </button>
                        )}
                    </div>
                )}

                {status === 'READY' && (
                    <div className="flex flex-col items-center w-full max-w-sm flex-1 justify-center">
                        <div className="mb-2 text-center">
                            <span className="text-xs font-bold text-slate-550 uppercase tracking-widest mr-2">Room Code:</span>
                            <span className="text-xl font-black text-slate-800 tracking-[0.2em]">{roomId}</span>
                        </div>
                        {!myReady ? (
                            <>
                                <h2 className="text-md font-bold text-slate-700 mb-1 uppercase tracking-widest">Deploy Your Fleet</h2>
                                <div className="text-[10px] text-slate-500 mb-3 h-4 text-center">
                                    {selectedShipInfo || selectedPlacedShipId ? 'Tap empty cell to place/move, buttons to rotate/remove' : 'Drag ships or tap one to select and place'}
                                </div>
                                
                                <div className="w-full px-2 max-w-[340px] mx-auto">
                                    <Grid 
                                        size={10} 
                                        gridRef={gridRef}
                                        onCellTap={handleGridTap} 
                                        myShips={placedShips} 
                                        oppShots={[]} 
                                        myShots={[]}
                                        onDragStartShip={handleDragStartBoard}
                                        onDragEndShip={handleDragEnd}
                                        onTouchStartShip={handleTouchStartShip}
                                        onTouchMoveShip={handleTouchMove}
                                        onTouchEndShip={handleTouchEnd}
                                        onDragOverCell={handleDragOverCell}
                                        onDropGrid={handleDropGrid}
                                        onDragLeaveGrid={handleDragLeaveGrid}
                                        hoverState={getHoverState()}
                                        onShipTap={handleShipTap}
                                        selectedPlacedShipId={selectedPlacedShipId}
                                        dragInfo={dragInfo}
                                    />
                                </div>

                                <div className="flex flex-col gap-2.5 w-full mt-4 max-w-[340px]">
                                    {/* Action Bar for Selection */}
                                    {(selectedShipInfo || selectedPlacedShipId) && (
                                        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-orange-100/60 border border-orange-200 rounded-xl animate-fade-in shadow-inner">
                                            <span className="text-[11px] font-mono font-bold text-sky-600 uppercase tracking-wider">
                                                Locked: {SHIP_NAMES[selectedShipInfo?.id || selectedPlacedShipId]?.split(' ')[0]}
                                            </span>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={handleRotateSelected}
                                                    className="px-2.5 py-1 bg-white hover:bg-orange-50 text-sky-655 border border-orange-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                                >
                                                    Rotate
                                                </button>
                                                {selectedPlacedShipId && (
                                                    <button 
                                                        onClick={handleRemoveSelected}
                                                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Dock Container */}
                                    <div 
                                        className="flex items-center justify-between gap-2 overflow-x-auto p-2 border border-orange-200 bg-white/70 shadow-sm rounded-xl min-h-[72px]" 
                                        onClick={() => { setSelectedShipInfo(null); setSelectedPlacedShipId(null); }}
                                    >
                                        {shipsToPlace.map(ship => {
                                            const isSelected = selectedShipInfo?.id === ship.id;
                                            const shipStyle: React.CSSProperties = {
                                                position: 'relative',
                                                width: `${ship.size * 28}px`,
                                                height: '32px',
                                                background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.4)',
                                                border: isSelected ? '2px solid #38bdf8' : '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                boxShadow: isSelected ? '0 0 8px rgba(56, 189, 248, 0.4)' : '0 1px 3px rgba(0,0,0,0.05)',
                                                touchAction: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden'
                                            };

                                            return (
                                                <div 
                                                    key={ship.id} 
                                                    draggable
                                                    onDragStart={(e) => handleDragStartDock(e, ship)}
                                                    onDragEnd={handleDragEnd}
                                                    onTouchStart={(e) => handleTouchStartShip(e, ship, 'dock')}
                                                    onTouchMove={handleTouchMove}
                                                    onTouchEnd={handleTouchEnd}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedShipInfo({ ...ship, isVertical: false }); setSelectedPlacedShipId(null); }}
                                                    style={shipStyle}
                                                    className={`transition-all flex-shrink-0 cursor-grab active:cursor-grabbing ${selectedShipInfo?.id === ship.id ? 'scale-105' : 'opacity-80 hover:opacity-100'} ${dragInfo?.ship?.id === ship.id ? 'opacity-30' : ''}`}
                                                >
                                                    <img 
                                                        src={SHIP_IMAGES[ship.id]} 
                                                        alt="" 
                                                        className="w-full h-full object-cover pointer-events-none select-none"
                                                        style={{
                                                            transform: 'rotate(-90deg)',
                                                            transformOrigin: 'center',
                                                            width: '100%',
                                                            height: '100%'
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                        {shipsToPlace.length === 0 && <span className="text-xs text-slate-500 font-bold m-auto">All Ships Deployed</span>}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        <button onClick={undoPlacement} disabled={placedShips.length === 0} className="flex-1 py-2.5 bg-white hover:bg-orange-50 border border-orange-200 text-slate-700 rounded-xl font-bold text-xs tracking-widest disabled:opacity-40 disabled:hover:bg-white transition-colors shadow-sm">UNDO</button>
                                        <button onClick={placeRandomShips} className="flex-1 py-2.5 bg-white hover:bg-orange-50 border border-orange-200 text-sky-600 rounded-xl font-bold text-xs tracking-widest transition-colors shadow-sm">RANDOM</button>
                                        <button onClick={commitBoard} disabled={placedShips.length < 5} className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 disabled:border-slate-250 disabled:text-slate-400 rounded-xl font-bold text-xs tracking-widest disabled:opacity-50 text-white transition-all shadow-md">READY</button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-full border border-orange-200 shadow-lg">
                                   <div className="w-3 h-3 rounded-full bg-pink-500 animate-ping"></div>
                                   <span className="text-sm font-bold text-slate-600 uppercase tracking-widest text-center">Fleet Deployed<br/><span className="text-xs text-slate-500">Waiting for enemy...</span></span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {status === 'PLAYING' && (
                    <div className="flex flex-col w-full flex-1 justify-start py-2 max-w-md md:max-w-4xl overflow-y-auto">
                        
                        {/* Turn Status & Timer Banner */}
                        <div className="mb-3 px-2 w-full flex-shrink-0">
                            <div className={`w-full p-3 rounded-2xl border transition-colors duration-300 flex items-center justify-between shadow-sm
                                ${turn === myPlayerId 
                                    ? 'bg-sky-50 border-sky-200' 
                                    : 'bg-white border-orange-100'
                                }`
                            }>
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2.5 h-2.5 rounded-full relative flex items-center justify-center">
                                        <div className={`absolute w-full h-full rounded-full animate-ping opacity-75 
                                            ${turn === myPlayerId ? 'bg-sky-500' : 'bg-rose-500'}`} 
                                        />
                                        <div className={`w-2.5 h-2.5 rounded-full relative 
                                            ${turn === myPlayerId ? 'bg-sky-500' : 'bg-rose-500'}`} 
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-black tracking-widest uppercase
                                            ${turn === myPlayerId ? 'text-sky-655' : 'text-slate-500'}`}>
                                            {turn === myPlayerId ? 'Lượt của bạn' : 'Lượt đối thủ'}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            {turn === myPlayerId ? 'Chọn mục tiêu & Bắn!' : 'Chờ đối thủ nổ súng...'}
                                        </span>
                                    </div>
                                </div>
                                
                                {turnTimeLeft !== undefined && turnTimeLeft !== null && (
                                    <div className="flex flex-col items-end flex-shrink-0">
                                        <span className={`font-mono text-sm font-black tracking-tighter leading-none
                                            ${turnTimeLeft <= 15 ? 'text-rose-600 animate-pulse' : 'text-slate-700'}`}>
                                            ⏱️ {turnTimeLeft}s
                                        </span>
                                        <div className="w-16 h-1 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-1000 rounded-full
                                                    ${turnTimeLeft <= 15 ? 'bg-rose-500 animate-pulse' : turnTimeLeft <= 40 ? 'bg-amber-400' : 'bg-sky-400'}`}
                                                style={{ width: `${(turnTimeLeft / 90) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Mobile Tab Switcher */}
                        <div className="flex gap-2 px-2 mb-3 md:hidden w-full flex-shrink-0">
                            <button
                                onClick={() => setActiveTab('attack')}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-xs tracking-widest transition-all border flex items-center justify-center gap-1.5
                                    ${activeTab === 'attack'
                                        ? 'bg-sky-50 border-sky-400 text-sky-600 font-extrabold shadow-sm'
                                        : 'bg-white border-orange-100 text-slate-500 shadow-sm'
                                    }`}
                            >
                                <span className="relative flex h-2 w-2">
                                    {turn === myPlayerId && (
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-500 opacity-75"></span>
                                    )}
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${turn === myPlayerId ? 'bg-sky-500' : 'bg-slate-300'}`}></span>
                                </span>
                                LƯỚI TẤN CÔNG
                            </button>
                            <button
                                onClick={() => setActiveTab('defense')}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-xs tracking-widest transition-all border flex items-center justify-center gap-1.5
                                    ${activeTab === 'defense'
                                        ? 'bg-rose-50 border-rose-400 text-rose-650 font-extrabold shadow-sm'
                                        : 'bg-white border-orange-100 text-slate-500 shadow-sm'
                                    }`}
                            >
                                <span className="relative flex h-2 w-2">
                                    {turn !== myPlayerId && (
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                                    )}
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${turn !== myPlayerId ? 'bg-rose-500' : 'bg-slate-300'}`}></span>
                                </span>
                                ĐỘI TÀU CỦA BẠN
                            </button>
                        </div>

                        {/* Dual Board Layout Container */}
                        <div className="flex flex-col md:flex-row w-full gap-4 md:gap-8 justify-center items-center md:items-stretch px-2 pb-4">
                            
                            {/* Opponent's Board */}
                            <div className={`flex-1 flex flex-col w-full max-w-sm ${activeTab === 'attack' ? 'block' : 'hidden md:flex'}`}>
                                <div className="flex justify-between items-center mb-1.5 px-1 h-[22px]">
                                    <span className={`text-xs font-bold uppercase tracking-widest ${turn === myPlayerId ? 'text-sky-600 animate-pulse' : 'text-slate-500'}`}>
                                        Enemy Waters {turn === myPlayerId && '- YOUR TURN'}
                                    </span>
                                    <span className={`text-[10px] font-mono font-bold bg-sky-50 px-1.5 py-0.5 border border-sky-200 rounded shadow-sm transition-opacity duration-150
                                        ${turn === myPlayerId && selectedTarget ? 'text-sky-600 opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                        {selectedTarget ? `${cols[selectedTarget.x]}${selectedTarget.y + 1}` : '--'}
                                    </span>
                                </div>
                                <div className={`transition-opacity w-full ${turn !== myPlayerId ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Grid 
                                        size={10} 
                                        gridRef={gridRef}
                                        onCellTap={handleGridTap} 
                                        myShips={[]} 
                                        oppShots={[]} 
                                        myShots={myShots} 
                                        isTargetMode 
                                        selectedTarget={selectedTarget}
                                    />
                                </div>
                                
                                {/* Opponent Fleet Radar */}
                                <div className="flex justify-center items-center gap-1 mt-2.5 px-1.5 py-1.5 bg-white/70 border border-orange-200 rounded-lg w-full flex-shrink-0 shadow-sm">
                                    {opponentFleet.map((ship) => (
                                        <div 
                                            key={ship.id} 
                                            className={`flex flex-col items-center p-1 rounded border text-center transition-all flex-1 ${
                                                ship.isSunk 
                                                    ? 'bg-red-50 border-red-100 text-red-550/40 line-through opacity-50' 
                                                    : ship.hitCount > 0
                                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                                        : 'bg-white border-orange-105 text-slate-500'
                                            }`}
                                        >
                                            <span className="text-[8px] font-mono font-bold uppercase tracking-wider mb-0.5">{ship.name}</span>
                                            <div className="flex gap-0.5">
                                                {Array.from({ length: ship.size }).map((_, idx) => {
                                                    const isHit = idx < ship.hitCount;
                                                    return (
                                                        <div 
                                                            key={idx} 
                                                            className={`w-1 h-1 rounded-full ${
                                                                ship.isSunk ? 'bg-red-500' : isHit ? 'bg-amber-550' : 'bg-slate-300'
                                                            }`} 
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-2 px-1 w-full flex-shrink-0 h-[20px] flex items-center justify-center">
                                    {turn === myPlayerId && (
                                        <p className={`text-center text-[10px] font-bold uppercase tracking-widest transition-colors duration-150 ${selectedTarget ? 'text-sky-600' : 'text-slate-400'}`}>
                                            {selectedTarget
                                                ? `🎯 Nhấn lại ô ${cols[selectedTarget.x]}${selectedTarget.y + 1} để bắn`
                                                : '👆 Nhấn 1 lần để chọn · Nhấn lại để bắn'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Divider (Desktop Only) */}
                            <div className="hidden md:flex w-px bg-orange-200 mx-1 relative self-stretch items-center justify-center">
                                <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                                </div>
                            </div>

                            {/* My Board */}
                            <div className={`flex-1 flex flex-col w-full max-w-sm ${activeTab === 'defense' ? 'block' : 'hidden md:flex'}`}>
                                <div className="flex justify-between items-center mb-1.5 px-1">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        Your Fleet
                                    </span>
                                </div>
                                <div className="w-full">
                                    <Grid 
                                        size={10} 
                                        onCellTap={()=>{}} 
                                        myShips={myBoardState || placedShips} 
                                        oppShots={oppShots} 
                                        myShots={[]} 
                                    />
                                </div>

                                {/* My Fleet Status pegs */}
                                <div className="flex justify-center items-center gap-1 mt-2.5 px-1.5 py-1.5 bg-white/70 border border-orange-200 rounded-lg w-full flex-shrink-0 shadow-sm">
                                    {myFleet.map((ship) => (
                                        <div 
                                            key={ship.id} 
                                            className={`flex flex-col items-center p-0.5 rounded text-center transition-all flex-1 ${
                                                ship.isSunk ? 'text-red-500/50 opacity-40' : 'text-slate-500'
                                            }`}
                                        >
                                            <span className="text-[7.5px] font-mono uppercase tracking-wider mb-0.5">{ship.name}</span>
                                            <div className="flex gap-0.5">
                                                {Array.from({ length: ship.size }).map((_, idx) => {
                                                    const isHit = idx < ship.hitCount;
                                                    return (
                                                        <div 
                                                            key={idx} 
                                                            className={`w-0.5 h-0.5 rounded-full ${
                                                                ship.isSunk ? 'bg-red-500' : isHit ? 'bg-red-550' : 'bg-slate-300'
                                                            }`} 
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {status === 'GAME_OVER' && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-orange-50/95 backdrop-blur-sm pb-20">
                        <button 
                            onClick={onLeaveRoom}
                            className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-orange-200 text-slate-600 rounded-full font-bold text-sm transition-colors shadow"
                        >
                            &larr; Exit
                        </button>
                        <div className="text-sm font-semibold text-slate-400 tracking-[0.2em] uppercase mb-4">Battle Result</div>
                        <div className={`text-5xl font-black uppercase tracking-widest mb-10 text-center animate-pulse ${winner === myPlayerId ? 'text-sky-600 drop-shadow-[0_0_15px_rgba(56,189,248,0.2)]' : 'text-pink-600 drop-shadow-[0_0_15px_rgba(236,72,153,0.2)]'}`}>
                            {winner === myPlayerId ? 'VICTORY' : 'DEFEAT'}
                        </div>
                        {myPlayerId === 'P1' && (
                           <button onPointerDown={() => socket.emit("startGame", roomId)} className="px-10 py-4 bg-sky-500 text-white rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all hover:bg-sky-600 outline-none">
                               PLAY AGAIN
                           </button>
                        )}
                        {myPlayerId === 'P2' && (
                           <div className="text-sm font-bold text-slate-500 uppercase">Waiting for Host...</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Grid({ 
    size, onCellTap, onDragStartShip, onDragEndShip, onTouchStartShip, onTouchMoveShip, onTouchEndShip,
    onDragOverCell, onDropGrid, onDragLeaveGrid, myShips, oppShots, myShots, isTargetMode, shrink, hoverState, 
    onShipTap, gridRef, selectedPlacedShipId, selectedTarget, dragInfo 
}: any) {
    
    const cells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells.push({ x, y });
        }
    }

    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const rows = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

    return (
        <div className="flex flex-col w-full select-none">
            {/* Top Column Headers A-J */}
            <div className="flex w-full pl-5 pr-0.5 mb-1.5 text-center font-mono text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {cols.map((col) => (
                    <div key={col} className="flex-1">{col}</div>
                ))}
            </div>

            <div className="flex w-full items-stretch">
                {/* Left Row Headers 1-10 */}
                <div className="flex flex-col justify-between py-1.5 pr-2.5 text-right font-mono text-[9px] sm:text-[10px] text-slate-500 font-bold w-3">
                    {rows.map((row) => (
                        <div key={row} className="h-0 flex items-center justify-end">{row}</div>
                    ))}
                </div>

                {/* Grid Container */}
                <div 
                   ref={gridRef}
                   className={`grid flex-1 aspect-square water-grid-bg border-[2px] border-sky-200 shadow-lg p-1 relative rounded-lg ${shrink ? 'gap-[2px]' : 'gap-1'}`} 
                   style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => onDropGrid && onDropGrid(e)}
                   onDragLeave={onDragLeaveGrid}
                >
                    <div className="absolute inset-0 water-sparkles pointer-events-none rounded-lg" />
                    <div className="absolute inset-0 water-waves pointer-events-none rounded-lg" />

                    {/* Background Grid Cells */}
                    {cells.map((cell) => {
                        let cellStatus = 'empty';
                        
                        if (!isTargetMode && oppShots) {
                            const shot = oppShots.find((s: any) => s.x === cell.x && s.y === cell.y);
                            if (shot) cellStatus = shot.hit ? 'opp_hit' : 'opp_miss';
                        }

                        if (isTargetMode && myShots) {
                            const shot = myShots.find((s: any) => s.x === cell.x && s.y === cell.y);
                            if (shot) cellStatus = shot.hit ? 'my_hit' : 'my_miss';
                        }

                        const isTargetSelected = isTargetMode && selectedTarget && selectedTarget.x === cell.x && selectedTarget.y === cell.y;

                        return (
                            <div 
                                key={`cell-${cell.x}-${cell.y}`}
                                onClick={() => onCellTap && onCellTap(cell.x, cell.y)}
                                onDragEnter={(e) => { e.preventDefault(); onDragOverCell && onDragOverCell(e, cell.x, cell.y); }}
                                onDragOver={(e) => { e.preventDefault(); onDragOverCell && onDragOverCell(e, cell.x, cell.y); }}
                                style={{
                                    gridColumn: cell.x + 1,
                                    gridRow: cell.y + 1
                                }}
                                className={`relative w-full h-full rounded transition-colors duration-150 border border-sky-300/30
                                    ${isTargetMode 
                                        ? isTargetSelected
                                            ? 'bg-sky-400/40 cursor-crosshair ring-2 ring-sky-500 ring-inset'
                                            : 'cursor-crosshair bg-sky-200/20 hover:bg-sky-300/35' 
                                        : 'bg-sky-200/25 hover:bg-sky-200/40'
                                    }
                                `}
                            >
                                {cellStatus === 'empty' && (
                                    <div className="absolute inset-0 m-auto w-[2px] h-[2px] rounded-full bg-sky-400/50 pointer-events-none" />
                                )}

                                {cellStatus.endsWith('miss') && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        <div className="w-2.5 h-2.5 bg-slate-400 rounded-full absolute z-20 animate-cannonball shadow-md" />
                                        <div className="w-full h-full rounded-full border border-sky-400/80 absolute z-10 animate-splash" />
                                        <div className="w-full h-full rounded-full border border-sky-300/40 absolute z-10 animate-ripple" style={{ animationDelay: '0.2s' }} />
                                        <div className="w-3 h-3 rounded-full border border-sky-500/50 bg-sky-950/20 shadow-[0_0_6px_rgba(56,189,248,0.2)]" />
                                    </div>
                                )}

                                {cellStatus.endsWith('hit') && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        <div className="w-full h-full rounded bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 absolute z-20 animate-explosion-flash" />
                                        
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 z-30 animate-particle-1" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-orange-400 z-30 animate-particle-2" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-300 z-30 animate-particle-3" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-red-400 z-30 animate-particle-4" />
                                        <div className="absolute w-1 h-1 rounded-full bg-yellow-300 z-30 animate-particle-5" />
                                        <div className="absolute w-1 h-1 rounded-full bg-orange-300 z-30 animate-particle-6" />
                                        
                                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-red-500 to-orange-600 border border-orange-400 z-10 animate-fire-glow shadow-[0_0_10px_#f97316]" />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    
                    {/* Render Placed Ships */}
                    {!isTargetMode && myShips && myShips.map((ship: any) => {
                        const isHovered = hoverState && hoverState.shipId === ship.id;
                        const isSelected = selectedPlacedShipId === ship.id;
                        
                        const isSunk = ship.cells && ship.cells.every((cell: any) => 
                            oppShots && oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
                        );
                        
                        const shipStyle: React.CSSProperties = {
                            gridColumn: `${ship.x + 1} / span ${ship.isVertical ? 1 : ship.size}`,
                            gridRow: `${ship.y + 1} / span ${ship.isVertical ? ship.size : 1}`,
                            position: 'relative',
                            border: isSelected ? '2px solid #38bdf8' : 'none',
                            boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.8)' : 'none',
                            borderRadius: '8px',
                            touchAction: 'none',
                            opacity: isHovered ? 0.15 : isSunk ? 0.65 : 0.95,
                            zIndex: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden'
                        };

                        // SỬA LẠI ĐOẠN NÀY
                        const imgStyle: React.CSSProperties = {
                            // Nếu dọc thì full 100%, nếu ngang thì lấy nghịch đảo tỷ lệ theo số ô của tàu
                            width: ship.isVertical ? '100%' : `${100 / ship.size}%`,
                            height: ship.isVertical ? '100%' : `${100 * ship.size}%`,
                            objectFit: 'cover',
                            filter: isSunk ? 'grayscale(100%) brightness(65%)' : 'none',
                            transform: ship.isVertical ? 'none' : 'rotate(-90deg)',
                            transformOrigin: 'center',
                            flexShrink: 0 // Đảm bảo flexbox không bóp nghẹt kích thước ảnh
                        };

                        return (
                            <div 
                                key={ship.id}
                                draggable={!!onDragStartShip && !isSunk}
                                onDragStart={(e) => onDragStartShip && onDragStartShip(e, ship)}
                                onDragEnd={(e) => onDragEndShip && onDragEndShip(e)}
                                onTouchStart={(e) => onTouchStartShip && onTouchStartShip(e, ship, 'board')}
                                onTouchMove={onTouchMoveShip}
                                onTouchEnd={onTouchEndShip}
                                onClick={(e) => { e.stopPropagation(); !isSunk && onShipTap && onShipTap(ship); }}
                                style={shipStyle}
                                className={`select-none ${onDragStartShip && !isSunk ? 'cursor-grab active:cursor-grabbing hover:brightness-105' : ''}`}
                            >
                                <img 
                                    src={SHIP_IMAGES[ship.id]} 
                                    alt="" 
                                    style={imgStyle}
                                    className="pointer-events-none select-none"
                                />
                            </div>
                        );
                    })}

                    {/* Temporary Preview Ship Overlay during Dragging */}
                    {!isTargetMode && dragInfo && hoverState && (
                        (() => {
                            const ship = dragInfo.ship;
                            const shipStyle: React.CSSProperties = {
                                gridColumn: `${hoverState.hx + 1} / span ${ship.isVertical ? 1 : ship.size}`,
                                gridRow: `${hoverState.hy + 1} / span ${ship.isVertical ? ship.size : 1}`,
                                position: 'relative',
                                border: hoverState.isValid ? '2px solid #22c55e' : '2px solid #ef4444',
                                boxShadow: hoverState.isValid ? '0 0 15px rgba(34, 197, 94, 0.8)' : '0 0 15px rgba(239, 68, 68, 0.8)',
                                borderRadius: '8px',
                                touchAction: 'none',
                                opacity: 0.7,
                                pointerEvents: 'none',
                                zIndex: 40,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden'
                            };

                            // SỬA LẠI ĐOẠN NÀY
                            const imgStyle: React.CSSProperties = {
                                width: ship.isVertical ? '100%' : `${100 / ship.size}%`,
                                height: ship.isVertical ? '100%' : `${100 * ship.size}%`,
                                objectFit: 'cover',
                                transform: ship.isVertical ? 'none' : 'rotate(-90deg)',
                                transformOrigin: 'center',
                                flexShrink: 0
                            };

                            return (
                                <div style={shipStyle} className="select-none pointer-events-none">
                                    <img 
                                        src={SHIP_IMAGES[ship.id]} 
                                        alt="" 
                                        style={imgStyle}
                                        className="pointer-events-none select-none"
                                    />
                                </div>
                            );
                        })()
                    )}

                    {/* Opponent Hit & Miss Markers Overlay */}
                    {!isTargetMode && oppShots && oppShots.map((shot: any) => {
                        return (
                            <div 
                                key={`opp-shot-${shot.x}-${shot.y}`}
                                style={{ gridColumn: shot.x + 1, gridRow: shot.y + 1 }}
                                className="relative w-full h-full flex items-center justify-center pointer-events-none z-30 overflow-hidden"
                            >
                                {shot.hit ? (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        <div className="w-full h-full rounded bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 absolute z-20 animate-explosion-flash" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 z-30 animate-particle-1" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-orange-400 z-30 animate-particle-2" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-300 z-30 animate-particle-3" />
                                        <div className="absolute w-1.5 h-1.5 rounded-full bg-red-400 z-30 animate-particle-4" />
                                        <div className="absolute w-1 h-1 rounded-full bg-yellow-300 z-30 animate-particle-5" />
                                        <div className="absolute w-1 h-1 rounded-full bg-orange-300 z-30 animate-particle-6" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-red-500 to-orange-600 border border-orange-400 z-10 animate-fire-glow shadow-[0_0_10px_#f97316]" />
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        <div className="w-2.5 h-2.5 bg-slate-400 rounded-full absolute z-20 animate-cannonball shadow-md" />
                                        <div className="w-full h-full rounded-full border border-sky-400/80 absolute z-10 animate-splash" />
                                        <div className="w-full h-full rounded-full border border-sky-300/40 absolute z-10 animate-ripple" style={{ animationDelay: '0.2s' }} />
                                        <div className="w-3 h-3 rounded-full border border-sky-500/50 bg-sky-950/20 shadow-[0_0_6px_rgba(56,189,248,0.2)]" />
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Hover Cell Previews */}
                    {hoverState && hoverState.cells.map((c: any) => {
                        if (c.x < 0 || c.x > 9 || c.y < 0 || c.y > 9) return null;
                        return (
                            <div key={`hover-${c.x}-${c.y}`} 
                                 style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
                                 className={`w-full h-full rounded opacity-25 z-10 pointer-events-none ${hoverState.isValid ? 'bg-green-500/20' : 'bg-red-500/20'}`} />
                        )
                    })}

                    {/* Glowing Targeting Reticle */}
                    {isTargetMode && selectedTarget && (
                        <div 
                            style={{ 
                                gridColumn: selectedTarget.x + 1, 
                                gridRow: selectedTarget.y + 1 
                            }}
                            className="w-full h-full flex items-center justify-center pointer-events-none z-45 relative animate-pulse"
                        >
                            <div className="absolute w-full h-full border border-sky-400 rounded opacity-60 shadow-[0_0_8px_rgba(56,189,248,0.4)]" />
                            <div className="absolute w-2 h-2 border-t-2 border-l-2 border-sky-400 top-0 left-0" />
                            <div className="absolute w-2 h-2 border-t-2 border-r-2 border-sky-400 top-0 right-0" />
                            <div className="absolute w-2 h-2 border-b-2 border-l-2 border-sky-400 bottom-0 left-0" />
                            <div className="absolute w-2 h-2 border-b-2 border-r-2 border-sky-400 bottom-0 right-0" />
                            <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}