import React from 'react';
import Head from 'next/head';
import styles from '../styles/ErrorPage.module.css';

export default function Custom500() {
  return (
    <>
      <Head>
        <title>500 — LuxHub</title>
      </Head>
      <div className={styles.container}>
        <div className={styles.card}>
          <span className={styles.code}>500</span>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.message}>
            We're experiencing a server issue. Please try again in a moment.
          </p>
          <div className={styles.actions}>
            <button onClick={() => window.location.reload()} className={styles.primaryBtn}>
              Try again
            </button>
            <a href="/" className={styles.secondaryBtn}>
              Go home
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
