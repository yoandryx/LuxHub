import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";

// Define types for user info and listings
interface UserInfo {
  email: string;
  role: string;
}

interface Listing {
  _id: string;
  title: string;
  status: string;
}

export default function UserProfile() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUserListings = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get("/api/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setListings(response.data.listings);
        setUserInfo(response.data.user);
      } catch (error) {
        alert("You are not authorized");
        router.push("/login");
      }
    };
    fetchUserListings();
  }, [router]);

  if (!userInfo) {
    return <div>Loading...</div>; // Loading state while fetching data
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">User Profile</h1>
      <div className="mb-4">
        <h2 className="text-xl">Profile Information</h2>
        <p>Email: {userInfo.email}</p>
        <p>Role: {userInfo.role}</p>
      </div>
      <h2 className="text-xl mb-2">Your Listings</h2>
      {listings.map((listing) => (
        <div key={listing._id} className="p-4 border mb-2">
          <h3>{listing.title}</h3>
          <p>Status: {listing.status}</p>
        </div>
      ))}
    </div>
  );
}
