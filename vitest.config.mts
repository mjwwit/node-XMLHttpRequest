import { defineConfig } from 'vitest/config'
export default defineConfig({
	test: { include: ['src/**/*.test.{ts,mts}'], testTimeout: 15000, hookTimeout: 15000 },
})
