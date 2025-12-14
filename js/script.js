import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";

console.log("Loading script.js v1.5.1 - 2024-12-14");

import { diagnosePersonalColor } from './color-diagnosis.js';
import { createHairMask, applyHairColor, getHairColorPalette } from './hair-simulation.js';
import { createPreciseHairMask, initImageSegmenter } from './hair-segmentation.js';
import { changeHairColorWithAI, getThreeRecommendedColors, loadImageToCanvas, canvasToBase64, verifyPassword, changeFashionWithAI } from './ai-hair-color.js';

const fileInput = document.getElementById('file-input');
const uploadContainer = document.getElementById('upload-container');
const previewContainer = document.getElementById('preview-container');
const outputCanvas = document.getElementById('output-canvas');
const ctx = outputCanvas.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const resetBtn = document.getElementById('reset-btn');
const resultsGrid = document.getElementById('results-grid');
const statusCard = document.getElementById('status-card');
const errorCard = document.getElementById('error-card');
const errorMessage = document.getElementById('error-message');

// グローバル変数
let currentLandmarks = null;
let originalCanvas = null;
let currentDiagnosis = null;
let beforeCanvas = null;
let afterCanvas = null;
let currentHairColor = null;
let aiGeneratedImages = []; // AI生成された3パターンの画像を保存
let allGeneratedImages = []; // すべての生成画像を蓄積（診断結果 + カスタム）
let currentSelectedIndex = -1; // 現在選択されているパターン
let inlineCanvas = null; // インライン表示用のCanvas
let isAnalyzing = false; // 解析中フラグ（重複実行防止）
let selectedFashionBaseImage = null; // ファッションシミュレーション用ベース画像
let selectedFashionHairInfo = null; // 選択された髪色情報

let faceLandmarker;
let poseLandmarker;
let runningMode = "IMAGE";

// カスタムカラーシミュレーション用のパレット
const CUSTOM_COLOR_PALETTES = {
    warm: [
        { name: 'Warm Brown', color: '#8B4513', description: 'Warm brown with reddish tones' },
        { name: 'Reddish Brown', color: '#A52A2A', description: 'Reddish brown' },
        { name: 'Orange Brown', color: '#D2691E', description: 'Orange-based brown' },
        { name: 'Pink Beige', color: '#E6C0C0', description: 'Pinkish beige' }
    ],
    ash: [
        { name: 'Ash Brown', color: '#777777', description: 'Cool ash brown' },
        { name: 'Ash Gray', color: '#808080', description: 'Grayish ash' },
        { name: 'Greige', color: '#9E9E9E', description: 'Mix of grey and beige' },
        { name: 'Silver Ash', color: '#C0C0C0', description: 'Silver-toned ash' }
    ],
    matte: [
        { name: 'Matte Brown', color: '#556B2F', description: 'Green-based matte brown' },
        { name: 'Olive Brown', color: '#808000', description: 'Olive toned brown' },
        { name: 'Khaki Beige', color: '#BDB76B', description: 'Beige with khaki undertones' },
        { name: 'Mint Ash', color: '#8FBC8F', description: 'Ash with mint tint' }
    ],
    gold: [
        { name: 'Gold Brown', color: '#DAA520', description: 'Golden brown' },
        { name: 'Yellow Beige', color: '#F0E68C', description: 'Yellow-based beige' },
        { name: 'Honey Gold', color: '#FFD700', description: 'Bright honey gold' },
        { name: 'Blonde', color: '#F5F5DC', description: 'Bright blonde' }
    ]
};

// Initialize MediaPipe FaceLandmarker
async function createFaceLandmarker() {
  try {
    loadingOverlay.classList.remove('hidden');
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU"
      },
      outputFaceBlendshapes: false,
      runningMode: runningMode,
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    // Initialize PoseLandmarker
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: "GPU"
      },
      runningMode: runningMode,
      numPoses: 1
    });

    // Image Segmenterも初期化
    await initImageSegmenter(FilesetResolver);
    
    loadingOverlay.classList.add('hidden');
    console.log("FaceLandmarker and PoseLandmarker initialized");
  } catch (error) {
    console.error(error);
    loadingText.innerText = "モデルの読み込みに失敗しました。ページをリロードしてください。";
    loadingText.classList.add('text-red-600');
  }
}

createFaceLandmarker();

// Settings Modal Logic Removed


// Event Listeners
uploadContainer.addEventListener('click', () => fileInput.click());

uploadContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadContainer.classList.add('active');
});

uploadContainer.addEventListener('dragleave', () => {
    uploadContainer.classList.remove('active');
});

uploadContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadContainer.classList.remove('active');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
    }
});

// ボタンのイベント
document.getElementById('close-preview-btn').addEventListener('click', closePreview);
document.getElementById('new-image-btn').addEventListener('click', resetToNewImage);
// 下部リセットボタンのイベント
const resetBtnBottom = document.getElementById('reset-btn-bottom');
if (resetBtnBottom) {
    resetBtnBottom.addEventListener('click', resetToNewImage);
}

// プレビューを閉じる（画像は残す）
function closePreview() {
    const confirmed = confirm('プレビューを閉じて画像選択に戻りますか？\n（診断結果は保持されます）');
    if (!confirmed) return;
    
    previewContainer.classList.add('hidden');
    uploadContainer.classList.remove('hidden');
    document.getElementById('before-after-toggle').classList.add('hidden');
}

