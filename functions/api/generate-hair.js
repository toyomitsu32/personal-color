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

        // Using "Nano Banana Pro" (Gemini 2.0 Flash) as requested
        const modelName = "gemini-2.0-flash"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

        const systemPrompt = `You are an expert AI hair stylist (Nano Banana Pro). 
        Change the hair color of the person in this image to ${color} (${prompt}).
        
        CRITICAL: The output MUST be a valid, very short Base64 string to fit in the response limit.
        1.  **DOWNSCALE the image to 128x128 pixels**. This is MANDATORY.
        2.  **COMPRESS** with low JPEG quality (30-50).
        3.  Return **ONLY** the raw Base64 string of this small, compressed image.
        4.  No JSON, no Markdown, no headers. JUST THE STRING.`;

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
                maxOutputTokens: 8192,
                temperature: 0.4
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
        
        // Debug info in case of failure
        let rawText = "No text returned";

        // Try to parse the response
        let generatedImage = null;
        try {
            if (!data.candidates || data.candidates.length === 0) {
                 throw new Error("No candidates returned. Safety settings might have blocked the response.");
            }
            
            const candidate = data.candidates[0];
            if (candidate.finishReason && candidate.finishReason !== "STOP") {
                 console.warn("Finish reason:", candidate.finishReason);
            }

            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                rawText = candidate.content.parts[0].text.trim();
                
                // Clean up possible markdown or headers just in case
                let base64String = rawText;
                base64String = base64String.replace(/```\w*/g, '').replace(/```/g, '').trim();
                base64String = base64String.replace(/^data:image\/\w+;base64,/, '');
                base64String = base64String.replace(/\s/g, '');
                
                generatedImage = base64String;
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
            throw new Error(`Failed to parse AI response: ${e.message}`);
        }

        if (!generatedImage || generatedImage.length < 100) {
             // If string is too short, it's likely an error message or refusal
             throw new Error(`AI returned invalid data (length ${generatedImage ? generatedImage.length : 0}). Raw output start: ${rawText.substring(0, 50)}...`);
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