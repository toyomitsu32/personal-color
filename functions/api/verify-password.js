export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { accessPassword } = body;

        const requiredPassword = env.ACCESS_PASSWORD;

        // If environment variable is not set, we cannot authenticate.
        if (!requiredPassword) {
            return new Response(JSON.stringify({
                success: false,
                error: "Server configuration error: ACCESS_PASSWORD not set."
            }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        if (accessPassword === requiredPassword) {
            // Check if GOOGLE_API_KEY is configured
            const googleApiConfigured = !!env.GOOGLE_API_KEY;
            
            return new Response(JSON.stringify({
                success: true,
                message: "Password verified.",
                googleApiConfigured: googleApiConfigured
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        } else {
             return new Response(JSON.stringify({
                success: false,
                error: "Invalid access password."
            }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}