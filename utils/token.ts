import jwt from "jsonwebtoken";

export const createToken = (data: object) => {
    return jwt.sign(data, process.env.JWT_SECRET!, { expiresIn: "1h" });
};

export const verifyToken = (token: string) => {
    return jwt.verify(token, process.env.JWT_SECRET!);
};
