/**
 * より精密な髪の領域セグメンテーション
 * MediaPipe Image Segmenterを使用
 */

let imageSegmenter = null;

/**
 * Image Segmenterを初期化（髪専用）
 */
export async function initImageSegmenter(FilesetResolver) {
    try {
        const { ImageSegmenter } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm");
        
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
                delegate: "GPU"
            },
            runningMode: "IMAGE",
            outputCategoryMask: true,
            outputConfidenceMasks: false
        });
        
        console.log("ImageSegmenter initialized");
        return true;
    } catch (error) {
        console.error("ImageSegmenter initialization failed:", error);
        return false;
    }
}

/**
 * より精密な髪のマスクを作成
 * 色ベースのセグメンテーションとランドマークを組み合わせ
 */
export function createPreciseHairMask(canvas, landmarks, originalHairColor) {
    const w = canvas.width;
    const h = canvas.height;
    
    // 新しいcanvasを作成してマスクを描画
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext('2d');
    
    // 元の画像データを取得
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    
    // 顔のランドマークから髪の領域を推定
    const foreheadCenter = landmarks[10];
    const leftTemple = landmarks[234];
    const rightTemple = landmarks[454];
    const chin = landmarks[152];
    
    // 顔の範囲を計算
    const faceWidth = Math.abs(rightTemple.x - leftTemple.x) * w;
    const faceHeight = Math.abs(foreheadCenter.y - chin.y) * h;
    
    // 髪の推定領域
    const hairTop = Math.max(0, foreheadCenter.y * h - faceHeight * 1.0);
    const hairBottom = foreheadCenter.y * h + faceHeight * 0.1;
    const hairLeft = Math.max(0, leftTemple.x * w - faceWidth * 0.4);
    const hairRight = Math.min(w, rightTemple.x * w + faceWidth * 0.4);
    
    // 色ベースのセグメンテーション
    const maskData = maskCtx.createImageData(w, h);
    const mask = maskData.data;
    
    // 髪の色をHSLに変換
    const hairHSL = rgbToHsl(originalHairColor.r, originalHairColor.g, originalHairColor.b);
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            
            // 推定領域内かチェック
            const inRegion = x >= hairLeft && x <= hairRight && y >= hairTop && y <= hairBottom;
            
            if (inRegion) {
                const pixelHSL = rgbToHsl(r, g, b);
                
                // 色の類似度を計算
                const hueDiff = Math.abs(pixelHSL.h - hairHSL.h);
                const satDiff = Math.abs(pixelHSL.s - hairHSL.s);
                const lightDiff = Math.abs(pixelHSL.l - hairHSL.l);
                
                // 色が似ているかつ暗い色（髪っぽい）ならマスク
                const isSimilar = hueDiff < 40 && satDiff < 40 && lightDiff < 40;
                const isDark = pixelHSL.l < 70; // 明度70%以下
                
                if (isSimilar && isDark) {
                    // マスクの強度を距離に応じて調整
                    const centerX = (hairLeft + hairRight) / 2;
                    const centerY = (hairTop + hairBottom) / 2;
                    const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                    const maxDist = Math.sqrt(Math.pow(faceWidth / 2, 2) + Math.pow(faceHeight, 2));
                    const strength = Math.max(0, 1 - distFromCenter / maxDist);
                    
                    mask[idx] = 255;
                    mask[idx + 1] = 255;
                    mask[idx + 2] = 255;
                    mask[idx + 3] = Math.round(strength * 255);
                } else {
                    mask[idx + 3] = 0; // 透明
                }
            } else {
                mask[idx + 3] = 0; // 領域外は透明
            }
        }
    }
    
    maskCtx.putImageData(maskData, 0, 0);
    
    // モルフォロジー処理で滑らかに
    applyMorphology(maskCanvas);
    
    return maskCanvas;
}

/**
 * モルフォロジー処理（クロージング）でマスクを滑らかに
 */
function applyMorphology(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    // 簡易的な膨張→収縮処理
    const iterations = 3;
    const kernel = 3;
    
    for (let iter = 0; iter < iterations; iter++) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const pixels = imageData.data;
        const tempData = new Uint8ClampedArray(pixels);
        
        // 膨張
        for (let y = kernel; y < h - kernel; y++) {
            for (let x = kernel; x < w - kernel; x++) {
                let maxAlpha = 0;
                for (let ky = -kernel; ky <= kernel; ky++) {
                    for (let kx = -kernel; kx <= kernel; kx++) {
                        const idx = ((y + ky) * w + (x + kx)) * 4 + 3;
                        maxAlpha = Math.max(maxAlpha, pixels[idx]);
                    }
                }
                const idx = (y * w + x) * 4 + 3;
                tempData[idx] = maxAlpha;
            }
        }
        
        ctx.putImageData(new ImageData(tempData, w, h), 0, 0);
    }
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return {
        h: h * 360,
        s: s * 100,
        l: l * 100
    };
}
