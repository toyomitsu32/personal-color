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

        // User requested model correction: Use generic multimodal name if specific one fails or is not standard
        const modelName = "gemini-2.0-flash"; // Reverting to standard Flash model which supports image I/O
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

        // Simplified prompt for native image generation/editing
        const systemPrompt = `Change the hair color of the person in this image to ${color} (${prompt}).`;

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
                // Corrected MIME type as per instructions: application/json for structured data or text/plain for raw
                // If using native image generation, response_mime_type should be removed or set to specific supported types.
                // However, standard Flash model returns text/json usually.
                // To support direct image output, we rely on the model's capability to return inline_data in the response part.
                // We will remove explicit response_mime_type to let the model decide the best output format (which can be multimodal).
                // If we want JSON, we use application/json. 
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
        
        // Handle Gemini Native Image Response (inline_data)
        // Python equivalent: if part.inline_data is not None: image = part.as_image()
        try {
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                for (const part of data.candidates[0].content.parts) {
                    // Check for inline_data (Native Image Output)
                    if (part.inline_data && part.inline_data.data) {
                        generatedImage = part.inline_data.data;
                        break;
                    }
                    // Fallback: Check if it returned text (error or refusal)
                    if (part.text) {
                        console.warn("Model returned text instead of image:", part.text);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
        }

        if (!generatedImage) {
             // Extract raw text for debugging if image missing
             const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No text";
             throw new Error(`Failed to generate image. Model response: ${rawText}`);
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