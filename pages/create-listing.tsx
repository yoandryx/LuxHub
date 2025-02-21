import styles from "../styles/Form.module.css";

export default function CreateListing() {
  return (
    <div className={styles.container}>
      <h1>Create a New Listing</h1>
      <form className={styles.form}>
        <input type="text" placeholder="Enter asset title" />
        <textarea placeholder="Describe your asset"></textarea>
        <input type="number" placeholder="Enter price in SOL" />
        <button type="submit">Create Listing</button>
      </form>
    </div>
  );
}
