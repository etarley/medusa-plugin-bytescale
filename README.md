# Medusa Plugin Bytescale

A [Bytescale](https://www.bytescale.com/) file storage provider for Medusa v2.

## Installation

```bash
npm install medusa-plugin-bytescale
```

## Configuration

In your Medusa backend, open `medusa-config.ts` (or `medusa-config.js`) and add
the module configuration:

```typescript
import { defineConfig, loadEnv } from '@medusajs/framework/utils';

loadEnv(process.env.NODE_ENV, process.cwd());

module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: '@medusajs/medusa/file',
      options: {
        providers: [
          {
            resolve: 'medusa-plugin-bytescale/providers/bytescale',
            id: 'bytescale',
            options: {
              accountId: process.env.BYTESCALE_ACCOUNT_ID,
              apiKey: process.env.BYTESCALE_API_KEY,
              prefix: 'uploads', // Optional: Folder prefix for uploads
            },
          },
        ],
      },
    },
  ],
});
```

## Environment Variables

Ensure you use a **Secret API Key** (starts with `secret_`) to allow file
deletion.

```env
BYTESCALE_ACCOUNT_ID=your_account_id
BYTESCALE_API_KEY=secret_xxxxxxxxx
```
# medusa-plugin-bytescale
