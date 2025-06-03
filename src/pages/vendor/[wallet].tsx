import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { VendorProfile } from "../../lib/models/VendorProfile";

const HeliusEndpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://devnet.helius-rpc.com/";

const VendorProfilePage = () => {
  const { query } = useRouter();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nftData, setNftData] = useState<any[]>([]);

  useEffect(() => {
    if (!query.wallet) return;

    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/vendor/profile?wallet=${query.wallet}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setProfile(null);
        } else {
          setProfile(data);
          setError(null);
        }
      } catch (err) {
        setError("Failed to load profile");
      }
    };

    fetchProfile();
  }, [query.wallet]);

  useEffect(() => {
    if (!profile?.inventory?.length) return;

    const fetchMetadata = async () => {
      const results = await Promise.all(
        profile.inventory.map(async (mint) => {
          try {
            const res = await fetch(HeliusEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: "1",
                method: "getAsset",
                params: { id: mint },
              }),
            });

            const { result } = await res.json();
            return result || null;
          } catch (err) {
            console.error("Helius fetch failed for", mint, err);
            return null;
          }
        })
      );

      setNftData(results.filter(Boolean));
    };

    fetchMetadata();
  }, [profile]);

  if (error) return <p>{error}</p>;
  if (!profile) return <p>Loading profile...</p>;

  return (
    <div style={{ padding: 20 }}>
      {profile.bannerUrl && (
        <img
          src={profile.bannerUrl}
          alt="Banner"
          style={{ width: "100%", maxHeight: 200, objectFit: "cover" }}
        />
      )}

      {profile.avatarUrl && (
        <img
          src={profile.avatarUrl}
          alt="Avatar"
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            marginTop: -50,
            border: "1px solid white",
            objectFit: "cover",
            background: "#00000030",
          }}
        />
      )}

      <h1>
        {profile.name} {profile.verified && "✅"}
      </h1>
      <p>@{profile.username}</p>
      <p>{profile.bio}</p>

      <div style={{ marginTop: 10 }}>
        {profile.socialLinks?.instagram && (
          <a href={profile.socialLinks.instagram} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>
            Instagram
          </a>
        )}
        {profile.socialLinks?.website && (
          <a href={profile.socialLinks.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
      </div>

      {nftData.length > 0 ? (
        <div>
          <h3 style={{ marginTop: 30 }}>Available Watches</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {nftData.map((meta, i) => {
              const image = meta?.content?.links?.image;
              const name = meta?.content?.metadata?.name;
              return (
                <div key={i} style={{ width: 200 }}>
                  <img
                    src={image}
                    alt={name || "NFT"}
                    style={{ width: "100%", borderRadius: 8 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/fallback-nft.png";
                    }}
                  />
                  <p>{name || "Unnamed NFT"}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 20 }}>No items listed yet.</p>
      )}
    </div>
  );
};

export default VendorProfilePage;
