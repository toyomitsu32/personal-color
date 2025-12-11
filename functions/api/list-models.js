export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { accessPassword } = body;

        // 1. Password Verification
        const requiredPassword = env.ACCESS_PASSWORD;
        if (!requiredPassword || accessPassword !== requiredPassword) {
            return new Response(JSON.stringify({
                success: false,
                error: "Invalid access password."
            }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        // 2. Google API Call (List Models)
        const apiKey = env.GOOGLE_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({
                success: false,
                error: "GOOGLE_API_KEY not set."
            }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        // Check both v1 and v1beta
        const versions = ['v1beta', 'v1'];
        const results = {};

        for (const version of versions) {
            const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                results[version] = data;
            } catch (e) {
                results[version] = { error: e.message };
            }
        }

        return new Response(JSON.stringify({
            success: true,
            models: results
        }), { headers: { "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}