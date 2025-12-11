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
        Return a valid JSON object with a single key 'image_data' containing the base64 encoded string of the edited image in JPEG format.
        IMPORTANT: Return ONLY the raw JSON string. Do not use Markdown code blocks. The base64 string should NOT include the 'data:image/jpeg;base64,' prefix.`;

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
                response_mime_type: "application/json"
            }
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
        
        // Try to parse the response
        let generatedImage = null;
        try {
            let textPart = data.candidates[0].content.parts[0].text;
            // Clean up markdown if present (e.g. ```json ... ```)
            textPart = textPart.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const parsed = JSON.parse(textPart);
            generatedImage = parsed.image_data;
            
            if (generatedImage) {
                // Remove prefix if mistakenly included by the AI
                generatedImage = generatedImage.replace(/^data:image\/\w+;base64,/, '');
                // Remove any whitespace (newlines, spaces) which can break base64
                generatedImage = generatedImage.replace(/\s/g, '');
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", e);
        }

        if (!generatedImage) {
             throw new Error("Failed to generate image with Gemini.");
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