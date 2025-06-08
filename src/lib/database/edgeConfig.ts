import { createClient } from "@vercel/edge-config";

// Use the new single ENV var: EDGE_CONFIG (contains token + ID)
export const edgeConfig = createClient(process.env.EDGE_CONFIG);