// 完全リセット：新しい画像で診断
function resetToNewImage() {
    const hasResults = currentDiagnosis !== null || aiGeneratedImages.length > 0;
    if (hasResults) {
        const confirmed = confirm('診断結果をリセットして別の画像をアップロードしますか？\n（現在の結果はすべて削除されます）');
        if (!confirmed) return;
    }
    
    // 完全リセット
    fileInput.value = '';
    
    // 生成画像ギャラリーをリフレッシュ
    const gallerySection = document.getElementById('image-gallery-section');
    if (gallerySection) {
        gallerySection.remove(); // DOMから削除
    }
    
    // Reset Layout
    const uploadWrapper = document.getElementById('upload-wrapper');
    const analysisSection = document.getElementById('analysis-section');
    const simulationSection = document.getElementById('simulation-section');
    
    uploadWrapper.classList.remove('hidden');
    analysisSection.classList.add('hidden', 'opacity-0');
    simulationSection.classList.add('hidden');
    
    previewContainer.classList.add('hidden'); // Legacy container check, but logic moved to layout switching
    
    resultsGrid.classList.add('hidden');
    statusCard.classList.add('hidden');
    errorCard.classList.add('hidden');
    
    // ローディングオーバーレイを非表示
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    
    const diagnosisCard = document.getElementById('diagnosis-card');
    const hairSimCard = document.getElementById('hair-simulation-card');
    const hairResultsCard = document.getElementById('hair-results-card');
    const beforeAfterToggle = document.getElementById('before-after-toggle');
    const inlinePreview = document.getElementById('inline-preview-container');
    const floatingActions = document.getElementById('floating-actions-container');
    const resetSection = document.getElementById('reset-section');
    const fashionSection = document.getElementById('fashion-simulation-section');
    
    if (diagnosisCard) diagnosisCard.classList.add('hidden');
    if (hairSimCard) hairSimCard.classList.add('hidden');
    const customColorCard = document.getElementById('custom-color-card');
    if (customColorCard) customColorCard.classList.add('hidden');
    if (hairResultsCard) hairResultsCard.classList.add('hidden');
    if (beforeAfterToggle) beforeAfterToggle.classList.add('hidden');
    if (inlinePreview) inlinePreview.classList.add('hidden');
    if (floatingActions) floatingActions.classList.add('hidden');
    if (resetSection) resetSection.classList.add('hidden');
    if (fashionSection) fashionSection.classList.add('hidden');
    
    // 生成ボタンを再表示
    const generateBtn = document.getElementById('generate-hair-colors-btn');
    const generatingStatus = document.getElementById('generating-status');
    if (generateBtn) generateBtn.classList.remove('hidden');
    if (generatingStatus) generatingStatus.classList.add('hidden');
    
    const generateBtnText = document.getElementById('generate-btn-text');
    if (generateBtnText) generateBtnText.innerText = '3パターン表示する';
    
    // グローバル変数をリセット
    currentLandmarks = null;
    originalCanvas = null;
    currentDiagnosis = null;
    beforeCanvas = null;
    afterCanvas = null;
    currentHairColor = null;
    aiGeneratedImages = [];
    allGeneratedImages = []; // 蓄積画像もリセット
    currentSelectedIndex = -1;
    inlineCanvas = null;
    selectedFashionBaseImage = null;
    selectedFashionHairInfo = null;
    
    console.log('Reset complete: All data cleared for new image analysis');
    
    // スムーズにスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
}



function processFile(file) {
    if (!faceLandmarker || !poseLandmarker) {
        alert("モデルがまだ読み込まれていません。少々お待ちください。");
        return;
    }
    
    if (isAnalyzing) return; // 解析中は無視
    isAnalyzing = true;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            runInference(img);
        };
        img.onerror = () => {
            isAnalyzing = false;
            alert("画像の読み込みに失敗しました。");
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        isAnalyzing = false;
        alert("ファイルの読み込みに失敗しました。");
    };
    reader.readAsDataURL(file);
}

async function runInference(img) {
    const uploadWrapper = document.getElementById('upload-wrapper');
    const analysisSection = document.getElementById('analysis-section');
    const simulationSection = document.getElementById('simulation-section');
    
    // UI Layout Switching
    uploadWrapper.classList.add('hidden');
    analysisSection.classList.remove('hidden');
    // simulationSection remains hidden until diagnosis is complete
    
    // Add small delay for opacity transition effect
    setTimeout(() => {
        analysisSection.classList.remove('opacity-0');
    }, 50);

    // Show loading (reuse overlay in upload container if needed, but we are switching layout)
    // Actually, we should keep upload container visible until image is processed?
    // Let's hide it and show preview immediately as per new layout.
    
    // Resize canvas to match image, but max width/height limits
    const maxWidth = 800;
    const scale = Math.min(1, maxWidth / img.width);
    outputCanvas.width = img.width * scale;
    outputCanvas.height = img.height * scale;

    ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height); // キャンバスをクリア
    ctx.drawImage(img, 0, 0, outputCanvas.width, outputCanvas.height);
    
    // 元の画像を保存
    originalCanvas = document.createElement('canvas');
    originalCanvas.width = outputCanvas.width;
    originalCanvas.height = outputCanvas.height;
    originalCanvas.getContext('2d').drawImage(outputCanvas, 0, 0);

    try {
        // Detect faces
        const results = faceLandmarker.detect(outputCanvas);
        
        // Detect pose (optional usage for now)
        try {
            const poseResults = poseLandmarker.detect(outputCanvas);
            console.log("Pose detection results:", poseResults);
            if (poseResults.landmarks && poseResults.landmarks.length > 0) {
                // 将来的に骨格診断に使用可能
                drawPoseLandmarks(poseResults.landmarks[0], ctx);
            }
        } catch (poseError) {
            console.warn("Pose detection failed:", poseError);
        }
        
        // Draw landmarks and analyze colors
        if (results.faceLandmarks.length > 0) {
            statusCard.classList.remove('hidden');
            errorCard.classList.add('hidden');
            resultsGrid.classList.remove('hidden');
            
            const landmarks = results.faceLandmarks[0];
            currentLandmarks = landmarks;
            
            // First draw landmarks (white dots)
            drawLandmarks(landmarks, ctx);
            // Then analyze colors and draw sampling points (red dots) on top
            analyzeColors(landmarks, ctx);
        } else {
            statusCard.classList.add('hidden');
            errorCard.classList.remove('hidden');
            resultsGrid.classList.add('hidden');
            errorMessage.innerText = "顔が検出されませんでした。別の画像を試してください。";
        }
    } catch (err) {
        console.error(err);
        errorMessage.innerText = "解析中にエラーが発生しました。";
        errorCard.classList.remove('hidden');
    } finally {
        isAnalyzing = false; // 解析終了
    }
}

