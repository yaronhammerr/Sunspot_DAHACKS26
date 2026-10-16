import { handleApi } from "../../../lib/server";

export function GET(request: Request) { return handleApi(request); }
