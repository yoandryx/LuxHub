import React from 'react';
import Head from 'next/head';
import styles from '../styles/ErrorPage.module.css';

export default function Custom404() {
  return (
    <>
      <Head>
        <title>404 — LuxHub</title>
      </Head>
      <div className={styles.container}>
        <div className={styles.card}>
          <span className={styles.code}>404</span>
          <h1 className={styles.title}>Page not found</h1>
          <p className={styles.message}>
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className={styles.actions}>
            <a href="/" className={styles.primaryBtn}>
              Go home
            </a>
            <a href="/marketplace" className={styles.secondaryBtn}>
              Browse marketplace
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