function analyzeColors(landmarks, ctx) {
    // Helper to get average color from a region
    function getColorAt(x, y, radius = 5) {
        const imageData = ctx.getImageData(
            Math.max(0, x - radius), 
            Math.max(0, y - radius), 
            radius * 2, 
            radius * 2
        );
        const data = imageData.data;
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }
        
        return {
            r: Math.round(r / count),
            g: Math.round(g / count),
            b: Math.round(b / count)
        };
    }

    // Coordinates mapping (Approximate MediaPipe Face Mesh indices)
    // Width and Height are needed to convert normalized coords
    const w = outputCanvas.width;
    const h = outputCanvas.height;

    // Face metrics for adaptive calculation
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    
    // Calculate face dimensions
    const faceHeight = Math.abs(chin.y - forehead.y) * h;
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x) * w;
    const faceSize = (faceHeight + faceWidth) / 2;
    
    // Adaptive radius: ~1.5% of face size
    const baseRadius = Math.max(2, Math.min(15, Math.round(faceSize * 0.015)));

    // 1. Skin (Nose tip) - Index 1
    const nose = landmarks[1];
    // Slightly larger radius for skin to average out pores/noise
    const skinColor = getColorAt(nose.x * w, nose.y * h, Math.round(baseRadius * 1.5)); 

    // 2. Eyes (Iris) - Left: 468, Right: 473
    const leftEye = landmarks[468];
    const rightEye = landmarks[473];
    // Smaller radius for eyes to stay within iris
    const eyeRadius = Math.max(1, Math.round(baseRadius * 0.5));
    const lColor = getColorAt(leftEye.x * w, leftEye.y * h, eyeRadius);
    const rColor = getColorAt(rightEye.x * w, rightEye.y * h, eyeRadius);
    const eyeColor = {
        r: Math.round((lColor.r + rColor.r) / 2),
        g: Math.round((lColor.g + rColor.g) / 2),
        b: Math.round((lColor.b + rColor.b) / 2)
    };

    // 3. Lips (Lower lip center) - Index 17 (or 13 for upper/lower inner)
    const lip = landmarks[13];
    const lipColor = getColorAt(lip.x * w, lip.y * h, baseRadius);

    // 4. Hair (Approximation)
    // Adjusted strategy: Sample closer to forehead
    // Go up from forehead by ~25% of face height
    // Note: y coordinates are 0 at top, 1 at bottom. So "up" is subtracting y.
    
    let hairX = forehead.x * w;
    // Go up by 1/4 of face height (approx forehead size)
    let hairY = (forehead.y * h) - (faceHeight * 0.25); 
    
    // Clamp to canvas (with padding)
    hairY = Math.max(5, hairY);
    
    // Sample hair with larger radius to get average color
    const hairColor = getColorAt(hairX, hairY, Math.round(baseRadius * 2));
    currentHairColor = hairColor; // 保存

    // Update UI
    updateColorUI('nose', skinColor);
    updateColorUI('eye', eyeColor);
    updateColorUI('lip', lipColor);
    updateColorUI('hair', hairColor);

    // パーソナルカラー診断を実行
    const diagnosis = diagnosePersonalColor({
        hair: hairColor,
        eye: eyeColor,
        skin: skinColor,
        lip: lipColor
    });
    
    currentDiagnosis = diagnosis;
    
    // Before画像を保存（サンプリングポイントを描画する前に保存）
    beforeCanvas = document.createElement('canvas');
    beforeCanvas.width = outputCanvas.width;
    beforeCanvas.height = outputCanvas.height;
    beforeCanvas.getContext('2d').drawImage(outputCanvas, 0, 0);
    
    // Draw sampling points for visualization
    // サンプリングポイント（色分けされた丸）を明確に表示
    const pointRadius = Math.max(6, Math.round(baseRadius * 1.0));
    drawPoint(ctx, nose.x * w, nose.y * h, 'skin', pointRadius);
    drawPoint(ctx, leftEye.x * w, leftEye.y * h, 'eye', pointRadius);
    drawPoint(ctx, lip.x * w, lip.y * h, 'lip', pointRadius);
    drawPoint(ctx, hairX, hairY, 'hair', pointRadius);
    
    console.log('Sampling points drawn at:', {
        nose: { x: nose.x * w, y: nose.y * h, color: skinColor },
        eye: { x: leftEye.x * w, y: leftEye.y * h, color: eyeColor },
        lip: { x: lip.x * w, y: lip.y * h, color: lipColor },
        hair: { x: hairX, y: hairY, color: hairColor }
    });
    
    // 診断結果を表示
    displayDiagnosisResult(diagnosis);
    
    // ヘアカラーシミュレーション機能を有効化
    initHairSimulation(diagnosis.season);
    
    // 表示セクションを有効化
    document.getElementById('simulation-section').classList.remove('hidden');
    
    // 別の画像で診断するボタンを表示
    const floatingActions = document.getElementById('floating-actions-container');
    if (floatingActions) floatingActions.classList.remove('hidden');
    
    const resetSection = document.getElementById('reset-section');
    if (resetSection) resetSection.classList.remove('hidden');
}

function drawPoint(ctx, x, y, type, radius = 5) {
    // Draw a more visible sampling point
    ctx.save();
    
    // Outer white ring for contrast
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    
    // Inner colored circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    
    // Color based on type
    switch(type) {
        case 'skin': ctx.fillStyle = '#FFA07A'; break; // Light Salmon
        case 'eye': ctx.fillStyle = '#4169E1'; break;  // Royal Blue
        case 'lip': ctx.fillStyle = '#FF69B4'; break;  // Hot Pink
        case 'hair': ctx.fillStyle = '#8B4513'; break; // Saddle Brown
        default: ctx.fillStyle = 'red';
    }
    ctx.fill();
    
    // Inner white stroke for definition
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
}

