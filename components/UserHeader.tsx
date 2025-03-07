import { useState } from "react";
import { useRouter } from "next/router";
import styles from "../styles/UserHeader.module.css"
import { CiShoppingCart } from "react-icons/ci";

export default function ProfileHeader() {

  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
  };

  const toggleProfileMenu = () => {
    setProfileMenuOpen(!profileMenuOpen);
  }

  return (
    <>

      <div className={styles.userNavContainer}>
        <nav onClick={toggleProfileMenu} className={`${styles.userNavbar} ${profileMenuOpen ? styles.open : ""}`}>

          <CiShoppingCart className={styles.userIcon} />

          <div className={styles.userMenuContainer}>
            <div className={styles.userMenu} >
              <div className={`${styles.userOptions} ${profileMenuOpen ? styles.open : ""}`}>
                
              </div>
            </div>
          </div>
          
        </nav>
      </div>

    </>
  );
}


