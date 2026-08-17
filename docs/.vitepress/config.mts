import { defineConfig } from "vitepress";

/**
 * The Ko-fi entry in `socialLinks`, drawn as a coffee mug.
 *
 * VitePress ships no Ko-fi icon. Naming one as a string would make the page
 * fetch it from `api.iconify.design` at runtime, so the icon is inlined here
 * instead and the site keeps its one less external dependency.
 *
 * The theme sizes it to 20px and paints it with `fill: currentColor`, so the
 * paths carry no colour of their own and follow the light and dark themes.
 */
const KOFI_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M6.7 2.9a1.1 1.1 0 0 1 1.1 1.1v2.8a1.1 1.1 0 0 1-2.2 0V4a1.1 1.1 0 0 1 1.1-1.1Z"/>
  <path d="M11.3 2.9a1.1 1.1 0 0 1 1.1 1.1v2.8a1.1 1.1 0 0 1-2.2 0V4a1.1 1.1 0 0 1 1.1-1.1Z"/>
  <path d="M2.7 9h13.2v7.4a4.6 4.6 0 0 1-4.6 4.6H7.3a4.6 4.6 0 0 1-4.6-4.6V9Z"/>
  <path d="M15.9 10.6H18a3.6 3.6 0 0 1 0 7.2h-2.1v-2.4H18a1.2 1.2 0 0 0 0-2.4h-2.1v-2.4Z"/>
</svg>`;

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
              { text: "Examples", link: "/guide/examples" },
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
              {
                text: "Protocol Bindings",
                collapsed: true,
                items: [
                  { text: "Overview", link: "/reference/bindings/" },
                  { text: "Kafka", link: "/reference/bindings/kafka" },
                  { text: "WebSocket", link: "/reference/bindings/websocket" },
                  { text: "MQTT", link: "/reference/bindings/mqtt" },
                  { text: "HTTP", link: "/reference/bindings/http" },
                  { text: "AMQP", link: "/reference/bindings/amqp" },
                  { text: "NATS", link: "/reference/bindings/nats" },
                  { text: "Pulsar", link: "/reference/bindings/pulsar" },
                  { text: "Google Cloud Pub/Sub", link: "/reference/bindings/google-pubsub" },
                  { text: "Amazon SQS", link: "/reference/bindings/sqs" },
                  { text: "Anypoint MQ", link: "/reference/bindings/anypoint-mq" },
                  { text: "JMS", link: "/reference/bindings/jms" },
                  { text: "IBM MQ", link: "/reference/bindings/ibm-mq" },
                  { text: "Solace", link: "/reference/bindings/solace" },
                ],
              },
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
              { text: "範例", link: "/zh-tw/guide/examples" },
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
              {
                text: "通訊協定 binding",
                collapsed: true,
                items: [
                  { text: "總覽", link: "/zh-tw/reference/bindings/" },
                  { text: "Kafka", link: "/zh-tw/reference/bindings/kafka" },
                  { text: "WebSocket", link: "/zh-tw/reference/bindings/websocket" },
                  { text: "MQTT", link: "/zh-tw/reference/bindings/mqtt" },
                  { text: "HTTP", link: "/zh-tw/reference/bindings/http" },
                  { text: "AMQP", link: "/zh-tw/reference/bindings/amqp" },
                  { text: "NATS", link: "/zh-tw/reference/bindings/nats" },
                  { text: "Pulsar", link: "/zh-tw/reference/bindings/pulsar" },
                  { text: "Google Cloud Pub/Sub", link: "/zh-tw/reference/bindings/google-pubsub" },
                  { text: "Amazon SQS", link: "/zh-tw/reference/bindings/sqs" },
                  { text: "Anypoint MQ", link: "/zh-tw/reference/bindings/anypoint-mq" },
                  { text: "JMS", link: "/zh-tw/reference/bindings/jms" },
                  { text: "IBM MQ", link: "/zh-tw/reference/bindings/ibm-mq" },
                  { text: "Solace", link: "/zh-tw/reference/bindings/solace" },
                ],
              },
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
      // `socialLinks` sits outside `locales`, so this one entry serves both
      // the English and the Traditional Chinese site.
      {
        icon: { svg: KOFI_ICON },
        link: "https://ko-fi.com/N4R6257TGG",
        ariaLabel: "Support on Ko-fi",
      },
    ],
    search: { provider: "local" },
  },
});
