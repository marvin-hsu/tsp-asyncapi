import { defineConfig } from "vitepress";

export default defineConfig({
  title: "TypeSpec AsyncAPI",
  description: "An AsyncAPI 3.1 emitter for TypeSpec",
  base: "/tsp-asyncapi/",
  lastUpdated: true,
  head: [
    ["script", { async: "", src: "https://www.googletagmanager.com/gtag/js?id=G-GPFN76W5SX" }],
    [
      "script",
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-GPFN76W5SX');`,
    ],
  ],

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
              {
                text: "Schema Conversion",
                collapsed: false,
                items: [
                  { text: "Models", link: "/guide/schema-conversion/models" },
                  { text: "Scalars", link: "/guide/schema-conversion/scalars" },
                  { text: "Enums", link: "/guide/schema-conversion/enums" },
                  { text: "Unions", link: "/guide/schema-conversion/unions" },
                  { text: "Inheritance", link: "/guide/schema-conversion/inheritance" },
                  { text: "Validation", link: "/guide/schema-conversion/validation" },
                  { text: "Modifiers", link: "/guide/schema-conversion/modifiers" },
                  { text: "Advanced", link: "/guide/schema-conversion/advanced" },
                ],
              },
              { text: "Request and Reply", link: "/guide/request-reply" },
            ],
          },
          {
            text: "Reference",
            items: [
              { text: "Emitter Options", link: "/reference/emitter-options" },
              {
                text: "Decorators",
                collapsed: false,
                items: [
                  { text: "Document Info", link: "/reference/decorators/document-info" },
                  { text: "Servers", link: "/reference/decorators/servers" },
                  { text: "Security", link: "/reference/decorators/security" },
                  { text: "Channels", link: "/reference/decorators/channels" },
                  { text: "Operations", link: "/reference/decorators/operations" },
                  { text: "Messages", link: "/reference/decorators/messages" },
                  { text: "Schemas", link: "/reference/decorators/schemas" },
                ],
              },
              { text: "Protocol Bindings", link: "/reference/bindings" },
              { text: "Diagnostics", link: "/reference/diagnostics" },
            ],
          },
        ],
        editLink: {
          pattern: "https://github.com/marvin-hsu/tsp-asyncapi/edit/main/docs/:path",
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
              {
                text: "Schema 轉換",
                collapsed: false,
                items: [
                  { text: "Model", link: "/zh-tw/guide/schema-conversion/models" },
                  { text: "Scalar", link: "/zh-tw/guide/schema-conversion/scalars" },
                  { text: "Enum", link: "/zh-tw/guide/schema-conversion/enums" },
                  { text: "Union", link: "/zh-tw/guide/schema-conversion/unions" },
                  { text: "繼承與多型", link: "/zh-tw/guide/schema-conversion/inheritance" },
                  { text: "驗證", link: "/zh-tw/guide/schema-conversion/validation" },
                  { text: "標註與修改", link: "/zh-tw/guide/schema-conversion/modifiers" },
                  { text: "進階處理", link: "/zh-tw/guide/schema-conversion/advanced" },
                ],
              },
              { text: "Request 與 Reply", link: "/zh-tw/guide/request-reply" },
            ],
          },
          {
            text: "參考",
            items: [
              {
                text: "Emitter 選項",
                link: "/zh-tw/reference/emitter-options",
              },
              {
                text: "Decorator",
                collapsed: false,
                items: [
                  { text: "文件資訊", link: "/zh-tw/reference/decorators/document-info" },
                  { text: "伺服器", link: "/zh-tw/reference/decorators/servers" },
                  { text: "安全機制", link: "/zh-tw/reference/decorators/security" },
                  { text: "通道", link: "/zh-tw/reference/decorators/channels" },
                  { text: "操作", link: "/zh-tw/reference/decorators/operations" },
                  { text: "訊息", link: "/zh-tw/reference/decorators/messages" },
                  { text: "結構與內建", link: "/zh-tw/reference/decorators/schemas" },
                ],
              },
              { text: "通訊協定 binding", link: "/zh-tw/reference/bindings" },
              { text: "診斷訊息", link: "/zh-tw/reference/diagnostics" },
            ],
          },
        ],
        editLink: {
          pattern: "https://github.com/marvin-hsu/tsp-asyncapi/edit/main/docs/:path",
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
        icon: "npm",
        link: "https://www.npmjs.com/package/tsp-asyncapi",
      },
      {
        icon: "github",
        link: "https://github.com/marvin-hsu/tsp-asyncapi",
      },
    ],
    search: { provider: "local" },
  },
});