function updateColorUI(prefix, color) {
    const hex = rgbToHex(color.r, color.g, color.b);
    const rgbStr = `rgb(${color.r}, ${color.g}, ${color.b})`;
    
    document.getElementById(`${prefix}-sample`).style.backgroundColor = hex;
    document.getElementById(`${prefix}-hex`).innerText = hex;
    document.getElementById(`${prefix}-rgb`).innerText = rgbStr;
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function drawLandmarks(landmarks, ctx) {
    // Draw face mesh for visual feedback (subtle white dots)
    const w = outputCanvas.width;
    const h = outputCanvas.height;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    // Draw subset of landmarks to reduce clutter (every 5th point)
    for (let i = 0; i < landmarks.length; i += 5) {
        const point = landmarks[i];
        ctx.beginPath();
        ctx.arc(point.x * w, point.y * h, 1.5, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function drawPoseLandmarks(landmarks, ctx) {
    const w = outputCanvas.width;
    const h = outputCanvas.height;
    
    ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 2;

    // Draw connections (simplified)
    const connections = PoseLandmarker.POSE_CONNECTIONS;
    if (connections) {
        for (const conn of connections) {
            const start = landmarks[conn.start];
            const end = landmarks[conn.end];
            ctx.beginPath();
            ctx.moveTo(start.x * w, start.y * h);
            ctx.lineTo(end.x * w, end.y * h);
            ctx.stroke();
        }
    }

    for (const point of landmarks) {
        ctx.beginPath();
        ctx.arc(point.x * w, point.y * h, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function displayDiagnosisResult(diagnosis) {
    const { season, seasonInfo, analysis } = diagnosis;
    
    // 診断結果カードを表示
    const diagnosisCard = document.getElementById('diagnosis-card');
    if (diagnosisCard) {
        diagnosisCard.classList.remove('hidden');
        
        // シーズン名
        document.getElementById('season-name').innerText = seasonInfo.name;
        document.getElementById('season-name-en').innerText = seasonInfo.nameEn;
        
        // 説明
        document.getElementById('season-description').innerText = seasonInfo.description;
        
        // 特徴リスト
        const characteristicsList = document.getElementById('characteristics-list');
        characteristicsList.innerHTML = '';
        seasonInfo.characteristics.forEach(char => {
            const li = document.createElement('li');
            li.className = 'text-sm text-slate-600';
            li.innerText = char;
            characteristicsList.appendChild(li);
        });
        
        // おすすめの色
        document.getElementById('recommendations').innerText = seasonInfo.recommendations;
        
        // 避けたい色
        document.getElementById('avoid-colors').innerText = seasonInfo.avoid;
        
        // カラーパレット
        const paletteContainer = document.getElementById('color-palette');
        paletteContainer.innerHTML = '';
        seasonInfo.colors.forEach(color => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'w-12 h-12 rounded-lg shadow-sm';
            colorDiv.style.backgroundColor = color;
            paletteContainer.appendChild(colorDiv);
        });
        
        // 分析データ
        document.getElementById('analysis-tone').innerText = 
            analysis.skinTone === 'warm' ? 'ウォームトーン（イエベ）' : 'クールトーン（ブルベ）';
        document.getElementById('analysis-brightness').innerText = 
            analysis.brightness === 'bright' ? '明るめ' : '深め';
        document.getElementById('analysis-saturation').innerText = 
            analysis.saturation === 'vivid' ? '鮮やか' : 'ソフト';
        document.getElementById('analysis-contrast').innerText = 
            analysis.contrast === 'high' ? '高コントラスト' : '低コントラスト';
        
        // エクスポートセクションを表示（PDF機能は一時無効化）
        // document.getElementById('export-section').classList.remove('hidden');
        
        // オリジナル画像での試着ボタンイベント設定
        const originalFashionBtn = document.getElementById('try-fashion-original-btn');
        if (originalFashionBtn) {
            // クローンしてリスナー重複防止
            const newBtn = originalFashionBtn.cloneNode(true);
            originalFashionBtn.parentNode.replaceChild(newBtn, originalFashionBtn);
            
            newBtn.addEventListener('click', () => {
                selectForFashion(null, 'original');
            });
        }
    }
}

// AI ヘアカラーシミュレーション機能を初期化
function initHairSimulation(season) {
    const hairSimCard = document.getElementById('hair-simulation-card');
    hairSimCard.classList.remove('hidden');
    
    // カスタムカラーカードも表示
    const customColorCard = document.getElementById('custom-color-card');
    if (customColorCard) customColorCard.classList.remove('hidden');

    // カスタムカラーシミュレーションを初期化
    initCustomColorSimulation();
    
    // 生成ボタンのイベント（一度だけ登録）
    const generateBtn = document.getElementById('generate-hair-colors-btn');
    const newGenerateBtn = generateBtn.cloneNode(true);
    generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);
    
    newGenerateBtn.addEventListener('click', async () => {
        // パスワードを取得（都度入力フィールドから）
        const passwordInput = document.getElementById('ai-password-input');
        const password = passwordInput ? passwordInput.value.trim() : '';
        
        // 以前の明示的なverifyPassword呼び出しを削除し、
        // 1枚目の生成結果（認証成否）を後続に適用するフローへ変更
        
        await generateThreeHairColors(season, password);
    });
}

// Canvas編集で 3パターンのヘアカラーを生成
async function generateThreeHairColors(season, password = '') {
    if (!originalCanvas || !currentLandmarks || !currentHairColor) return;
    
    // UIの準備
    document.getElementById('generate-hair-colors-btn').classList.add('hidden');
    document.getElementById('generating-status').classList.remove('hidden');
    document.getElementById('hair-results-card').classList.add('hidden');
    
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('generation-progress');
    
    aiGeneratedImages = [];
    
    // AIを使用するかどうか判定
    let useAI = (password && password.trim() !== '');

    try {
        // シーズンに合わせた3つのカラーを取得
        const recommendedColors = getThreeRecommendedColors(season);
        
        // 各カラーを順番に生成
        for (let i = 0; i < recommendedColors.length; i++) {
            const colorInfo = recommendedColors[i];
            
            // 進捗表示を更新
            progressText.innerText = `パターン ${i + 1}/3 を作成中: ${colorInfo.name} ${useAI ? '(AI生成中...)' : ''}`;
            progressBar.style.width = `${((i) / 3) * 100}%`;
            
            try {
                // 短い待機時間を入れてUIを更新
                await new Promise(resolve => setTimeout(resolve, 100));
                
                let resultCanvas;
                let imageUrl = null;
                let errorMessage = null;

                if (useAI) {
                    try {
                        // AI生成を試みる
                        const imageBase64 = await canvasToBase64(originalCanvas);
                        imageUrl = await changeHairColorWithAI(imageBase64, colorInfo.color, colorInfo.description, password);
                        resultCanvas = await loadImageToCanvas(imageUrl);
                    } catch (aiError) {
                        console.error(`AI generation failed for ${colorInfo.name}:`, aiError);
                        
                        // エラーハンドリングの改善:
                        // 1枚目でAI関連の致命的なエラーが出た場合、ユーザー体験を損なわないよう
                        // 2枚目以降は自動的に簡易モードにフォールバックする
                        if (i === 0) {
                             alert(`AI生成エラー: ${aiError.message}\n\n以降のパターンは簡易モード（ブラウザ描画）で生成します。`);
                             useAI = false; // フラグをオフにする
                        }
                        
                        console.log("Falling back to canvas implementation due to AI error.");
                        const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
                        resultCanvas = applyHairColor(originalCanvas, maskCanvas, colorInfo.color);
                        imageUrl = null; 
                    }
                } else {
                    // 通常のCanvas処理
                    const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
                    resultCanvas = applyHairColor(originalCanvas, maskCanvas, colorInfo.color);
                }
                
                const generatedItem = {
                    canvas: resultCanvas,
                    colorInfo: colorInfo,
                    imageUrl: imageUrl,
                    timestamp: Date.now(),
                    type: 'recommended'
                };
                
                aiGeneratedImages.push(generatedItem);
                allGeneratedImages.push(generatedItem); // 全体の履歴にも追加
                
                // 進捗バーを更新
                progressBar.style.width = `${((i + 1) / 3) * 100}%`;
                
            } catch (error) {
                console.error(`Failed to generate pattern ${i + 1}:`, error);
                
                // パスワードエラーの場合は明確にユーザーに伝える
                let displayError = error.message;
                
                const errorItem = {
                    canvas: null,
                    colorInfo: colorInfo,
                    error: displayError,
                    timestamp: Date.now(),
                    type: 'recommended'
                };
                
                aiGeneratedImages.push(errorItem);
                allGeneratedImages.push(errorItem); // エラーも記録
            }
        }
        
        // 完了
        progressText.innerText = '作成完了！';
        
        // 結果を表示
        setTimeout(() => {
            displayHairColorResults();
            document.getElementById('generating-status').classList.add('hidden');
            document.getElementById('hair-results-card').classList.remove('hidden');
        }, 500);
        
    } catch (error) {
        console.error('Hair color generation failed:', error);
        alert('ヘアカラー作成に失敗しました。もう一度お試しください。');
        document.getElementById('generating-status').classList.add('hidden');
        document.getElementById('generate-hair-colors-btn').classList.remove('hidden');
    }
}

// 生成結果を表示
function displayHairColorResults() {
    const container = document.getElementById('results-grid-container');
    container.innerHTML = '';
    
    aiGeneratedImages.forEach((result, index) => {
        const resultCard = document.createElement('div');
        resultCard.className = 'bg-slate-50 rounded-xl p-4 space-y-3';
        
        if (result.error) {
            // エラーの場合
            resultCard.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center" style="background-color: ${result.colorInfo.color}">
                        <span class="material-icons text-white">error</span>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-semibold text-slate-800">${result.colorInfo.name}</h4>
                        <p class="text-xs text-red-500">${result.error}</p>
                    </div>
                </div>
            `;
        } else {
            // 成功の場合
            const tempCanvas = result.canvas;
            const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
            const isAI = !!result.imageUrl;
            
            resultCard.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <div class="w-8 h-8 rounded-full border-2 border-white shadow" style="background-color: ${result.colorInfo.color}"></div>
                        <h4 class="font-semibold text-slate-800">
                            ${result.colorInfo.name}
                            ${isAI ? '<span class="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">AI生成</span>' : ''}
                        </h4>
                    </div>
                    <div class="flex space-x-2">
                        <button class="view-result-btn text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center" data-index="${index}">
                            <span class="material-icons text-sm mr-1">visibility</span>
                            表示
                        </button>
                        <button class="select-fashion-btn text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded font-medium flex items-center" data-index="${index}" data-type="recommended">
                            <span class="material-icons text-sm mr-1">checkroom</span>
                            試着
                        </button>
                    </div>
                </div>
                <div class="relative rounded-lg overflow-hidden shadow-md cursor-pointer hover:shadow-lg transition-all" data-index="${index}">
                    <img src="${imageDataUrl}" alt="${result.colorInfo.name}" class="w-full h-auto">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-all flex items-end p-3">
                        <p class="text-white text-xs font-medium">クリックして拡大表示</p>
                    </div>
                </div>
            `;
        }
        
        container.appendChild(resultCard);
    });
    
    // 表示ボタンとサムネイルクリックのイベント
    container.querySelectorAll('[data-index]').forEach(element => {
        // Only bind if it's the view button or the image container (not select button)
        if (!element.classList.contains('select-fashion-btn')) {
             element.addEventListener('click', (e) => {
                 // If clicking the select button inside, don't trigger view
                 if (e.target.closest('.select-fashion-btn')) return;
                 const index = parseInt(e.currentTarget.getAttribute('data-index'));
                 displayResultOnMainCanvas(index);
            });
        }
    });

    // ファッション試着ボタンのイベント
    container.querySelectorAll('.select-fashion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 親要素のクリックイベントを停止
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            selectForFashion(index, 'recommended');
        });
    });
}

// インラインプレビューに結果を表示
function displayResultOnMainCanvas(index) {
    const result = aiGeneratedImages[index];
    if (!result || !result.canvas) return;
    
    currentSelectedIndex = index;
    
    // インラインプレビューコンテナを表示
    const inlinePreviewContainer = document.getElementById('inline-preview-container');
    inlinePreviewContainer.classList.remove('hidden');
    
    // インラインCanvasを初期化
    inlineCanvas = document.getElementById('inline-canvas');
    inlineCanvas.width = result.canvas.width;
    inlineCanvas.height = result.canvas.height;
    
    const inlineCtx = inlineCanvas.getContext('2d');
    
    // After画像として保存
    afterCanvas = document.createElement('canvas');
    afterCanvas.width = result.canvas.width;
    afterCanvas.height = result.canvas.height;
    afterCanvas.getContext('2d').drawImage(result.canvas, 0, 0);
    
    // 初期表示はAfter
    inlineCtx.drawImage(afterCanvas, 0, 0);
    
    // Before/Afterトグルを表示
    document.getElementById('before-after-toggle').classList.remove('hidden');
    
    // カラー名を表示
    document.getElementById('current-color-name').innerText = result.colorInfo.name;
    
    // インライン試着ボタンのイベント設定
    const inlineFashionBtn = document.getElementById('try-fashion-inline-btn');
    if (inlineFashionBtn) {
        // クローンしてリスナー重複防止
        const newBtn = inlineFashionBtn.cloneNode(true);
        inlineFashionBtn.parentNode.replaceChild(newBtn, inlineFashionBtn);
        
        newBtn.addEventListener('click', () => {
            selectForFashion(currentSelectedIndex, 'inline');
        });
    }
    
    // Afterボタンを選択状態に
    document.getElementById('show-before-btn').className = 'flex-1 px-4 py-2 text-sm font-medium bg-white text-slate-700 rounded-lg border-2 border-slate-300 hover:bg-slate-50 transition-all';
    document.getElementById('show-after-btn').className = 'flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-md transition-all';
    
    // スムーズにスクロール（インラインプレビューが見える位置へ）
    inlinePreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ヘアカラーを適用
function applyHairColorToCanvas(color) {
    if (!currentLandmarks || !originalCanvas || !currentHairColor) return;
    
    // 精密なマスクを作成
    const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
    
    // 色を適用
    const resultCanvas = applyHairColor(originalCanvas, maskCanvas, color);
    
    // After画像として保存
    afterCanvas = document.createElement('canvas');
    afterCanvas.width = resultCanvas.width;
    afterCanvas.height = resultCanvas.height;
    afterCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);
    
    // canvasに描画
    ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    ctx.drawImage(resultCanvas, 0, 0);
    
    // ランドマークを再描画
    drawLandmarks(currentLandmarks, ctx);
    
    // Before/Afterトグルを表示
    document.getElementById('before-after-toggle').classList.remove('hidden');
}

// ヘアカラーをリセット
function resetHairColor() {
    if (!originalCanvas) return;
    
    ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    ctx.drawImage(originalCanvas, 0, 0);
    
    // ランドマークを再描画
    if (currentLandmarks) {
        drawLandmarks(currentLandmarks, ctx);
    }
    
    // After画像をクリア
    afterCanvas = null;
    
    // Before/Afterトグルを非表示
    document.getElementById('before-after-toggle').classList.add('hidden');
}

// Before/After切り替え（インラインプレビューで表示）
document.getElementById('show-before-btn').addEventListener('click', () => {
    if (beforeCanvas && inlineCanvas) {
        const inlineCtx = inlineCanvas.getContext('2d');
        inlineCtx.clearRect(0, 0, inlineCanvas.width, inlineCanvas.height);
        inlineCtx.drawImage(beforeCanvas, 0, 0, inlineCanvas.width, inlineCanvas.height);
        
        // ボタンの状態を更新
        document.getElementById('show-before-btn').className = 'flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-md transition-all';
        document.getElementById('show-after-btn').className = 'flex-1 px-4 py-2 text-sm font-medium bg-white text-slate-700 rounded-lg border-2 border-slate-300 hover:bg-slate-50 transition-all';
    }
});

document.getElementById('show-after-btn').addEventListener('click', () => {
    if (afterCanvas && inlineCanvas) {
        const inlineCtx = inlineCanvas.getContext('2d');
        inlineCtx.clearRect(0, 0, inlineCanvas.width, inlineCanvas.height);
        inlineCtx.drawImage(afterCanvas, 0, 0, inlineCanvas.width, inlineCanvas.height);
        
        // ボタンの状態を更新
        document.getElementById('show-before-btn').className = 'flex-1 px-4 py-2 text-sm font-medium bg-white text-slate-700 rounded-lg border-2 border-slate-300 hover:bg-slate-50 transition-all';
        document.getElementById('show-after-btn').className = 'flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-md transition-all';
    }
});

// カスタムカラーシミュレーションの初期化
function initCustomColorSimulation() {
    const toneBtns = document.querySelectorAll('.custom-tone-btn');
    const variationsContainer = document.getElementById('tone-variations');
    const variationButtonsContainer = document.getElementById('variation-buttons');
    
    // カテゴリボタンのイベント
    toneBtns.forEach(btn => {
        // 重複登録防止のため、一旦クローンして置換
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            // アクティブ状態の切り替え
            document.querySelectorAll('.custom-tone-btn').forEach(b => {
                b.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2');
            });
            newBtn.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2');
            
            const tone = newBtn.getAttribute('data-tone');
            showToneVariations(tone);
        });
    });
    
    function showToneVariations(tone) {
        variationsContainer.classList.remove('hidden');
        variationButtonsContainer.innerHTML = '';
        
        const colors = CUSTOM_COLOR_PALETTES[tone] || [];
        
        colors.forEach(colorInfo => {
            const btn = document.createElement('button');
            btn.className = 'flex flex-col items-center justify-center p-2 rounded-lg hover:bg-slate-100 transition-all min-w-[80px]';
            btn.innerHTML = `
                <div class="w-10 h-10 rounded-full shadow-sm mb-1 border border-slate-200" style="background-color: ${colorInfo.color}"></div>
                <span class="text-xs font-medium text-slate-700">${colorInfo.name}</span>
            `;
            
            btn.addEventListener('click', () => {
                generateCustomColor(colorInfo);
            });
            
            variationButtonsContainer.appendChild(btn);
        });
    }
}

