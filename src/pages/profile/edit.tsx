import { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/router";

interface UserInfo {
  email: string;
  walletAddress?: string;
  stripeID?: string;
  role: string;
  type: "web2" | "web3";
}

export default function EditProfile() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchProfile = async () => {
      try {
        const response = await axios.get("/api/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(response.data.user);
        setEmail(response.data.user.email);
        setWalletAddress(response.data.user.walletAddress || "");
      } catch (error) {
        console.error("Failed to fetch profile", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    try {
      const response = await axios.patch(
        "/api/users/update",
        { email, walletAddress },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage("Profile updated successfully!");
    } catch (error: any) {
      setMessage("Failed to update profile: " + error.response?.data?.error);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (!user) return <p>User not found</p>;

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">Edit Profile</h1>
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="border p-2"
        />
        <input
          type="text"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          placeholder="Wallet Address"
          className="border p-2"
        />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded">
          Update Profile
        </button>
      </form>
    </div>
  );
}
