import { NextApiRequest, NextApiResponse, NextApiHandler } from "next";
import { verifyToken } from "../auth/token";

const authMiddleware = (handler: NextApiHandler) => async (req: NextApiRequest, res: NextApiResponse) => {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authorization.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ error: "Invalid token" });
    }

    // Attach user info to the request object
    (req as any).user = decoded;

    return handler(req, res);
};

export default authMiddleware;
