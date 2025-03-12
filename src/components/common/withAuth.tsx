import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";

const withAuth = (WrappedComponent: React.ComponentType, role?: string) => {
  const AuthComponent = () => {
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const router = useRouter();

    useEffect(() => {
      const checkAuth = async () => {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }

        try {
          const response = await axios.get("/api/auth/verify", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const user = response.data.user;

          if (role && user.role !== role) {
            router.push("/login");
            return;
          }

          setAuthorized(true);
        } catch (error) {
          console.error("Authentication error:", error);
          localStorage.removeItem("token");
          router.push("/login");
        } finally {
          setLoading(false);
        }
      };

      checkAuth();
    }, [router]);

    if (loading) return <p>Loading...</p>;
    if (!authorized) return null;

    return <WrappedComponent />;
  };

  return AuthComponent;
};

export default withAuth;
