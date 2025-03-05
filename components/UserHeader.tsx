import { useRouter } from "next/router";

export default function ProfileHeader() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  return (
    <header className=" ">
      <h1 className=" ">Profile Header</h1>
      <button onClick={handleLogout} className=" ">
        Log Out
      </button>
      <button onClick={handleLogin} className=" ">
        Log In
      </button>
    </header>
  );
}


