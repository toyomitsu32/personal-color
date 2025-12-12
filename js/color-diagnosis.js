/**
 * パーソナルカラー診断ロジック
 * 髪・目・肌・唇の色情報から春夏秋冬のタイプを判定
 */

/**
 * RGBをHSL（色相・彩度・明度）に変換
 */
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

/**
 * 色の明度を判定
 */
function getBrightness(rgb) {
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

/**
 * 色の彩度（鮮やかさ）を判定
 */
function getSaturation(rgb) {
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const diff = max - min;
    return max === 0 ? 0 : (diff / max) * 100;
}

/**
 * 色のウォームトーン/クールトーンを判定（一般用）
 * @returns {string} 'warm' or 'cool'
 */
function getTone(rgb) {
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hue = hsl.h;

    // 黄色・オレンジ・赤系 = ウォーム (0-60度, 300-360度)
    // 青・緑系 = クール (60-300度)
    // ただし、赤(0付近)の中でも紫寄りはクール、オレンジ寄りはウォーム
    if ((hue >= 350 || hue <= 50)) { // 赤〜オレンジ
        return 'warm';
    } else if (hue > 50 && hue < 180) { // 黄色〜緑
        return 'warm'; 
    } else {
        return 'cool';
    }
}

/**
 * 肌色のトーン判定（日本人向け調整）
 */
function getSkinTone(rgb) {
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const h = hsl.h;
    
    // 日本人の肌：概ね Hue 10〜30度付近に分布
    // 18度未満（赤み/ピンク寄り）→ Cool (Blue Base)
    // 18度以上（黄み/オレンジ寄り）→ Warm (Yellow Base)
    // ※照明条件によって変動するため、極端な値は補正が必要だが、簡易的に閾値を設定
    if (h < 18 || h > 340) {
        return 'cool';
    } else {
        return 'warm';
    }
}

/**
 * パーソナルカラー診断のメイン関数
 * @param {Object} colors - {hair, eye, skin, lip} の各色情報（RGB）
 * @returns {Object} 診断結果
 */
export function diagnosePersonalColor(colors) {
    const { hair, eye, skin, lip } = colors;

    // 各パーツの分析
    const hairHsl = rgbToHsl(hair.r, hair.g, hair.b);
    const eyeHsl = rgbToHsl(eye.r, eye.g, eye.b);
    const skinHsl = rgbToHsl(skin.r, skin.g, skin.b);
    const lipHsl = rgbToHsl(lip.r, lip.g, lip.b);

    const hairBrightness = getBrightness(hair);
    const skinBrightness = getBrightness(skin);
    const eyeBrightness = getBrightness(eye); // 瞳の明るさを追加
    
    const hairSaturation = getSaturation(hair);
    const lipSaturation = getSaturation(lip);
    const skinSaturation = getSaturation(skin);

    // トーン判定
    const skinBase = getSkinTone(skin);
    const lipBase = getTone(lip); // 唇は一般的なトーン判定でOK（青みピンク vs コーラル）

    // スコアリングシステム
    let scores = {
        spring: 0,
        summer: 0,
        autumn: 0,
        winter: 0
    };

    // --- 判定ロジックの改善 ---

    // 1. ベースカラー（肌・唇）
    // 肌がクールなら夏・冬、ウォームなら春・秋に加点
    if (skinBase === 'warm') {
        scores.spring += 3;
        scores.autumn += 3;
    } else {
        scores.summer += 3;
        scores.winter += 3;
    }

    // 唇の色補正
    if (lipBase === 'warm') {
        scores.spring += 1;
        scores.autumn += 1;
    } else {
        scores.summer += 1;
        scores.winter += 1;
    }

    // 2. 明度（Brightness）
    // 瞳が明るい → Spring / Summer
    // 瞳が暗い → Autumn / Winter
    if (eyeBrightness > 40) { // 瞳が茶色っぽく明るい
        scores.spring += 2;
        scores.summer += 2;
    } else { // 瞳が黒く濃い
        scores.autumn += 2;
        scores.winter += 2;
    }

    // 肌の明るさ
    // 明るい肌 → Spring / Summer / Winter（Winterは白肌も多い）
    // 落ち着いた肌 → Autumn
    if (skinBrightness > 140) { // 閾値を160から140へ緩和
        scores.spring += 1;
        scores.summer += 1;
        scores.winter += 1;
    } else {
        scores.autumn += 2;
    }

    // 髪の明るさ（地毛前提だが、染めている場合もあるので参考程度に）
    if (hairBrightness > 50) {
        scores.spring += 1;
        scores.summer += 1;
    } else {
        scores.autumn += 1;
        scores.winter += 1;
    }

    // 3. 彩度（Saturation）と質感
    // Spring: 高彩度・ツヤ (キラキラ)
    // Summer: 低彩度・ソフト (マット〜セミマット)
    // Autumn: 低〜中彩度・マット (リッチ)
    // Winter: 高彩度・クリア (コントラスト)

    // 肌の彩度が高い（血色が良い、または黄みが強い）
    if (skinSaturation > 25) { 
        scores.spring += 1; 
        scores.autumn += 1;
    } else {
        scores.summer += 1;
        scores.winter += 1;
    }

    // 唇や髪の彩度が高い
    const avgSaturation = (lipSaturation + hairSaturation) / 2;
    if (avgSaturation > 25) {
        scores.spring += 2;
        scores.winter += 2;
    } else {
        scores.summer += 2;
        scores.autumn += 2;
    }

    // 4. コントラスト（髪と肌の明度差）
    const contrast = Math.abs(hairBrightness - skinBrightness);
    if (contrast > 100) { // コントラストが強い
        scores.winter += 3; // Winterの最大特徴
        scores.spring += 1;
    } else { // コントラストが弱い（馴染んでいる）
        scores.summer += 2;
        scores.autumn += 2;
    }

    // --- 最終調整 ---
    // 日本人は黒髪・黒目が多いのでAutumn/Winterになりやすいのを補正
    // Spring要素（明るさ・鮮やかさ）がある場合はSpringを優遇
    if (skinBase === 'warm' && eyeBrightness > 30) {
        scores.spring += 1;
    }
    
    // Summer要素（ブルベ・ソフト）の救済
    if (skinBase === 'cool' && contrast < 100) {
        scores.summer += 1;
    }

    // 最高スコアのシーズンを判定
    const season = Object.keys(scores).reduce((a, b) => 
        scores[a] >= scores[b] ? a : b
    );

    // シーズンの詳細情報
    const seasonInfo = getSeasonInfo(season);

    return {
        season,
        scores,
        seasonInfo,
        analysis: {
            skinTone: skinBase,
            brightness: skinBrightness > 140 ? 'bright' : 'deep',
            saturation: avgSaturation > 25 ? 'vivid' : 'soft',
            contrast: contrast > 100 ? 'high' : 'low',
            skinBrightness,
            hairBrightness,
            eyeBrightness,
            contrast
        }
    };
}

/**
 * 各シーズンの詳細情報を取得
 */
function getSeasonInfo(season) {
    const info = {
        spring: {
            name: 'スプリング（イエベ春）',
            nameEn: 'Spring',
            description: '明るく透明感のある肌で、黄みがかったベースカラー。瞳はキラキラと明るく、全体的に華やかで若々しい印象です。',
            characteristics: [
                '肌：明るくツヤのある黄み肌',
                '瞳：明るいブラウン、キャラメル色',
                '髪：明るいブラウン、栗色',
                '雰囲気：華やか、フレッシュ、元気'
            ],
            colors: ['#FFD700', '#FF6B9D', '#87CEEB', '#98FB98', '#FFA07A', '#FFE4B5'],
            recommendations: '明るく鮮やかな色が似合います。コーラルピンク、ピーチ、アイボリー、ターコイズなど。',
            avoid: '暗い色、青みの強い色、グレーなどのくすんだ色は避けましょう。'
        },
        summer: {
            name: 'サマー（ブルベ夏）',
            nameEn: 'Summer',
            description: '青みがかった透明感のある肌で、柔らかく上品な印象。瞳は優しいグレーがかったブラウンやブラック。全体的にエレガントで涼やかです。',
            characteristics: [
                '肌：明るく透明感のある青み肌',
                '瞳：ソフトなブラウン、グレーがかった黒',
                '髪：ソフトな黒髪、グレーがかったブラウン',
                '雰囲気：優雅、上品、涼やか'
            ],
            colors: ['#E6E6FA', '#B0C4DE', '#DDA0DD', '#F0E68C', '#87CEEB', '#FFB6C1'],
            recommendations: '柔らかく淡い色が似合います。ラベンダー、ローズピンク、ミントブルー、ベビーピンクなど。',
            avoid: '濃い色、黄みの強い色、オレンジや茶色は避けましょう。'
        },
        autumn: {
            name: 'オータム（イエベ秋）',
            nameEn: 'Autumn',
            description: '黄みがかったマットな質感の肌で、深みのある落ち着いた印象。瞳は深いブラウンやゴールド系。全体的にシックで大人っぽい雰囲気です。',
            characteristics: [
                '肌：マットな質感の黄み肌、オークル系',
                '瞳：深いブラウン、ダークブラウン',
                '髪：ダークブラウン、こげ茶',
                '雰囲気：シック、落ち着き、大人っぽい'
            ],
            colors: ['#8B4513', '#D2691E', '#F4A460', '#BDB76B', '#808000', '#CD853F'],
            recommendations: '深く温かみのある色が似合います。テラコッタ、マスタード、カーキ、ブラウン、ベージュなど。',
            avoid: '明るすぎる色、青みの強い色、パステルカラーは避けましょう。'
        },
        winter: {
            name: 'ウィンター（ブルベ冬）',
            nameEn: 'Winter',
            description: '青みがかったクリアな肌で、白と黒のコントラストがはっきりしている。瞳は黒々としていて、全体的にシャープでクールな印象です。',
            characteristics: [
                '肌：青白い、または健康的な青み肌',
                '瞳：黒、ダークブラウン、コントラスト強',
                '髪：黒髪、ダークな髪色',
                '雰囲気：クール、シャープ、華やか'
            ],
            colors: ['#000000', '#FFFFFF', '#FF1493', '#4169E1', '#9370DB', '#00CED1'],
            recommendations: 'はっきりとした色が似合います。ピュアホワイト、ブラック、ロイヤルブルー、ショッキングピンクなど。',
            avoid: '黄みの強い色、ベージュ、オレンジなどの温かい色は避けましょう。'
        }
    };

    return info[season];
}
