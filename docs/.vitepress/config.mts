import { defineConfig } from 'vitepress'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json')

export default defineConfig({
  lang: 'en-US',
  title: 'nestjs-beanstalk',
  description: 'NestJS custom transport strategy for Beanstalkd',

  // GitHub Pages project site: romysaputrasihanandaa.github.io/nestjs-beanstalk
  base: '/nestjs-beanstalk/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'nestjs-beanstalk',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API', link: '/api/server', activeMatch: '/api/' },
      { text: 'Advanced', link: '/advanced/retry-bury', activeMatch: '/advanced/' },
      {
        text: `v${version}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/romysaputrasihananda/nestjs-beanstalk/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@romysaputrasihanandaa/nestjs-beanstalk' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Consumer', link: '/guide/consumer' },
            { text: 'Producer', link: '/guide/producer' },
            { text: 'Context', link: '/guide/context' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'BeanstalkServer', link: '/api/server' },
            { text: 'BeanstalkClient', link: '/api/client' },
            { text: 'BeanstalkContext', link: '/api/context' },
            { text: 'Decorators', link: '/api/decorators' },
            { text: 'Interfaces', link: '/api/interfaces' },
          ],
        },
      ],
      '/advanced/': [
        {
          text: 'Advanced',
          items: [
            { text: 'Retry & Bury', link: '/advanced/retry-bury' },
            { text: 'Concurrency', link: '/advanced/concurrency' },
            { text: 'Logging', link: '/advanced/logging' },
            { text: 'Manual Ack', link: '/advanced/manual-ack' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/romysaputrasihananda/nestjs-beanstalk' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@romysaputrasihanandaa/nestjs-beanstalk' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 romysaputrasihananda',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/romysaputrasihananda/nestjs-beanstalk/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
