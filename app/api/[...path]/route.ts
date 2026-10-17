import { handleApi } from "../../../lib/server";
import { regionalForecast } from "../../../lib/weather-service";

export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/$/, "") === "/api/forecast") {
    if (url.search) return Response.json({ error: "This endpoint uses a fixed Bay Area forecast grid; parameters are not accepted." }, { status: 400 });
    return regionalForecast().then(data => Response.json(data, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }));
  }
  return handleApi(request);
}
