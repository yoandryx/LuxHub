import { NextApiRequest, NextApiResponse } from "next";
import { generateAdminToken } from "../../../lib/token";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = generateAdminToken();
  res.status(200).json({ token });
}
