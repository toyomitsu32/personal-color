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

        // Use Gemini 2.5 Flash Image model as strictly requested
        const modelName = "gemini-2.5-flash-image"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

        // Enhanced prompt to preserve hairstyle and facial features
        const systemPrompt = `Change ONLY the hair color of the person in this image to ${color} (${prompt}). IMPORTANT: Keep the exact same hairstyle, hair length, hair texture, facial features, face shape, and background. Do not modify anything except the hair color. Preserve the original composition completely.`;

        // Gemini 2.5 Flash Image specific payload
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
                temperature: 0.1,  // Low temperature for more consistent/deterministic output
                // This model supports image output directly via inline_data in response
                // We do NOT set response_mime_type to 'application/json' or 'text/plain' 
                // to allow the model to return native image objects.
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
        
        // Handle Gemini Native Image Response
        try {
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                for (const part of data.candidates[0].content.parts) {
                    // Check for inline_data (Native Image Output) - handle both snake_case and camelCase
                    const inlineData = part.inline_data || part.inlineData;
                    
                    if (inlineData && inlineData.data) {
                        generatedImage = inlineData.data;
                        // Capture mimeType if available (default to jpeg)
                        const mimeType = inlineData.mimeType || inlineData.mime_type || "image/jpeg";
                        
                        // Return immediately upon finding image
                        return new Response(JSON.stringify({
                            success: true,
                            imageUrl: `data:${mimeType};base64,${generatedImage}`
                        }), { headers: { "Content-Type": "application/json" } });
                    }
                    
                    // Fallback check for text if image failed
                    if (part.text && !generatedImage) {
                         // Keep looking, maybe image is in next part
                         console.log("Log: Part contains text:", part.text);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
        }

        if (!generatedImage) {
             const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No output";
             throw new Error(`Failed to generate image. Model response: ${rawText.substring(0, 200)}...`);
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