export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { image, prompt, color, accessPassword } = body;

        // 1. Password Verification
        const requiredPassword = env.ACCESS_PASSWORD;
        
        // If environment variable is not set, we cannot authenticate.
        if (!requiredPassword) {
            return new Response(JSON.stringify({
                success: false,
                error: "Server configuration error: ACCESS_PASSWORD not set."
            }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        if (accessPassword !== requiredPassword) {
            return new Response(JSON.stringify({
                success: false,
                error: "Invalid access password."
            }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        // 2. Google API Call (Gemini)
        const apiKey = env.GOOGLE_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({
                success: false,
                error: "Server configuration error: GOOGLE_API_KEY not set."
            }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // Prepare the image (remove header)
        const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

        // Use Gemini 2.0 Flash as it is confirmed working and fast
        const modelName = "gemini-2.0-flash"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

        // Prompt designed to force the LLM to act as an image processor via Base64 text
        const systemPrompt = `You are an AI image processing engine.
        Task: Change the hair color of the person in the input image to ${color} (${prompt}).
        
        OUTPUT FORMAT REQUIREMENTS:
        1.  **Generate a completely new JPEG image** representing the result.
        2.  **Downscale the result to 64x64 pixels**. (Extremely small size is required to fit text limit).
        3.  **Compress with JPEG Quality 10**. (Maximum compression required).
        4.  Output **ONLY** the raw Base64 encoded string of this new JPEG image.
        5.  Do NOT output JSON. Do NOT output markdown blocks (like \`\`\`base64).
        6.  Do NOT output the data prefix (data:image/jpeg;base64,).
        7.  Just the raw string characters. Nothing else.`;

        const payload = {
            contents: [{
                parts: [
                    { text: systemPrompt },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: "text/plain",
                maxOutputTokens: 8192
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const apiResponse = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-goog-api-key": apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            throw new Error(`Google API Error: ${apiResponse.status} - ${errorText}`);
        }

        const data = await apiResponse.json();
        
        let generatedImage = null;
        let rawText = "No text returned";

        try {
            // Check if we got a text response (Base64 string)
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                const textPart = data.candidates[0].content.parts.find(p => p.text);
                
                if (textPart) {
                    rawText = textPart.text.trim();
                    // Clean up markdown code blocks if present
                    let cleanBase64 = rawText.replace(/```\w*/g, '').replace(/```/g, '').trim();
                    // Clean up whitespace
                    cleanBase64 = cleanBase64.replace(/\s/g, '');
                    // Remove prefix if present
                    cleanBase64 = cleanBase64.replace(/^data:image\/\w+;base64,/, '');
                    
                    if (cleanBase64.length > 100) {
                        generatedImage = cleanBase64;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
        }

        if (!generatedImage) {
             throw new Error(`Failed to generate image. Model response: ${rawText.substring(0, 100)}...`);
        }

        return new Response(JSON.stringify({
            success: true,
            imageUrl: `data:image/jpeg;base64,${generatedImage}`
        }), { headers: { "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}