// カスタムカラー生成実行
async function generateCustomColor(colorInfo) {
    if (!originalCanvas || !currentLandmarks || !currentHairColor) return;
    
    const container = document.getElementById('custom-result-container');
    const loading = document.getElementById('custom-loading');
    const canvas = document.getElementById('custom-output-canvas');
    const label = document.getElementById('custom-color-label');
    
    container.classList.remove('hidden');
    loading.classList.remove('hidden');
    
    // スクロールして結果を表示
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // パスワードを取得
    const passwordInput = document.getElementById('ai-password-input');
    const password = passwordInput ? passwordInput.value.trim() : '';
    const useAI = (password && password.trim() !== '');
    
    try {
        let resultCanvas;
        
        if (useAI) {
            try {
                // AI生成
                const imageBase64 = await canvasToBase64(originalCanvas);
                // カスタムカラーの場合は、colorInfo.color と colorInfo.description を使用
                const imageUrl = await changeHairColorWithAI(imageBase64, colorInfo.color, colorInfo.description, password);
                resultCanvas = await loadImageToCanvas(imageUrl);
            } catch (aiError) {
                console.error("Custom AI generation failed:", aiError);
                alert(`AI生成エラー: ${aiError.message}\n\n簡易モードで生成します。`);
                
                // フォールバック
                const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
                resultCanvas = applyHairColor(originalCanvas, maskCanvas, colorInfo.color);
            }
        } else {
            // Canvas生成
            const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
            resultCanvas = applyHairColor(originalCanvas, maskCanvas, colorInfo.color);
        }
        
        // キャンバスに描画
        canvas.width = resultCanvas.width;
        canvas.height = resultCanvas.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(resultCanvas, 0, 0);
        
        // ラベル更新
        label.innerText = `${colorInfo.name} ${useAI ? '(AI Generated)' : ''}`;
        
        // 全体の履歴に追加
        const customItem = {
            canvas: resultCanvas,
            colorInfo: colorInfo,
            imageUrl: null,
            timestamp: Date.now(),
            type: 'custom'
        };
        allGeneratedImages.push(customItem);
        
        // ギャラリーを更新
        updateImageGallery();
        
    } catch (error) {
        console.error("Custom generation failed:", error);
        alert("画像の生成に失敗しました。");
    } finally {
        loading.classList.add('hidden');
    }
}

