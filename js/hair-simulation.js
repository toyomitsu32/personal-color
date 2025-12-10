/**
 * ヘアカラーシミュレーション機能
 * 髪の領域を検出して色を変更する
 */

/**
 * 髪の領域をマスクとして取得
 * MediaPipeの顔ランドマークから髪の領域を推定
 */
export function createHairMask(canvas, landmarks) {
    const w = canvas.width;
    const h = canvas.height;
    
    // 新しいcanvasを作成してマスクを描画
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext('2d');
    
    // 顔の輪郭ポイント (MediaPipe Face Landmarker の頭頂部と側面)
    // 頭頂部周辺のランドマーク: 10 (額中央), 103, 67, 109 (左側), 338, 297, 332 (右側)
    const foreheadCenter = landmarks[10];
    const leftForehead = landmarks[103];
    const rightForehead = landmarks[332];
    const leftTemple = landmarks[234];
    const rightTemple = landmarks[454];
    const leftCheek = landmarks[227];
    const rightCheek = landmarks[447];
    
    // 顔の幅と高さを計算
    const faceWidth = Math.abs(rightTemple.x - leftTemple.x) * w;
    const faceHeight = Math.abs(foreheadCenter.y - landmarks[152].y) * h; // 152は顎の中心
    
    // 髪の領域を推定（額から上）
    const hairTop = Math.max(0, foreheadCenter.y * h - faceHeight * 0.8);
    const hairLeft = Math.max(0, leftTemple.x * w - faceWidth * 0.3);
    const hairRight = Math.min(w, rightTemple.x * w + faceWidth * 0.3);
    const hairBottom = foreheadCenter.y * h + faceHeight * 0.05;
    
    // 楕円形のマスクを作成
    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    
    // 髪の形を楕円で近似
    const centerX = (hairLeft + hairRight) / 2;
    const centerY = (hairTop + hairBottom) / 2;
    const radiusX = (hairRight - hairLeft) / 2;
    const radiusY = (hairBottom - hairTop) / 2;
    
    maskCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    maskCtx.fill();
    
    // 下部を滑らかにカット（額のラインに沿って）
    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    maskCtx.moveTo(leftTemple.x * w - faceWidth * 0.3, hairBottom);
    
    // ベジェ曲線で額のラインを描く
    const cp1x = leftForehead.x * w;
    const cp1y = leftForehead.y * h;
    const cp2x = rightForehead.x * w;
    const cp2y = rightForehead.y * h;
    const endX = rightTemple.x * w + faceWidth * 0.3;
    const endY = hairBottom;
    
    maskCtx.bezierCurveTo(
        cp1x, cp1y - 20,
        cp2x, cp2y - 20,
        endX, endY
    );
    
    maskCtx.lineTo(endX, h);
    maskCtx.lineTo(hairLeft, h);
    maskCtx.closePath();
    maskCtx.fill();
    
    return maskCanvas;
}

/**
 * 髪の色を変更する
 * @param {HTMLCanvasElement} canvas - 元の画像のcanvas
 * @param {HTMLCanvasElement} maskCanvas - 髪のマスク
 * @param {string} newColor - 新しい髪の色 (hex)
 * @returns {HTMLCanvasElement} - 色変更後のcanvas
 */
export function applyHairColor(canvas, maskCanvas, newColor) {
    const w = canvas.width;
    const h = canvas.height;
    
    // 結果用のcanvasを作成
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = w;
    resultCanvas.height = h;
    const resultCtx = resultCanvas.getContext('2d');
    
    // 元の画像を描画
    resultCtx.drawImage(canvas, 0, 0);
    
    // マスクとcanvasのピクセルデータを取得
    const imageData = resultCtx.getImageData(0, 0, w, h);
    const maskData = maskCanvas.getContext('2d').getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const mask = maskData.data;
    
    // HEXをRGBに変換
    const targetColor = hexToRgb(newColor);
    
    // 各ピクセルを処理
    for (let i = 0; i < pixels.length; i += 4) {
        const maskAlpha = mask[i] / 255; // マスクの強度 (0-1)
        
        if (maskAlpha > 0.1) { // マスク領域内のみ処理
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            // 元の明度を保持しながら色相を変更
            const brightness = (r + g + b) / 3;
            const brightnessRatio = brightness / 128; // 正規化
            
            // 新しい色に元の明度を適用
            const newR = Math.min(255, targetColor.r * brightnessRatio);
            const newG = Math.min(255, targetColor.g * brightnessRatio);
            const newB = Math.min(255, targetColor.b * brightnessRatio);
            
            // ブレンド（マスクの強度に応じて）
            const blendStrength = maskAlpha * 0.7; // 70%の強度で適用
            pixels[i] = r * (1 - blendStrength) + newR * blendStrength;
            pixels[i + 1] = g * (1 - blendStrength) + newG * blendStrength;
            pixels[i + 2] = b * (1 - blendStrength) + newB * blendStrength;
        }
    }
    
    resultCtx.putImageData(imageData, 0, 0);
    return resultCanvas;
}

/**
 * HEXカラーをRGBに変換
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

/**
 * シーズンに応じたヘアカラーパレットを取得
 */
export function getHairColorPalette(season) {
    const palettes = {
        spring: [
            { name: 'ハニーブロンド', color: '#D4A574' },
            { name: 'ゴールデンブラウン', color: '#B8860B' },
            { name: 'ライトキャラメル', color: '#C68642' },
            { name: 'ウォームベージュ', color: '#D2B48C' },
            { name: 'コッパーブラウン', color: '#B87333' },
            { name: 'ピーチブロンド', color: '#E6B88A' }
        ],
        summer: [
            { name: 'アッシュブロンド', color: '#C4B5A0' },
            { name: 'ローズブラウン', color: '#9B7B7B' },
            { name: 'ソフトグレージュ', color: '#B8AFA8' },
            { name: 'ラベンダーアッシュ', color: '#A895A0' },
            { name: 'クールベージュ', color: '#C9B8A3' },
            { name: 'シルバーグレー', color: '#A8A8A0' }
        ],
        autumn: [
            { name: 'ダークブラウン', color: '#654321' },
            { name: 'チェスナット', color: '#8B4513' },
            { name: 'マホガニー', color: '#823D3D' },
            { name: 'オータムレッド', color: '#A0522D' },
            { name: 'ディープコッパー', color: '#A0522D' },
            { name: 'ウォームブラック', color: '#3C2F2F' }
        ],
        winter: [
            { name: 'ジェットブラック', color: '#1C1C1C' },
            { name: 'クールブラック', color: '#252525' },
            { name: 'ブルーブラック', color: '#1F2937' },
            { name: 'シルバー', color: '#C0C0C0' },
            { name: 'プラチナブロンド', color: '#E5E4E2' },
            { name: 'バーガンディ', color: '#800020' }
        ]
    };
    
    return palettes[season] || palettes.spring;
}
