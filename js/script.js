import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";

import { diagnosePersonalColor } from './color-diagnosis.js';
import { createHairMask, applyHairColor, getHairColorPalette } from './hair-simulation.js';
import { createPreciseHairMask, initImageSegmenter } from './hair-segmentation.js';
import { changeHairColorWithAI, getThreeRecommendedColors, loadImageToCanvas, canvasToBase64, verifyPassword } from './ai-hair-color.js';

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
let currentSelectedIndex = -1; // 現在選択されているパターン
let inlineCanvas = null; // インライン表示用のCanvas
let isAnalyzing = false; // 解析中フラグ（重複実行防止）

let faceLandmarker;
let runningMode = "IMAGE";

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
      minFaceDetectionConfidence: 0.6, // 信頼度閾値を上げて誤検出を減らす
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    // Image Segmenterも初期化
    await initImageSegmenter(FilesetResolver);
    
    loadingOverlay.classList.add('hidden');
    console.log("FaceLandmarker initialized");
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
    previewContainer.classList.add('hidden');
    uploadContainer.classList.remove('hidden');
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
    
    if (diagnosisCard) diagnosisCard.classList.add('hidden');
    if (hairSimCard) hairSimCard.classList.add('hidden');
    if (hairResultsCard) hairResultsCard.classList.add('hidden');
    if (beforeAfterToggle) beforeAfterToggle.classList.add('hidden');
    if (inlinePreview) inlinePreview.classList.add('hidden');
    if (floatingActions) floatingActions.classList.add('hidden');
    
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
    currentSelectedIndex = -1;
    inlineCanvas = null;
    
    // スムーズにスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
}



function processFile(file) {
    if (!faceLandmarker) {
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
    // Show loading
    uploadContainer.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    document.getElementById('floating-actions-container').classList.remove('hidden');
    loadingOverlay.classList.remove('hidden'); // Reuse overlay if possible, but it's inside upload container. 
    // Let's just show preview immediately.

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
        
        // Draw landmarks and analyze colors
        if (results.faceLandmarks.length > 0) {
            statusCard.classList.remove('hidden');
            errorCard.classList.add('hidden');
            resultsGrid.classList.remove('hidden');
            
            const landmarks = results.faceLandmarks[0];
            currentLandmarks = landmarks;
            
            analyzeColors(landmarks, ctx);
            drawLandmarks(landmarks, ctx);
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
    
    // Before画像を保存（赤い丸を描画する前に保存）
    beforeCanvas = document.createElement('canvas');
    beforeCanvas.width = outputCanvas.width;
    beforeCanvas.height = outputCanvas.height;
    beforeCanvas.getContext('2d').drawImage(outputCanvas, 0, 0);
    
    // Draw sampling points for visualization（Beforeを保存した後に描画）
    drawPoint(ctx, nose.x * w, nose.y * h, 'skin');
    drawPoint(ctx, leftEye.x * w, leftEye.y * h, 'eye');
    drawPoint(ctx, lip.x * w, lip.y * h, 'lip');
    drawPoint(ctx, hairX, hairY, 'hair');
    
    // 診断結果を表示
    displayDiagnosisResult(diagnosis);
    
    // ヘアカラーシミュレーション機能を有効化
    initHairSimulation(diagnosis.season);
}

function drawPoint(ctx, x, y, type) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
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
    // Optional: Draw face mesh for visual feedback
    // Just drawing a few key points to keep it clean
    const w = outputCanvas.width;
    const h = outputCanvas.height;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (const point of landmarks) {
        ctx.beginPath();
        ctx.arc(point.x * w, point.y * h, 1, 0, 2 * Math.PI);
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
    }
}

// AI ヘアカラーシミュレーション機能を初期化
function initHairSimulation(season) {
    const hairSimCard = document.getElementById('hair-simulation-card');
    hairSimCard.classList.remove('hidden');
    
    // 生成ボタンのイベント（一度だけ登録）
    const generateBtn = document.getElementById('generate-hair-colors-btn');
    const newGenerateBtn = generateBtn.cloneNode(true);
    generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);
    
    newGenerateBtn.addEventListener('click', async () => {
        // パスワードを取得（都度入力フィールドから）
        const passwordInput = document.getElementById('ai-password-input');
        const password = passwordInput ? passwordInput.value.trim() : '';
        
        // パスワードがある場合は先に検証
        if (password) {
            const generateBtn = document.getElementById('generate-hair-colors-btn');
            const originalBtnText = document.getElementById('generate-btn-text').innerText;
            
            // ボタンをローディング状態に
            generateBtn.disabled = true;
            generateBtn.classList.add('opacity-75', 'cursor-not-allowed');
            document.getElementById('generate-btn-text').innerText = 'パスワード確認中...';
            
            const verifyResult = await verifyPassword(password);
            
            // ボタンの状態を戻す
            generateBtn.disabled = false;
            generateBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            document.getElementById('generate-btn-text').innerText = originalBtnText;

            if (!verifyResult.isValid) {
                alert("パスワードが間違っています。\n正しいパスワードを入力するか、空欄のままにして簡易モードを使用してください。");
                return; // 中断
            }

            if (!verifyResult.googleApiConfigured) {
                 alert("パスワードは正しいですが、サーバー側でGoogle APIキーが設定されていません。\n管理者に連絡するか、簡易モード（パスワード空欄）を使用してください。");
                 return; // 中断 or 簡易モードへ誘導?
                 // User likely wants to know status, so alert is good.
                 // If they want to force simple mode, they can clear password.
            }
        }

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
    const useAI = (password && password.trim() !== '');

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
                        // AI失敗時はフォールバックせずにエラーを表示するか、
                        // または「パスワード間違い」などの明確な理由ならそれを表示
                        if (aiError.message.includes("パスワード")) {
                             throw aiError; // パスワードエラーは全体を中断またはユーザーに通知
                        }
                        // その他のエラーならCanvasフォールバックへ（今回は単純化のためフォールバック）
                        // エラーを表示してからフォールバック
                        alert(`AI生成エラー: ${aiError.message}\n簡易モード（ブラウザ描画）で生成します。`);
                        console.log("Falling back to canvas implementation due to AI error.");
                        const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
                        resultCanvas = applyHairColor(originalCanvas, maskCanvas, colorInfo.color);
                        imageUrl = null; 
                        // エラーメッセージは記録せず、Canvas版を表示
                    }
                } else {
                    // 通常のCanvas処理
                    const maskCanvas = createPreciseHairMask(originalCanvas, currentLandmarks, currentHairColor);
                    resultCanvas = applyHairColor(originalCanvas, maskCanvas, colorInfo.color);
                }
                
                aiGeneratedImages.push({
                    canvas: resultCanvas,
                    colorInfo: colorInfo,
                    imageUrl: imageUrl
                });
                
                // 進捗バーを更新
                progressBar.style.width = `${((i + 1) / 3) * 100}%`;
                
            } catch (error) {
                console.error(`Failed to generate pattern ${i + 1}:`, error);
                
                // パスワードエラーの場合は明確にユーザーに伝える
                let displayError = error.message;
                
                aiGeneratedImages.push({
                    canvas: null,
                    colorInfo: colorInfo,
                    error: displayError
                });
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
                    <button class="view-result-btn text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center" data-index="${index}">
                        <span class="material-icons text-sm mr-1">visibility</span>
                        表示
                    </button>
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
        element.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            displayResultOnMainCanvas(index);
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
