import jwt, { JwtPayload } from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key_here";  // Replace with a strong secret key

// Generate a token for admin
export const generateAdminToken = () => {
  const payload = { role: "admin" };
  return jwt.sign(payload, SECRET_KEY, { expiresIn: "24h" });
};

// Function to sign tokens
export const signToken = (payload: object) => {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: "7d" });
};

// Verify token
export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, SECRET_KEY) as JwtPayload;
  } catch (error) {
    return null;
  }
};

