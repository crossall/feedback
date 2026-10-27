import type { Metadata } from "next";

import styles from "./showcase.module.css";

export const metadata: Metadata = {
  title: "2026 마포초등학교 교육력제고 온라인 결과발표회",
  description: "2026 마포초등학교 교육력제고 온라인 결과발표회",
};

export default function ShowcasePage() {
  return (
    <main className={styles.root}>
      <div className={styles.atmosphere} aria-hidden="true">
        <span className={styles.glowTop} />
        <span className={styles.glowBottom} />
        <span className={styles.lightDoor} />
        <span className={styles.floorLine} />
      </div>

      <div className={styles.constellation} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className={styles.exhibition} aria-hidden="true">
        <div className={`${styles.orbit} ${styles.orbitOuter}`}>
          <span />
        </div>
        <div className={`${styles.orbit} ${styles.orbitMiddle}`}>
          <span />
        </div>
        <div className={`${styles.orbit} ${styles.orbitInner}`}>
          <span />
        </div>
        <div className={styles.portal} />

        <div className={`${styles.exhibitCard} ${styles.cardOne}`}>
          <i />
          <i />
          <i />
        </div>
        <div className={`${styles.exhibitCard} ${styles.cardTwo}`}>
          <i />
          <i />
          <i />
        </div>
        <div className={`${styles.exhibitCard} ${styles.cardThree}`}>
          <i />
          <i />
          <i />
        </div>
        <div className={`${styles.exhibitCard} ${styles.cardFour}`}>
          <i />
          <i />
          <i />
        </div>
      </div>

      <section className={styles.titleStage} aria-labelledby="showcase-title">
        <h1 id="showcase-title" className={styles.title}>
          <span className={styles.prelude}>2026 마포초등학교</span>
          <span className={styles.headline}>교육력제고</span>
          <span className={styles.subheadline}>온라인 결과발표회</span>
        </h1>
      </section>

      <div className={styles.frame} aria-hidden="true">
        <span className={styles.cornerTopLeft} />
        <span className={styles.cornerTopRight} />
        <span className={styles.cornerBottomLeft} />
        <span className={styles.cornerBottomRight} />
      </div>

      <div className={styles.curtain} aria-hidden="true">
        <span />
        <span />
      </div>
    </main>
  );
}
