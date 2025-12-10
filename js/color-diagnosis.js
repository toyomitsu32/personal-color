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
 * 色のウォームトーン/クールトーンを判定
 * @returns {string} 'warm' or 'cool'
 */
function getTone(rgb) {
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hue = hsl.h;

    // 黄色・オレンジ・赤系 = ウォーム (0-60度, 300-360度)
    // 青・緑系 = クール (60-300度)
    if ((hue >= 0 && hue <= 60) || (hue >= 300 && hue <= 360)) {
        return 'warm';
    } else {
        return 'cool';
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
    
    const hairSaturation = getSaturation(hair);
    const lipSaturation = getSaturation(lip);

    // トーン判定（ウォーム or クール）
    const skinTone = getTone(skin);
    const lipTone = getTone(lip);

    // スコアリングシステム
    let scores = {
        spring: 0,  // 春 (明るい・暖色)
        summer: 0,  // 夏 (明るい・寒色)
        autumn: 0,  // 秋 (暗い・暖色)
        winter: 0   // 冬 (暗い・寒色)
    };

    // 1. ベースカラー（肌・唇のトーン）の判定
    const warmCount = [skinTone, lipTone].filter(t => t === 'warm').length;
    const isWarmBase = warmCount >= 1; // 肌または唇がウォームなら暖色寄り

    // 2. 明度の判定（肌の明るさ）
    const isBrightSkin = skinBrightness > 160; // 明るい肌 = Spring/Summer

    // 3. 彩度の判定（髪・唇の鮮やかさ）
    const averageSaturation = (hairSaturation + lipSaturation) / 2;
    const isHighSaturation = averageSaturation > 30; // 鮮やか = Spring/Winter

    // 4. コントラストの判定（髪と肌の明度差）
    const contrast = Math.abs(hairBrightness - skinBrightness);
    const isHighContrast = contrast > 80; // コントラスト高 = Winter/Autumn

    // スコアリング
    // Spring（イエベ春）: 明るく、暖色で、鮮やか
    if (isWarmBase) scores.spring += 2;
    if (isBrightSkin) scores.spring += 2;
    if (isHighSaturation) scores.spring += 1;
    if (!isHighContrast) scores.spring += 1;

    // Summer（ブルベ夏）: 明るく、寒色で、柔らかい
    if (!isWarmBase) scores.summer += 2;
    if (isBrightSkin) scores.summer += 2;
    if (!isHighSaturation) scores.summer += 1;
    if (!isHighContrast) scores.summer += 1;

    // Autumn（イエベ秋）: 暗く、暖色で、深い
    if (isWarmBase) scores.autumn += 2;
    if (!isBrightSkin) scores.autumn += 2;
    if (!isHighSaturation) scores.autumn += 1;
    if (isHighContrast) scores.autumn += 1;

    // Winter（ブルベ冬）: 暗く、寒色で、鮮やか
    if (!isWarmBase) scores.winter += 2;
    if (!isBrightSkin) scores.winter += 2;
    if (isHighSaturation) scores.winter += 1;
    if (isHighContrast) scores.winter += 1;

    // 最高スコアのシーズンを判定
    const season = Object.keys(scores).reduce((a, b) => 
        scores[a] > scores[b] ? a : b
    );

    // シーズンの詳細情報
    const seasonInfo = getSeasonInfo(season);

    return {
        season,
        scores,
        seasonInfo,
        analysis: {
            skinTone: isWarmBase ? 'warm' : 'cool',
            brightness: isBrightSkin ? 'bright' : 'deep',
            saturation: isHighSaturation ? 'vivid' : 'soft',
            contrast: isHighContrast ? 'high' : 'low',
            skinBrightness,
            hairBrightness,
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
