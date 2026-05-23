import React, { useState, useEffect, useMemo, useRef } from 'react';

type BattleshipMode = 'NORMAL' | 'HARD';

const BOARD_CONFIGS: Record<BattleshipMode, { size: number; label: string }> = {
    NORMAL: { size: 10, label: 'Normal 10x10' },
    HARD: { size: 12, label: 'Hard 12x12' },
};

const NORMAL_SHIP_TYPES = [
    { id: 'S1', size: 5, color: '#fca5a5' }, // Red (Carrier)
    { id: 'S2', size: 4, color: '#fcd34d' }, // Yellow (Battleship)
    { id: 'S3', size: 3, color: '#86efac' }, // Green (Cruiser)
    { id: 'S4', size: 3, color: '#93c5fd' }, // Blue (Submarine)
    { id: 'S5', size: 2, color: '#d8b4fe' }, // Purple (Destroyer)
];

const HARD_SHIP_TYPES = NORMAL_SHIP_TYPES.map((ship) =>
    ship.id === 'S4' ? { ...ship, size: 2 } : ship
);

const getShipTypes = (mode: BattleshipMode) => mode === 'HARD' ? HARD_SHIP_TYPES : NORMAL_SHIP_TYPES;

const SHIP_NAMES: Record<string, string> = {
    'S1': 'Carrier (5)',
    'S2': 'Battleship (4)',
    'S3': 'Cruiser (3)',
    'S4': 'Submarine (3)',
    'S5': 'Destroyer (2)'
};

