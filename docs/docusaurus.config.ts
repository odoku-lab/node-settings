import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "node-settings",
  tagline: "Type-safe environment variable settings loader for Node.js",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://odoku-lab.github.io",
  baseUrl: "/node-settings/",

  organizationName: "odoku-lab",
  projectName: "node-settings",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "ja",
    locales: ["ja", "en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/odoku-lab/node-settings/edit/main/docs/",
          routeBasePath: "/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/docusaurus-social-card.jpg",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "node-settings",
      logo: {
        alt: "node-settings",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "ドキュメント",
        },
        {
          type: "localeDropdown",
          position: "right",
        },
        {
          href: "https://github.com/odoku-lab/node-settings",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "ドキュメント",
          items: [
            {
              label: "はじめよう",
              to: "/getting-started",
            },
            {
              label: "スキーマ定義",
              to: "/guides/defining-schema",
            },
          ],
        },
        {
          title: "リファレンス",
          items: [
            {
              label: "型一覧",
              to: "/types/overview",
            },
            {
              label: "CLI",
              to: "/cli/overview",
            },
            {
              label: "エラークラス",
              to: "/api/errors",
            },
          ],
        },
        {
          title: "GitHub",
          items: [
            {
              label: "リポジトリ",
              href: "https://github.com/odoku-lab/node-settings",
            },
            {
              label: "Issue",
              href: "https://github.com/odoku-lab/node-settings/issues",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} odoku-lab.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "diff", "json", "typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
