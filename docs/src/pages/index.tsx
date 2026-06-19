import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import clsx from "clsx";
import type { ReactNode } from "react";

import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/getting-started">
            はじめよう
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/intro"
            style={{ marginLeft: "1rem" }}
          >
            ドキュメントを読む
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: "型安全",
    description: "スキーマ定義から TypeScript の型を自動推論。実行時も型安全。",
  },
  {
    title: "多彩な型",
    description:
      "String / Number / Boolean / URL / Duration / JSON / Array / Template / Func など。Zod・Valibot とも連携。",
  },
  {
    title: "シークレット管理",
    description:
      "AWS Secrets Manager・Azure Key Vault・GCP Secret Manager・HashiCorp Vault などの外部シークレットを TTL キャッシュ付きで取得。",
  },
  {
    title: "ランタイム操作",
    description: "mutate() / reset() で実行時に設定を差し替え。frozen モードで変更を禁止。",
  },
];

function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map((feature) => (
            <div className={clsx("col col--3")} key={feature.title}>
              <div className="padding-horiz--md padding-vert--md">
                <Heading as="h3">{feature.title}</Heading>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Type-safe environment variable settings loader for Node.js"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
