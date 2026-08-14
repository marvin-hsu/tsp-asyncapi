import { defineConfig } from "vitepress";

export default defineConfig({
  title: "TypeSpec AsyncAPI",
  description: "An AsyncAPI 3.1 emitter for TypeSpec",
  base: "/typespec-asyncapi/",
  lastUpdated: true,

  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/getting-started" },
          { text: "Reference", link: "/reference/emitter-options" },
        ],
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "Getting Started", link: "/guide/getting-started" },
              { text: "Schema Conversion", link: "/guide/schema-conversion" },
            ],
          },
          {
            text: "Reference",
            items: [
              { text: "Emitter Options", link: "/reference/emitter-options" },
              { text: "Decorators", link: "/reference/decorators" },
              { text: "Diagnostics", link: "/reference/diagnostics" },
            ],
          },
        ],
        editLink: {
          pattern: "https://github.com/marvin-hsu/typespec-asyncapi/edit/main/docs/:path",
          text: "Edit this page on GitHub",
        },
        outline: { label: "On this page" },
        lastUpdated: { text: "Last updated" },
      },
    },
    "zh-tw": {
      label: "繁體中文",
      lang: "zh-TW",
      link: "/zh-tw/",
      themeConfig: {
        nav: [
          { text: "指南", link: "/zh-tw/guide/getting-started" },
          { text: "參考", link: "/zh-tw/reference/emitter-options" },
        ],
        sidebar: [
          {
            text: "指南",
            items: [
              { text: "快速開始", link: "/zh-tw/guide/getting-started" },
              { text: "Schema 轉換", link: "/zh-tw/guide/schema-conversion" },
            ],
          },
          {
            text: "參考",
            items: [
              {
                text: "Emitter 選項",
                link: "/zh-tw/reference/emitter-options",
              },
              { text: "Decorator", link: "/zh-tw/reference/decorators" },
              { text: "診斷訊息", link: "/zh-tw/reference/diagnostics" },
            ],
          },
        ],
        editLink: {
          pattern: "https://github.com/marvin-hsu/typespec-asyncapi/edit/main/docs/:path",
          text: "在 GitHub 上編輯此頁",
        },
        outline: { label: "本頁目錄" },
        lastUpdated: { text: "最後更新" },
        docFooter: { prev: "上一頁", next: "下一頁" },
        darkModeSwitchLabel: "深色模式",
        sidebarMenuLabel: "選單",
        returnToTopLabel: "回到頂端",
        langMenuLabel: "切換語言",
      },
    },
  },

  themeConfig: {
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/marvin-hsu/typespec-asyncapi",
      },
    ],
    search: { provider: "local" },
  },
});
