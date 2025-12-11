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

        // Use Imagen 3 model via Gemini API
        // NOTE: While "imagen-3.0-generate-001" is the Vertex AI model name, 
        // the Gemini API via Google AI Studio typically exposes Imagen models differently or requires specific access.
        // Assuming user has access to Imagen via Gemini API key as requested.
        // If this fails, we fall back to user's instruction.
        
        // However, standard Gemini API keys often work with "gemini-pro" or similar.
        // For Imagen on Gemini API (if available), the endpoint might be slightly different or same.
        // Let's try the standard Imagen endpoint structure if available, or use the recommended "imagen-3.0-generate-001".
        
        // Actually, for AI Studio keys, the model is often "imagen-3.0-generate-001".
        const modelName = "imagen-3.0-generate-001"; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict`; // Imagen uses :predict usually, or generateImages

        // Imagen API payload structure is different
        // It takes instances and parameters
        const payload = {
            instances: [
                {
                    prompt: `A photorealistic portrait of a person with ${color} hair. ${prompt}. High quality, professional photography.`,
                    image: {
                        bytesBase64Encoded: base64Image
                    }
                }
            ],
            parameters: {
                sampleCount: 1,
                aspectRatio: "1:1", // Or match input image ratio if possible
                personGeneration: "allow_adult",
                safetySettings: [ // Imagen specific safety settings structure might differ, simplifying
                     { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }
                ]
            }
        };

        // Note: Imagen 3 API availability on public API keys is limited. 
        // If this specific URL/Model fails, it means the user's key doesn't support Imagen directly.
        
        // ALTERNATIVE: Use the image editing capability if supported by a specific Gemini model designed for it.
        // But user asked for "Imagen 3".
        
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
        
        // Handle Imagen API Response
        try {
            if (data.predictions && data.predictions.length > 0) {
                // Imagen returns bytesBase64Encoded directly in predictions
                if (data.predictions[0].bytesBase64Encoded) {
                    generatedImage = data.predictions[0].bytesBase64Encoded;
                } else if (data.predictions[0].mimeType && data.predictions[0].bytesBase64Encoded) {
                     generatedImage = data.predictions[0].bytesBase64Encoded;
                }
            } else if (data.error) {
                 throw new Error(`Imagen API Error: ${data.error.message || JSON.stringify(data.error)}`);
            }
        } catch (e) {
            console.error("Failed to parse Imagen response:", e);
             // Fallback for debugging
             throw new Error(`Failed to parse Imagen response. Raw data: ${JSON.stringify(data).substring(0, 200)}...`);
        }

        if (!generatedImage) {
             throw new Error(`Failed to generate image with Imagen. No image data found.`);
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