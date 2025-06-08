import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "your_secret_key";

export const verifyAdmin = (token: string) => {
  try {
    const decoded = jwt.verify(token, secret) as any;
    return decoded?.role === "admin";
  } catch (error) {
    return false;
  }
};
