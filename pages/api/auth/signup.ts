import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import User from '../../../models/User';
import dbConnect from '../../../lib/mongodb';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        await dbConnect();
        const { email, password, role, type } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const newUser = await User.create({ email, password, role, type });

        const token = jwt.sign(
            { userId: newUser._id, role: newUser.role },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );

        res.status(201).json({ token });
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};

export default handler;
