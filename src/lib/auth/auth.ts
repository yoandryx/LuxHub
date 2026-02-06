import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is required');
}

export const verifyAdmin = (token: string) => {
  try {
    const decoded = jwt.verify(token, secret) as any;
    return decoded?.role === 'admin';
  } catch (error) {
    return false;
  }
};
