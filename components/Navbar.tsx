import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-blue-500 text-white p-4 flex justify-between">
      <h1 className="text-xl font-bold">Decentralized Marketplace</h1>
      <div className="space-x-4">
        <Link href="/">Home</Link>
        <Link href="/listings">Listings</Link>
        <Link href="/create-listing">Create Listing</Link>
        <Link href="/profile">Profile</Link>
      </div>
    </nav>
  );
}