// 生成画像ギャラリーの更新・表示
function updateImageGallery() {
    // ギャラリーセクションがなければ作成
    let gallerySection = document.getElementById('image-gallery-section');
    
    if (!gallerySection) {
        // カスタムカラーカードの後に挿入
        const customColorCard = document.getElementById('custom-color-card');
        gallerySection = document.createElement('div');
        gallerySection.id = 'image-gallery-section';
        gallerySection.className = 'bg-white rounded-2xl p-8 shadow-xl border border-slate-100 hidden';
        gallerySection.innerHTML = `
            <div class="space-y-6">
                <div class="text-center">
                    <h3 class="text-xl font-bold text-slate-900 flex items-center justify-center mb-2">
                        <span class="material-icons text-purple-500 mr-2">photo_library</span>
                        生成した画像一覧
                    </h3>
                    <p class="text-sm text-slate-500">
                        これまでに生成したすべての画像を確認できます。
                    </p>
                </div>
                <div id="gallery-grid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <!-- 動的に生成 -->
                </div>
            </div>
        `;
        customColorCard.parentNode.insertBefore(gallerySection, customColorCard.nextSibling);
    }
    
    // 画像が1つ以上あれば表示
    if (allGeneratedImages.length > 0) {
        gallerySection.classList.remove('hidden');
        
        const galleryGrid = document.getElementById('gallery-grid');
        galleryGrid.innerHTML = '';
        
        // 新しい順に表示
        const sortedImages = [...allGeneratedImages].reverse();
        
        sortedImages.forEach((item, index) => {
            if (!item.canvas) return; // エラーのものはスキップ
            
            const imageDataUrl = item.canvas.toDataURL('image/jpeg', 0.8);
            const typeLabel = item.type === 'recommended' ? 'おすすめ' : 'カスタム';
            
            const imgCard = document.createElement('div');
            imgCard.className = 'relative group cursor-pointer rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all';
            imgCard.innerHTML = `
                <img src="${imageDataUrl}" alt="${item.colorInfo.name}" class="w-full h-auto">
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-3">
                    <p class="text-white font-bold text-sm">${item.colorInfo.name}</p>
                    <p class="text-white/80 text-xs">${typeLabel}</p>
                </div>
                <div class="absolute top-2 right-2 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all">
                    <span class="material-icons text-purple-600 text-sm">zoom_in</span>
                </div>
            `;
            
            // クリックで拡大表示
            imgCard.addEventListener('click', (e) => {
                 // Check if click target is the select button
                 if (e.target.closest('.select-gallery-fashion-btn')) {
                     // Handled by the button listener
                     return;
                 }
                showImageModal(imageDataUrl, item.colorInfo.name, typeLabel);
            });
            
            // Add fashion select button to gallery item
            const actionDiv = document.createElement('div');
            actionDiv.className = 'absolute top-2 left-2 z-10';
            actionDiv.innerHTML = `
                <button class="select-gallery-fashion-btn bg-white/90 hover:bg-white text-indigo-600 p-1.5 rounded-full shadow-md transition-all flex items-center justify-center" title="この髪色で服を試着">
                    <span class="material-icons text-sm">checkroom</span>
                </button>
            `;
            
            // Re-structure to allow button click
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'relative group cursor-pointer rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-all';
            
            // Original Inner HTML minus the wrapper div
            imgWrapper.innerHTML = `
                <img src="${imageDataUrl}" alt="${item.colorInfo.name}" class="w-full h-auto">
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-3">
                    <p class="text-white font-bold text-sm">${item.colorInfo.name}</p>
                    <p class="text-white/80 text-xs">${typeLabel}</p>
                </div>
                <div class="absolute top-2 right-2 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all">
                    <span class="material-icons text-purple-600 text-sm">zoom_in</span>
                </div>
            `;
            imgWrapper.appendChild(actionDiv);
            
             // Re-attach click listener
            imgWrapper.addEventListener('click', (e) => {
                if (e.target.closest('.select-gallery-fashion-btn')) {
                     // Calculate actual index in allGeneratedImages (reversed in UI)
                     const actualIndex = allGeneratedImages.length - 1 - index;
                     selectForFashion(actualIndex, 'all');
                     return;
                }
                showImageModal(imageDataUrl, item.colorInfo.name, typeLabel);
            });
            
            galleryGrid.appendChild(imgWrapper);
        });
    }
}