const getShipNames = (mode: BattleshipMode): Record<string, string> => ({
    ...SHIP_NAMES,
    'S4': `Submarine (${mode === 'HARD' ? 2 : 3})`,
});

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
    turnTimeLeft, battleshipMode = 'NORMAL', onLeaveRoom
}: any) {
    const isP1 = myPlayerId === 'P1';
    const currentMode: BattleshipMode = battleshipMode === 'HARD' ? 'HARD' : 'NORMAL';
    const boardSize = BOARD_CONFIGS[currentMode].size;
    const shipTypes = useMemo(() => getShipTypes(currentMode), [currentMode]);
    const shipNames = useMemo(() => getShipNames(currentMode), [currentMode]);
    
    // Trạng thái chuẩn bị xếp thuyền
    const [shipsToPlace, setShipsToPlace] = useState(shipTypes);
    const [placedShips, setPlacedShips] = useState<any[]>([]);
    const [selectedShipInfo, setSelectedShipInfo] = useState<any | null>(null);
    const [selectedPlacedShipId, setSelectedPlacedShipId] = useState<string | null>(null);
    const [selectedTarget, setSelectedTarget] = useState<{x: number, y: number} | null>(null);
    const [dragInfo, setDragInfo] = useState<any>(null);
    const [hoverCell, setHoverCell] = useState<{x: number, y: number} | null>(null);
    
    // Trạng thái thông báo và danh sách tàu chìm công/thủ
    const [toast, setToast] = useState<string | null>(null);
    const [sunkShips, setSunkShips] = useState<string[]>([]);
    const [mySunkShips, setMySunkShips] = useState<string[]>([]);

    // Bộ đệm xử lý hoãn (delay) lượt đi và lộ diện tàu đối thủ
    const [localTurn, setLocalTurn] = useState<string>(turn);
    const [isAnimating, setIsAnimating] = useState<boolean>(false);
    const [revealedOppShips, setRevealedOppShips] = useState<any[]>([]); 

    // Chuyển đổi tab trên giao diện Mobile
    const [activeTab, setActiveTab] = useState<'attack' | 'defense'>('attack');

    const gridRef = useRef<HTMLDivElement>(null);
    const gridRectRef = useRef<DOMRect | null>(null);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const hasMovedRef = useRef<boolean>(false);

    // Hàm dọn dẹp dữ liệu cũ khi game được reset về trạng thái xếp tàu
    const resetLocalGameStates = () => {
        setShipsToPlace(shipTypes);
        setPlacedShips([]);
        setSelectedShipInfo(null);
        setSelectedPlacedShipId(null);
        setSelectedTarget(null);
        setSunkShips([]);
        setMySunkShips([]);
        setRevealedOppShips([]);
        setIsAnimating(false);
        setActiveTab('attack');
        
        // Hiện lại overlay màn hình kết thúc nếu trước đó lỡ ẩn đi
        const overlay = document.getElementById('gameover-overlay');
        if (overlay) overlay.style.display = 'flex';
    };

    useEffect(() => {
        if (status === 'WAITING' || status === 'SETUP' || status === 'READY') {
            resetLocalGameStates();
        }
    }, [currentMode]);

    // Lắng nghe sự kiện reset/chơi lại từ server phát về cho cả phòng
    useEffect(() => {
        const handleGameReset = () => {
            resetLocalGameStates();
            setToast("TRẬN ĐẤU ĐÃ ĐƯỢC LÀM MỚI! HÃY XẾP ĐỘI TÀU!");
            setTimeout(() => setToast(null), 2000);
        };

        // Đồng bộ sự kiện reset từ Server (tùy thuộc vào tên event server của bạn, thường là battleshipGameReset hoặc tương đương)
        socket.on('battleshipGameReset', handleGameReset);
        // Nếu server của bạn tái sử dụng lại trạng thái khi trigger trạng thái room
        socket.on('roomStatusUpdate', (data: any) => {
            if (data.status === 'READY' && placedShips.length > 0 && (p1Shots?.length === 0 && p2Shots?.length === 0)) {
                // Trường hợp server ép trạng thái về READY từ màn kết thúc
                resetLocalGameStates();
            }
        });

        return () => {
            socket.off('battleshipGameReset', handleGameReset);
            socket.off('roomStatusUpdate');
        };
    }, [socket, placedShips]);

    // Hàm phát sự kiện yêu cầu chơi lại lên server giữ nguyên phòng
    const handleRequestPlayAgain = () => {
        // Gửi lệnh restart lên server để server xóa mảng shots, hạm đội cũ và set room status về 'READY' hoặc 'SETUP'
        socket.emit("battleshipRequestRestart", { roomId, playerId: myPlayerId });
        
        // Nếu hệ thống server của bạn dùng chung emit cũ, hãy đổi thành:
        // socket.emit("startGame", roomId); hoặc lệnh tương đương tùy backend của bạn.
    };

    // Phát âm thanh và hiệu ứng rung (Haptic)
    const playEffect = (type: 'hit' | 'miss' | 'turn') => {
        try {
            if (navigator.vibrate) {
                if (type === 'hit') navigator.vibrate([100, 50, 100]);
                else if (type === 'miss') navigator.vibrate([50]);
                else if (type === 'turn') navigator.vibrate([150]);
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
                osc.start(); osc.stop(ctx.currentTime + 0.5);
            } else if (type === 'miss') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start(); osc.stop(ctx.currentTime + 0.3);
            } else if (type === 'turn') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.25);
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
                osc.start(); osc.stop(ctx.currentTime + 0.25);
            }
        } catch (e) { }
    };

    // Đồng bộ turn ban đầu
    useEffect(() => {
        if (!isAnimating) {
            setLocalTurn(turn);
        }
    }, [turn, isAnimating]);

    // Tạo Banner thông báo khi chuyển đổi localTurn
    useEffect(() => {
        if (status !== 'PLAYING') return;
        if (localTurn === myPlayerId) {
            setToast("LƯỢT CỦA BẠN!");
            playEffect('turn');
        } else {
            setToast("LƯỢT CỦA ĐỐI THỦ!");
        }
        const t = setTimeout(() => setToast(null), 2500);
        return () => clearTimeout(t);
    }, [localTurn, status, myPlayerId]);

    // Lắng nghe socket kết quả phát bắn: Chạy hiệu ứng -> Delay 3s -> Chuyển banner lượt mới
    useEffect(() => {
        const handleShootRes = (data: any) => {
            setIsAnimating(true);

            if (data.playerId === myPlayerId) {
                if (data.hit) {
                    playEffect('hit');
                    setToast("BẮN TRÚNG! ĐANG CẬP NHẬT...");
                } else {
                    playEffect('miss');
                    setToast("HỤT RỒI! ĐANG CẬP NHẬT...");
                }
            } else {
                playEffect(data.hit ? 'hit' : 'miss');
                setToast(data.hit ? "ĐỐI THỦ BẮN TRÚNG!" : "ĐỐI THỦ BẮN HỤT!");
            }

            setTimeout(() => {
                setIsAnimating(false);
                setLocalTurn(data.nextTurn || turn);
                setToast(null);
            }, 1000);
        };

        socket.on('battleshipShotResult', handleShootRes);
        return () => {
            socket.off('battleshipShotResult', handleShootRes);
        };
    }, [socket, myPlayerId, turn]);

    // Lắng nghe sự kiện hết thời gian lượt đi
    useEffect(() => {
        const handleTimeout = (data: { previousTurn: string }) => {
            if (data.previousTurn === myPlayerId) {
                setToast("QUÁ 90 GIÂY! BẠN BỊ MẤT LƯỢT!");
            } else {
                setToast("ĐỐI THỦ HẾT GIỜ! LƯỢT CỦA BẠN!");
            }
            playEffect('miss');
            setTimeout(() => setToast(null), 2000);
        };
        socket.on('battleshipTurnTimeout', handleTimeout);
        return () => socket.off('battleshipTurnTimeout', handleTimeout);
    }, [socket, myPlayerId]);

    // Tự động nhảy Tab hiển thị trên điện thoại khi đổi lượt
    useEffect(() => {
        if (status === 'PLAYING') {
            if (localTurn === myPlayerId) setActiveTab('attack');
            else setActiveTab('defense');
        }
    }, [localTurn, status, myPlayerId]);

    const myBoardState = isP1 ? p1Board : p2Board;
    const oppBoardState = isP1 ? p2Board : p1Board; 

    const myShots = isP1 ? p1Shots : p2Shots;
    const oppShots = isP1 ? p2Shots : p1Shots;

    const myReady = isP1 ? p1Ready : p2Ready;
    const oppReady = isP1 ? p2Ready : p1Ready;

    // Theo dõi và cập nhật danh hạm đội đối thủ bị chìm hoàn toàn
    useEffect(() => {
        if (status !== 'PLAYING' || !oppBoardState) return;
        
        const currentSunk: string[] = [];
        const currentSunkShipsData: any[] = [];

        oppBoardState.forEach((ship: any) => {
            const isSunk = ship.cells.every((cell: any) => 
                myShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
            );
            if (isSunk) {
                currentSunk.push(ship.id);
                currentSunkShipsData.push(ship);
            }
        });

        setRevealedOppShips(currentSunkShipsData);

        const newlySunk = currentSunk.filter(id => !sunkShips.includes(id));
        if (newlySunk.length > 0) {
            setSunkShips(currentSunk);
            const name = shipNames[newlySunk[0]].split(' ')[0];
            setToast(`ENEMY ${name.toUpperCase()} SUNK!`);
            setTimeout(() => setToast(null), 2000);
        }
    }, [oppBoardState, myShots, status, sunkShips]);

    // Theo dõi và cập nhật hạm đội của bản thân bị chìm hoàn toàn
    useEffect(() => {
        if (status !== 'PLAYING') return;
        const board = myBoardState || placedShips;
        if (board) {
            const currentSunk: string[] = [];
            board.forEach((ship: any) => {
                const isSunk = ship.cells.every((cell: any) => 
                    oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit)
                );
                if (isSunk) currentSunk.push(ship.id);
            });

            const newlySunk = currentSunk.filter(id => !mySunkShips.includes(id));
            if (newlySunk.length > 0) {
                setMySunkShips(currentSunk);
                const name = shipNames[newlySunk[0]].split(' ')[0];
                setToast(`YOUR ${name.toUpperCase()} SUNK!`);
                setTimeout(() => setToast(null), 2000);
            }
        }
    }, [myBoardState, placedShips, oppShots, status, mySunkShips]);

    const handleGridTap = (x: number, y: number) => {
        if (isAnimating) return;
        if (status === 'READY') {
            if (selectedShipInfo) {
                const { id, size, isVertical, color } = selectedShipInfo;
                if (isVertical && y + size > boardSize) return;
                if (!isVertical && x + size > boardSize) return;
                const cells = [];
                for(let i=0; i<size; i++) cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                if (placedShips.some(ship => ship.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y)))) return;

                setPlacedShips([...placedShips, { id, size, isVertical, color, cells, x, y }]);
                setShipsToPlace(shipsToPlace.filter(s => s.id !== id));
                setSelectedShipInfo(null); setSelectedPlacedShipId(null);
            } else if (selectedPlacedShipId) {
                const ship = placedShips.find(s => s.id === selectedPlacedShipId);
                if (ship) {
                    const { id, size, isVertical, color } = ship;
                    if (isVertical && y + size > boardSize) return;
                    if (!isVertical && x + size > boardSize) return;
                    const cells = [];
                    for(let i=0; i<size; i++) cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                    if (placedShips.some(p => p.id !== id && p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y)))) return;

                    setPlacedShips(placedShips.map(p => p.id === id ? { ...p, x, y, cells } : p));
                }
            }
        } else if (status === 'PLAYING') {
            if (localTurn !== myPlayerId) return;
            if (myShots.some((s: any) => s.x === x && s.y === y)) return;
            if (selectedTarget && selectedTarget.x === x && selectedTarget.y === y) {
                handleFire();
            } else {
                setSelectedTarget({ x, y });
            }
        }
    };

    const handleFire = () => {
        if (!selectedTarget || localTurn !== myPlayerId) return;
        socket.emit('battleshipShoot', { roomId, playerId: myPlayerId, x: selectedTarget.x, y: selectedTarget.y });
        setSelectedTarget(null);
    };

    // Hệ thống Drag Drop đồng bộ máy tính PC
    const handleDragStartDock = (e: React.DragEvent, ship: any) => {
        const isVertical = selectedShipInfo?.id === ship.id ? selectedShipInfo.isVertical : false;
        setDragInfo({ ship: { ...ship, isVertical }, source: 'dock', offsetIndex: 0 });
        e.dataTransfer.setData('text/plain', ship.id);
        const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragStartBoard = (e: React.DragEvent, ship: any) => {
        const target = e.currentTarget as HTMLElement; 
        const rect = target.getBoundingClientRect();
        const isVertical = ship.isVertical; 
        const cellSize = isVertical ? rect.height / ship.size : rect.width / ship.size;
        const offsetIndex = isVertical ? Math.floor((e.clientY - rect.top) / cellSize) : Math.floor((e.clientX - rect.left) / cellSize);
        
        setDragInfo({ ship, source: 'board', offsetIndex: Math.max(0, Math.min(offsetIndex, ship.size - 1)) });
        e.dataTransfer.setData('text/plain', ship.id);
        const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragOverCell = (e: React.DragEvent, x: number, y: number) => { 
        e.preventDefault(); 
        if (!dragInfo) return; 
        setHoverCell(prev => prev?.x === x && prev?.y === y ? prev : { x, y }); 
    };

    const handleDragLeaveGrid = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDragEnd = () => { setDragInfo(null); setHoverCell(null); };

    const handleDropGrid = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); 
        e.dataTransfer.getData('text/plain'); 
        if (!dragInfo || !hoverCell) { setDragInfo(null); setHoverCell(null); return; }
        const hState = getHoverState(hoverCell.x, hoverCell.y);
        if (hState && hState.isValid) {
            const newShip = { ...dragInfo.ship, x: hState.hx, y: hState.hy, cells: hState.cells };
            let newPlaced = [...placedShips];
            if (dragInfo.source === 'board') newPlaced = newPlaced.filter((s:any) => s.id !== newShip.id);
            else setShipsToPlace(shipsToPlace.filter((s:any) => s.id !== newShip.id));
            newPlaced.push(newShip); setPlacedShips(newPlaced); setSelectedPlacedShipId(newShip.id);
        }
        setDragInfo(null); setHoverCell(null);
    };

    // Hệ thống di chuyển Touch Mobile
    const handleTouchStartShip = (e: React.TouchEvent, ship: any, source: 'dock' | 'board') => {
        const touch = e.touches[0]; const target = e.currentTarget as HTMLElement; const rect = target.getBoundingClientRect();
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }; hasMovedRef.current = false;
        if (gridRef.current) gridRectRef.current = gridRef.current.getBoundingClientRect();
        let offsetIndex = 0; const isVertical = source === 'board' ? ship.isVertical : (selectedShipInfo?.id === ship.id ? selectedShipInfo.isVertical : false);
        if (source === 'board') {
            const cellSize = isVertical ? rect.height / ship.size : rect.width / ship.size;
            offsetIndex = Math.max(0, Math.min(Math.floor((isVertical ? touch.clientY - rect.top : touch.clientX - rect.left) / cellSize), ship.size - 1));
        }
        setDragInfo({ ship: { ...ship, isVertical }, source, offsetIndex });
        if (source === 'board') { setSelectedPlacedShipId(ship.id); setSelectedShipInfo(null); }
        else { setSelectedShipInfo({ ...ship, isVertical }); setSelectedPlacedShipId(null); }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!dragInfo || !touchStartRef.current) return;
        const touch = e.touches[0]; if (Math.sqrt(Math.pow(touch.clientX - touchStartRef.current.x, 2) + Math.pow(touch.clientY - touchStartRef.current.y, 2)) > 6) hasMovedRef.current = true;
        if (hasMovedRef.current) {
            if (e.cancelable) e.preventDefault();
            const gridRect = gridRectRef.current || (gridRef.current ? gridRef.current.getBoundingClientRect() : null); if (!gridRect) return;
            if (touch.clientX >= gridRect.left && touch.clientX <= gridRect.right && touch.clientY >= gridRect.top && touch.clientY <= gridRect.bottom) {
                setHoverCell({ x: Math.max(0, Math.min(Math.floor((touch.clientX - gridRect.left) / (gridRect.width / boardSize)), boardSize - 1)), y: Math.max(0, Math.min(Math.floor((touch.clientY - gridRect.top) / (gridRect.height / boardSize)), boardSize - 1)) });
            } else setHoverCell(null);
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!dragInfo) return;
        if (!hasMovedRef.current) {
            setDragInfo(null); setHoverCell(null); touchStartRef.current = null; gridRectRef.current = null;
            if (dragInfo.source === 'board') handleShipTap(dragInfo.ship);
            else setSelectedShipInfo({ ...dragInfo.ship, isVertical: false }); return;
        }
        if (hoverCell) {
            const hState = getHoverState(hoverCell.x, hoverCell.y);
            if (hState && hState.isValid) {
                const newShip = { ...dragInfo.ship, x: hState.hx, y: hState.hy, cells: hState.cells };
                let newPlaced = [...placedShips]; if (dragInfo.source === 'board') newPlaced = newPlaced.filter((s:any) => s.id !== newShip.id); else setShipsToPlace(shipsToPlace.filter((s:any) => s.id !== newShip.id));
                newPlaced.push(newShip); setPlacedShips(newPlaced); setSelectedPlacedShipId(newShip.id); setSelectedShipInfo(null);
            }
        }
        setDragInfo(null); setHoverCell(null); touchStartRef.current = null; gridRectRef.current = null;
    };

    const getHoverState = (cx?: number, cy?: number) => {
        if (!dragInfo) return null; const currentX = cx ?? hoverCell?.x; const currentY = cy ?? hoverCell?.y; if (currentX === undefined || currentY === undefined) return null;
        const { ship, offsetIndex } = dragInfo; const startX = ship.isVertical ? currentX : currentX - offsetIndex; const startY = ship.isVertical ? currentY - offsetIndex : currentY;
        const cells = []; for(let i=0; i<ship.size; i++) cells.push({ x: ship.isVertical ? startX : startX + i, y: ship.isVertical ? startY + i : startY });
        const isOutOfBounds = cells.some(c => c.x < 0 || c.x >= boardSize || c.y < 0 || c.y >= boardSize);
        const hasCollision = placedShips.some((p:any) => p.id !== ship.id && p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y)));
        return { shipId: ship.id, cells, isValid: !isOutOfBounds && !hasCollision, hx: startX, hy: startY };
    };

    const handleShipTap = (ship: any) => {
        if (status !== 'READY') return;
        if (selectedPlacedShipId === ship.id) handleRotateSelected();
        else { setSelectedPlacedShipId(ship.id); setSelectedShipInfo(null); }
    };

    const handleRotateSelected = () => {
        if (selectedShipInfo) {
            setSelectedShipInfo({ ...selectedShipInfo, isVertical: !selectedShipInfo.isVertical });
        } else if (selectedPlacedShipId) {
            const ship = placedShips.find(s => s.id === selectedPlacedShipId);
            if (ship) {
                const newIsVertical = !ship.isVertical; const cells = [];
                for(let i=0; i<ship.size; i++) cells.push({ x: newIsVertical ? ship.x : ship.x + i, y: newIsVertical ? ship.y + i : ship.y });
                if (!cells.some(c => c.x < 0 || c.x >= boardSize || c.y < 0 || c.y >= boardSize) && !placedShips.some((p:any) => p.id !== ship.id && p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y)))) {
                    setPlacedShips(placedShips.map((p:any) => p.id === ship.id ? { ...p, isVertical: newIsVertical, cells } : p));
                } else playEffect('miss');
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
        setSelectedPlacedShipId(null); setSelectedShipInfo(null);
    };

    const placeRandomShips = () => {
        let currentPlaced: any[] = [];
        for (const ship of [...shipTypes]) {
            let placed = false; let attempts = 0;
            while (!placed && attempts < 100) {
                const isVertical = Math.random() > 0.5;
                const x = Math.floor(Math.random() * (isVertical ? boardSize : boardSize - ship.size + 1));
                const y = Math.floor(Math.random() * (isVertical ? boardSize - ship.size + 1 : boardSize));
                const cells = [];
                for(let i=0; i<ship.size; i++) cells.push({ x: isVertical ? x : x + i, y: isVertical ? y + i : y });
                if (!currentPlaced.some(p => p.cells.some((c: any) => cells.some(cc => cc.x === c.x && cc.y === c.y)))) {
                    currentPlaced.push({ ...ship, isVertical, cells, x, y }); placed = true;
                }
                attempts++;
            }
        }
        setPlacedShips(currentPlaced); setShipsToPlace([]); setSelectedShipInfo(null); setSelectedPlacedShipId(null);
    };

    const handleModeChange = (mode: BattleshipMode) => {
        socket.emit("setBattleshipMode", { roomId, mode });
    };

    const commitBoard = () => { if (placedShips.length === shipTypes.length) socket.emit("battleshipReady", { roomId, playerId: myPlayerId, board: placedShips }); };

    const getOpponentFleetStatus = () => {
        if (!oppBoardState) return shipTypes.map(ship => ({ id: ship.id, size: ship.size, color: ship.color, name: shipNames[ship.id].split(' ')[0], isSunk: false }));
        return oppBoardState.map((ship: any) => {
            const isSunk = ship.cells.every((cell: any) => myShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit));
            return { id: ship.id, size: ship.size, color: ship.color, name: shipNames[ship.id].split(' ')[0], isSunk };
        });
    };

    const getMyFleetStatus = () => {
        const board = myBoardState || placedShips;
        if (!board) return shipTypes.map(ship => ({ id: ship.id, size: ship.size, color: ship.color, name: shipNames[ship.id].split(' ')[0], isSunk: false }));
        return board.map((ship: any) => {
            const isSunk = ship.cells.every((cell: any) => oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit));
            return { id: ship.id, size: ship.size, color: ship.color, name: shipNames[ship.id].split(' ')[0], isSunk };
        });
    };

    const opponentFleet = getOpponentFleetStatus();
    const myFleet = getMyFleetStatus();

    return (
        <div className="flex flex-col h-[100dvh] w-screen bg-orange-50 text-slate-800 font-sans select-none overflow-hidden relative">
            {toast && (
                <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-50 border font-mono font-black text-xs sm:text-sm tracking-widest px-6 py-3 rounded-full shadow-lg animate-bounce text-center transition-all duration-300
                    ${toast.includes('LƯỢT CỦA BẠN') || toast.includes('TRÚNG') ? 'bg-sky-600 border-sky-500 text-white shadow-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-white border-orange-200 text-slate-700 shadow-orange-100/40'}
                `}>
                    {toast}
                </div>
            )}

            <div className="w-full max-w-lg md:max-w-4xl mx-auto flex items-center justify-between px-4 pt-4 pb-0 flex-shrink-0 relative z-40">
                <button onClick={onLeaveRoom} className="px-3 py-1.5 bg-white hover:bg-orange-50 text-slate-600 border border-orange-200 rounded-full font-bold text-xs tracking-wider transition-colors shadow-sm">&larr; Exit</button>
                <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-pink-550">SEA STRIKE</h1>
                <div className="w-[68px]" />
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
                           <button onPointerDown={() => socket.emit("startGame", roomId)} className="px-10 py-4 bg-sky-500 text-white rounded-full text-xl font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-sky-600">ENTER FLEET</button>
                        )}
                    </div>
                )}

                {status === 'READY' && (
                    <div className="flex flex-col items-center w-full max-w-sm flex-1 justify-center">
                        <div className="mb-2 text-center">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-2">Room Code:</span>
                            <span className="text-xl font-black text-slate-800 tracking-[0.2em]">{roomId}</span>
                        </div>
                        {!myReady && !oppReady && (
                            <div className="flex items-center gap-1.5 mb-3 p-1 bg-white/80 border border-orange-200 rounded-xl shadow-sm">
                                {(['NORMAL', 'HARD'] as BattleshipMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => handleModeChange(mode)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${currentMode === mode ? 'bg-sky-500 text-white' : 'text-slate-500 hover:bg-orange-50'}`}
                                    >
                                        {BOARD_CONFIGS[mode].label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {!myReady ? (
                            <>
                                <h2 className="text-md font-bold text-slate-700 mb-1 uppercase tracking-widest">Deploy Your Fleet</h2>
                                <div className="text-[10px] text-slate-500 mb-3 h-4 text-center">
                                    {selectedShipInfo || selectedPlacedShipId ? 'Tap empty cell to place/move' : 'Drag ships or tap one to select'}
                                </div>
                                <div className="w-full px-2 max-w-[340px] mx-auto">
                                    <Grid size={boardSize} gridRef={gridRef} onCellTap={handleGridTap} myShips={placedShips} oppShots={[]} myShots={[]} onDragStartShip={handleDragStartBoard} onDragEndShip={handleDragEnd} onTouchStartShip={handleTouchStartShip} onTouchMoveShip={handleTouchMove} onTouchEndShip={handleTouchEnd} onDragOverCell={handleDragOverCell} onDropGrid={handleDropGrid} onDragLeaveGrid={handleDragLeaveGrid} hoverState={getHoverState()} onShipTap={handleShipTap} selectedPlacedShipId={selectedPlacedShipId} dragInfo={dragInfo} />
                                </div>
                                <div className="flex flex-col gap-2.5 w-full mt-4 max-w-[340px]">
                                    {(selectedShipInfo || selectedPlacedShipId) && (
                                        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-orange-100/60 border border-orange-200 rounded-xl shadow-inner">
                                            <span className="text-[11px] font-mono font-bold text-sky-600 uppercase tracking-wider">Locked: {shipNames[selectedShipInfo?.id || selectedPlacedShipId]?.split(' ')[0]}</span>
                                            <div className="flex gap-2">
                                                <button onClick={handleRotateSelected} className="px-2.5 py-1 bg-white border border-orange-200 rounded-lg text-[10px] font-bold uppercase">Rotate</button>
                                                {selectedPlacedShipId && <button onClick={handleRemoveSelected} className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-500 rounded-lg text-[10px] font-bold uppercase">Remove</button>}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between gap-2 overflow-x-auto p-2 border border-orange-200 bg-white/70 shadow-sm rounded-xl min-h-[72px]" onClick={() => { setSelectedShipInfo(null); setSelectedPlacedShipId(null); }}>
                                        {shipsToPlace.map(ship => (
                                            <div key={ship.id} draggable onDragStart={(e) => handleDragStartDock(e, ship)} onDragEnd={handleDragEnd} onTouchStart={(e) => handleTouchStartShip(e, ship, 'dock')} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onClick={(e) => { e.stopPropagation(); setSelectedShipInfo({ ...ship, isVertical: false }); setSelectedPlacedShipId(null); }} style={{ position: 'relative', width: `${ship.size * 28}px`, height: '32px', background: selectedShipInfo?.id === ship.id ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.4)', border: selectedShipInfo?.id === ship.id ? '2px solid #38bdf8' : '1px solid #e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} className={`transition-all flex-shrink-0 cursor-grab ${selectedShipInfo?.id === ship.id ? 'scale-105' : 'opacity-80'}`}>
                                                <img src={SHIP_IMAGES[ship.id]} alt="" className="object-cover pointer-events-none flex-shrink-0" style={{ width: '32px', height: `${ship.size * 28}px`, transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                                            </div>
                                        ))}
                                        {shipsToPlace.length === 0 && <span className="text-xs text-slate-500 font-bold m-auto">All Ships Deployed</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={undoPlacement} disabled={placedShips.length === 0} className="flex-1 py-2.5 bg-white border border-orange-200 rounded-xl font-bold text-xs disabled:opacity-40">UNDO</button>
                                        <button onClick={placeRandomShips} className="flex-1 py-2.5 bg-white border border-orange-200 text-sky-600 rounded-xl font-bold text-xs">RANDOM</button>
                                        <button onClick={commitBoard} disabled={placedShips.length < shipTypes.length} className="flex-1 py-2.5 bg-sky-500 text-white rounded-xl font-bold text-xs disabled:bg-slate-200 disabled:text-slate-400">READY</button>
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

                {(status === 'PLAYING' || status === 'GAME_OVER') && (
                    <div className="flex flex-col w-full flex-1 justify-start py-2 max-w-md md:max-w-4xl overflow-y-auto">
                        
                        {status === 'PLAYING' && (
                            <div className="mb-3 px-2 w-full flex-shrink-0">
                                <div className={`w-full p-3 rounded-2xl border transition-colors duration-300 flex items-center justify-between shadow-sm ${localTurn === myPlayerId ? 'bg-sky-50 border-sky-200' : 'bg-white border-orange-100'}`}>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full relative flex items-center justify-center">
                                            <div className={`absolute w-full h-full rounded-full animate-ping opacity-75 ${localTurn === myPlayerId ? 'bg-sky-500' : 'bg-rose-500'}`} />
                                            <div className={`w-2.5 h-2.5 rounded-full relative ${localTurn === myPlayerId ? 'bg-sky-500' : 'bg-rose-500'}`} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-xs font-black tracking-widest uppercase ${localTurn === myPlayerId ? 'text-sky-600' : 'text-slate-500'}`}>
                                                {localTurn === myPlayerId ? 'Lượt của bạn' : 'Lượt đối thủ'}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                {isAnimating ? 'Đang kiểm tra chấn động...' : localTurn === myPlayerId ? 'Chọn mục tiêu & Bắn!' : 'Chờ đối thủ nổ súng...'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {turnTimeLeft !== undefined && turnTimeLeft !== null && (
                                        <div className="flex flex-col items-end flex-shrink-0">
                                            <span className={`font-mono text-sm font-black ${turnTimeLeft <= 15 ? 'text-rose-600 animate-pulse' : 'text-slate-700'}`}>⏱️ {turnTimeLeft}s</span>
                                            <div className="w-16 h-1 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                                                <div className={`h-full transition-all duration-1000 ${turnTimeLeft <= 15 ? 'bg-rose-500' : 'bg-sky-400'}`} style={{ width: `${(turnTimeLeft / 90) * 100}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 px-2 mb-3 md:hidden w-full flex-shrink-0">
                            <button onClick={() => setActiveTab('attack')} className={`flex-1 py-2.5 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 ${activeTab === 'attack' ? 'bg-sky-50 border-sky-400 text-sky-600 font-extrabold' : 'bg-white text-slate-500'}`}>LƯỚI TẤN CÔNG</button>
                            <button onClick={() => setActiveTab('defense')} className={`flex-1 py-2.5 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 ${activeTab === 'defense' ? 'bg-rose-50 border-rose-400 text-rose-600 font-extrabold' : 'bg-white text-slate-500'}`}>ĐỘI TÀU CỦA BẠN</button>
                        </div>

                        <div className="flex flex-col md:flex-row w-full gap-4 md:gap-8 justify-center items-center md:items-stretch px-2 pb-4">
                            
                            {/* BÀN TẤN CÔNG (Đối thủ) */}
                            <div className={`flex-1 flex flex-col w-full max-w-sm ${activeTab === 'attack' ? 'block' : 'hidden md:flex'}`}>
                                <div className="flex justify-between items-center mb-1.5 px-1 h-[22px]">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                        {status === 'GAME_OVER' ? "Hạm đội đối thủ phát lộ" : "Lưới Tấn Công"}
                                    </span>
                                </div>
                                <div className={`transition-opacity w-full ${(status === 'PLAYING' && localTurn !== myPlayerId) || isAnimating ? 'opacity-70 pointer-events-none' : ''}`}>
                                    <Grid 
                                        size={boardSize}
                                        gridRef={gridRef}
                                        onCellTap={handleGridTap} 
                                        myShips={[]} 
                                        oppShots={[]} 
                                        myShots={myShots} 
                                        isTargetMode 
                                        selectedTarget={selectedTarget}
                                        revealedOppShips={revealedOppShips} 
                                        oppFullBoard={status === 'GAME_OVER' ? oppBoardState : null} 
                                        onDragOverCell={handleDragOverCell}
                                        onDragLeaveGrid={handleDragLeaveGrid}
                                    />
                                </div>
                                
                                <div className="flex justify-center items-center gap-1 mt-2.5 px-1.5 py-1.5 bg-white/70 border border-orange-200 rounded-lg w-full shadow-sm">
                                    {opponentFleet.map((ship) => (
                                        <div key={ship.id} className={`flex flex-col items-center p-1 rounded border text-center flex-1 transition-colors duration-300 ${ship.isSunk ? 'bg-red-500/10 border-red-500 text-red-600 line-through' : 'bg-white text-slate-500'}`}>
                                            <span className="text-[8px] font-mono font-bold uppercase">{ship.name}</span>
                                            <div className="flex gap-0.5 mt-0.5">
                                                {Array.from({ length: ship.size }).map((_, idx) => (
                                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${ship.isSunk ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]' : 'bg-slate-200'}`} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="hidden md:flex w-px bg-orange-200 mx-1 relative self-stretch items-center justify-center" />

                            {/* BÀN PHÒNG THỦ (Của bạn) */}
                            <div className={`flex-1 flex flex-col w-full max-w-sm ${activeTab === 'defense' ? 'block' : 'hidden md:flex'}`}>
                                <div className="flex justify-between items-center mb-1.5 px-1"><span className="text-xs font-bold uppercase tracking-widest text-slate-500">Đội tàu bảo vệ</span></div>
                                <div className="w-full">
                                    <Grid size={boardSize} onCellTap={()=>{}} myShips={myBoardState || placedShips} oppShots={oppShots} myShots={[]} />
                                </div>
                                <div className="flex justify-center items-center gap-1 mt-2.5 px-1.5 py-1.5 bg-white/70 border border-orange-200 rounded-lg w-full shadow-sm">
                                    {myFleet.map((ship) => (
                                        <div key={ship.id} className={`flex flex-col items-center p-1 rounded border text-center flex-1 transition-colors duration-300 ${ship.isSunk ? 'bg-red-500/10 border-red-400 text-red-500' : 'bg-white text-slate-500'}`}>
                                            <span className="text-[7.5px] font-mono uppercase">{ship.name}</span>
                                            <div className="flex gap-0.5 mt-0.5">
                                                {Array.from({ length: ship.size }).map((_, idx) => (
                                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${ship.isSunk ? 'bg-red-500' : 'bg-slate-200'}`} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {status === 'GAME_OVER' && (
                    <div id="gameover-overlay" className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-orange-50/90 backdrop-blur-sm pb-20">
                        <button onClick={onLeaveRoom} className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-white border border-orange-200 text-slate-600 rounded-full font-bold text-sm shadow">&larr; Exit</button>
                        <div className="text-sm font-semibold text-slate-400 tracking-[0.2em] uppercase mb-4">Trận đấu kết thúc</div>
                        <div className={`text-5xl font-black uppercase tracking-widest mb-4 text-center ${winner === myPlayerId ? 'text-sky-600' : 'text-pink-600'}`}>
                            {winner === myPlayerId ? 'VICTORY' : 'DEFEAT'}
                        </div>
                        <button onClick={() => { const overlay = document.getElementById('gameover-overlay'); if(overlay) overlay.style.display='none'; }} className="mb-6 text-xs text-sky-600 font-bold underline cursor-pointer">Xem sơ đồ chiến trường</button>
                        
                        {/* THAY ĐỔI: Cơ chế nút bấm chơi lại không reload trang */}
                        <button 
                            onClick={handleRequestPlayAgain} 
                            className="px-10 py-4 bg-sky-500 text-white rounded-full text-xl font-bold tracking-[0.1em] shadow-lg hover:bg-sky-600 active:scale-95 transition-all outline-none"
                        >
                            PLAY AGAIN
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function Grid({ 
    size, onCellTap, onDragStartShip, onDragEndShip, onTouchStartShip, onTouchMoveShip, onTouchEndShip,
    onDragOverCell, onDropGrid, onDragLeaveGrid, myShips, oppShots, myShots, isTargetMode, shrink, hoverState, 
    onShipTap, gridRef, selectedPlacedShipId, selectedTarget, dragInfo,
    revealedOppShips, oppFullBoard 
}: any) {
    
    const cells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells.push({ x, y });
        }
    }

    const checkCellInRevealedShip = (x: number, y: number) => {
        if (!isTargetMode) return null;
        if (oppFullBoard) {
            const ship = oppFullBoard.find((s: any) => s.cells.some((c: any) => c.x === x && c.y === y));
            if (ship) return { color: '#ef4444', isSunk: true };
        }
        if (revealedOppShips) {
            const ship = revealedOppShips.find((s: any) => s.cells.some((c: any) => c.x === x && c.y === y));
            if (ship) return { color: '#ef4444', isSunk: true };
        }
        return null;
    };

    const getShipsToRenderOnAttack = () => {
        if (!isTargetMode) return [];
        if (oppFullBoard) return oppFullBoard;
        if (revealedOppShips) return revealedOppShips;
        return [];
    };

    const attackShipsToRender = getShipsToRenderOnAttack();

    return (
        <div className="flex flex-col w-full select-none">
            <div className="flex w-full pl-5 pr-0.5 mb-1.5 text-center font-mono text-[9px] sm:text-[10px] text-slate-500 font-bold tracking-wider">
                {Array.from({ length: size }, (_, index) => String.fromCharCode(65 + index)).map((col) => (
                    <div key={col} className="flex-1">{col}</div>
                ))}
            </div>

            <div className="flex w-full items-stretch">
                <div className="flex flex-col justify-between py-1.5 pr-2.5 text-right font-mono text-[9px] sm:text-[10px] text-slate-500 font-bold w-3">
                    {Array.from({ length: size }, (_, index) => String(index + 1)).map((row) => (
                        <div key={row} className="h-0 flex items-center justify-end">{row}</div>
                    ))}
                </div>

                <div 
                   ref={gridRef}
                   className={`grid flex-1 aspect-square water-grid-bg border-[2px] border-sky-200 shadow-lg p-1 relative rounded-lg ${shrink ? 'gap-[2px]' : 'gap-1'}`} 
                   style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}
                   onDragLeave={onDragLeaveGrid}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => onDropGrid && onDropGrid(e)}
                >
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
                        const revealedData = checkCellInRevealedShip(cell.x, cell.y);

                        return (
                            <div 
                                key={`cell-${cell.x}-${cell.y}`}
                                onClick={() => onCellTap && onCellTap(cell.x, cell.y)}
                                onDragEnter={(e) => { e.preventDefault(); onDragOverCell && onDragOverCell(e, cell.x, cell.y); }}
                                onDragOver={(e) => { e.preventDefault(); onDragOverCell && onDragOverCell(e, cell.x, cell.y); }}
                                style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 }}
                                className={`relative w-full h-full rounded transition-colors duration-150 border border-sky-300/30
                                    ${isTargetMode 
                                        ? isTargetSelected
                                            ? 'bg-sky-400/40 ring-2 ring-sky-500 ring-inset'
                                            : revealedData
                                                ? 'bg-red-500/20 border-red-400' 
                                                : 'bg-sky-200/20 hover:bg-sky-300/35' 
                                        : 'bg-sky-200/25 hover:bg-sky-200/40'
                                    }
                                `}
                            >
                                {revealedData && (
                                    <div className="absolute inset-0 bg-red-600/30 border border-red-500 z-10 pointer-events-none rounded-sm" />
                                )}

                                {cellStatus === 'empty' && !revealedData && (
                                    <div className="absolute inset-0 m-auto w-[2px] h-[2px] rounded-full bg-sky-400/50 pointer-events-none" />
                                )}

                                {cellStatus.endsWith('miss') && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        <div className="w-full h-full rounded-full border border-sky-400/80 absolute z-10 animate-splash" />
                                        <div className="w-3 h-3 rounded-full border border-sky-500/50 bg-sky-950/20" />
                                    </div>
                                )}

                                {cellStatus.endsWith('hit') && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        <div className="w-full h-full rounded bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 absolute z-20 animate-explosion-flash" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-red-500 to-orange-600 border border-orange-400 z-10 shadow-[0_0_10px_#f97316]" />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    
                    {/* HÌNH ẢNH CON TÀU ĐỐI THỦ */}
                    {isTargetMode && attackShipsToRender.map((ship: any) => {
                        const isSunkInMatch = revealedOppShips && revealedOppShips.some((s: any) => s.id === ship.id);
                        return (
                            <div 
                                key={`opp-ship-reveal-${ship.id}`} 
                                style={{ 
                                    gridColumn: `${ship.x + 1} / span ${ship.isVertical ? 1 : ship.size}`, 
                                    gridRow: `${ship.y + 1} / span ${ship.isVertical ? ship.size : 1}`, 
                                    position: 'relative', 
                                    borderRadius: '8px', 
                                    opacity: 0.85, 
                                    zIndex: 15, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    overflow: 'hidden',
                                    pointerEvents: 'none'
                                }}
                            >
                                <img 
                                    src={SHIP_IMAGES[ship.id]} 
                                    alt="" 
                                    style={{ 
                                        width: ship.isVertical ? '100%' : `${100 / ship.size}%`, 
                                        height: ship.isVertical ? '100%' : `${100 * ship.size}%`, 
                                        objectFit: 'cover', 
                                        filter: isSunkInMatch ? 'sepia(100%) saturate(300%) hue-rotate(-50deg) brightness(70%)' : 'none', 
                                        transform: ship.isVertical ? 'none' : 'rotate(-90deg)', 
                                        transformOrigin: 'center', 
                                        flexShrink: 0 
                                    }} 
                                />
                            </div>
                        );
                    })}

                    {/* HẠM ĐỘI BẢN THÂN */}
                    {!isTargetMode && myShips && myShips.map((ship: any) => {
                        const isSelected = selectedPlacedShipId === ship.id;
                        const isSunk = ship.cells && ship.cells.every((cell: any) => oppShots && oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit));
                        
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
                                style={{ 
                                    gridColumn: `${ship.x + 1} / span ${ship.isVertical ? 1 : ship.size}`, 
                                    gridRow: `${ship.y + 1} / span ${ship.isVertical ? ship.size : 1}`, 
                                    position: 'relative', 
                                    border: isSelected ? '2px solid #38bdf8' : 'none', 
                                    boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.8)' : 'none', 
                                    borderRadius: '8px', 
                                    opacity: isSunk ? 0.5 : 0.95, 
                                    zIndex: 20, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    overflow: 'visible'
                                }}
                                className={`select-none ${onDragStartShip && !isSunk ? 'cursor-grab active:cursor-grabbing hover:brightness-105' : ''}`}
                            >
                                <img src={SHIP_IMAGES[ship.id]} alt="" style={{ width: ship.isVertical ? '100%' : `${100 / ship.size}%`, height: ship.isVertical ? '100%' : `${100 * ship.size}%`, objectFit: 'cover', filter: isSunk ? 'grayscale(100%) brightness(50%)' : 'none', transform: ship.isVertical ? 'none' : 'rotate(-90deg)', transformOrigin: 'center', flexShrink: 0 }} className="pointer-events-none" />

                                {/* Hiệu ứng HIT trên tàu - Hiển thị chấm đỏ tại các ô bị trúng */}
                                {ship.cells && ship.cells.map((cell: any) => {
                                    const isHit = oppShots && oppShots.some((s: any) => s.x === cell.x && s.y === cell.y && s.hit);
                                    if (!isHit) return null;

                                    const cellIndexInShip = ship.cells.indexOf(cell);
                                    const cellPercentage = ((cellIndexInShip + 0.5) / ship.size) * 100;

                                    return (
                                        <div
                                            key={`hit-${ship.id}-${cell.x}-${cell.y}`}
                                            style={{
                                                position: 'absolute',
                                                [ship.isVertical ? 'top' : 'left']: `${cellPercentage}%`,
                                                [ship.isVertical ? 'left' : 'top']: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '50%',
                                                background: 'radial-gradient(circle at 30% 30%, #ff6b6b, #dc2626)',
                                                border: '2px solid #991b1b',
                                                boxShadow: '0 0 12px rgba(220, 38, 38, 0.8), inset 0 0 6px rgba(0, 0, 0, 0.3)',
                                                zIndex: 50,
                                                pointerEvents: 'none',
                                                animation: 'pulse 1.5s ease-in-out infinite'
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute',
                                                width: '4px',
                                                height: '4px',
                                                background: '#fff',
                                                borderRadius: '50%',
                                                top: '3px',
                                                left: '3px',
                                                opacity: 0.6
                                            }} />
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}

                    {/* BÓNG MỜ PREVIEW OVERLAY */}
                    {!isTargetMode && dragInfo && hoverState && (
                        (() => {
                            const ship = dragInfo.ship;
                            return (
                                <div 
                                    style={{ 
                                        gridColumn: `${hoverState.hx + 1} / span ${ship.isVertical ? 1 : ship.size}`, 
                                        gridRow: `${hoverState.hy + 1} / span ${ship.isVertical ? ship.size : 1}`, 
                                        position: 'relative', 
                                        border: hoverState.isValid ? '2px solid #22c55e' : '2px solid #ef4444', 
                                        boxShadow: hoverState.isValid ? '0 0 15px rgba(34, 197, 94, 0.8)' : '0 0 15px rgba(239, 68, 68, 0.8)', 
                                        borderRadius: '8px', 
                                        opacity: 0.5, 
                                        zIndex: 40, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        overflow: 'hidden',
                                        pointerEvents: 'none' 
                                    }}
                                >
                                    <img src={SHIP_IMAGES[ship.id]} alt="" style={{ width: ship.isVertical ? '100%' : `${100 / ship.size}%`, height: ship.isVertical ? '100%' : `${100 * ship.size}%`, objectFit: 'cover', transform: ship.isVertical ? 'none' : 'rotate(-90deg)', transformOrigin: 'center', flexShrink: 0 }} className="pointer-events-none" />
                                </div>
                            );
                        })()
                    )}

                    {/* LỚP NỀN Ô LƯỚI BÓNG MỜ */}
                    {hoverState && hoverState.cells.map((c: any) => {
                        if (c.x < 0 || c.x >= size || c.y < 0 || c.y >= size) return null;
                        return (
                            <div key={`hover-${c.x}-${c.y}`} 
                                 style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
                                 className={`w-full h-full rounded opacity-30 z-10 pointer-events-none ${hoverState.isValid ? 'bg-green-400' : 'bg-red-400'}`} />
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
