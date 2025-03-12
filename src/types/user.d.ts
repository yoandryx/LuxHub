// /types/user.d.ts
interface User {
    _id?: string;
    email: string;
    password?: string;
    walletAddress?: string;
    stripeID?: string;
    role: "admin" | "user";
    type: "web2" | "web3";
}