// 画像モーダル表示
function showImageModal(imageUrl, title, subtitle) {
    // モーダルがなければ作成
    let modal = document.getElementById('image-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.className = 'fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 hidden';
        modal.innerHTML = `
            <div class="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl">
                <button id="close-modal-btn" class="absolute top-4 right-4 bg-white/90 hover:bg-white text-slate-700 p-2 rounded-full shadow-md transition-colors z-10">
                    <span class="material-icons">close</span>
                </button>
                <div class="p-6">
                    <h3 id="modal-title" class="text-xl font-bold text-slate-900 mb-2"></h3>
                    <p id="modal-subtitle" class="text-sm text-slate-500 mb-4"></p>
                    <img id="modal-image" src="" alt="" class="w-full h-auto rounded-lg">
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 閉じるボタン
        document.getElementById('close-modal-btn').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        // 背景クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
    
    // モーダルに画像を設定して表示
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-subtitle').innerText = subtitle;
    document.getElementById('modal-image').src = imageUrl;
    modal.classList.remove('hidden');
}

// ファッションシミュレーション機能
async function selectForFashion(index, type) {
    let item;
    let canvas;
    let hairInfo;

    if (type === 'original') {
        // オリジナル画像を使用
        if (!originalCanvas) {
            alert("画像が読み込まれていません。");
            return;
        }
        canvas = originalCanvas;
        hairInfo = { name: '現在の髪色', color: '#333333' }; // デフォルト値
        
        // 解析済みの髪色があればそれを使う
        if (currentHairColor) {
            hairInfo.color = `rgb(${currentHairColor.r}, ${currentHairColor.g}, ${currentHairColor.b})`;
        }
    } else if (type === 'recommended') {
        item = aiGeneratedImages[index];
        canvas = item?.canvas;
        hairInfo = item?.colorInfo;
    } else if (type === 'all') {
        item = allGeneratedImages[index];
        canvas = item?.canvas;
        hairInfo = item?.colorInfo;
    } else if (type === 'inline') {
        // インラインプレビューの現在の状態を使用
        // before/afterのどちらが表示されているか確認する必要があるが、
        // 簡易的に afterCanvas (シミュレーション結果) があればそれを、なければ originalCanvas を使う
        // しかし、インラインプレビューは aiGeneratedImages の結果を表示しているはず。
        
        // currentSelectedIndex を使用
        if (currentSelectedIndex >= 0 && aiGeneratedImages[currentSelectedIndex]) {
            item = aiGeneratedImages[currentSelectedIndex];
            canvas = item.canvas;
            hairInfo = item.colorInfo;
        } else {
            // フォールバック
            canvas = afterCanvas || originalCanvas;
            hairInfo = { name: document.getElementById('current-color-name').innerText || '現在の髪色' };
        }
    }
    
    if (!canvas) return;
    
    // ベース画像を保存
    const base64 = await canvasToBase64(canvas);
    selectedFashionBaseImage = base64;
    selectedFashionHairInfo = hairInfo || { name: '選択した髪色' };
    
    // UI更新
    const baseImageEl = document.getElementById('fashion-base-image');
    baseImageEl.src = canvas.toDataURL('image/jpeg', 0.8);
    baseImageEl.classList.remove('hidden');
    document.getElementById('fashion-output-canvas').classList.add('hidden');
    document.getElementById('fashion-placeholder').classList.add('hidden');
    document.getElementById('fashion-label-container').classList.remove('hidden');
    
    const styleLabel = document.getElementById('fashion-current-style');
    styleLabel.innerText = `現在のスタイル: ${selectedFashionHairInfo.name}`;
    
    // おすすめカラーを更新
    updateFashionRecommendations();
    
    // セクションを表示してスクロール
    const fashionSection = document.getElementById('fashion-simulation-section');
    fashionSection.classList.remove('hidden');
    
    // スクロール処理（少し遅延させてUIレンダリングを待つ）
    setTimeout(() => {
        fashionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    // Customボタンを有効化
    const customBtn = document.getElementById('fashion-generate-btn');
    customBtn.disabled = false;
    customBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function updateFashionRecommendations() {
    const container = document.getElementById('fashion-recommended-palette');
    container.innerHTML = '';
    
    if (!currentDiagnosis) return;
    
    const season = currentDiagnosis.season;
    const colors = getRecommendedFashionColors(season);
    
    colors.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'flex flex-col items-center p-3 rounded-lg border border-slate-200 hover:bg-slate-50 hover:shadow-md transition-all group';
        btn.innerHTML = `
            <div class="w-12 h-12 rounded-full shadow-sm mb-2 border border-slate-100" style="background-color: ${color.hex}"></div>
            <span class="text-xs font-medium text-slate-700 text-center">${color.name}</span>
        `;
        
        btn.addEventListener('click', () => {
            generateFashion(color.name);
        });
        
        container.appendChild(btn);
    });
}

function getRecommendedFashionColors(season) {
    // シーズンごとのファッションカラー
    const palettes = {
        'spring': [
            { name: 'Cream Yellow', hex: '#FFFDD0' },
            { name: 'Coral Pink', hex: '#FF7F50' },
            { name: 'Light Green', hex: '#90EE90' },
            { name: 'Beige', hex: '#F5F5DC' },
            { name: 'Aqua', hex: '#00FFFF' },
            { name: 'Orange', hex: '#FFA500' }
        ],
        'summer': [
            { name: 'Powder Blue', hex: '#B0E0E6' },
            { name: 'Lavender', hex: '#E6E6FA' },
            { name: 'Off White', hex: '#FAF0E6' },
            { name: 'Rose Pink', hex: '#FF66CC' },
            { name: 'Mint Green', hex: '#98FF98' },
            { name: 'Grey', hex: '#808080' }
        ],
        'autumn': [
            { name: 'Terracotta', hex: '#E2725B' },
            { name: 'Khaki', hex: '#F0E68C' },
            { name: 'Mustard', hex: '#FFDB58' },
            { name: 'Dark Brown', hex: '#654321' },
            { name: 'Olive', hex: '#808000' },
            { name: 'Teal', hex: '#008080' }
        ],
        'winter': [
            { name: 'Royal Blue', hex: '#4169E1' },
            { name: 'Pure White', hex: '#FFFFFF' },
            { name: 'Black', hex: '#000000' },
            { name: 'Magenta', hex: '#FF00FF' },
            { name: 'Emerald', hex: '#50C878' },
            { name: 'Icy Lemon', hex: '#FFFACD' }
        ]
    };
    
    return palettes[season] || palettes['spring'];
}

async function generateFashion(colorName) {
    if (!selectedFashionBaseImage) {
        alert("まずは髪色シミュレーション画像を選択してください。");
        return;
    }
    
    // パスワードチェック
    const passwordInput = document.getElementById('ai-password-input');
    const password = passwordInput ? passwordInput.value.trim() : '';
    
    if (!password) {
        alert("ファッションコーディネート機能は高精度AIを使用するため、パスワードが必要です。\n「ヘアカラーシミュレーション」セクションでパスワードを入力してください。");
        return;
    }
    
    // UI Loading
    const loadingOverlay = document.getElementById('fashion-loading-overlay');
    loadingOverlay.classList.remove('hidden');
    
    try {
        const imageUrl = await changeFashionWithAI(selectedFashionBaseImage, colorName, password);
        const resultCanvas = await loadImageToCanvas(imageUrl);
        
        // 結果を表示
        const outputCanvas = document.getElementById('fashion-output-canvas');
        outputCanvas.width = resultCanvas.width;
        outputCanvas.height = resultCanvas.height;
        const ctx = outputCanvas.getContext('2d');
        ctx.drawImage(resultCanvas, 0, 0);
        
        document.getElementById('fashion-base-image').classList.add('hidden');
        outputCanvas.classList.remove('hidden');
        
        // ラベル更新
        const styleLabel = document.getElementById('fashion-current-style');
        styleLabel.innerText = `Coordinate: ${selectedFashionHairInfo.name} Hair × ${colorName} Outfit`;
        
    } catch (error) {
        console.error("Fashion generation failed:", error);
        alert(`生成エラー: ${error.message}`);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// Custom Fashion Color Event
document.getElementById('fashion-generate-btn').addEventListener('click', () => {
    const textInput = document.getElementById('fashion-custom-color-text');
    const pickerInput = document.getElementById('fashion-custom-color-picker');
    
    let color = textInput.value.trim();
    if (!color) {
        // カラーピッカーの色を使用する場合、hexコードより色名の方がAIには伝わりやすいが、
        // hexコードも一応送れる。しかしGeminiは色名推奨。
        // ここでは単純にhexを送る
        color = pickerInput.value;
    }
    
    generateFashion(color);
});

// Sync picker to text (optional)
document.getElementById('fashion-custom-color-picker').addEventListener('change', (e) => {
    // document.getElementById('fashion-custom-color-text').value = e.target.value; 
    // HEXコードを入れるとユーザーが混乱するかもしれないので、入れないでおく
});
