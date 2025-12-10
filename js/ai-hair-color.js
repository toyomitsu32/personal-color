/**
 * AI画像生成を使用した高精度ヘアカラー変更
 */

/**
 * 画像をbase64に変換
 */
async function canvasToBase64(canvas) {
    return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * AI画像生成を使用してヘアカラーを変更
 * @param {string} imageBase64 - 元画像のbase64 (data URL形式)
 * @param {string} targetColor - ターゲットカラー名（例: "blonde", "brown", "black"）
 * @param {string} colorDescription - カラーの詳細説明
 * @returns {Promise<string>} - 生成された画像のURL
 */
export async function changeHairColorWithAI(imageBase64, targetColor, colorDescription) {
    // この関数は image_generation ツールが利用できる環境でのみ動作します
    // 静的サイトでは直接呼び出せないため、エラーメッセージを返します
    throw new Error('AI画像生成機能は、このツールでは利用できません。サーバーサイドの実装が必要です。');
}

/**
 * シーズンに基づいた3つのおすすめヘアカラーを取得
 */
export function getThreeRecommendedColors(season) {
    const recommendations = {
        spring: [
            {
                name: 'ハニーブロンド',
                color: '#D4A574',
                aiColor: 'honey blonde',
                description: 'warm honey blonde with golden highlights'
            },
            {
                name: 'ライトキャラメル',
                color: '#C68642',
                aiColor: 'light caramel',
                description: 'light caramel brown with warm undertones'
            },
            {
                name: 'ゴールデンブラウン',
                color: '#B8860B',
                aiColor: 'golden brown',
                description: 'rich golden brown with amber tones'
            }
        ],
        summer: [
            {
                name: 'アッシュブロンド',
                color: '#C4B5A0',
                aiColor: 'ash blonde',
                description: 'cool ash blonde with silver undertones'
            },
            {
                name: 'ソフトグレージュ',
                color: '#B8AFA8',
                aiColor: 'soft greige',
                description: 'soft greige (grey-beige blend) with cool tones'
            },
            {
                name: 'ローズブラウン',
                color: '#9B7B7B',
                aiColor: 'rose brown',
                description: 'rose brown with subtle pink undertones'
            }
        ],
        autumn: [
            {
                name: 'チェスナット',
                color: '#8B4513',
                aiColor: 'chestnut',
                description: 'deep chestnut brown with warm red tones'
            },
            {
                name: 'マホガニー',
                color: '#823D3D',
                aiColor: 'mahogany',
                description: 'rich mahogany with reddish-brown tones'
            },
            {
                name: 'ダークブラウン',
                color: '#654321',
                aiColor: 'dark brown',
                description: 'deep dark brown with warm undertones'
            }
        ],
        winter: [
            {
                name: 'ジェットブラック',
                color: '#1C1C1C',
                aiColor: 'jet black',
                description: 'pure jet black with cool blue undertones'
            },
            {
                name: 'ブルーブラック',
                color: '#1F2937',
                aiColor: 'blue black',
                description: 'blue-black with subtle blue highlights'
            },
            {
                name: 'プラチナブロンド',
                color: '#E5E4E2',
                aiColor: 'platinum blonde',
                description: 'icy platinum blonde with silver highlights'
            }
        ]
    };
    
    return recommendations[season] || recommendations.spring;
}

/**
 * 画像URLをキャンバスに読み込む
 */
export async function loadImageToCanvas(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // CORS対応
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        
        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };
        
        img.src = imageUrl;
    });
}
