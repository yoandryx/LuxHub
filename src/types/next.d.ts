import { JwtPayload } from "jsonwebtoken";
import { NextApiRequest } from "next";

// Extend NextApiRequest to include user property
declare module "next" {
    interface NextApiRequest {
        user?: string | JwtPayload;
    }
}
